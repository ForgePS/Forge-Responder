import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceLeaveApproval,
  buildLeaveApprovalMeta,
  isLeaveSelectableDay,
  isRotationShift,
} from "../../src/lib/employeePortalWorkflow.js";

const personnel = [
  { id: "CHIEF", name: "Chief A. Sample", rank: "Fire Chief", shift: "Administration", ems: "Paramedic", supervisor: "City Administrator" },
  { id: "DEP", name: "Deputy B. Example", rank: "Deputy Chief", shift: "Administration", ems: "Paramedic", supervisor: "Chief A. Sample" },
  { id: "MAR", name: "Marshal G. Inspector", rank: "Fire Marshal", shift: "Administration", ems: "EMT" },
  { id: "BC-A", name: "Battalion C. Demo", rank: "Battalion Chief", shift: "A Shift" },
  { id: "BC-C", name: "Battalion Y. Showcase", rank: "Battalion Chief", shift: "C Shift" },
  { id: "CPT-C", name: "Captain Z. Trial", rank: "Captain", shift: "C Shift" },
  { id: "FF-C", name: "Firefighter B. Specimen", rank: "Firefighter", shift: "C Shift", ems: "Paramedic", supervisor: "Captain Z. Trial" },
];
const byId = Object.fromEntries(personnel.map((p) => [p.id, p]));
const today = new Date(2026, 10, 2, 12);

test("the Fire Chief's leave needs no approval", () => {
  const meta = buildLeaveApprovalMeta(byId.CHIEF, personnel, "Vacation", { today });
  assert.equal(meta.approvalRoute, "auto");
  assert.equal(meta.status, "Approved");
  assert.equal(meta.approvalStage, "complete");
});

test("the Fire Chief approves the Deputy Chief", () => {
  const meta = buildLeaveApprovalMeta(byId.DEP, personnel, "Vacation", { today });
  assert.equal(meta.approvalStage, "chief");
  assert.equal(meta.assignedApprover, "Chief A. Sample");
  assert.deepEqual(meta.assignedApproverIds, ["CHIEF"]);
});

test("the Deputy Chief or Fire Chief approves staff and Battalion Chiefs", () => {
  for (const id of ["MAR", "BC-A"]) {
    const meta = buildLeaveApprovalMeta(byId[id], personnel, "Vacation", { today });
    assert.equal(meta.approvalStage, "chief", id);
    assert.equal(meta.assignedApprover, "Deputy B. Example or Chief A. Sample", id);
    assert.deepEqual(meta.assignedApproverIds, ["DEP", "CHIEF"], id);
  }
});

test("shift members go to their officer, then their own shift's Battalion Chief", () => {
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation", { today });
  assert.equal(meta.approvalRoute, "officer-then-battalion");
  assert.equal(meta.assignedOfficerId, "CPT-C");
  assert.equal(meta.assignedBattalionChiefId, "BC-C");
  const sick = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Sick", { today });
  assert.equal(sick.assignedBattalionChiefId, "BC-C");
});

// C Shift works Nov 3, 6, 9, 12… ("today" is Mon Nov 2).
test("the Deputy or Fire Chief covers when the Battalion Chief is away from now until after the requested dates", () => {
  const leaveRequests = [
    { personnelId: "BC-C", status: "Approved", selectedDates: ["2026-11-03", "2026-11-06", "2026-11-09"] },
  ];
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation", { today, leaveRequests, dayIds: ["2026-11-09"] });
  assert.equal(meta.approvalStage, "chief");
  assert.equal(meta.coveringFor, "Battalion Y. Showcase");
  assert.equal(meta.assignedApprover, "Deputy B. Example or Chief A. Sample");
});

test("the Battalion Chief keeps the request if they're back by the requested dates", () => {
  const leaveRequests = [
    { personnelId: "BC-C", status: "Approved", selectedDates: ["2026-11-03", "2026-11-06", "2026-11-09"] },
  ];
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation", { today, leaveRequests, dayIds: ["2026-11-12"] });
  assert.equal(meta.assignedBattalionChiefId, "BC-C");
});

test("the Battalion Chief keeps the request if they work a shift before going on leave", () => {
  const leaveRequests = [
    { personnelId: "BC-C", status: "Approved", selectedDates: ["2026-11-06", "2026-11-09"] },
  ];
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation", { today, leaveRequests, dayIds: ["2026-11-09"] });
  assert.equal(meta.assignedBattalionChiefId, "BC-C");
  // A single day off isn't extended leave.
  const short = [{ personnelId: "BC-C", status: "Approved", selectedDates: ["2026-11-02"] }];
  assert.equal(buildLeaveApprovalMeta(byId["FF-C"], personnel, "Sick", { today, leaveRequests: short }).assignedBattalionChiefId, "BC-C");
});

test("a chief-stage approval is final", () => {
  const { leavePatch, isFinal } = advanceLeaveApproval({ approvalStage: "chief" }, "Approved");
  assert.equal(leavePatch.status, "Approved");
  assert.equal(isFinal, true);
});

test("a line member whose officer isn't in personnel skips the officer step", () => {
  const ff = { ...byId["FF-C"], supervisor: "Someone Not Listed" };
  assert.equal(buildLeaveApprovalMeta(ff, personnel, "Vacation", { today }).approvalStage, "battalionChief");
});

test("platoon members pick their work days; day staff pick weekdays", () => {
  assert.equal(isRotationShift("C Shift"), true);
  assert.equal(isRotationShift("Administration"), false);
  // 2026-11-02 is a Monday, 2026-11-07 a Saturday.
  assert.equal(isLeaveSelectableDay("2026-11-02", "Administration"), true);
  assert.equal(isLeaveSelectableDay("2026-11-07", "Administration"), false);
  const week = ["2026-11-02", "2026-11-03", "2026-11-04"];
  assert.equal(week.filter((d) => isLeaveSelectableDay(d, "C Shift")).length, 1);
});

test("a pending request shows only for the member it's waiting on", async () => {
  const { isLeaveAwaitingPerson } = await import("../../src/lib/employeePortalWorkflow.js");
  const officerStep = { status: "Pending Officer Approval", approvalStage: "officer", assignedOfficerId: "CPT-C", assignedBattalionChiefId: "BC-C", personnelId: "FF-C" };
  assert.equal(isLeaveAwaitingPerson(officerStep, byId["CPT-C"]), true);
  assert.equal(isLeaveAwaitingPerson(officerStep, byId["BC-C"]), false);
  const bcStep = { ...officerStep, status: "Pending Battalion Chief", approvalStage: "battalionChief" };
  assert.equal(isLeaveAwaitingPerson(bcStep, byId["BC-C"]), true);
  const chiefStep = { status: "Pending Chief Approval", approvalStage: "chief", assignedApproverIds: ["DEP", "CHIEF"], personnelId: "BC-A" };
  assert.equal(isLeaveAwaitingPerson(chiefStep, byId.DEP), true);
  assert.equal(isLeaveAwaitingPerson(chiefStep, byId.CHIEF), true);
  assert.equal(isLeaveAwaitingPerson({ ...chiefStep, status: "Approved" }, byId.CHIEF), false);
  // Nobody approves their own request.
  assert.equal(isLeaveAwaitingPerson({ ...chiefStep, personnelId: "DEP" }, byId.DEP), false);
});
