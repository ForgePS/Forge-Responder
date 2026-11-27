// Automatic preplan review tasks from occupancy and violation writes.
// Run: npm run test:functions (Firestore emulator).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { handleOccupancyWritten, handleReviewTaskCreated, handleViolationWritten } = require("./lib/preplanReviewTasks.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
let db;

// A v2 Firestore event as the trigger receives it.
const snap = (data) => ({ exists: data != null, data: () => data });
const occupancyEvent = (before, after, occupancyId = "OCC-1") => ({ params: { departmentId: A, occupancyId }, data: { before: snap(before), after: snap(after) } });
const violationEvent = (before, after, violationId = "VIO-1") => ({ params: { departmentId: A, violationId }, data: { before: snap(before), after: snap(after) } });

async function tasks() {
  const result = await db.collection(`departments/${A}/preplanReviewTasks`).get();
  return result.docs.map((doc) => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.preplanId.localeCompare(b.preplanId));
}

const occupancy = { name: "Main Street Diner", address: "214 Main St", sprinkler: "Yes", occupancyType: "Assembly" };

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
  await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational" });
  await db.doc(`departments/${A}/preplans/PP2`).set({ occupancyId: "OCC-1", status: "draft" });
  await db.doc(`departments/${A}/preplans/PP-OLD`).set({ occupancyId: "OCC-1", status: "archived" });
  await db.doc(`departments/${A}/preplans/PP-OTHER`).set({ occupancyId: "OCC-2", status: "operational" });
});

describe("occupancy changes", () => {
  it("open one task per live preplan, naming what changed", async () => {
    const result = await handleOccupancyWritten(db, occupancyEvent(occupancy, { ...occupancy, address: "216 Main St", sprinkler: "No" }));
    assert.equal(result.created, 2);
    const rows = await tasks();
    assert.deepEqual(rows.map((row) => row.preplanId), ["PP1", "PP2"]);
    assert.deepEqual(rows[0].changedFields, ["Address", "Sprinkler system"]);
    assert.equal(rows[0].status, "open");
    assert.equal(rows[0].source, "occupancy");
    assert.equal(rows[0].automatic, true);
  });

  it("are idempotent: the same delivery twice makes no second task", async () => {
    const event = occupancyEvent(occupancy, { ...occupancy, address: "216 Main St" });
    await handleOccupancyWritten(db, event);
    const again = await handleOccupancyWritten(db, event);
    assert.equal(again.created, 0);
    assert.equal((await tasks()).length, 2);
  });

  it("ignore new occupancies, bookkeeping-only edits, and occupancies without a preplan", async () => {
    assert.equal((await handleOccupancyWritten(db, occupancyEvent(null, occupancy))).created, 0);
    assert.equal((await handleOccupancyWritten(db, occupancyEvent(occupancy, { ...occupancy, notes: "x", lastInspectionAt: "2026-11-25" }))).created, 0);
    assert.equal((await handleOccupancyWritten(db, occupancyEvent(occupancy, { ...occupancy, address: "1 Elm" }, "OCC-NONE"))).created, 0);
    assert.equal((await tasks()).length, 0);
  });

  it("a deleted occupancy asks whether the preplan should be archived", async () => {
    await handleOccupancyWritten(db, occupancyEvent(occupancy, null));
    const rows = await tasks();
    assert.equal(rows.length, 2);
    assert.match(rows[0].reason, /deleted/);
  });

  it("respect the department switching occupancy tasks off", async () => {
    await db.doc(`departments/${A}/preplanSettings/reviewRules`).set({ occupancyChanges: false });
    assert.equal((await handleOccupancyWritten(db, occupancyEvent(occupancy, { ...occupancy, address: "216 Main St" }))).created, 0);
  });

  it("never touch the preplan or the occupancy", async () => {
    await handleOccupancyWritten(db, occupancyEvent(occupancy, { ...occupancy, address: "216 Main St" }));
    assert.deepEqual((await db.doc(`departments/${A}/preplans/PP1`).get()).data(), { occupancyId: "OCC-1", status: "operational" });
  });
});

describe("inspection findings", () => {
  const finding = { occupancyId: "OCC-1", inspectionId: "INS-1", codeCitation: "IFC 904.12", name: "Hood suppression not serviced", severity: "high", status: "open" };

  it("a significant new finding opens a task; a routine one doesn't", async () => {
    assert.equal((await handleViolationWritten(db, violationEvent(null, finding))).created, 2);
    const rows = await tasks();
    assert.equal(rows[0].source, "violation");
    assert.equal(rows[0].violationId, "VIO-1");
    assert.equal(rows[0].inspectionId, "INS-1");
    assert.equal((await handleViolationWritten(db, violationEvent(null, { ...finding, codeCitation: "IFC 315.3", name: "Storage too high" }, "VIO-2"))).created, 0);
  });

  it("follow the department's minimum severity", async () => {
    await db.doc(`departments/${A}/preplanSettings/reviewRules`).set({ minSeverity: "critical" });
    assert.equal((await handleViolationWritten(db, violationEvent(null, finding))).created, 0);
  });

  it("a corrected finding prompts a check only when an alert or link refers to it", async () => {
    const corrected = { ...finding, status: "closed" };
    assert.equal((await handleViolationWritten(db, violationEvent(finding, corrected))).created, 0);
    await db.doc(`departments/${A}/preplanAlerts/AL1`).set({ preplanId: "PP1", violationId: "VIO-1", resolutionStatus: "active" });
    const result = await handleViolationWritten(db, violationEvent(finding, corrected));
    assert.equal(result.created, 1);
    const [task] = await tasks();
    assert.equal(task.preplanId, "PP1");
    assert.match(task.reason, /1 current alert refers to it/);
    // Already closed before: not a new resolution.
    assert.equal((await handleViolationWritten(db, violationEvent(corrected, { ...corrected, notes: "x" }))).created, 0);
  });
});

describe("notifications for new review tasks", () => {
  const created = (task, taskId = "T1") => ({ params: { departmentId: A, taskId }, data: { exists: true, data: () => task } });
  const task = { status: "open", preplanId: "PP1", source: "occupancy", reason: "Address changed.", requestedBy: "system" };
  const grant = (uid, permissions) => db.doc(`departments/${A}/memberGrants/${uid}`).set({ permissions });
  async function inbox() {
    const result = await db.collection(`departments/${A}/notifications`).get();
    return result.docs.map((doc) => doc.data()).sort((a, b) => a.userId.localeCompare(b.userId));
  }

  beforeEach(async () => {
    await grant("planner", { editPreplans: true });
    await grant("lead", { approvePreplans: true });
    await grant("config", { managePreplanConfig: true });
    await grant("ff", { viewPreplans: true });
  });

  it("go to the assigned planner and reviewer, and open the preplan's Alerts & reviews", async () => {
    await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational", assignedPlannerId: "planner", reviewerId: "lead", preplanNumber: "PP-2026-0001" });
    assert.equal((await handleReviewTaskCreated(db, created(task))).notified, 2);
    const rows = await inbox();
    assert.deepEqual(rows.map((row) => row.userId), ["lead", "planner"]);
    assert.equal(rows[0].status, "unread");
    assert.equal(rows[0].recordId, "PP1");
    assert.equal(rows[0].openPage, "All Preplans");
    assert.equal(rows[0].openTab, "alerts");
    assert.match(rows[0].title, /occupancy record changed/);
    assert.match(rows[0].message, /PP-2026-0001\. Address changed\./);
  });

  it("fall back to preplan approvers and configurers, never the person who asked or a planner without access", async () => {
    // "ff" is assigned but can only view preplans.
    await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational", assignedPlannerId: "ff" });
    await handleReviewTaskCreated(db, created({ ...task, source: "manual", requestedBy: "lead" }));
    assert.deepEqual((await inbox()).map((row) => row.userId), ["config"]);
  });

  it("reach the approvers when the planner asked for the review themselves", async () => {
    await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational", assignedPlannerId: "planner" });
    await handleReviewTaskCreated(db, created({ ...task, source: "manual", requestedBy: "planner" }));
    assert.deepEqual((await inbox()).map((row) => row.userId), ["config", "lead"]);
  });

  it("don't repeat the place's name when the reason already starts with it", async () => {
    await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational", assignedPlannerId: "planner", preplanNumber: "PP-1", facilityName: "Main Street Diner" });
    await handleReviewTaskCreated(db, created({ ...task, reason: "Main Street Diner: Address changed." }));
    await handleReviewTaskCreated(db, created({ ...task, reason: "Check the kitchen." }, "T2"));
    const messages = (await inbox()).map((row) => row.message).sort();
    assert.deepEqual(messages, ["PP-1 · Main Street Diner. Check the kitchen.", "PP-1. Main Street Diner: Address changed."]);
  });

  it("are sent once per task, and not at all when switched off or the preplan is archived", async () => {
    await db.doc(`departments/${A}/preplans/PP1`).set({ occupancyId: "OCC-1", status: "operational", assignedPlannerId: "planner" });
    await handleReviewTaskCreated(db, created(task));
    assert.equal((await handleReviewTaskCreated(db, created(task))).notified, 0);
    assert.equal((await inbox()).length, 1);

    await db.doc(`departments/${A}/preplanSettings/reviewRules`).set({ notifyOnNewTasks: false });
    assert.equal((await handleReviewTaskCreated(db, created(task, "T2"))).notified, 0);
    await db.doc(`departments/${A}/preplanSettings/reviewRules`).delete();
    await db.doc(`departments/${A}/preplans/PP1`).update({ status: "archived" });
    assert.equal((await handleReviewTaskCreated(db, created(task, "T3"))).notified, 0);
    assert.equal((await inbox()).length, 1);
  });
});
