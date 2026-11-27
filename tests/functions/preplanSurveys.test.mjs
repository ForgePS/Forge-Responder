// Field survey notifications. Run: npm run test:functions (Firestore emulator).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { handleSurveyWritten } = require("./lib/preplanSurveys.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
let db;

const snap = (data) => ({ exists: data != null, data: () => data });
const written = (before, after, surveyId = "S1") => ({ params: { departmentId: A, surveyId }, data: { before: snap(before), after: snap(after) } });
const survey = {
  preplanId: "PP1", preplanNumber: "PP-2026-0001", facilityName: "Main Street Diner", address: "214 Main St", occupancyId: "OCC-1",
  status: "assigned", assignedStation: "Station 1", assignedShift: "A Shift", assignedUserIds: [], dueDate: "2026-12-20", assignedBy: "boss",
};

async function inbox() {
  const result = await db.collection(`departments/${A}/notifications`).get();
  return result.docs.map((doc) => doc.data()).sort((a, b) => a.userId.localeCompare(b.userId) || a.title.localeCompare(b.title));
}

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});
after(async () => { await admin.app().delete(); });

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  const member = (uid, station, shift, permissions, status = "active") => Promise.all([
    db.doc(`departments/${A}/users/${uid}`).set({ uid, assignedStation: station, assignedShift: shift, status }),
    db.doc(`departments/${A}/memberGrants/${uid}`).set({ permissions }),
  ]);
  await member("capA", "Station 1", "A Shift", { conductPreplanSurveys: true });
  await member("ffA", "Station 1", "A Shift", { viewPreplans: true });
  await member("capB", "Station 1", "B Shift", { conductPreplanSurveys: true });
  await member("gone", "Station 1", "A Shift", { conductPreplanSurveys: true }, "inactive");
  await member("boss", "HQ", "", { editPreplans: true });
  await member("chief", "HQ", "", { approvePreplans: true });
  await member("scheduler", "HQ", "", { assignInspections: true });
  await member("inspector", "HQ", "", { editInspections: true });
});

describe("field survey notifications", () => {
  it("a station survey goes to that shift's active members who may survey", async () => {
    await handleSurveyWritten(db, written(null, survey));
    const rows = await inbox();
    assert.deepEqual(rows.map((row) => row.userId), ["capA"]);
    assert.equal(rows[0].openPage, "Field Surveys");
    assert.equal(rows[0].surveyId, "S1");
    assert.match(rows[0].message, /Main Street Diner, 214 Main St\. Due 2026-12-20\./);
  });

  it("a named survey goes to the people named", async () => {
    await handleSurveyWritten(db, written(null, { ...survey, assignedUserIds: ["capB"] }));
    assert.deepEqual((await inbox()).map((row) => row.userId), ["capB"]);
  });

  it("a submitted survey goes to whoever assigned it, else the approvers; a returned one to the surveyor", async () => {
    const sent = { ...survey, status: "submitted", submittedBy: "capA", submittedByName: "Capt. A", submittedAt: "t1" };
    await handleSurveyWritten(db, written({ ...survey, status: "in_progress" }, sent));
    assert.deepEqual((await inbox()).map((row) => row.userId), ["boss"]);

    await handleSurveyWritten(db, written({ ...survey, status: "in_progress", assignedBy: "nobody" }, { ...sent, assignedBy: "nobody" }, "S2"));
    assert.deepEqual((await inbox()).map((row) => row.userId), ["boss", "chief"]);

    await handleSurveyWritten(db, written(sent, { ...sent, status: "returned", reviewedBy: "boss", reviewedAt: "t2", reviewNotes: "Check the riser room" }));
    const returned = (await inbox()).filter((row) => row.title.includes("returned"));
    assert.deepEqual(returned.map((row) => row.userId), ["capA"]);
    assert.match(returned[0].message, /Check the riser room/);
  });

  it("a new referral goes to inspection schedulers, once", async () => {
    const referral = { id: "ref-1", reason: "Exit blocked by pallets", urgency: "urgent", createdBy: "capA", createdByName: "Capt. A" };
    const working = { ...survey, status: "in_progress" };
    await handleSurveyWritten(db, written(working, { ...working, referrals: [referral] }));
    await handleSurveyWritten(db, written(working, { ...working, referrals: [referral] }));
    await handleSurveyWritten(db, written({ ...working, referrals: [referral] }, { ...working, referrals: [referral], notes: "x" }));
    const rows = await inbox();
    assert.deepEqual(rows.map((row) => row.userId), ["scheduler"]);
    assert.match(rows[0].title, /Inspection referral \(Urgent\)/);
    assert.equal(rows[0].occupancyId, "OCC-1");
  });

  it("ordinary saves notify nobody", async () => {
    const working = { ...survey, status: "in_progress" };
    await handleSurveyWritten(db, written(working, { ...working, notes: "halfway" }));
    assert.equal((await inbox()).length, 0);
  });
});
