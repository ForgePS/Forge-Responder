import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFleetStatus,
  changedUnitStatuses,
  classicStatusLabel,
  fleetDecisionForClassicStatus,
  readinessForFleetStatus,
} from "../../src/lib/fleet/fleetStatusOverlay.js";

const classic = [
  { id: "APP-1", unit: "Engine 1", status: "In Service" },
  { id: "APP-2", unit: "Truck 3", status: "In Service" },
  { id: "APP-9", unit: "Brush 9", status: "Out of Service" },
];
const fleet = [
  { id: "APP-1", legacyApparatusId: "APP-1", unitDesignation: "Engine 1", status: "out_of_service", readinessState: "out_of_service" },
  { id: "FLT-X", unitDesignation: "Truck 3", status: "restricted", readinessState: "available_restricted", activeRestriction: "No aerial ops" },
];

test("a unit taken out of service in Fleet shows out of service everywhere", () => {
  const live = applyFleetStatus(classic, fleet);
  assert.equal(live[0].status, "Out of Service");
  assert.equal(live[1].status, "In Service");
  assert.equal(live[1].restriction, "No aerial ops");
  assert.equal(live[2].status, "Out of Service", "units with no fleet record keep their own status");
});

test("no fleet records: the classic list is returned untouched", () => {
  assert.equal(applyFleetStatus(classic, []), classic);
});

test("labels", () => {
  assert.equal(classicStatusLabel({ status: "in_service", readinessState: "available" }), "In Service");
  assert.equal(classicStatusLabel({ status: "in_service", readinessState: "in_shop" }), "Out of Service");
  assert.equal(classicStatusLabel({ status: "reserve" }), "Reserve");
  assert.equal(classicStatusLabel({ status: "decommissioned" }), "Decommissioned");
});

test("classic status changes become fleet decisions", () => {
  assert.deepEqual(fleetDecisionForClassicStatus("Out of Service"), { decision: "out_of_service" });
  assert.deepEqual(fleetDecisionForClassicStatus("In Service"), { decision: "return_to_service" });
  assert.equal(fleetDecisionForClassicStatus("Something else"), null);
  const changed = changedUnitStatuses(classic, [{ ...classic[0], status: "In Service" }, { ...classic[1], status: "Out of Service" }]);
  assert.deepEqual(changed.map((u) => u.unit), ["Truck 3"]);
  assert.equal(readinessForFleetStatus("out_of_service"), "out_of_service");
});
