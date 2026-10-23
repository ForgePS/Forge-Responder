// Creator Console usage + export against the Firestore and Storage emulators.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const consoleFns = require("./lib/platformConsole.js");

const PROJECT_ID = "demo-forge-rms";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const CREATOR = { auth: { uid: "creator-1", token: { email: "c@forge.test", firebase: { sign_in_second_factor: "totp" } } } };
const CREATOR_NO_2FA = { auth: { uid: "creator-1", token: { email: "c@forge.test" } } };
const MEMBER = { auth: { uid: "member-1", token: { email: "m@a.gov" } } };
let db;
let bucket;

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = admin.firestore();
  bucket = admin.storage().bucket(BUCKET);
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  const [files] = await bucket.getFiles().catch(() => [[]]);
  await Promise.all(files.map((f) => f.delete().catch(() => {})));
  await Promise.all([
    db.doc("platformCreators/creator-1").set({ status: "active" }),
    db.doc("platformDepartments/dept-a").set({ name: "Dept A", status: "active", subdomain: "dept-a" }),
    db.doc("platformDepartments/old").set({ name: "Old", status: "disabled" }),
    db.doc("platformSubscriptions/dept-a").set({ planId: "standard", status: "trial", billingCycle: "annual", renewalDate: "2027-01-19" }),
    db.doc("rmsGateways/dept-a").set({ departmentId: "dept-a", status: "active" }),
    db.doc("departments/dept-a/profile/main").set({ name: "Dept A" }),
    db.doc("departments/dept-a/users/u1").set({ status: "active" }),
    db.doc("departments/dept-a/users/u2").set({ status: "disabled" }),
    db.doc("departments/dept-a/lists/hlfd-rms-personnel").set({ items: [{ id: "DA-101" }, { id: "DA-102" }] }),
    db.doc("departments/dept-a/incidents/i1").set({ summary: "fire", at: Timestamp.fromDate(new Date("2026-10-01T12:00:00Z")) }),
    db.doc("departments/dept-a/auditLogs/a1").set({ action: "x", created_at: "2026-10-20T10:00:00.000Z" }),
    db.doc("departments/dept-a/auditLogs/a2").set({ action: "y", createdAt: "2026-10-21T09:00:00.000Z" }),
    db.doc("departments/dept-a/integrations/twilio").set({ authToken: "SECRET-TOKEN" }),
    db.doc("departments/dept-a/fleetAssets/e1").set({ unit: "Engine 1" }),
    db.doc("departments/dept-a/fleetAssets/e1/history/h1").set({ note: "nested" }),
    db.doc("invites/inv1").set({ departmentId: "dept-a", status: "pending" }),
    bucket.file("departments/dept-a/logos/logo.png").save(Buffer.from("png-bytes"), { contentType: "image/png" }),
  ]);
});

describe("departmentUsage", () => {
  it("is creator-only", async () => {
    await assert.rejects(consoleFns.departmentUsage(db, bucket, MEMBER), (e) => e.code === "permission-denied");
    await assert.rejects(consoleFns.departmentUsage(db, bucket, { auth: null }), (e) => e.code === "unauthenticated");
  });

  it("reports members, invites, personnel, records, storage, activity and subscription", async () => {
    const { departments } = await consoleFns.departmentUsage(db, bucket, CREATOR);
    assert.deepEqual(departments.map((d) => d.departmentId), ["dept-a"], "disabled departments are skipped");
    const [row] = departments;
    assert.deepEqual(row.members, { active: 1, total: 2 });
    assert.equal(row.pendingInvites, 1);
    assert.equal(row.personnel, 2);
    assert.ok(row.records >= 8);
    assert.deepEqual(row.storage, { files: 1, bytes: 9 });
    assert.equal(row.lastActivity, "2026-10-21T09:00:00.000Z");
    assert.equal(row.subscription.status, "trial");
  });
});

describe("exportDepartmentData", () => {
  it("is creator-only", async () => {
    await assert.rejects(consoleFns.exportDepartmentData(db, bucket, { ...MEMBER, data: { departmentId: "dept-a" } }), (e) => e.code === "permission-denied");
  });

  it("exports every document (nested too), excludes credentials, and writes a readable file", async () => {
    const result = await consoleFns.exportDepartmentData(db, bucket, { ...CREATOR, data: { departmentId: "dept-a" } });
    assert.match(result.path, /^exports\/dept-a\/dept-a-.*\.json$/);

    const [contents] = await bucket.file(result.path).download();
    const data = JSON.parse(contents.toString("utf8"));
    const paths = Object.keys(data.documents);
    assert.ok(paths.includes("departments/dept-a/incidents/i1"));
    assert.ok(paths.includes("departments/dept-a/fleetAssets/e1/history/h1"), "nested subcollections included");
    assert.ok(paths.includes("platformSubscriptions/dept-a"));
    assert.ok(paths.includes("rmsGateways/dept-a"));
    assert.equal(data.documents["departments/dept-a/incidents/i1"].at, "2026-10-01T12:00:00.000Z", "timestamps as ISO");
    assert.ok(!contents.toString("utf8").includes("SECRET-TOKEN"), "integration secrets never exported");
    assert.ok(!paths.some((p) => p.startsWith("invites/")), "invite tokens never exported");
    assert.deepEqual(data.files.map((f) => f.path), ["departments/dept-a/logos/logo.png"]);
    assert.match(result.url, /token=/);

    const audit = await db.collection("platformAuditLogs").get();
    assert.equal(audit.docs[0].data().action, "department.exported");
  });

  it("refuses unknown departments", async () => {
    await assert.rejects(consoleFns.exportDepartmentData(db, bucket, { ...CREATOR, data: { departmentId: "nope" } }), (e) => e.code === "not-found");
  });
});
