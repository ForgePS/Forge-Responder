// EMS equipment callables (functions/lib/emsEquipment/service.js) against the
// Firestore and Storage emulators: registration, moves, verification, missing
// and found, inspections, repairs, retirement, files, idempotent retries,
// permissions per role, tenant isolation, the plan, and the classic Assets
// import with rollback. A cross-tenant write or a doubled action blocks release.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const eq = require("./lib/emsEquipment/service.js");
const inv = require("./lib/emsInventory/service.js");

const PROJECT_ID = "demo-forge-rms";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const A = "dept-a";
const B = "dept-b";

let db;
let bucket;
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
const record = async (id, d = A) => (await db.doc(`departments/${d}/emsEquipment/${id}`).get()).data();
const events = async (id, d = A) => (await db.collection(`departments/${d}/emsEquipmentEvents`).where("equipmentId", "==", id).get()).docs.map((doc) => doc.data());
const audits = async (d = A) => (await db.collection(`departments/${d}/emsAuditEvents`).get()).docs.map((doc) => doc.data());

/** A Fleet medic unit and a supply room, and one cardiac monitor on the medic unit. */
async function setup() {
  await db.doc(`departments/${A}/fleetAssets/FA-M1`).set({ unitDesignation: "Medic 1", station: "Station 1" });
  await db.doc(`departments/${A}/fleetAssets/FA-M2`).set({ unitDesignation: "Medic 2", station: "Station 2" });
  const { locationId: supply } = await inv.saveLocation(db, req("chief-a", { departmentId: A, location: { name: "Supply room", type: "storageArea", stationName: "Station 1" } }));
  const { equipmentId } = await eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: {
    name: "Cardiac monitor", category: "Cardiac Monitoring", assetNumber: "CM-01", serialNumber: "SN-5501", manufacturer: "Zoll",
    schedules: { inspectionIntervalDays: 30, nextInspectionDue: "2026-12-01", maintenanceIntervalDays: 365 },
    assignment: { fleetAssetId: "FA-M1" },
  } }));
  return { supply, equipmentId };
}

const act = (fn, uid, data) => fn(db, req(uid, { departmentId: A, requestId: rid(), ...data }));

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = admin.firestore();
  bucket = admin.storage().bucket(BUCKET);
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

describe("registering equipment", () => {
  it("places it on the unit as Assigned, copies labels from Fleet, and writes history and audit", async () => {
    const { equipmentId } = await setup();
    const r = await record(equipmentId);
    assert.equal(r.status, "assigned");
    assert.deepEqual(r.assignment, { stationName: "Station 1", fleetAssetId: "FA-M1", unitDesignation: "Medic 1", locationId: "", locationName: "" });
    assert.equal(r.assetNumberKey, "CM01");
    assert.equal(r.serialKey, "SN5501");
    assert.equal(r.version, 1);
    assert.deepEqual((await events(equipmentId)).map((e) => e.type), ["registered"]);
    assert.ok((await audits()).some((a) => a.action === "ems.equipment.registered" && a.recordId === equipmentId));
  });

  it("refuses an equipment ID already in use, but another department may use it", async () => {
    await setup();
    await expectCode(eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { name: "Other", category: "Suction", assetNumber: "cm 01" } })), "already-exists");
    const other = await eq.saveEquipment(db, req("chief-b", { departmentId: B, equipment: { name: "Monitor", category: "Cardiac Monitoring", assetNumber: "CM-01" } }));
    assert.ok(other.equipmentId);
  });

  it("makes an equipment ID when none is given; editing keeps status and place and records what changed", async () => {
    const { equipmentId } = await setup();
    const { equipmentId: bare } = await eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { name: "Suction unit", category: "Suction" } }));
    assert.equal((await record(bare)).assetNumber, bare);
    assert.equal((await record(bare)).status, "available");

    await eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { id: equipmentId, name: "Cardiac monitor", category: "Cardiac Monitoring", assetNumber: "CM-01", model: "X Series", status: "retired", assignment: {} } }));
    const r = await record(equipmentId);
    assert.equal(r.model, "X Series");
    assert.equal(r.status, "assigned");
    assert.equal(r.assignment.fleetAssetId, "FA-M1");
    assert.equal(r.version, 2);
    assert.equal(r.schedules.inspectionIntervalDays, null, "schedules are replaced by what the form sends");
    const edit = (await events(equipmentId)).find((e) => e.type === "updated");
    assert.ok(edit.changedFields.includes("model"));
  });

  it("only managers register or edit", async () => {
    await setup();
    for (const uid of ["officer-a", "ff-a", "ro-a"]) {
      await expectCode(eq.saveEquipment(db, req(uid, { departmentId: A, equipment: { name: "X", category: "Suction" } })), "permission-denied");
    }
  });

  it("refuses a vehicle or storage location from another department, and bad dates and intervals", async () => {
    await setup();
    await db.doc(`departments/${B}/fleetAssets/FA-B1`).set({ unitDesignation: "B Medic" });
    await expectCode(eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { name: "X", category: "Suction", assignment: { fleetAssetId: "FA-B1" } } })), "not-found");
    await expectCode(eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { name: "X", category: "Suction", purchaseDate: "2026-13-01" } })), "invalid-argument");
    await expectCode(eq.saveEquipment(db, req("chief-a", { departmentId: A, equipment: { name: "X", category: "Suction", schedules: { inspectionIntervalDays: 0 } } })), "invalid-argument");
  });
});

describe("moving equipment", () => {
  it("officers move it to storage (Available) and onto another unit (Assigned); the history keeps from and to", async () => {
    const { equipmentId, supply } = await setup();
    await act(eq.transferEquipment, "officer-a", { equipmentId, to: { locationId: supply }, reason: "Swap for service" });
    let r = await record(equipmentId);
    assert.equal(r.status, "available");
    assert.equal(r.assignment.locationName, "Supply room");
    assert.equal(r.assignment.stationName, "Station 1");
    await act(eq.transferEquipment, "officer-a", { equipmentId, to: { fleetAssetId: "FA-M2" } });
    r = await record(equipmentId);
    assert.equal(r.status, "assigned");
    assert.equal(r.assignment.unitDesignation, "Medic 2");
    const moves = (await events(equipmentId)).filter((e) => e.type === "transferred");
    assert.equal(moves.length, 2);
    assert.ok(moves.some((m) => m.from.unitDesignation === "Medic 1" && m.to.locationName === "Supply room" && m.reason === "Swap for service"));
  });

  it("firefighters and read-only members can't move equipment; moving it to where it already is is refused", async () => {
    const { equipmentId } = await setup();
    for (const uid of ["ff-a", "ro-a"]) await expectCode(act(eq.transferEquipment, uid, { equipmentId, to: {} }), "permission-denied");
    await expectCode(act(eq.transferEquipment, "officer-a", { equipmentId, to: { fleetAssetId: "FA-M1", stationName: "Station 1" } }), "failed-precondition", /already there/);
  });

  it("a retried request moves it once; the same request id can't be reused by someone else", async () => {
    const { equipmentId, supply } = await setup();
    const data = { departmentId: A, requestId: rid(), equipmentId, to: { locationId: supply } };
    const first = await eq.transferEquipment(db, req("officer-a", data));
    const again = await eq.transferEquipment(db, req("officer-a", data));
    assert.equal(first.replayed, false);
    assert.equal(again.replayed, true);
    assert.equal(again.eventId, first.eventId);
    assert.equal((await events(equipmentId)).filter((e) => e.type === "transferred").length, 1);
    assert.equal((await record(equipmentId)).version, 2);
    await expectCode(eq.transferEquipment(db, req("chief-a", data)), "already-exists");
  });

  it("two people moving it at once both land, one after the other", async () => {
    const { equipmentId, supply } = await setup();
    const results = await Promise.all([
      act(eq.transferEquipment, "officer-a", { equipmentId, to: { locationId: supply } }),
      act(eq.transferEquipment, "bc-a", { equipmentId, to: { fleetAssetId: "FA-M2" } }),
    ]);
    assert.deepEqual(results.map((x) => x.replayed), [false, false]);
    const moves = (await events(equipmentId)).filter((e) => e.type === "transferred");
    const r = await record(equipmentId);
    assert.equal(moves.length, 2);
    assert.equal(r.version, 3);
    // The second move starts from where the first one left it.
    const [first, second] = moves.sort((a, b) => a.at.localeCompare(b.at));
    assert.deepEqual(second.from, first.to);
    // The record ends where the last committed move put it.
    const last = moves.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    assert.deepEqual(r.assignment, last.to);
  });
});

describe("verifying, missing and found", () => {
  it("firefighters verify it's there; read-only members can't", async () => {
    const { equipmentId } = await setup();
    await act(eq.verifyEquipment, "ff-a", { equipmentId, note: "In the side compartment" });
    const r = await record(equipmentId);
    assert.equal(r.lastVerifiedBy, "ff-a");
    assert.ok(r.lastVerifiedAt);
    assert.equal(r.status, "assigned");
    const verified = (await events(equipmentId)).find((e) => e.type === "verified");
    assert.match(verified.at, /^\d{4}-\d{2}-\d{2}T/, "the event keeps its own timestamp");
    assert.equal(verified.place, "Medic 1 · Station 1");
    assert.equal(verified.actorUid, "ff-a");
    await expectCode(act(eq.verifyEquipment, "ro-a", { equipmentId }), "permission-denied");
  });

  it("missing equipment can't be moved or inspected; verifying it marks it found and restores its status", async () => {
    const { equipmentId, supply } = await setup();
    await act(eq.setStatus, "chief-a", { equipmentId, status: "in_service" });
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "missing", description: "Not in the compartment at shift change" });
    let r = await record(equipmentId);
    assert.equal(r.status, "missing");
    assert.equal(r.statusBeforeMissing, "in_service");
    await expectCode(act(eq.transferEquipment, "officer-a", { equipmentId, to: { locationId: supply } }), "failed-precondition", /missing/);
    await expectCode(act(eq.recordInspection, "ff-a", { equipmentId, result: "pass" }), "failed-precondition");
    await expectCode(act(eq.reportProblem, "ff-a", { equipmentId, kind: "missing", description: "again" }), "failed-precondition");
    await act(eq.verifyEquipment, "officer-a", { equipmentId });
    r = await record(equipmentId);
    assert.equal(r.status, "in_service");
    assert.equal(r.missingReport, null);
    assert.deepEqual((await events(equipmentId)).map((e) => e.type).sort(), ["found", "registered", "reported_missing", "status_changed"]);
  });

  it("equipment that goes missing while waiting for repair is still waiting for repair when found", async () => {
    const { equipmentId } = await setup();
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "maintenance", description: "Screen flickers" });
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "missing", description: "Gone from the shop shelf" });
    await act(eq.verifyEquipment, "ff-a", { equipmentId });
    const r = await record(equipmentId);
    assert.equal(r.status, "maintenance_required");
    assert.equal(r.openProblem.description, "Screen flickers");
    assert.equal(r.statusBeforeHold, "assigned");
  });
});

describe("problems, inspections and repairs", () => {
  it("a deficiency can be noted without taking it out of use, or take it out of use until repaired", async () => {
    const { equipmentId } = await setup();
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "damaged", description: "Cracked handle" });
    let r = await record(equipmentId);
    assert.equal(r.status, "assigned");
    assert.equal(r.openProblem.description, "Cracked handle");
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "damaged", description: "Won't power on", takeOutOfService: true });
    r = await record(equipmentId);
    assert.equal(r.status, "maintenance_required");
    assert.equal(r.condition, "damaged");
    await expectCode(act(eq.reportProblem, "ff-a", { equipmentId, kind: "damaged", description: "" }), "invalid-argument");
    await expectCode(act(eq.reportProblem, "ro-a", { equipmentId, kind: "damaged", description: "x" }), "permission-denied");
  });

  it("a passed inspection sets the next date from the interval; a failed one needs notes and holds it for repair", async () => {
    const { equipmentId } = await setup();
    await act(eq.recordInspection, "ff-a", { equipmentId, result: "pass" });
    let r = await record(equipmentId);
    const today = new Date().toISOString().slice(0, 10);
    const in30 = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000).toISOString().slice(0, 10);
    assert.equal(r.schedules.nextInspectionDue, in30);
    assert.ok(r.schedules.lastInspectionAt);
    assert.equal(r.lastVerifiedBy, "ff-a", "an inspection also proves it's there");
    await expectCode(act(eq.recordInspection, "ff-a", { equipmentId, result: "fail" }), "invalid-argument", /what failed/i);
    await act(eq.recordInspection, "ff-a", { equipmentId, result: "fail", notes: "Battery won't hold charge" });
    r = await record(equipmentId);
    assert.equal(r.status, "maintenance_required");
    assert.match(r.openProblem.description, /Battery/);
    assert.equal(r.schedules.nextInspectionDue, in30, "a failed inspection doesn't move the due date");
  });

  it("a calibration without an interval keeps the date the manager set", async () => {
    const { equipmentId } = await setup();
    await act(eq.recordInspection, "ff-a", { equipmentId, kind: "calibration", result: "pass", notes: "Within spec" });
    const r = await record(equipmentId);
    assert.ok(r.schedules.lastCalibrationAt);
    assert.equal(r.schedules.nextCalibrationDue, null);
    assert.equal((await events(equipmentId)).find((e) => e.type === "calibrated").result, "pass");
  });

  it("only managers complete maintenance, which clears the problem and returns it to use", async () => {
    const { equipmentId } = await setup();
    await act(eq.reportProblem, "ff-a", { equipmentId, kind: "damaged", description: "Won't power on", takeOutOfService: true });
    await expectCode(act(eq.completeMaintenance, "officer-a", { equipmentId, notes: "Fixed" }), "permission-denied");
    await expectCode(act(eq.completeMaintenance, "chief-a", { equipmentId, notes: "" }), "invalid-argument");
    await act(eq.completeMaintenance, "chief-a", { equipmentId, notes: "Replaced the battery", cost: "129.99", vendorName: "Zoll service" });
    const r = await record(equipmentId);
    assert.equal(r.status, "assigned");
    assert.equal(r.openProblem, null);
    assert.equal(r.condition, "good");
    assert.ok(r.schedules.nextMaintenanceDue, "next maintenance from the 365-day interval");
    const done = (await events(equipmentId)).find((e) => e.type === "maintenance_completed");
    assert.equal(done.cost, 129.99);
  });
});

describe("status changes, retirement and disposal", () => {
  it("out of service and retirement need a reason; disposal comes after retirement and is final", async () => {
    const { equipmentId, supply } = await setup();
    await expectCode(act(eq.setStatus, "chief-a", { equipmentId, status: "out_of_service" }), "invalid-argument", /reason/);
    await expectCode(act(eq.setStatus, "chief-a", { equipmentId, status: "disposed", reason: "x" }), "failed-precondition", /Retire/);
    await act(eq.setStatus, "chief-a", { equipmentId, status: "retired", reason: "End of life" });
    const r = await record(equipmentId);
    assert.equal(r.status, "retired");
    assert.ok(r.retiredAt);
    await expectCode(act(eq.transferEquipment, "chief-a", { equipmentId, to: { locationId: supply } }), "failed-precondition", /Retired/);
    await expectCode(act(eq.verifyEquipment, "ff-a", { equipmentId }), "failed-precondition");
    await act(eq.setStatus, "chief-a", { equipmentId, status: "disposed", reason: "Recycled" });
    await expectCode(act(eq.setStatus, "chief-a", { equipmentId, status: "available", reason: "Oops" }), "failed-precondition", /final/);
    assert.deepEqual((await events(equipmentId)).map((e) => e.type).sort(), ["disposed", "registered", "retired"]);
  });

  it("officers can't change status; Available on a vehicle is stored as Assigned", async () => {
    const { equipmentId } = await setup();
    await expectCode(act(eq.setStatus, "officer-a", { equipmentId, status: "in_service" }), "permission-denied");
    await act(eq.setStatus, "chief-a", { equipmentId, status: "in_service" });
    await act(eq.setStatus, "chief-a", { equipmentId, status: "available" });
    assert.equal((await record(equipmentId)).status, "assigned");
  });
});

describe("photos and documents", () => {
  it("lists a file uploaded into the record's folder and deletes it when removed", async () => {
    const { equipmentId } = await setup();
    const path = `departments/${A}/emsEquipment/${equipmentId}/abc-manual.pdf`;
    await bucket.file(path).save(Buffer.from("%PDF-1.7\n"), { contentType: "application/pdf" });
    await eq.addFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, kind: "document", path, name: "manual.pdf" }));
    let r = await record(equipmentId);
    assert.deepEqual(r.documents.map((f) => [f.name, f.contentType]), [["manual.pdf", "application/pdf"]]);
    await expectCode(eq.addFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, kind: "photo", path, name: "x" })), "invalid-argument", /images/);
    await eq.removeFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, path }));
    r = await record(equipmentId);
    assert.deepEqual(r.documents, []);
    const [exists] = await bucket.file(path).exists();
    assert.equal(exists, false);
  });

  it("refuses files outside the record's folder, missing uploads, and non-managers", async () => {
    const { equipmentId } = await setup();
    const other = `departments/${B}/emsEquipment/${equipmentId}/x.pdf`;
    await bucket.file(other).save(Buffer.from("x"), { contentType: "application/pdf" });
    await expectCode(eq.addFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, kind: "document", path: other })), "invalid-argument");
    await expectCode(eq.addFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, kind: "document", path: `departments/${A}/emsEquipment/${equipmentId}/../x` })), "invalid-argument");
    await expectCode(eq.addFile(db, bucket, req("chief-a", { departmentId: A, requestId: rid(), equipmentId, kind: "document", path: `departments/${A}/emsEquipment/${equipmentId}/nope.pdf` })), "not-found");
    await expectCode(eq.addFile(db, bucket, req("ff-a", { departmentId: A, requestId: rid(), equipmentId, kind: "document", path: other })), "permission-denied");
  });
});

describe("tenancy and the plan", () => {
  it("another department can't act on this department's equipment, even with the real id", async () => {
    const { equipmentId } = await setup();
    await expectCode(eq.verifyEquipment(db, req("chief-b", { departmentId: B, requestId: rid(), equipmentId })), "not-found");
    await expectCode(eq.verifyEquipment(db, req("chief-b", { departmentId: A, requestId: rid(), equipmentId })), "permission-denied");
    await expectCode(eq.saveEquipment(db, req("chief-b", { departmentId: B, equipment: { id: equipmentId, name: "Mine", category: "Suction" } })), "not-found");
    assert.equal((await record(equipmentId)).name, "Cardiac monitor");
  });

  it("nothing works when the plan doesn't include EMS Management, or without signing in", async () => {
    const { equipmentId } = await setup();
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["schedule", "ems"] });
    await expectCode(act(eq.verifyEquipment, "chief-a", { equipmentId }), "permission-denied", /plan/);
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["schedule", "emsManagement"] });
    await act(eq.verifyEquipment, "chief-a", { equipmentId });
    await expectCode(eq.verifyEquipment(db, req(null, { departmentId: A, requestId: rid(), equipmentId })), "unauthenticated");
  });
});

describe("importing the classic Assets list", () => {
  const rows = [
    { id: "AST-1178", name: "Cardiac Monitor", category: "Medical", serial: "CM-22018", location: "Medic 1", assigned: "F. Roster", inspection: "Jan 2, 2027", value: "$28,500", status: "In Service" },
    { id: "AST-1307", name: "Portable Radio", category: "Communications", serial: "RAD-55210", location: "Repair Vendor", assigned: "Unassigned", inspection: "Mar 1, 2027", value: "$4,600", status: "Out for Repair" },
    { id: "AST-1362", name: "AED", category: "Medical", serial: "AED-90117", location: "Station 2", status: "Available" },
    { id: "CM-01", name: "Clash", category: "Medical", status: "Available" },
  ];

  it("previews, imports the chosen rows, skips repeats, keeps the list, and rolls back only untouched records", async () => {
    await setup();
    await db.doc(`departments/${A}/lists/hlfd-rms-assets`).set({ items: rows });
    const stations = ["Station 1", "Station 2"];

    const preview = await eq.previewMigration(db, req("chief-a", { departmentId: A, stations }));
    assert.equal(preview.rows.length, 4);
    const byId = Object.fromEntries(preview.rows.map((r) => [r.sourceId, r]));
    assert.equal(byId["AST-1178"].record.where, "Medic 1 · Station 1");
    assert.equal(byId["AST-1307"].record.status, "maintenance_required");
    assert.equal(byId["AST-1362"].record.where, "Station 2");
    assert.match(byId["CM-01"].skip, /already has this equipment ID/);
    assert.equal(await db.collection(`departments/${A}/emsEquipment`).count().get().then((s) => s.data().count), 1, "preview writes nothing");

    const applied = await eq.applyMigration(db, req("chief-a", { departmentId: A, stations, sourceIds: ["AST-1178", "AST-1362", "CM-01"] }));
    assert.equal(applied.createdCount, 2);
    assert.equal(applied.skippedCount, 1);
    const imported = (await db.collection(`departments/${A}/emsEquipment`).where("migration.batchId", "==", applied.batchId).get()).docs.map((d) => d.data());
    const monitor = imported.find((r) => r.assetNumber === "AST-1178");
    assert.equal(monitor.status, "in_service");
    assert.equal(monitor.assignment.fleetAssetId, "FA-M1");
    assert.equal(monitor.purchasePrice, 28500);
    assert.equal(monitor.schedules.nextInspectionDue, "2027-01-02");
    assert.deepEqual((await events(monitor.id)).map((e) => e.type), ["imported"]);

    // Importing again skips what's already in.
    const again = await eq.previewMigration(db, req("chief-a", { departmentId: A, stations }));
    assert.equal(again.rows.find((r) => r.sourceId === "AST-1178").skip, "Already imported.");
    assert.equal(again.rows.find((r) => r.sourceId === "AST-1307").skip, "");

    // The classic list is untouched.
    assert.deepEqual((await db.doc(`departments/${A}/lists/hlfd-rms-assets`).get()).data().items, rows);

    // Someone verifies the monitor; rollback keeps it and removes the untouched AED.
    await act(eq.verifyEquipment, "ff-a", { equipmentId: monitor.id });
    const rolled = await eq.rollbackMigration(db, req("chief-a", { departmentId: A, batchId: applied.batchId }));
    assert.equal(rolled.removedCount, 1);
    assert.deepEqual(rolled.kept.map((k) => k.equipmentId), [monitor.id]);
    const left = (await db.collection(`departments/${A}/emsEquipment`).get()).docs.map((d) => d.data().assetNumber).sort();
    assert.deepEqual(left, ["AST-1178", "CM-01"]);
    const report = (await db.doc(`departments/${A}/emsEquipmentMigrations/${applied.batchId}`).get()).data();
    assert.equal(report.status, "partly_rolled_back");
    assert.ok((await audits()).some((a) => a.action === "ems.equipment.import_rolled_back"));
  });

  it("reads lists stored one record per document, and only managers import", async () => {
    await db.doc(`departments/${A}/lists/hlfd-rms-assets`).set({ storage: "items" });
    await db.doc(`departments/${A}/lists/hlfd-rms-assets/items/AST-1`).set({ id: "AST-1", name: "Suction", category: "Medical", status: "Available", _order: 0 });
    const preview = await eq.previewMigration(db, req("chief-a", { departmentId: A }));
    assert.deepEqual(preview.rows.map((r) => r.record.name), ["Suction"]);
    await expectCode(eq.previewMigration(db, req("officer-a", { departmentId: A })), "permission-denied");
    await expectCode(eq.applyMigration(db, req("chief-a", { departmentId: A, sourceIds: [] })), "invalid-argument");
  });
});
