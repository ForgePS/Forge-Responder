import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRoleLabel } from "../../src/lib/roleLabels.js";
import { auditActionLabel, auditModule, auditSummary, isRoutineSave } from "../../src/lib/auditLabels.js";

test("role names read like ranks", () => {
  assert.equal(formatRoleLabel("FireChief", { roleIds: ["fireChief"] }), "Fire Chief");
  assert.equal(formatRoleLabel("department_admin", {}), "Fire Chief");
  assert.equal(formatRoleLabel("member", { roleIds: ["readOnly"] }), "Read Only");
  assert.equal(formatRoleLabel("captain", { roleIds: ["trainingOfficer"] }), "Training Officer");
  assert.equal(formatRoleLabel("creator", {}), "Creator");
  assert.equal(formatRoleLabel("", {}), "Member");
});

test("audit actions read as plain words", () => {
  assert.equal(auditActionLabel("invite.created"), "Invited");
  assert.equal(auditActionLabel("defect_create"), "Reported defect");
  assert.equal(auditActionLabel("reserve_swap_end"), "Reserve swap end");
  assert.equal(auditActionLabel(""), "Updated");
});

test("older invite entries get an area and a summary", () => {
  const log = { action: "invite.created", target: "ff@a.gov" };
  assert.equal(auditModule(log), "Users");
  assert.equal(auditSummary(log), "Invited ff@a.gov");
});

test("routine list saves are recognised", () => {
  assert.equal(isRoutineSave({ action: "update", summary: "Saved Personnel (12 records)" }), true);
  assert.equal(isRoutineSave({ action: "update", summary: "Updated permissions for Chief" }), false);
});
