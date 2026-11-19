// EMS supply inventory callables (functions/lib/emsInventory/service.js) against
// the Firestore emulator: ledger + balances, FEFO, never negative, idempotent
// retries, concurrent use, permissions, tenant isolation, counts with an
// independent reviewer, and reversals. A cross-tenant or double-deduction
// failure here blocks release.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const inv = require("./lib/emsInventory/service.js");
const { lotKey } = require("./lib/emsInventory/logic.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
const B = "dept-b";

let db;
const auth = (uid) => ({ uid, token: { email: `${uid}@example.test`, name: uid } });
const req = (uid, data) => ({ auth: uid ? auth(uid) : undefined, data });
let seq = 0;
const rid = () => `req${Date.now().toString(36)}${(seq += 1)}xx`;

async function expectCode(promise, code, pattern) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

const member = (departmentId, uid, roleIds) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({ uid, status: "active", departmentId, roleIds, role: roleIds[0], email: `${uid}@example.test` });

const balance = async (locationId, itemId, d = A) => (await db.doc(`departments/${d}/emsInventoryBalances/${locationId}__${itemId}`).get()).data();
const ledger = async (d = A) => (await db.collection(`departments/${d}/emsInventoryTransactions`).get()).docs.map((doc) => doc.data());

/** A catalog item, a supply room and a medic unit in department A. */
async function setup(uid = "chief-a") {
  const { itemId } = await inv.saveItem(db, req(uid, { departmentId: A, item: { name: "IV start kit", category: "IV supplies", unitOfMeasure: "kit", tracksExpiration: true, unitCost: 4.5 } }));
  const { locationId: station } = await inv.saveLocation(db, req(uid, { departmentId: A, location: { name: "Station 1", type: "station" } }));
  const { locationId: supply } = await inv.saveLocation(db, req(uid, { departmentId: A, location: { name: "Supply room", type: "storageArea", parentId: station } }));
  const { locationId: medic } = await inv.saveLocation(db, req(uid, { departmentId: A, location: { name: "Medic 1", type: "vehicle", parentId: station } }));
  return { itemId, station, supply, medic };
}

const receive = (ctx, quantity, lot, expiration, uid = "chief-a", requestId = rid()) =>
  inv.postTransaction(db, req(uid, { departmentId: A, requestId, type: "receive", itemId: ctx.itemId, toLocationId: ctx.supply, quantity, lot, expiration }));

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await admin.app().delete();
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await Promise.all([
    member(A, "chief-a", ["fireChief"]),
    member(A, "bc-a", ["battalionChief"]),
    member(A, "officer-a", ["companyOfficer"]),
    member(A, "ff-a", ["firefighter"]),
    member(A, "ro-a", ["readOnly"]),
    member(B, "chief-b", ["fireChief"]),
  ]);
});

describe("ledger and balances", () => {
  it("receives, uses FEFO, transfers, and keeps the ledger and audit in step", async () => {
    const ctx = await setup();
    await receive(ctx, 10, "LATE", "2027-09-01");
    await receive(ctx, 4, "SOON", "2027-01-15");

    const used = await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 6, incidentNumber: "26-1182" }));
    assert.deepEqual(used.lines.map((l) => [l.lot, l.delta]), [["SOON", -4], ["LATE", -2]]);

    await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "transfer", itemId: ctx.itemId, fromLocationId: ctx.supply, toLocationId: ctx.medic, quantity: 3 }));
    const supply = await balance(ctx.supply, ctx.itemId);
    const medic = await balance(ctx.medic, ctx.itemId);
    assert.equal(supply.onHand, 5);
    assert.equal(medic.onHand, 3);
    assert.deepEqual(medic.lots.map((l) => [l.lot, l.quantity]), [["LATE", 3]]);

    // The balance is exactly the sum of the ledger lines.
    const rows = await ledger();
    const sum = (loc) => rows.flatMap((t) => t.lines).filter((l) => l.locationId === loc).reduce((s, l) => s + l.delta, 0);
    assert.equal(sum(ctx.supply), supply.onHand);
    assert.equal(sum(ctx.medic), medic.onHand);
    assert.equal(rows.length, 4);
    const usage = rows.find((t) => t.type === "usage");
    assert.equal(usage.incidentNumber, "26-1182");
    assert.equal(usage.createdBy, "ff-a");
    assert.equal(usage.unitCost, 4.5);

    const audit = (await db.collection(`departments/${A}/emsAuditEvents`).get()).docs.map((d) => d.data().action);
    assert.ok(audit.includes("ems.inventory.usage"));
    assert.ok(audit.includes("ems.inventory.transfer"));
  });

  it("never goes negative and never picks expired stock for use", async () => {
    const ctx = await setup();
    await receive(ctx, 2, "OLD", "2025-01-01");
    await receive(ctx, 1, "NEW", "2027-01-01");
    await expectCode(inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 })),
      "failed-precondition", /usable/);
    await expectCode(inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "damaged", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 4, reason: "Crushed" })),
      "failed-precondition", /Only 3 on hand/);
    const removed = await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "expired", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 }));
    assert.deepEqual(removed.lines.map((l) => l.lot), ["OLD"]);
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 1);
    assert.equal((await ledger()).length, 3, "refused requests leave no ledger record");
  });

  it("requires lot/expiration the item tracks, and a reason for waste", async () => {
    const ctx = await setup();
    await expectCode(inv.postTransaction(db, req("chief-a", { departmentId: A, requestId: rid(), type: "receive", itemId: ctx.itemId, toLocationId: ctx.supply, quantity: 1 })),
      "invalid-argument", /expiration/);
    await receive(ctx, 1, "A", "2027-01-01");
    await expectCode(inv.postTransaction(db, req("chief-a", { departmentId: A, requestId: rid(), type: "waste", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 })),
      "invalid-argument", /reason/);
  });
});

describe("retries and concurrency", () => {
  it("a retried request returns the first result and moves stock once", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    const requestId = rid();
    const call = () => inv.postTransaction(db, req("ff-a", { departmentId: A, requestId, type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 }));
    const first = await call();
    const again = await call();
    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 3);
    // Someone else can't reuse it.
    await expectCode(inv.postTransaction(db, req("officer-a", { departmentId: A, requestId, type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 })), "already-exists");
  });

  it("the same request sent twice at once deducts once", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    const requestId = rid();
    const results = await Promise.allSettled([1, 2].map(() =>
      inv.postTransaction(db, req("ff-a", { departmentId: A, requestId, type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 }))));
    assert.ok(results.every((r) => r.status === "fulfilled"), JSON.stringify(results.map((r) => r.reason?.message)));
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 3);
    assert.equal((await ledger()).filter((t) => t.type === "usage").length, 1);
  });

  it("two people using the last stock at once: one succeeds, nothing goes negative", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    const results = await Promise.allSettled(["ff-a", "officer-a"].map((uid) =>
      inv.postTransaction(db, req(uid, { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 3 }))));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.find((r) => r.status === "rejected").reason.code, "failed-precondition");
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 2);
    assert.equal((await ledger()).filter((t) => t.type === "usage").length, 1);
  });

  it("concurrent transfers keep both sides balanced", async () => {
    const ctx = await setup();
    await receive(ctx, 10, "A", "2027-01-01");
    await Promise.all([1, 2, 3, 4].map(() =>
      inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "transfer", itemId: ctx.itemId, fromLocationId: ctx.supply, toLocationId: ctx.medic, quantity: 2 }))));
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 2);
    assert.equal((await balance(ctx.medic, ctx.itemId)).onHand, 8);
  });
});

describe("permissions and tenants", () => {
  it("crews use and transfer; only managers receive, waste, set par or edit the catalog", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    const ff = (data) => req("ff-a", { departmentId: A, ...data });
    await expectCode(inv.postTransaction(db, ff({ requestId: rid(), type: "receive", itemId: ctx.itemId, toLocationId: ctx.supply, quantity: 1, expiration: "2027-01-01" })), "permission-denied");
    await expectCode(inv.postTransaction(db, ff({ requestId: rid(), type: "waste", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1, reason: "x" })), "permission-denied");
    await expectCode(inv.setPar(db, ff({ locationId: ctx.supply, itemId: ctx.itemId, par: { min: 1 } })), "permission-denied");
    await expectCode(inv.saveItem(db, ff({ item: { name: "Gauze", category: "Dressings" } })), "permission-denied");
    await expectCode(inv.saveSettings(db, req("bc-a", { departmentId: A, settings: { rotationPolicy: "fifo", expirationWarningDays: [30] } })), "permission-denied");
    await expectCode(inv.postTransaction(db, req("ro-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 })), "permission-denied");
    await expectCode(inv.postTransaction(db, req(null, { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 })), "unauthenticated");
  });

  it("another department can't touch this department's stock, even with its ids", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    await expectCode(inv.postTransaction(db, req("chief-b", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 })), "permission-denied");
    await expectCode(inv.postTransaction(db, req("chief-b", { departmentId: B, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 })), "not-found");
    await expectCode(inv.saveLocation(db, req("chief-b", { departmentId: B, location: { name: "Sneaky", type: "bin", parentId: ctx.supply } })), "not-found");
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 5);
    assert.equal((await db.collection(`departments/${B}/emsInventoryTransactions`).get()).size, 0);
  });

  it("is refused when the plan leaves out EMS Management", async () => {
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["dashboard", "personnel", "administration"] });
    await expectCode(inv.saveItem(db, req("chief-a", { departmentId: A, item: { name: "Gauze", category: "Dressings" } })), "permission-denied", /plan/);
  });
});

describe("locations, par and settings", () => {
  it("refuses loops and turning off a location that still holds stock", async () => {
    const ctx = await setup();
    await expectCode(inv.saveLocation(db, req("chief-a", { departmentId: A, location: { id: ctx.station, name: "Station 1", type: "station", parentId: ctx.supply } })), "invalid-argument", /inside itself/);
    await receive(ctx, 1, "A", "2027-01-01");
    await expectCode(inv.saveLocation(db, req("chief-a", { departmentId: A, location: { id: ctx.supply, name: "Supply room", type: "storageArea", parentId: ctx.station, active: false } })), "failed-precondition");
    const loc = (await db.doc(`departments/${A}/emsInventoryLocations/${ctx.supply}`).get()).data();
    assert.deepEqual(loc.ancestorIds, [ctx.station]);
  });

  it("par levels set low / out of stock flags", async () => {
    const ctx = await setup();
    await inv.setPar(db, req("chief-a", { departmentId: A, locationId: ctx.medic, itemId: ctx.itemId, par: { min: 2, max: 6, reorderPoint: 3, reorderQuantity: 4 } }));
    let medic = await balance(ctx.medic, ctx.itemId);
    assert.equal(medic.outOfStock, true);
    assert.equal(medic.onHand, 0);
    await receive(ctx, 5, "A", "2027-01-01");
    await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "transfer", itemId: ctx.itemId, fromLocationId: ctx.supply, toLocationId: ctx.medic, quantity: 4 }));
    medic = await balance(ctx.medic, ctx.itemId);
    assert.equal(medic.outOfStock, false);
    assert.equal(medic.lowStock, false);
    assert.equal(medic.par.reorderPoint, 3);
    await expectCode(inv.setPar(db, req("chief-a", { departmentId: A, locationId: ctx.medic, itemId: ctx.itemId, par: { min: 7, max: 6 } })), "invalid-argument");
  });

  it("FIFO setting changes which lot leaves first", async () => {
    const ctx = await setup();
    await receive(ctx, 2, "FIRST-IN", "2027-09-01");
    await receive(ctx, 2, "SOON", "2027-01-01");
    await inv.saveSettings(db, req("chief-a", { departmentId: A, settings: { rotationPolicy: "fifo", expirationWarningDays: [60, 30] } }));
    const used = await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 }));
    assert.equal(used.lines[0].lot, "FIRST-IN");
  });
});

describe("physical counts", () => {
  async function countWithDifference(ctx, counter = "ff-a") {
    await receive(ctx, 5, "A", "2027-01-01");
    const { countId } = await inv.startCount(db, req(counter, { departmentId: A, locationId: ctx.supply, requestId: rid() }));
    const count = (await db.doc(`departments/${A}/emsInventoryCounts/${countId}`).get()).data();
    assert.equal(count.rows.length, 1);
    assert.equal(count.rows[0].expected, 5);
    return { countId, rowId: count.rows[0].rowId };
  }

  it("needs a reason for every difference, then a different person approves and the stock is adjusted", async () => {
    const ctx = await setup();
    const { countId, rowId } = await countWithDifference(ctx);
    await expectCode(inv.submitCount(db, req("ff-a", { departmentId: A, countId, rows: [{ rowId, counted: 4 }] })), "failed-precondition", /reason/);
    // Stock used while counting is kept: only the difference found is applied.
    await inv.postTransaction(db, req("officer-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 }));
    await inv.submitCount(db, req("ff-a", { departmentId: A, countId, rows: [{ rowId, counted: 4, reason: "One kit opened and discarded" }] }));
    await expectCode(inv.approveCount(db, req("officer-a", { departmentId: A, countId })), "permission-denied");
    const approved = await inv.approveCount(db, req("bc-a", { departmentId: A, countId, note: "OK" }));
    assert.equal(approved.adjustmentTransactionIds.length, 1);
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 3);
    const adj = (await ledger()).find((t) => t.type === "countAdjustment");
    assert.equal(adj.lines[0].delta, -1);
    assert.equal(adj.countedBy, "ff-a");
    assert.equal(adj.approvedBy, "bc-a");
    await expectCode(inv.approveCount(db, req("bc-a", { departmentId: A, countId })), "failed-precondition");
  });

  it("the person who counted can't approve their own count", async () => {
    const ctx = await setup();
    const { countId, rowId } = await countWithDifference(ctx, "bc-a");
    await inv.submitCount(db, req("bc-a", { departmentId: A, countId, rows: [{ rowId, counted: 6, reason: "Found one" }] }));
    await expectCode(inv.approveCount(db, req("bc-a", { departmentId: A, countId })), "permission-denied", /other than/);
    await expectCode(inv.rejectCount(db, req("bc-a", { departmentId: A, countId, note: "no" })), "permission-denied");
    await inv.rejectCount(db, req("chief-a", { departmentId: A, countId, note: "Recount the top shelf" }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 5, "a rejected count changes nothing");
  });

  it("found stock that wasn't in the system is added by the count", async () => {
    const ctx = await setup();
    const { countId, rowId } = await countWithDifference(ctx);
    await inv.saveCount(db, req("ff-a", { departmentId: A, countId, rows: [{ rowId, counted: 5 }], addRows: [{ itemId: ctx.itemId, lot: "FOUND", expiration: "2027-03-01" }] }));
    const count = (await db.doc(`departments/${A}/emsInventoryCounts/${countId}`).get()).data();
    const found = count.rows.find((r) => r.added);
    assert.equal(found.key, lotKey("FOUND", "2027-03-01"));
    await inv.submitCount(db, req("ff-a", { departmentId: A, countId, rows: [{ rowId, counted: 5 }, { rowId: found.rowId, counted: 2, reason: "Box behind the bins" }] }));
    await inv.approveCount(db, req("chief-a", { departmentId: A, countId }));
    const supply = await balance(ctx.supply, ctx.itemId);
    assert.equal(supply.onHand, 7);
    assert.ok(supply.lots.some((l) => l.lot === "FOUND" && l.quantity === 2));
  });
});

describe("reversals", () => {
  it("puts stock back once, keeps the original, and can't reverse a reversal", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "A", "2027-01-01");
    const { transactionId } = await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 }));
    await expectCode(inv.reverseTransaction(db, req("ff-a", { departmentId: A, transactionId, reason: "Wrong item" })), "permission-denied");
    await expectCode(inv.reverseTransaction(db, req("bc-a", { departmentId: A, transactionId })), "invalid-argument");
    const rev = await inv.reverseTransaction(db, req("bc-a", { departmentId: A, transactionId, reason: "Wrong item" }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 5);
    await expectCode(inv.reverseTransaction(db, req("bc-a", { departmentId: A, transactionId, reason: "again" })), "already-exists");
    await expectCode(inv.reverseTransaction(db, req("bc-a", { departmentId: A, transactionId: rev.transactionId, reason: "undo" })), "failed-precondition");
    const original = (await db.doc(`departments/${A}/emsInventoryTransactions/${transactionId}`).get()).data();
    assert.equal(original.status, "posted");
    assert.equal(original.quantity, 2);
  });

  it("refuses a reversal that would leave less than zero", async () => {
    const ctx = await setup();
    const received = await receive(ctx, 3, "A", "2027-01-01");
    await inv.postTransaction(db, req("ff-a", { departmentId: A, requestId: rid(), type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 3 }));
    await expectCode(inv.reverseTransaction(db, req("bc-a", { departmentId: A, transactionId: received.transactionId, reason: "Wrong count" })), "failed-precondition");
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 0);
  });
});
