// EMS supply inventory rules (functions/lib/emsInventory/logic.js) and the
// display helpers that mirror them (src/lib/ems/inventoryDisplay.js).
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as display from "../../src/lib/ems/inventoryDisplay.js";

const require = createRequire(import.meta.url);
const logic = require("../../functions/lib/emsInventory/logic.js");

const TODAY = "2026-11-19";
const lot = (lotNo, expiration, quantity, receivedAt = "2026-01-01T00:00:00.000Z") =>
  ({ key: logic.lotKey(lotNo, expiration), lot: lotNo, expiration, quantity, receivedAt });

describe("lot picking", () => {
  const lots = [
    lot("C", "2027-06-01", 5, "2026-01-01T00:00:00.000Z"),
    lot("A", "2026-12-01", 3, "2026-03-01T00:00:00.000Z"),
    lot("B", "", 4, "2025-12-01T00:00:00.000Z"),
    lot("OLD", "2026-10-01", 2, "2025-06-01T00:00:00.000Z"),
  ];

  it("FEFO takes the soonest unexpired expiration first and never expired stock for use", () => {
    const picks = logic.pickLots(lots, 6, { policy: "fefo", today: TODAY, stock: "unexpired" });
    assert.deepEqual(picks.map((p) => [p.lot, p.take]), [["A", 3], ["C", 3]]);
  });

  it("FIFO takes the oldest receipt first", () => {
    const picks = logic.pickLots(lots, 5, { policy: "fifo", today: TODAY, stock: "unexpired" });
    assert.deepEqual(picks.map((p) => [p.lot, p.take]), [["B", 4], ["C", 1]]);
  });

  it("items with no expiration leave last under FEFO", () => {
    const picks = logic.pickLots(lots, 12, { policy: "fefo", today: TODAY, stock: "unexpired" });
    assert.deepEqual(picks.map((p) => p.lot), ["A", "C", "B"]);
  });

  it("refuses more than is usable and says when the rest is expired", () => {
    assert.throws(() => logic.pickLots(lots, 13, { today: TODAY, stock: "unexpired" }), /Only 12 usable on hand; the rest is expired/);
    assert.throws(() => logic.pickLots(lots, 15, { today: TODAY, stock: "any" }), /Only 14 on hand/);
  });

  it("removing expired stock only picks expired lots", () => {
    const picks = logic.pickLots(lots, 2, { today: TODAY, stock: "expired" });
    assert.deepEqual(picks.map((p) => [p.lot, p.take]), [["OLD", 2]]);
    assert.throws(() => logic.pickLots(lots, 3, { today: TODAY, stock: "expired" }), /Only 2 expired/);
    // A chosen lot must be expired too, so usable stock can't be written off without a reason.
    assert.throws(() => logic.pickLots(lots, 1, { today: TODAY, stock: "expired", lotKey: logic.lotKey("C", "2027-06-01") }), /hasn't expired/);
    assert.equal(logic.pickLots(lots, 1, { today: TODAY, stock: "expired", lotKey: logic.lotKey("OLD", "2026-10-01") })[0].take, 1);
  });

  it("a chosen lot is used alone, and an expired one is refused for use", () => {
    const picks = logic.pickLots(lots, 2, { today: TODAY, stock: "unexpired", lotKey: logic.lotKey("C", "2027-06-01") });
    assert.deepEqual(picks.map((p) => [p.lot, p.take]), [["C", 2]]);
    assert.throws(() => logic.pickLots(lots, 1, { today: TODAY, stock: "unexpired", lotKey: logic.lotKey("OLD", "2026-10-01") }), /expired on 2026-10-01/);
    assert.throws(() => logic.pickLots(lots, 6, { today: TODAY, stock: "any", lotKey: logic.lotKey("C", "2027-06-01") }), /Only 5 on hand/);
  });

  it("an item expiring today is still usable today", () => {
    const picks = logic.pickLots([lot("T", TODAY, 1)], 1, { today: TODAY, stock: "unexpired" });
    assert.equal(picks[0].take, 1);
  });
});

describe("balances", () => {
  const ctx = { itemId: "I1", locationId: "L1", transactionId: "T-1", at: "2026-11-19T12:00:00.000Z" };

  it("adds a received lot and keeps flags in step with par", () => {
    const start = { id: "L1__I1", itemId: "I1", locationId: "L1", onHand: 0, lots: [], par: { min: 5, max: 20, reorderPoint: 8, reorderQuantity: 12 } };
    const next = logic.applyLines(start, [{ key: logic.lotKey("A", "2027-01-01"), lot: "A", expiration: "2027-01-01", receivedAt: ctx.at, delta: 6 }], ctx);
    assert.equal(next.onHand, 6);
    assert.equal(next.lowStock, true);
    assert.equal(next.outOfStock, false);
    assert.equal(next.earliestExpiration, "2027-01-01");
    assert.equal(next.lastTransactionId, "T-1");
    assert.deepEqual(next.par, start.par);
  });

  it("never goes below zero", () => {
    const start = { onHand: 2, lots: [lot("A", "2027-01-01", 2)], par: null };
    assert.throws(() => logic.applyLines(start, [{ key: logic.lotKey("A", "2027-01-01"), delta: -3 }], ctx), /less than zero/);
    assert.throws(() => logic.applyLines(start, [{ key: logic.lotKey("Z", ""), delta: -1 }], ctx), /isn't in stock/);
  });

  it("drops emptied lots and marks out of stock when a par exists", () => {
    const start = { onHand: 2, lots: [lot("A", "2027-01-01", 2)], par: { min: 1, max: 4, reorderPoint: null, reorderQuantity: null } };
    const next = logic.applyLines(start, [{ key: logic.lotKey("A", "2027-01-01"), delta: -2 }], ctx);
    assert.equal(next.onHand, 0);
    assert.deepEqual(next.lots, []);
    assert.equal(next.outOfStock, true);
    assert.equal(next.lowStock, true);
    assert.equal(next.earliestExpiration, "");
  });

  it("a transfer moves the same lots and a reversal puts them back", () => {
    const fromBalance = { lots: [lot("A", "2026-12-01", 3), lot("C", "2027-06-01", 5)] };
    const lines = logic.linesFor("transfer", {
      quantity: 4, fromLocationId: "SUP", toLocationId: "M1", fromBalance, policy: "fefo", today: TODAY, at: ctx.at,
    });
    assert.deepEqual(lines.map((l) => [l.locationId, l.lot, l.delta]), [["SUP", "A", -3], ["SUP", "C", -1], ["M1", "A", 3], ["M1", "C", 1]]);
    assert.equal(lines.reduce((sum, l) => sum + l.delta, 0), 0);
    const back = logic.reversedLines(lines);
    assert.deepEqual(back.map((l) => l.delta), [3, 1, -3, -1]);
    const byLocation = logic.linesByLocation(lines);
    assert.deepEqual([...byLocation.keys()], ["SUP", "M1"]);
  });

  it("receiving the same lot and expiration again adds to the same lot", () => {
    const [line] = logic.linesFor("receive", { quantity: 2, toLocationId: "L1", lot: "A", expiration: "2027-01-01", at: ctx.at });
    const start = { onHand: 3, lots: [lot("A", "2027-01-01", 3, "2026-01-01T00:00:00.000Z")] };
    const next = logic.applyLines(start, [line], ctx);
    assert.equal(next.lots.length, 1);
    assert.equal(next.lots[0].quantity, 5);
    assert.equal(next.lots[0].receivedAt, "2026-01-01T00:00:00.000Z");
  });
});

describe("counts and validation", () => {
  it("every row needs a count and every difference needs a reason", () => {
    const problems = logic.countProblems([
      { expected: 4, counted: 4 },
      { expected: 4, counted: null },
      { expected: 4, counted: 3, reason: "" },
      { expected: 4, counted: 3, reason: "Used on call 26-1182, not recorded" },
    ]);
    assert.deepEqual(problems, [{ index: 1, problem: "not counted" }, { index: 2, problem: "needs a reason" }]);
  });

  it("quantities are whole and in range", () => {
    assert.equal(logic.wholeQuantity("3"), 3);
    assert.equal(logic.wholeQuantity(0), null);
    assert.equal(logic.wholeQuantity(0, { allowZero: true }), 0);
    assert.equal(logic.wholeQuantity(1.5), null);
    assert.equal(logic.wholeQuantity(-1), null);
    assert.equal(logic.wholeQuantity("abc"), null);
  });

  it("dates must be real calendar days", () => {
    assert.equal(logic.isValidDate("2027-02-28"), true);
    assert.equal(logic.isValidDate("2027-02-30"), false);
    assert.equal(logic.isValidDate("02/01/2027"), false);
  });
});

describe("display helpers match the server", () => {
  it("shares settings defaults, location types, categories and transaction types", () => {
    assert.deepEqual({ ...display.DEFAULT_EMS_SETTINGS }, { ...logic.DEFAULT_SETTINGS });
    assert.deepEqual(display.LOCATION_TYPES, logic.LOCATION_TYPES);
    assert.deepEqual(display.DEFAULT_SUPPLY_CATEGORIES, logic.DEFAULT_SUPPLY_CATEGORIES);
    for (const [key, rule] of Object.entries(logic.TRANSACTION_TYPES)) {
      assert.deepEqual(
        { label: display.TRANSACTION_TYPES[key]?.label, direction: display.TRANSACTION_TYPES[key]?.direction, access: display.TRANSACTION_TYPES[key]?.access },
        { label: rule.label, direction: rule.direction, access: rule.access },
        key
      );
    }
    assert.deepEqual(Object.keys(display.TRANSACTION_TYPES), Object.keys(logic.TRANSACTION_TYPES));
    assert.equal(display.daysUntil("2026-12-19", TODAY), logic.daysUntil("2026-12-19", TODAY));
  });

  it("expiration status follows the warning days", () => {
    const days = [90, 60, 30, 14, 7];
    assert.equal(display.expirationStatus("", days, TODAY).level, "none");
    assert.equal(display.expirationStatus("2026-11-18", days, TODAY).level, "expired");
    assert.equal(display.expirationStatus("2026-11-25", days, TODAY).level, "soon");
    assert.match(display.expirationStatus("2026-12-10", days, TODAY).label, /within 30/);
    assert.equal(display.expirationStatus("2027-06-01", days, TODAY).level, "ok");
  });

  it("stock status and paths", () => {
    assert.equal(display.stockStatus({ outOfStock: true, lowStock: true }).key, "out");
    assert.equal(display.stockStatus({ lowStock: true }).key, "low");
    assert.equal(display.stockStatus({ onHand: 9, par: { max: 5 } }).key, "over");
    const byId = { S: { id: "S", name: "Station 1" }, R: { id: "R", name: "Supply room", ancestorIds: ["S"] } };
    assert.equal(display.locationPath({ id: "C", name: "Cabinet A", ancestorIds: ["R", "S"] }, byId), "Station 1 › Supply room › Cabinet A");
  });
});
