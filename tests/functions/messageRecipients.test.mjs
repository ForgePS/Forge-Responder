// Message recipients (toAll / recipientUids) against the Firestore emulator.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { handleMessageWritten, backfillDepartmentMessages } = require("./lib/messageRecipients.js");

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
  await db.doc("departments/d1/lists/hlfd-rms-personnel/items/P1").set({ id: "P1", name: "Capt", rank: "Captain", shift: "A Shift", _order: 1 });
  await db.doc("departments/d1/lists/hlfd-rms-personnel/items/P2").set({ id: "P2", name: "FF", rank: "Firefighter", shift: "B Shift", _order: 2 });
  await db.doc("departments/d1/users/u1").set({ uid: "u1", status: "active", personnelId: "P1", role: "companyOfficer" });
  await db.doc("departments/d1/users/u2").set({ uid: "u2", status: "active", personnelId: "P2", role: "firefighter" });
  await db.doc("departments/d1/users/u3").set({ uid: "u3", status: "disabled", personnelId: "", role: "firefighter" });
  await db.doc("departments/d1/settings/main").set({ internalEmailGroups: [{ id: "cg-b", label: "B crew", members: ["shift:B Shift"] }] });
});

// The shape Firestore triggers pass to handleMessageWritten.
async function fire(messageId, before = null) {
  const ref = db.doc(`departments/d1/internalEmails/${messageId}`);
  const snap = await ref.get();
  const asSnap = (data) => (data ? { exists: true, data: () => data } : { exists: false, data: () => undefined });
  await handleMessageWritten(db, {
    params: { departmentId: "d1", messageId },
    data: { before: asSnap(before), after: snap },
  });
  return (await ref.get()).data();
}

describe("message recipients", () => {
  it("a new message gets the uids of the members it's for", async () => {
    await db.doc("departments/d1/internalEmails/m1").set({ fromUid: "u1", recipients: ["group:cg-b"] });
    const data = await fire("m1");
    assert.equal(data.toAll, false);
    assert.deepEqual(data.recipientUids, ["u2"]);
  });

  it("a message to everyone is marked toAll", async () => {
    await db.doc("departments/d1/internalEmails/m2").set({ fromUid: "u1", recipients: ["g:all"] });
    const data = await fire("m2");
    assert.equal(data.toAll, true);
    assert.deepEqual(data.recipientUids, []);
  });

  it("an audience edited by hand is put back", async () => {
    await db.doc("departments/d1/internalEmails/m3").set({ fromUid: "u1", recipients: ["person:P2"], toAll: false, recipientUids: ["u2"] });
    const before = (await db.doc("departments/d1/internalEmails/m3").get()).data();
    await db.doc("departments/d1/internalEmails/m3").update({ recipientUids: ["u1", "u2"] });
    const data = await fire("m3", before);
    assert.deepEqual(data.recipientUids, ["u2"]);
  });

  it("backfill fills older messages and is safe to run twice", async () => {
    await db.doc("departments/d1/internalEmails/old1").set({ fromUid: "u1", recipients: ["command"] });
    await db.doc("departments/d1/internalEmails/old2").set({ fromUid: "u1", recipients: "all" });
    assert.deepEqual(await backfillDepartmentMessages(db, "d1", { dryRun: true }), { updated: 2, unchanged: 0 });
    assert.equal((await db.doc("departments/d1/internalEmails/old1").get()).data().recipientUids, undefined, "dry run writes nothing");
    assert.deepEqual(await backfillDepartmentMessages(db, "d1", { dryRun: false }), { updated: 2, unchanged: 0 });
    assert.deepEqual((await db.doc("departments/d1/internalEmails/old1").get()).data().recipientUids, ["u1"]);
    assert.deepEqual(await backfillDepartmentMessages(db, "d1", { dryRun: false }), { updated: 0, unchanged: 2 });
  });
});
