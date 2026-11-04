// FORGE FIELD incident reports: the whole RMS report merges field by field.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyReportChange, combineIncidentBookkeeping, incidentMergePaths } from "../../src/lib/neris/reportMerge.js";
import { threeWayMerge } from "../../src/field/fieldMerge.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

describe("field incident merge", () => {
  const base = {
    id: "R1", reportNumber: "NERIS-2026-001", incidentDate: "2026-11-04", incidentAddress: "", status: "Draft",
    workspace: { cad: {}, units: [], personnel: [], narrative: {}, auditLog: [] },
    modules: { core_mod_incident: { incident_internal_id: "NERIS-2026-001" }, mod_fire: {} },
  };

  it("covers module answers and workspace sections, not bookkeeping", () => {
    const mine = clone(base);
    mine.modules.core_mod_incident.incident_actions_taken = ["SUPPRESSION"];
    const paths = incidentMergePaths(base, mine);
    assert.ok(paths.includes("modules.core_mod_incident.incident_actions_taken"));
    assert.ok(paths.includes("workspace.cad"));
    assert.ok(!paths.includes("workspace.auditLog"));
    assert.ok(!paths.includes("completionPercentage"));
  });

  it("keeps the crew's answers and the office's answers when they touch different questions", () => {
    const mine = clone(base);
    mine.modules.core_mod_incident.incident_actions_taken = ["SUPPRESSION"];
    mine.workspace.cad = { dispatchTime: "2026-11-04T06:43" };
    const server = clone(base);
    server.modules.core_mod_incident.incident_people_present = "True";
    server.workspace.narrative = { body: "Office note" };
    const { merged, conflicts } = threeWayMerge(base, mine, server, incidentMergePaths(base, mine, server));
    assert.equal(conflicts.length, 0);
    assert.deepEqual(merged.modules.core_mod_incident.incident_actions_taken, ["SUPPRESSION"]);
    assert.equal(merged.modules.core_mod_incident.incident_people_present, "True");
    assert.equal(merged.workspace.narrative.body, "Office note");
    assert.equal(merged.workspace.cad.dispatchTime, "2026-11-04T06:43");
  });

  it("flags the same question changed in both places", () => {
    const mine = clone(base);
    mine.incidentAddress = "412 Oak St";
    const server = clone(base);
    server.incidentAddress = "414 Oak St";
    const { conflicts } = threeWayMerge(base, mine, server, incidentMergePaths(base, mine, server));
    assert.deepEqual(conflicts.map((conflict) => conflict.path), ["incidentAddress"]);
  });

  it("keeps both change logs and auto-fill notes", () => {
    const mine = { workspace: { auditLog: [{ action: "a" }] }, autoPopulateSources: { x: "cad" } };
    const server = { workspace: { auditLog: [{ action: "b" }, { action: "a" }] }, autoPopulateSources: { y: "occupancy" } };
    const combined = combineIncidentBookkeeping({ workspace: {} }, mine, server);
    assert.equal(combined.workspace.auditLog.length, 2);
    assert.deepEqual(Object.keys(combined.autoPopulateSources).sort(), ["x", "y"]);
  });

  it("moves a draft to In Progress on its first edit, like the RMS", () => {
    const next = applyReportChange(base, { incidentAddress: "1 Main" });
    assert.equal(next.status, "In Progress");
    assert.equal(applyReportChange({ ...base, status: "Needs Review" }, { incidentAddress: "x" }).status, "Needs Review");
  });
});
