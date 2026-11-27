// EMS medications (slice E4) against the Firestore emulator: the medication catalog
// and its permissions, lot and expiration rules, controlled substances refused,
// recalls putting lots on hold everywhere, held stock refused for use, recalled
// lots held when received, closing recalls, and manual holds.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const inv = require("./lib/emsInventory/service.js");
const meds = require("./lib/emsMedications/service.js");
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

const member = (departmentId, uid, roleIds, extra = {}) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({ uid, status: "active", departmentId, roleIds, role: roleIds[0], email: `${uid}@example.test`, ...extra });

const balance = async (locationId, itemId, d = A) => (await db.doc(`departments/${d}/emsInventoryBalances/${locationId}__${itemId}`).get()).data();
const holds = async (d = A) => (await db.collection(`departments/${d}/emsLotHolds`).get()).docs.map((doc) => doc.data());

const EPI = { name: "Epinephrine 1 mg/10 mL", genericName: "Epinephrine", strength: "1 mg/10 mL", dosageForm: "Prefilled syringe", routes: ["IV", "IO"], category: "Cardiac", ndc: "0409-4921-34", itemClass: "medication" };

async function setup() {
  const { itemId } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: EPI }));
  const { locationId: supply } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Med room", type: "storageArea" } }));
  const { locationId: medic } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Medic 1", type: "vehicle" } }));
  return { itemId, supply, medic };
}

const post = (uid, data) => inv.postTransaction(db, req(uid, { departmentId: A, requestId: rid(), ...data }));
const receive = (ctx, quantity, lot, expiration, to = ctx.supply) =>
  post("chief-a", { type: "receive", itemId: ctx.itemId, toLocationId: to, quantity, lot, expiration });

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
  await db.doc(`departments/${A}/roles/supplyOnly`).set({ id: "supplyOnly", name: "Supply manager", permissions: { manageEmsInventory: true, useEmsSupplies: true } });
  await Promise.all([
    member(A, "chief-a", ["fireChief"]),
    member(A, "officer-a", ["companyOfficer"]),
    member(A, "ff-a", ["firefighter"]),
    member(A, "supply-a", ["supplyOnly"]),
    member(B, "chief-b", ["fireChief"]),
  ]);
});

describe("medication catalog", () => {
  it("saves medication fields, normalizes the NDC and always tracks lots and expiration", async () => {
    const { itemId } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, tracksLots: false, tracksExpiration: false } }));
    const item = (await db.doc(`departments/${A}/emsInventoryItems/${itemId}`).get()).data();
    assert.equal(item.itemClass, "medication");
    assert.equal(item.ndc11, "00409-4921-34");
    assert.deepEqual(item.routes, ["IV", "IO"]);
    assert.equal(item.tracksLots, true);
    assert.equal(item.tracksExpiration, true);
    // The class never changes on edit.
    await inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, id: itemId, itemClass: "supply", strength: "0.1 mg/mL" } }));
    const after = (await db.doc(`departments/${A}/emsInventoryItems/${itemId}`).get()).data();
    assert.equal(after.itemClass, "medication");
    assert.equal(after.strength, "0.1 mg/mL");
  });

  it("refuses a bad NDC and a missing generic name", async () => {
    await expectCode(inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, ndc: "1234567890" } })), "invalid-argument", /NDC/);
    await expectCode(inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, genericName: "" } })), "invalid-argument", /generic name/);
  });

  it("needs medication permissions, not supply ones", async () => {
    await expectCode(inv.saveItem(db, req("supply-a", { departmentId: A, item: EPI })), "permission-denied", /medications/);
    await expectCode(inv.saveItem(db, req("ff-a", { departmentId: A, item: EPI })), "permission-denied");
    await expectCode(inv.saveItem(db, req("chief-b", { departmentId: A, item: EPI })), "permission-denied");
    // The supply manager still manages supplies.
    await inv.saveItem(db, req("supply-a", { departmentId: A, item: { name: "Gauze", category: "Dressings" } }));
  });
});

describe("medication stock", () => {
  it("needs a lot and expiration to receive, and stamps the ledger with the item class", async () => {
    const ctx = await setup();
    await expectCode(post("chief-a", { type: "receive", itemId: ctx.itemId, toLocationId: ctx.supply, quantity: 5, expiration: "2027-05-01" }), "invalid-argument", /lot/);
    await receive(ctx, 5, "EP1", "2027-05-01");
    const records = (await db.collection(`departments/${A}/emsInventoryTransactions`).get()).docs.map((d) => d.data());
    assert.deepEqual(records.map((r) => r.itemClass), ["medication"]);
  });

  it("crews record use with useEmsMedications; supply-only members can't touch medications", async () => {
    const ctx = await setup();
    await receive(ctx, 5, "EP1", "2027-05-01");
    await post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1, incidentNumber: "26-1" });
    await expectCode(post("supply-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 }), "permission-denied", /medications/);
    await expectCode(post("ff-a", { type: "waste", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1, reason: "dropped" }), "permission-denied");
    assert.equal((await balance(ctx.supply, ctx.itemId)).onHand, 4);
  });

  it("refuses controlled substances in this ledger", async () => {
    const { itemId } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, name: "Fentanyl 100 mcg/2 mL", genericName: "Fentanyl", controlledSchedule: "II", ndc: "" } }));
    const { locationId } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Safe", type: "storageArea" } }));
    await expectCode(post("chief-a", { type: "receive", itemId, toLocationId: locationId, quantity: 2, lot: "F1", expiration: "2027-01-01" }), "failed-precondition", /controlled substance/i);
  });
});

describe("recalls and holds", () => {
  it("a recall holds matching lots everywhere; held stock can't be used and doesn't count toward par", async () => {
    const ctx = await setup();
    await receive(ctx, 6, "BAD-1", "2027-05-01");
    await receive(ctx, 4, "GOOD-2", "2027-06-01");
    await post("ff-a", { type: "transfer", itemId: ctx.itemId, fromLocationId: ctx.supply, toLocationId: ctx.medic, quantity: 2 });
    await inv.setPar(db, req("chief-a", { departmentId: A, locationId: ctx.supply, itemId: ctx.itemId, par: { min: 5 } }));

    const result = await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], lotNumbers: ["bad1"], reason: "Particulate matter", recallClass: "II", reference: "R-100" } }));
    assert.equal(result.heldLots, 1);
    assert.equal(result.heldQuantity, 6);

    const supply = await balance(ctx.supply, ctx.itemId);
    assert.equal(supply.heldQuantity, 4);
    assert.equal(supply.lowStock, true, "4 good of a minimum of 5");
    assert.deepEqual(supply.lots.map((l) => [l.lot, l.held]), [["BAD-1", true], ["GOOD-2", false]]);
    assert.equal((await balance(ctx.medic, ctx.itemId)).heldQuantity, 2);

    // Use skips the held lot, and refuses it when chosen.
    const used = await post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 });
    assert.deepEqual(used.lines.map((l) => l.lot), ["GOOD-2"]);
    const bad = lotKey("BAD-1", "2027-05-01");
    await expectCode(post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.medic, quantity: 1, lotKey: bad }), "failed-precondition", /on hold/);
    await expectCode(post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.medic, quantity: 1 }), "failed-precondition", /on hold/);

    // Held stock can be moved to quarantine when chosen, stays held, and leaves as a return.
    await post("ff-a", { type: "transfer", itemId: ctx.itemId, fromLocationId: ctx.medic, toLocationId: ctx.supply, quantity: 2, lotKey: bad });
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 6);
    await expectCode(meds.closeRecall(db, req("chief-a", { departmentId: A, recallId: result.recallId, outcome: "completed" })), "failed-precondition", /still on hand/);
    await post("chief-a", { type: "returnToVendor", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 6, lotKey: bad, reason: "Recall R-100" });
    await meds.closeRecall(db, req("chief-a", { departmentId: A, recallId: result.recallId, outcome: "completed" }));
    const [hold] = await holds();
    assert.equal(hold.status, "released");
    const recall = (await db.doc(`departments/${A}/emsMedicationRecalls/${result.recallId}`).get()).data();
    assert.equal(recall.status, "closed");
    assert.equal(recall.outcome, "completed");
  });

  it("a recalled lot received later goes straight on hold", async () => {
    const ctx = await setup();
    await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], lotNumbers: ["LATE-9"], reason: "Mislabeled", reference: "R-9" } }));
    const received = await receive(ctx, 3, "late9", "2027-08-01");
    assert.deepEqual(received.heldForRecall.map((r) => r.reference), ["R-9"]);
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 3);
    const other = await receive(ctx, 2, "OK-1", "2027-08-01");
    assert.equal(other.heldForRecall, undefined);
  });

  it("withdrawing a recall releases its holds", async () => {
    const ctx = await setup();
    await receive(ctx, 3, "W-1", "2027-08-01");
    const { recallId } = await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], reason: "Every lot" } }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 3);
    await expectCode(meds.closeRecall(db, req("chief-a", { departmentId: A, recallId, outcome: "withdrawn" })), "invalid-argument", /why/);
    await meds.closeRecall(db, req("chief-a", { departmentId: A, recallId, outcome: "withdrawn", note: "Manufacturer withdrew it" }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 0);
    await post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 });
  });

  it("manual holds: placed and released by a manager, not while a recall covers the lot", async () => {
    const ctx = await setup();
    await receive(ctx, 3, "T-1", "2027-08-01");
    const key = lotKey("T-1", "2027-08-01");
    await expectCode(meds.placeHold(db, req("ff-a", { departmentId: A, itemId: ctx.itemId, lotKey: key, reason: "Left in the sun" })), "permission-denied");
    await expectCode(meds.placeHold(db, req("chief-a", { departmentId: A, itemId: ctx.itemId, lotKey: key })), "invalid-argument", /why/);
    const { holdId } = await meds.placeHold(db, req("chief-a", { departmentId: A, itemId: ctx.itemId, lotKey: key, reason: "Temperature excursion" }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 3);

    const { recallId } = await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], lotNumbers: ["T-1"], reason: "Recall too" } }));
    await expectCode(meds.releaseHold(db, req("chief-a", { departmentId: A, holdId, note: "Fine" })), "failed-precondition", /recall/);
    // Withdrawing the recall keeps the manual hold.
    await meds.closeRecall(db, req("chief-a", { departmentId: A, recallId, outcome: "withdrawn", note: "Not ours" }));
    assert.equal((await holds())[0].status, "active");
    await meds.releaseHold(db, req("chief-a", { departmentId: A, holdId, note: "Checked: within range" }));
    assert.equal((await balance(ctx.supply, ctx.itemId)).heldQuantity, 0);
  });

  it("recalls take only medications, and stay inside the department", async () => {
    const ctx = await setup();
    const { itemId: gauze } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: { name: "Gauze", category: "Dressings" } }));
    await expectCode(meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [gauze], reason: "x" } })), "failed-precondition", /isn't a medication/);
    await expectCode(meds.createRecall(db, req("chief-b", { departmentId: B, recall: { itemIds: [ctx.itemId], reason: "x" } })), "not-found");
    await expectCode(meds.createRecall(db, req("supply-a", { departmentId: A, recall: { itemIds: [ctx.itemId], reason: "x" } })), "permission-denied");
  });

  it("a count adjustment keeps hold flags", async () => {
    const ctx = await setup();
    await receive(ctx, 4, "C-1", "2027-08-01");
    await meds.placeHold(db, req("chief-a", { departmentId: A, itemId: ctx.itemId, lotKey: lotKey("C-1", "2027-08-01"), reason: "Check" }));
    const { countId } = await inv.startCount(db, req("officer-a", { departmentId: A, locationId: ctx.supply, requestId: rid() }));
    const count = (await db.doc(`departments/${A}/emsInventoryCounts/${countId}`).get()).data();
    const rows = count.rows.map((r) => ({ ...r, counted: r.expected - 1, reason: "One broken" }));
    await inv.submitCount(db, req("officer-a", { departmentId: A, countId, rows }));
    await inv.approveCount(db, req("chief-a", { departmentId: A, countId }));
    const after = await balance(ctx.supply, ctx.itemId);
    assert.equal(after.onHand, 3);
    assert.equal(after.heldQuantity, 3);
  });

  it("reversing a removal of a recalled lot puts the stock back on hold", async () => {
    const ctx = await setup();
    await receive(ctx, 2, "REV-1", "2027-08-01");
    const used = await post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 2 });
    const { heldLots } = await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], lotNumbers: ["REV-1"], reason: "Wrong strength", reference: "R-7" } }));
    assert.equal(heldLots, 0, "nothing on hand when the recall was recorded");
    await inv.reverseTransaction(db, req("chief-a", { departmentId: A, transactionId: used.transactionId, reason: "Entered on the wrong unit" }));
    const after = await balance(ctx.supply, ctx.itemId);
    assert.equal(after.onHand, 2);
    assert.equal(after.heldQuantity, 2);
    const [hold] = await holds();
    assert.equal(hold.status, "active");
    assert.equal(hold.recallIds.length, 1);
    await expectCode(post("ff-a", { type: "usage", itemId: ctx.itemId, fromLocationId: ctx.supply, quantity: 1 }), "failed-precondition", /on hold/);
  });

  it("a count that finds a recalled lot puts it on hold", async () => {
    const ctx = await setup();
    await receive(ctx, 1, "OK-1", "2027-08-01");
    await meds.createRecall(db, req("chief-a", { departmentId: A, recall: { itemIds: [ctx.itemId], lotNumbers: ["FOUND-7"], reason: "Contamination", reference: "R-8" } }));
    const { countId } = await inv.startCount(db, req("officer-a", { departmentId: A, locationId: ctx.supply, requestId: rid() }));
    await inv.saveCount(db, req("officer-a", { departmentId: A, countId, addRows: [{ itemId: ctx.itemId, lot: "FOUND-7", expiration: "2027-09-01" }] }));
    const count = (await db.doc(`departments/${A}/emsInventoryCounts/${countId}`).get()).data();
    const rows = count.rows.map((r) => (r.added ? { ...r, counted: 3, reason: "Found in a drawer" } : { ...r, counted: r.expected }));
    await inv.submitCount(db, req("officer-a", { departmentId: A, countId, rows }));
    await inv.approveCount(db, req("chief-a", { departmentId: A, countId }));
    const after = await balance(ctx.supply, ctx.itemId);
    assert.equal(after.onHand, 4);
    assert.equal(after.heldQuantity, 3);
    const [hold] = await holds();
    assert.equal(hold.key, lotKey("FOUND-7", "2027-09-01"));
    assert.equal(hold.status, "active");
  });

  it("counts can't add or adjust a controlled substance", async () => {
    const ctx = await setup();
    const { itemId: fentanyl } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: { ...EPI, name: "Fentanyl 100 mcg/2 mL", genericName: "Fentanyl", controlledSchedule: "II", ndc: "" } }));
    await receive(ctx, 1, "OK-1", "2027-08-01");
    // A balance written before the item was marked controlled stays off the count sheet.
    await db.doc(`departments/${A}/emsInventoryBalances/${ctx.supply}__${fentanyl}`).set({ itemId: fentanyl, locationId: ctx.supply, onHand: 2,
      lots: [{ key: lotKey("F-1", "2027-01-01"), lot: "F-1", expiration: "2027-01-01", quantity: 2 }] });
    const { countId } = await inv.startCount(db, req("officer-a", { departmentId: A, locationId: ctx.supply, requestId: rid() }));
    const count = (await db.doc(`departments/${A}/emsInventoryCounts/${countId}`).get()).data();
    assert.ok(count.rows.every((r) => r.itemId !== fentanyl));
    await expectCode(inv.saveCount(db, req("officer-a", { departmentId: A, countId, addRows: [{ itemId: fentanyl, lot: "F-2", expiration: "2027-01-01" }] })), "failed-precondition", /controlled substance/i);

    // Even a count that already holds such a row can't be approved.
    const ref = db.doc(`departments/${A}/emsInventoryCounts/${countId}`);
    await ref.update({ status: "submitted", submittedBy: "officer-a", rows: [...count.rows.map((r) => ({ ...r, counted: r.expected })),
      { rowId: `${fentanyl}-x`, itemId: fentanyl, itemName: "Fentanyl", unitOfMeasure: "each", key: lotKey("F-1", "2027-01-01"), lot: "F-1", expiration: "2027-01-01", expected: 2, counted: 5, reason: "x", added: false }] });
    await expectCode(inv.approveCount(db, req("chief-a", { departmentId: A, countId })), "failed-precondition", /controlled substance/i);
  });
});
