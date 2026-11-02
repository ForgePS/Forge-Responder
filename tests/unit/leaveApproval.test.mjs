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

test("when the shift's Battalion Chief is on extended leave, the Deputy or Fire Chief covers", () => {
  const leaveRequests = [
    { personnelId: "BC-C", status: "Approved", selectedDates: ["2026-10-31", "2026-11-03", "2026-11-06"] },
  ];
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation", { today, leaveRequests });
  assert.equal(meta.approvalStage, "chief");
  assert.equal(meta.coveringFor, "Battalion Y. Showcase");
  assert.equal(meta.assignedApprover, "Deputy B. Example or Chief A. Sample");
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
