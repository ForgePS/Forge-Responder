// EMS medications (slice E4): NDC handling, recall matching, lots on hold in lot
// picking and balance flags (functions/lib/emsInventory/logic.js), the client
// constants that mirror them (src/lib/ems/inventoryDisplay.js), and the
// expiration and recall helpers the medication screens use.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import * as display from "../../src/lib/ems/inventoryDisplay.js";
import { expiringLots, lotsOnHand, sameLot } from "../../src/lib/ems/medicationScreens.js";

const require = createRequire(import.meta.url);
const logic = require("../../functions/lib/emsInventory/logic.js");

const TODAY = "2026-11-26";
const lot = (lotNo, expiration, quantity, extra = {}) => ({ key: logic.lotKey(lotNo, expiration), lot: lotNo, expiration, quantity, receivedAt: "2026-01-01T00:00:00.000Z", ...extra });

describe("NDC", () => {
  it("normalizes each 10-digit form and the 11-digit form to 5-4-2", () => {
    assert.equal(logic.normalizeNdc("0409-4888-02").ndc11, "00409-4888-02");
    assert.equal(logic.normalizeNdc("12345-678-90").ndc11, "12345-0678-90");
    assert.equal(logic.normalizeNdc("12345-6789-1").ndc11, "12345-6789-01");
    assert.equal(logic.normalizeNdc("12345-6789-01").ndc11, "12345-6789-01");
    assert.equal(logic.normalizeNdc("12345678901").ndc11, "12345-6789-01");
    assert.deepEqual(logic.normalizeNdc(""), { ndc: "", ndc11: "" });
  });

  it("refuses what isn't an NDC, including ambiguous 10 digits without dashes", () => {
    for (const bad of ["1234567890", "123-45-6789", "ABCDE-1234-12", "1234-5678-901"]) assert.equal(logic.normalizeNdc(bad), null, bad);
  });
});

describe("recall matching", () => {
  const recall = { id: "R1", status: "open", itemIds: ["epi"], lotNumbers: ["AB-123"] };
  it("matches lot numbers without case, spaces or dashes", () => {
    assert.equal(logic.recallCovers(recall, "epi", "ab 123"), true);
    assert.equal(logic.recallCovers(recall, "epi", "AB1234"), false);
    assert.equal(logic.recallCovers(recall, "other", "AB-123"), false);
  });
  it("covers every lot when no lot numbers are listed, and nothing once closed", () => {
    assert.equal(logic.recallCovers({ ...recall, lotNumbers: [] }, "epi", "anything"), true);
    assert.equal(logic.recallCovers({ ...recall, status: "closed" }, "epi", "AB-123"), false);
    assert.equal(logic.sameLotNumber("", ""), false);
    for (const [a, b] of [["AB-123", "ab 123"], ["X1", "X2"], ["", ""]]) assert.equal(sameLot(a, b), logic.sameLotNumber(a, b));
  });
});

describe("lots on hold", () => {
  const held = lot("BAD", "2027-01-01", 5);
  const good = lot("GOOD", "2027-06-01", 2);
  const heldKeys = new Set([held.key]);

  it("use skips held lots, and refuses one when chosen", () => {
    const picks = logic.pickLots([held, good], 2, { today: TODAY, stock: "unexpired", heldKeys, held: "exclude" });
    assert.deepEqual(picks.map((p) => p.lot), ["GOOD"]);
    assert.throws(() => logic.pickLots([held, good], 1, { today: TODAY, stock: "unexpired", lotKey: held.key, heldKeys, held: "exclude" }), /on hold/);
    assert.throws(() => logic.pickLots([held, good], 3, { today: TODAY, stock: "unexpired", heldKeys, held: "exclude" }), /2 usable on hand; 5 are on hold/);
  });

  it("transfer moves a held lot only when chosen; removals may take held stock", () => {
    assert.deepEqual(logic.pickLots([held, good], 2, { today: TODAY, stock: "unexpired", heldKeys, held: "explicit" }).map((p) => p.lot), ["GOOD"]);
    assert.deepEqual(logic.pickLots([held, good], 1, { today: TODAY, stock: "unexpired", lotKey: held.key, heldKeys, held: "explicit" }).map((p) => p.lot), ["BAD"]);
    assert.deepEqual(logic.pickLots([held, good], 6, { today: TODAY, stock: "any", heldKeys, held: "include" }).map((p) => p.lot), ["BAD", "GOOD"]);
  });

  it("held stock doesn't count toward par, and hold flags follow the lot keys", () => {
    const flags = logic.balanceFlags(7, { min: 3 }, [{ ...held, held: true }, good]);
    assert.equal(flags.heldQuantity, 5);
    assert.equal(flags.lowStock, true);
    const all = logic.balanceFlags(5, { min: 3 }, [{ ...held, held: true }]);
    assert.equal(all.outOfStock, true);
    const balance = { onHand: 7, par: { min: 3 }, lots: [held, good] };
    assert.equal(logic.withHolds(balance, heldKeys).heldQuantity, 5);
    assert.equal(logic.withHolds(balance, new Set()).heldQuantity, 0);
    const applied = logic.applyLines({ onHand: 5, lots: [held] }, [{ key: held.key, lot: "BAD", expiration: "2027-01-01", delta: -1 }], { itemId: "i", locationId: "l", transactionId: "t", at: "x", heldKeys });
    assert.equal(applied.lots[0].held, true);
    assert.equal(applied.heldQuantity, 4);
  });
});

describe("client constants match the server", () => {
  it("medication lists and hold rules", () => {
    assert.deepEqual(display.DOSAGE_FORMS, logic.DOSAGE_FORMS);
    assert.deepEqual(display.ROUTES, logic.ROUTES);
    assert.deepEqual(display.CONTROLLED_SCHEDULES, logic.CONTROLLED_SCHEDULES);
    assert.deepEqual(display.STORAGE_CONDITIONS, logic.STORAGE_CONDITIONS);
    assert.deepEqual(display.RECALL_CLASSES, logic.RECALL_CLASSES);
    assert.deepEqual(display.DEFAULT_MEDICATION_CATEGORIES, logic.DEFAULT_MEDICATION_CATEGORIES);
    for (const [key, rule] of Object.entries(logic.TRANSACTION_TYPES)) assert.equal(display.TRANSACTION_TYPES[key].held, rule.held, key);
  });
});

describe("medication screens", () => {
  const items = [{ id: "epi", name: "Epinephrine" }];
  const locations = [{ id: "m1", name: "Medic 1" }];
  const balances = [{ id: "m1__epi", itemId: "epi", locationId: "m1", lots: [lot("OLD", "2026-11-20", 1), lot("SOON", "2026-12-01", 2, { held: true }), lot("NONE", "", 3)] }];

  it("lists lots soonest expiration first with their status", () => {
    const rows = expiringLots({ items, balances, locations, warningDays: [30, 90], today: TODAY });
    assert.deepEqual(rows.map((r) => [r.lot.lot, r.status.level]), [["OLD", "expired"], ["SOON", "soon"], ["NONE", "none"]]);
    assert.equal(rows[0].path, "Medic 1");
  });

  it("totals each lot across locations and keeps the hold flag", () => {
    const more = [...balances, { id: "s__epi", itemId: "epi", locationId: "s", lots: [lot("SOON", "2026-12-01", 4, { held: true })] }];
    const soon = lotsOnHand(more, { epi: items[0] }).find((l) => l.lot === "SOON");
    assert.equal(soon.onHand, 6);
    assert.equal(soon.held, true);
    assert.equal(soon.places.length, 2);
  });
});
