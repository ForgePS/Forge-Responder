// EMS check-off callables (functions/lib/emsCheckoffs/service.js) against the
// Firestore emulator: assignments, readiness rules, recording a finished check
// (equipment answers into the equipment's history, supply counts judged against
// par without moving stock), retries that act once, sign-off by someone else,
// permissions per role and tenant isolation.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const ck = require("./lib/emsCheckoffs/service.js");
const eq = require("./lib/emsEquipment/service.js");
const inv = require("./lib/emsInventory/service.js");

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
const equipment = async (id) => (await db.doc(`departments/${A}/emsEquipment/${id}`).get()).data();
const result = async (id, d = A) => (await db.doc(`departments/${d}/emsCheckoffResults/${id}`).get()).data();
const audits = async () => (await db.collection(`departments/${A}/emsAuditEvents`).get()).docs.map((doc) => doc.data());

const TEMPLATE = {
  templateId: "TPL-MEDIC",
  version: 1,
  name: "Daily medic check-off",
  sections: [{ id: "s1", title: "EMS", fields: [
    { key: "lights", label: "Lights", type: "pass_fail" },
    { key: "gear", label: "Equipment on the unit", type: "ems_equipment" },
    { key: "stock", label: "Supplies on the unit", type: "ems_supplies" },
  ] }],
};

/**
 * Medic 1 (ALS class, Station 1) with a monitor, an AED and a cabinet holding
 * gauze (par min 4, 5 on hand); Medic 2 with a suction unit. One published checklist.
 */
async function setup() {
  await db.doc(`departments/${A}/fleetAssets/FA-M1`).set({ unitDesignation: "Medic 1", station: "Station 1", fleetClassId: "ALS" });
  await db.doc(`departments/${A}/fleetAssets/FA-M2`).set({ unitDesignation: "Medic 2", station: "Station 2" });
  await db.doc(`departments/${A}/fleetClasses/ALS`).set({ name: "ALS ambulance" });
  await db.doc(`departments/${A}/fleetChecklistTemplates/${TEMPLATE.templateId}`).set({ name: TEMPLATE.name, lifecycleStatus: "published", currentVersion: 1 });
  const save = (equipmentFields) => eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: equipmentFields }));
  const { equipmentId: monitor } = await save({ name: "Cardiac monitor", category: "Cardiac Monitoring", assetNumber: "CM-01", assignment: { fleetAssetId: "FA-M1" } });
  const { equipmentId: aed } = await save({ name: "AED", category: "Defibrillation", assetNumber: "AED-01", assignment: { fleetAssetId: "FA-M1" } });
  const { equipmentId: suction } = await save({ name: "Suction", category: "Suction", assetNumber: "SU-01", assignment: { fleetAssetId: "FA-M2" } });
  const { itemId } = await inv.saveItem(db, req("chief-a", { departmentId: A, item: { name: "Gauze 4x4", category: "Bandages", unitOfMeasure: "pack" } }));
  const { locationId: vehicle } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Medic 1", type: "vehicle", fleetAssetId: "FA-M1" } }));
  const { locationId: cabinet } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Cabinet 3", type: "cabinet", parentId: vehicle } }));
  await inv.postTransaction(db, req("chief-a", { departmentId: A, requestId: rid(), type: "receive", itemId, toLocationId: cabinet, quantity: 5 }));
  await inv.setPar(db, req("chief-a", { departmentId: A, locationId: cabinet, itemId, par: { min: 4, max: 8 } }));
  return { monitor, aed, suction, itemId, cabinet, balanceId: `${cabinet}__${itemId}` };
}

/** A finished Fleet check by `uid`, as the browser writes it. */
async function finishedCheck(uid, answers, { checkId = `CHK-${(seq += 1)}`, fleetAssetId = "FA-M1", template = TEMPLATE, d = A } = {}) {
  await db.doc(`departments/${d}/fleetChecks/${checkId}`).set({
    id: checkId, fleetAssetId, templateId: template.templateId, templateVersion: template.version, templateSnapshot: template,
    status: "completed", result: "Failed", failedItems: [{ fieldKey: "gear" }], answers, operatorId: uid, operatorName: uid,
    completedAt: "2026-11-26T14:00:00.000Z",
  });
  return checkId;
}

const assign = (uid, assignment) => ck.saveAssignment(db, req(uid, { departmentId: A, assignment }));
const record = (uid, checkId, d = A) => ck.recordResults(db, req(uid, { departmentId: d, checkId }));

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
    member(B, "ff-b", ["firefighter"]),
  ]);
});

describe("assignments and readiness rules", () => {
  it("assigns a checklist to a vehicle, a fleet class or a station with labels from the real records", async () => {
    await setup();
    const { assignmentId } = await assign("bc-a", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "daily" }, requiresSignOff: true });
    let a = (await db.doc(`departments/${A}/emsCheckoffAssignments/${assignmentId}`).get()).data();
    assert.equal(a.targetLabel, "Medic 1");
    assert.equal(a.templateName, TEMPLATE.name);
    assert.equal(a.requiresSignOff, true);
    await assign("bc-a", { id: assignmentId, templateId: TEMPLATE.templateId, targetType: "fleetClass", targetId: "ALS", frequency: { kind: "every_n_days", days: 3 }, active: false });
    a = (await db.doc(`departments/${A}/emsCheckoffAssignments/${assignmentId}`).get()).data();
    assert.equal(a.targetLabel, "ALS ambulance");
    assert.deepEqual(a.frequency, { kind: "every_n_days", days: 3 });
    assert.equal(a.active, false);
    assert.equal(a.version, 2);
    const { assignmentId: byStation } = await assign("chief-a", { templateId: TEMPLATE.templateId, targetType: "station", targetId: "Station 2", frequency: { kind: "weekly" } });
    assert.ok(byStation);
    assert.ok((await audits()).some((x) => x.action === "ems.checkoff.assignment.updated"));
  });

  it("refuses unknown checklists and vehicles, bad schedules, and members who don't manage check-offs", async () => {
    await setup();
    await expectCode(assign("bc-a", { templateId: "NOPE", targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "daily" } }), "not-found");
    await expectCode(assign("bc-a", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-X", frequency: { kind: "daily" } }), "not-found");
    await expectCode(assign("bc-a", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "every_n_days", days: 0 } }), "invalid-argument");
    await expectCode(assign("officer-a", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "daily" } }), "permission-denied");
    await expectCode(assign("chief-b", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "daily" } }), "permission-denied");
  });

  it("saves readiness rules with defaults for anything left out", async () => {
    const { rules } = await ck.saveReadinessRules(db, req("chief-a", { departmentId: A, rules: { suppliesLow: "off", requiredEquipmentCategories: ["Defibrillation"] } }));
    assert.equal(rules.suppliesLow, "off");
    assert.equal(rules.checkOverdue, "not_ready");
    const stored = (await db.doc(`departments/${A}/emsCheckoffSettings/main`).get()).data();
    assert.deepEqual(stored.readinessRules.requiredEquipmentCategories, ["Defibrillation"]);
    await expectCode(ck.saveReadinessRules(db, req("ff-a", { departmentId: A, rules: {} })), "permission-denied");
    await expectCode(ck.saveReadinessRules(db, req("chief-a", { departmentId: A, rules: { checkOverdue: "maybe" } })), "invalid-argument");
  });
});

describe("recording a finished check-off", () => {
  it("records equipment answers on each piece and judges supply counts against par without moving stock", async () => {
    const ctx = await setup();
    const checkId = await finishedCheck("ff-a", {
      lights: "Pass",
      gear: { expected: [ctx.monitor, ctx.aed], rows: { [ctx.monitor]: { state: "present" }, [ctx.aed]: { state: "damaged", outOfUse: true, note: "Cracked case" } } },
      stock: { expected: [{ id: ctx.balanceId, parMin: 4 }], rows: { [ctx.balanceId]: { count: 3, expiredFound: true } } },
    });
    const out = await record("ff-a", checkId);
    assert.equal(out.recorded, true);
    const r = await result(checkId);
    assert.equal(r.unitDesignation, "Medic 1");
    assert.equal(r.operatorUid, "ff-a");
    assert.deepEqual(r.equipment.map((e) => [e.equipmentId, e.state, e.outcome]), [[ctx.monitor, "present", "recorded"], [ctx.aed, "damaged", "recorded"]]);
    assert.equal(r.supplies.length, 1);
    assert.deepEqual(
      { short: r.supplies[0].short, shortBy: r.supplies[0].shortBy, parMin: r.supplies[0].parMin, ledgerOnHand: r.supplies[0].ledgerOnHand, countDiffers: r.supplies[0].countDiffers, expiredFound: r.supplies[0].expiredFound, locationName: r.supplies[0].locationName },
      { short: true, shortBy: 1, parMin: 4, ledgerOnHand: 5, countDiffers: true, expiredFound: true, locationName: "Cabinet 3" },
    );
    assert.deepEqual(r.problemCounts, { equipment: 1, supplies: 1, countsDiffer: 1 });
    assert.equal(r.verification.status, "not_required");

    const monitor = await equipment(ctx.monitor);
    assert.equal(monitor.lastVerifiedBy, "ff-a");
    const aed = await equipment(ctx.aed);
    assert.equal(aed.status, "maintenance_required");
    assert.equal(aed.openProblem.description, "Cracked case");
    const balance = (await db.doc(`departments/${A}/emsInventoryBalances/${ctx.balanceId}`).get()).data();
    assert.equal(balance.onHand, 5, "a check-off count never changes stock");
    assert.ok((await audits()).some((x) => x.action === "ems.checkoff.recorded" && x.recordId === checkId));
  });

  it("records once: a retry returns the first result and adds no equipment history", async () => {
    const ctx = await setup();
    const checkId = await finishedCheck("ff-a", { gear: { expected: [ctx.monitor], rows: { [ctx.monitor]: { state: "missing" } } } });
    const [first, second] = await Promise.all([record("ff-a", checkId), record("ff-a", checkId)]);
    assert.equal(first.recorded && second.recorded, true);
    const third = await record("ff-a", checkId);
    assert.equal(third.replayed, true);
    const history = (await db.collection(`departments/${A}/emsEquipmentEvents`).where("equipmentId", "==", ctx.monitor).get()).docs.map((d) => d.data().type);
    assert.deepEqual(history.sort(), ["registered", "reported_missing"]);
    assert.equal((await equipment(ctx.monitor)).status, "missing");
  });

  it("skips equipment that isn't on the checked unit and supplies at other locations", async () => {
    const ctx = await setup();
    const checkId = await finishedCheck("ff-a", {
      gear: { expected: [ctx.suction], rows: { [ctx.suction]: { state: "missing" } } },
      stock: { expected: [], rows: { [`OTHER__${ctx.itemId}`]: { count: 0 } } },
    });
    await record("ff-a", checkId);
    const r = await result(checkId);
    assert.equal(r.equipment[0].outcome, "skipped");
    assert.match(r.equipment[0].message, /isn't on this unit/);
    assert.equal(r.supplies.length, 0);
    assert.equal((await equipment(ctx.suction)).status, "assigned");
  });

  it("a check with no EMS items is recorded only when an assignment covers it, and then follows its sign-off setting", async () => {
    await setup();
    const plain = { templateId: TEMPLATE.templateId, version: 1, name: TEMPLATE.name, sections: [{ id: "s", fields: [{ key: "lights", type: "pass_fail" }] }] };
    const first = await finishedCheck("ff-a", { lights: "Pass" }, { template: plain });
    assert.deepEqual(await record("ff-a", first), { recorded: false, reason: "not_ems" });
    await assign("bc-a", { templateId: TEMPLATE.templateId, targetType: "station", targetId: "Station 1", frequency: { kind: "daily" }, requiresSignOff: true });
    const second = await finishedCheck("ff-a", { lights: "Pass" }, { template: plain });
    await record("ff-a", second);
    assert.equal((await result(second)).verification.status, "pending");
  });

  it("only the person who did the check records it; unfinished checks and other departments are refused", async () => {
    const ctx = await setup();
    const checkId = await finishedCheck("ff-a", { gear: { expected: [ctx.monitor], rows: { [ctx.monitor]: { state: "present" } } } });
    await expectCode(record("officer-a", checkId), "permission-denied", /person who did/);
    await expectCode(record("ro-a", checkId), "permission-denied");
    await expectCode(record("chief-b", checkId, B), "not-found");
    await db.doc(`departments/${A}/fleetChecks/${checkId}`).update({ status: "in_progress" });
    await expectCode(record("ff-a", checkId), "failed-precondition");
  });

  it("a member of another department can't act on this department's equipment through their own check", async () => {
    const ctx = await setup();
    await db.doc(`departments/${B}/fleetAssets/FA-M1`).set({ unitDesignation: "B Medic" });
    const checkId = await finishedCheck("ff-b", { gear: { expected: [ctx.monitor], rows: { [ctx.monitor]: { state: "missing" } } } }, { d: B });
    await record("ff-b", checkId, B);
    const r = await result(checkId, B);
    assert.equal(r.equipment[0].outcome, "skipped");
    assert.equal((await equipment(ctx.monitor)).status, "assigned");
  });
});

describe("sign-off", () => {
  async function pendingCheck() {
    await setup();
    await assign("bc-a", { templateId: TEMPLATE.templateId, targetType: "vehicle", targetId: "FA-M1", frequency: { kind: "daily" }, requiresSignOff: true });
    const checkId = await finishedCheck("officer-a", { lights: "Pass" });
    await record("officer-a", checkId);
    return checkId;
  }

  it("someone else signs it off once; the person who did it can't", async () => {
    const checkId = await pendingCheck();
    await expectCode(ck.signOff(db, req("officer-a", { departmentId: A, checkId, decision: "verified" })), "permission-denied", /Someone else/);
    await expectCode(ck.signOff(db, req("ff-a", { departmentId: A, checkId, decision: "verified" })), "permission-denied");
    await ck.signOff(db, req("bc-a", { departmentId: A, checkId, decision: "verified", note: "Looks good" }));
    const r = await result(checkId);
    assert.deepEqual([r.verification.status, r.verification.by, r.verification.note], ["verified", "bc-a", "Looks good"]);
    await expectCode(ck.signOff(db, req("chief-a", { departmentId: A, checkId, decision: "returned", note: "x" })), "failed-precondition");
    assert.ok((await audits()).some((x) => x.action === "ems.checkoff.verified"));
  });

  it("sending back needs a reason", async () => {
    const checkId = await pendingCheck();
    await expectCode(ck.signOff(db, req("bc-a", { departmentId: A, checkId, decision: "returned" })), "invalid-argument");
    await ck.signOff(db, req("bc-a", { departmentId: A, checkId, decision: "returned", note: "Count the cabinet again" }));
    assert.equal((await result(checkId)).verification.status, "returned");
  });

  it("another department can't sign off this department's check-off", async () => {
    const checkId = await pendingCheck();
    await expectCode(ck.signOff(db, req("chief-b", { departmentId: B, checkId, decision: "verified" })), "not-found");
    await expectCode(ck.signOff(db, req("chief-b", { departmentId: A, checkId, decision: "verified" })), "permission-denied");
  });
});

describe("the plan", () => {
  it("refuses everything when the plan lists modules without EMS Management", async () => {
    await setup();
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["apparatus"] });
    await expectCode(ck.saveReadinessRules(db, req("chief-a", { departmentId: A, rules: {} })), "permission-denied", /plan/);
  });
});
