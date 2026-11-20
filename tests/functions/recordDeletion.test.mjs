// Administrators delete inspections and preplans with a reason; a copy and the
// audit entries are kept. Run: npm run test:functions (Firestore emulator).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { deleteRecordWithReason } = require("./lib/recordDeletion.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
const B = "dept-b";
const DEMO = "forge-demo";

let db;
const req = (uid, data) => ({ auth: uid ? { uid, token: { email: `${uid}@example.test`, name: uid } } : undefined, data });

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

const member = (departmentId, uid, roleIds) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({ uid, status: "active", departmentId, roleIds, role: roleIds[0] });

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
    member(A, "ff-a", ["firefighter"]),
    member(B, "chief-b", ["fireChief"]),
    member(DEMO, "demo-admin", ["fireChief"]),
    db.doc(`departments/${A}/inspections/INS-1`).set({ id: "INS-1", inspectionNumber: "INS-2026-0001", occupancyName: "Main Street Diner", status: "completed" }),
    db.doc(`departments/${A}/preplans/PP-1`).set({ id: "PP-1", preplanNumber: "PP-0001", facilityName: "Warehouse", status: "published" }),
    db.doc(`departments/${A}/preplanRevisions/RV-1`).set({ id: "RV-1", preplanId: "PP-1", sectionAnswers: { address: "1 Main" } }),
    db.doc(`departments/${A}/preplanRevisions/RV-2`).set({ id: "RV-2", preplanId: "PP-1", sectionAnswers: {} }),
    db.doc(`departments/${A}/preplanRevisions/RV-OTHER`).set({ id: "RV-OTHER", preplanId: "PP-2" }),
    db.doc(`departments/${A}/preplanRestricted/RV-1`).set({ preplanId: "PP-1", answers: { gatesCodes: "1234" } }),
    db.doc(`departments/${DEMO}/inspections/INS-D`).set({ id: "INS-D", status: "completed" }),
  ]);
});

describe("deleteRecordWithReason", () => {
  it("deletes an inspection and keeps a copy, the reason and the audit entries", async () => {
    const result = await deleteRecordWithReason(db, req("chief-a", {
      departmentId: A, kind: "inspection", recordId: "INS-1", reason: "Duplicate record", notes: "Same as INS-2026-0002",
    }));
    assert.equal((await db.doc(`departments/${A}/inspections/INS-1`).get()).exists, false);
    const archive = (await db.doc(`departments/${A}/deletedRecords/${result.deletedRecordId}`).get()).data();
    assert.equal(archive.kind, "inspection");
    assert.equal(archive.reason, "Duplicate record");
    assert.equal(archive.notes, "Same as INS-2026-0002");
    assert.equal(archive.deletedByUid, "chief-a");
    assert.equal(archive.snapshot.inspectionNumber, "INS-2026-0001");
    assert.equal(archive.label, "INS-2026-0001 · Main Street Diner");
    const logs = (await db.collection(`departments/${A}/auditLogs`).get()).docs.map((d) => d.data());
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, "delete");
    assert.match(logs[0].summary, /Reason: Duplicate record \(Same as INS-2026-0002\)/);
    assert.equal((await db.collection(`departments/${A}/inspectionAuditEvents`).get()).size, 1);
  });

  it("deletes a preplan with its revisions and restricted answers, keeping copies", async () => {
    const result = await deleteRecordWithReason(db, req("chief-a", {
      departmentId: A, kind: "preplan", recordId: "PP-1", reason: "Business closed or building demolished",
    }));
    assert.equal(result.relatedCount, 3);
    for (const path of ["preplans/PP-1", "preplanRevisions/RV-1", "preplanRevisions/RV-2", "preplanRestricted/RV-1"]) {
      assert.equal((await db.doc(`departments/${A}/${path}`).get()).exists, false, path);
    }
    assert.equal((await db.doc(`departments/${A}/preplanRevisions/RV-OTHER`).get()).exists, true, "other preplans untouched");
    const copies = (await db.collection(`departments/${A}/deletedRecords/${result.deletedRecordId}/documents`).get()).docs.map((d) => d.data());
    assert.deepEqual(copies.map((c) => `${c.collection}/${c.id}`).sort(), ["preplanRestricted/RV-1", "preplanRevisions/RV-1", "preplanRevisions/RV-2"]);
  });

  it("needs a reason from the list, and notes for Other", async () => {
    await expectCode(deleteRecordWithReason(db, req("chief-a", { departmentId: A, kind: "inspection", recordId: "INS-1", reason: "" })), "invalid-argument");
    await expectCode(deleteRecordWithReason(db, req("chief-a", { departmentId: A, kind: "inspection", recordId: "INS-1", reason: "Other (explain in notes)" })), "invalid-argument");
    await expectCode(deleteRecordWithReason(db, req("chief-a", { departmentId: A, kind: "occupancy", recordId: "INS-1", reason: "Duplicate record" })), "invalid-argument");
    assert.equal((await db.doc(`departments/${A}/inspections/INS-1`).get()).exists, true);
  });

  it("only administrators of that department can delete", async () => {
    const data = { departmentId: A, kind: "inspection", recordId: "INS-1", reason: "Duplicate record" };
    await expectCode(deleteRecordWithReason(db, req("ff-a", data)), "permission-denied");
    await expectCode(deleteRecordWithReason(db, req("chief-b", data)), "permission-denied");
    await expectCode(deleteRecordWithReason(db, req(null, data)), "unauthenticated");
    assert.equal((await db.doc(`departments/${A}/inspections/INS-1`).get()).exists, true);
    assert.equal((await db.collection(`departments/${A}/deletedRecords`).get()).size, 0);
  });

  it("is turned off in the public demo department", async () => {
    await expectCode(deleteRecordWithReason(db, req("demo-admin", { departmentId: DEMO, kind: "inspection", recordId: "INS-D", reason: "Duplicate record" })), "permission-denied");
  });

  it("reports a record that's already gone", async () => {
    await expectCode(deleteRecordWithReason(db, req("chief-a", { departmentId: A, kind: "inspection", recordId: "INS-404", reason: "Duplicate record" })), "not-found");
  });
});
