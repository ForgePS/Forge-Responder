import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCompletionMessage,
  detectUnitSafetyConcern,
  isUnitDown,
  portalReportToFleetWorkOrderInput,
  selectLegacyWorkOrdersToSync,
  workOrderStatusLabel,
} from "../../src/lib/fleet/workOrderLoopLogic.js";

test("sync picks only classic orders not already in Fleet", () => {
  const legacy = [
    { id: "WO-1" },
    { id: "WO-2" },
    { id: "WO-3" },
    { id: "WO-3" },
    { id: "" },
    { issue: "no id" },
  ];
  const fleet = [
    { id: "WO-1" },
    { id: "WO-ABC", legacyWorkOrderId: "WO-2" },
  ];
  const picked = selectLegacyWorkOrdersToSync(legacy, fleet);
  assert.deepEqual(picked.map((row) => row.id), ["WO-3"]);
});

test("sync is idempotent once copied", () => {
  const legacy = [{ id: "WO-1" }, { id: "WO-2" }];
  const first = selectLegacyWorkOrdersToSync(legacy, []);
  assert.equal(first.length, 2);
  assert.equal(selectLegacyWorkOrdersToSync(legacy, first).length, 0);
  assert.deepEqual(selectLegacyWorkOrdersToSync(null, null), []);
});

test("detects out of service and unsafe wording", () => {
  assert.equal(detectUnitSafetyConcern("Engine 1 is out of service, pump won't engage"), "out_of_service");
  assert.equal(detectUnitSafetyConcern("Put it OOS"), "out_of_service");
  assert.equal(detectUnitSafetyConcern("Brakes failed on the way back, unsafe to drive"), "unsafe");
  assert.equal(detectUnitSafetyConcern("Scratched compartment door"), "");
  assert.equal(detectUnitSafetyConcern("close the door"), "");
});

test("portal report maps to a requested Fleet work order", () => {
  const input = portalReportToFleetWorkOrderInput(
    { location: "Engine 1", equipment: "Pump panel", damageDescription: "Gauge cracked", date: "2026-10-30" },
    { id: "WO-P1", priority: "Medium" },
    "FF Smith"
  );
  assert.equal(input.status, "requested");
  assert.equal(input.source, "employee_portal");
  assert.equal(input.unit, "Engine 1");
  assert.equal(input.priority, "medium");
  assert.equal(input.complaint, "Pump panel — Gauge cracked");
  assert.equal(input.requestedBy, "FF Smith");
  assert.equal(input.legacyWorkOrderId, "WO-P1");
  assert.equal(input.concern, "");
  assert.equal(input.oosRequired, false);

  const urgent = portalReportToFleetWorkOrderInput(
    { location: "Medic 2", damageDescription: "Unit is out of service — no brakes" },
    { id: "WO-P2" },
    ""
  );
  assert.equal(urgent.priority, "critical");
  assert.equal(urgent.concern, "out_of_service");
  assert.equal(urgent.oosRequired, true);
  assert.equal(urgent.requestedBy, "Employee");
});

test("unit down checks", () => {
  assert.equal(isUnitDown({ status: "out_of_service" }), true);
  assert.equal(isUnitDown({ status: "restricted" }), true);
  assert.equal(isUnitDown({ status: "in_service" }), false);
  assert.equal(isUnitDown(null), false);
});

test("completion message is plain", () => {
  assert.equal(
    buildCompletionMessage({ workOrderNumber: "WO-9", defectClosed: true, returnedToService: true, unitName: "Engine 1" }),
    "Work order WO-9 completed. Defect closed. Engine 1 is back in service."
  );
  assert.equal(
    buildCompletionMessage({ workOrderNumber: "WO-9", pmAdvanced: true, pmProgramName: "Annual pump service", warnings: ["Engine 1 is still out of service."] }),
    "Work order WO-9 completed. Annual pump service marked done and next due date set. Engine 1 is still out of service."
  );
  assert.equal(workOrderStatusLabel("awaiting_parts"), "Awaiting parts");
  assert.equal(workOrderStatusLabel("ready_for_qc"), "Ready for QC");
});
