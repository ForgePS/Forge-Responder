import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeaveApprovalMeta,
  isLeaveSelectableDay,
  isRotationShift,
} from "../../src/lib/employeePortalWorkflow.js";

const personnel = [
  { id: "BC-A", name: "Battalion C. Demo", rank: "Battalion Chief", shift: "A Shift" },
  { id: "BC-C", name: "Battalion Y. Showcase", rank: "Battalion Chief", shift: "C Shift" },
  { id: "CPT-C", name: "Captain Z. Trial", rank: "Captain", shift: "C Shift" },
  { id: "FF-C", name: "Firefighter B. Specimen", rank: "Firefighter", shift: "C Shift", ems: "Paramedic", supervisor: "Captain Z. Trial" },
  { id: "CHIEF", name: "Chief A. Sample", rank: "Fire Chief", shift: "Administration", ems: "Paramedic", supervisor: "City Administrator" },
];
const byId = Object.fromEntries(personnel.map((p) => [p.id, p]));

test("a firefighter's vacation goes to their officer, then their shift's battalion chief", () => {
  const meta = buildLeaveApprovalMeta(byId["FF-C"], personnel, "Vacation");
  assert.equal(meta.approvalRoute, "officer-then-battalion");
  assert.equal(meta.assignedOfficerId, "CPT-C");
  assert.equal(meta.assignedBattalionChiefId, "BC-C");
});

test("a chief officer never waits on a supervisor who isn't a member", () => {
  const meta = buildLeaveApprovalMeta(byId.CHIEF, personnel, "Vacation");
  assert.equal(meta.approvalRoute, "battalion");
  assert.equal(meta.approvalStage, "battalionChief");
});

test("a line member whose officer isn't in personnel skips the officer step", () => {
  const ff = { ...byId["FF-C"], supervisor: "Someone Not Listed" };
  assert.equal(buildLeaveApprovalMeta(ff, personnel, "Vacation").approvalStage, "battalionChief");
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
