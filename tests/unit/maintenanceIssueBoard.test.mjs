// Maintenance Issues dashboard: lifecycle stages, joins and KPIs.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMaintenanceIssues,
  deriveIssueState,
  filterMaintenanceIssues,
  nextStep,
  planWorkOrderTransitions,
  summarizeMaintenanceIssues,
} from "../../src/lib/maintenanceIssueBoard.js";

const NOW = new Date("2026-11-08T12:00:00Z").getTime();
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

describe("planWorkOrderTransitions", () => {
  it("walks the allowed transitions", () => {
    assert.deepEqual(planWorkOrderTransitions("requested", "completed"), ["approved", "in_progress", "completed"]);
    assert.deepEqual(planWorkOrderTransitions("requested", "awaiting_parts"), ["approved", "scheduled", "awaiting_parts"]);
    assert.deepEqual(planWorkOrderTransitions("in_progress", "in_progress"), []);
  });
  it("returns null when the order is final", () => {
    assert.equal(planWorkOrderTransitions("closed", "in_progress"), null);
    assert.equal(planWorkOrderTransitions("cancelled", "completed"), null);
  });
});

describe("deriveIssueState", () => {
  it("is new with no work order or a requested one", () => {
    assert.equal(deriveIssueState(null).stage, "new");
    assert.equal(deriveIssueState({ status: "requested" }).stage, "new");
  });
  it("follows the chosen path's step", () => {
    assert.equal(deriveIssueState({ status: "approved", issueOutcome: "replace", issueStep: "triaged" }).stage, "triaged");
    const ordered = deriveIssueState({ status: "awaiting_parts", issueOutcome: "replace", issueStep: "ordered" });
    assert.equal(ordered.stage, "in_progress");
    assert.equal(ordered.path, "replace");
  });
  it("resolves with the path's outcome", () => {
    assert.equal(deriveIssueState({ status: "completed", issueOutcome: "dispose", issueStep: "disposed" }).outcome, "disposed");
    assert.equal(deriveIssueState({ status: "cancelled", issueOutcome: "no_action", issueStep: "closed_no_action" }).outcome, "no_action");
    assert.equal(deriveIssueState({ status: "cancelled" }).outcome, "cancelled");
  });
  it("treats a work order finished in Fleet as repaired, or the path's last step", () => {
    assert.deepEqual(
      deriveIssueState({ status: "closed" }),
      { stage: "resolved", path: "repair", step: "repaired", outcome: "repaired" },
    );
    assert.equal(deriveIssueState({ status: "completed", issueOutcome: "replace", issueStep: "ordered" }).step, "replaced");
  });
  it("treats in-shop work with no path as a repair in progress", () => {
    assert.equal(deriveIssueState({ status: "in_progress" }).path, "repair");
  });
});

describe("buildMaintenanceIssues", () => {
  const workOrders = [
    { id: "WO-PABC", status: "requested", source: "employee_portal", complaint: "Mirror — cracked", unitDesignation: "Engine 4", openedAt: daysAgo(2) },
    { id: "WO-9", status: "in_progress", source: "manual", category: "PM", complaint: "Oil change" },
    { id: "FWO-2", status: "awaiting_parts", source: "legacy_list", legacyWorkOrderId: "WO-F77", issueOutcome: "replace", issueStep: "ordered", openedAt: daysAgo(20) },
    { id: "FWO-3", status: "completed", category: "Damage report", completedAt: daysAgo(1), openedAt: daysAgo(5) },
  ];
  const damageForms = [
    { id: "portal-WO-PABC", workOrderId: "WO-PABC", source: "employee-portal", equipment: "Driver mirror", submittedAt: daysAgo(2), submitterName: "FF Lee", photos: [{ url: "https://x/1.jpg" }] },
    { id: "field-1", workOrderId: "WO-F77", source: "field-app", equipment: "SCBA bottle", submittedAt: daysAgo(20) },
    { id: "jot-1", source: "jotform", equipment: "Bay door", submittedAt: daysAgo(30) },
  ];
  const issues = buildMaintenanceIssues({ workOrders, damageForms, now: NOW });

  it("keeps reported issues and skips routine work orders", () => {
    assert.deepEqual(issues.map((issue) => issue.id).sort(), ["FWO-2", "FWO-3", "WO-PABC", "form:jot-1"]);
  });
  it("joins the damage report to its work order", () => {
    const portal = issues.find((issue) => issue.id === "WO-PABC");
    assert.equal(portal.title, "Driver mirror");
    assert.equal(portal.source, "Employee Portal");
    assert.equal(portal.reportedBy, "FF Lee");
    assert.equal(portal.photos.length, 1);
    assert.equal(issues.find((issue) => issue.id === "FWO-2").source, "FORGE FIELD");
  });
  it("lists a report with no work order as new", () => {
    const jot = issues.find((issue) => issue.id === "form:jot-1");
    assert.equal(jot.stage, "new");
    assert.equal(jot.workOrder, null);
    assert.equal(jot.overdue, true);
  });
  it("summarizes the board", () => {
    const summary = summarizeMaintenanceIssues(issues, { now: NOW });
    assert.equal(summary.total, 4);
    assert.equal(summary.open, 3);
    assert.equal(summary.new, 2);
    assert.equal(summary.overdue, 2);
    assert.equal(summary.byStage.in_progress, 1);
    assert.equal(summary.resolvedRecently, 1);
    assert.equal(summary.byOutcome.repaired, 1);
  });
  it("filters by path and text", () => {
    assert.deepEqual(filterMaintenanceIssues(issues, { path: "replace" }).map((i) => i.id), ["FWO-2"]);
    assert.deepEqual(filterMaintenanceIssues(issues, { search: "bay" }).map((i) => i.id), ["form:jot-1"]);
  });
});

describe("nextStep", () => {
  it("moves along the path and stops at the end", () => {
    assert.equal(nextStep("replace", "ordered").id, "received");
    assert.equal(nextStep("dispose", "disposed"), null);
  });
});
