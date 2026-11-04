// Linking a member to their personnel record, against the Firestore emulator.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { linkMyPersonnelRecord } = require("./lib/personnel.js");

const PROJECT_ID = "demo-forge-rms";
let db;

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await db.doc("departments/d1/lists/hlfd-rms-personnel").set({ storage: "items" });
  await db.doc("departments/d1/lists/hlfd-rms-personnel/items/P1").set({ id: "P1", name: "Pat", email: "Pat@Dept.org", _order: 1 });
  await db.doc("departments/d1/lists/hlfd-rms-personnel/items/P2").set({ id: "P2", name: "Pat Other", email: "pat@gmail.com", _order: 2 });
  await db.doc("departments/d1/users/u1").set({ uid: "u1", status: "active", personnelId: "" });
});

const call = (uid, token, departmentId = "d1") => linkMyPersonnelRecord(db, { auth: { uid, token }, data: { departmentId } });

describe("linkMyPersonnelRecord", () => {
  it("links by exact verified email", async () => {
    const result = await call("u1", { email: "pat@dept.org", email_verified: true });
    assert.deepEqual(result, { linked: true, personnelId: "P1" });
    assert.equal((await db.doc("departments/d1/users/u1").get()).data().personnelId, "P1");
  });

  it("won't link an unverified email", async () => {
    const result = await call("u1", { email: "pat@dept.org", email_verified: false });
    assert.equal(result.linked, false);
    assert.equal((await db.doc("departments/d1/users/u1").get()).data().personnelId, "");
  });

  it("won't match on the part before the @ alone", async () => {
    const result = await call("u1", { email: "pat@elsewhere.com", email_verified: true });
    assert.equal(result.linked, false);
  });

  it("won't link a record another member already holds", async () => {
    await db.doc("departments/d1/users/u2").set({ uid: "u2", status: "active", personnelId: "P1" });
    const result = await call("u1", { email: "pat@dept.org", email_verified: true });
    assert.equal(result.reason, "already_linked_to_another_member");
  });

  it("never relinks a member who is already linked", async () => {
    await db.doc("departments/d1/users/u1").set({ personnelId: "P2" }, { merge: true });
    const result = await call("u1", { email: "pat@dept.org", email_verified: true });
    assert.equal(result.personnelId, "P2");
    assert.equal(result.alreadyLinked, true);
  });

  it("refuses non-members", async () => {
    await assert.rejects(call("stranger", { email: "pat@dept.org", email_verified: true }), /not a member/);
  });
});
