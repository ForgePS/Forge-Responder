import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyFleetStatus,
  changedUnitStatuses,
  classicStatusLabel,
  findFleetAssetForUnit,
  fleetDecisionForClassicStatus,
  fleetUpdatesForClassicEdits,
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

test("renaming a new unit on the Apparatus page renames its fleet unit", () => {
  const before = [{ id: "APP-NEW", unit: "New Apparatus", type: "Apparatus", station: "Station 1", year: "" }];
  const after = [{ ...before[0], unit: "Engine 4", type: "Engine", station: "Station 2", year: "2024" }];
  const fleetAssets = [{ id: "APP-NEW", legacyApparatusId: "APP-NEW", unitDesignation: "New Apparatus", fleetNumber: "New Apparatus", name: "New Apparatus", type: "Apparatus", station: "Station 1" }];
  const [update] = fleetUpdatesForClassicEdits(before, after, fleetAssets);
  assert.equal(update.asset.id, "APP-NEW");
  assert.deepEqual(update.patch, { unitDesignation: "Engine 4", fleetNumber: "Engine 4", name: "Engine 4", type: "Engine", station: "Station 2", year: "2024" });
});

test("a fleet number set in Fleet survives a rename", () => {
  const before = [{ id: "APP-1", unit: "Engine 1" }];
  const after = [{ id: "APP-1", unit: "Engine 11" }];
  const fleetAssets = [{ id: "APP-1", legacyApparatusId: "APP-1", unitDesignation: "Engine 1", fleetNumber: "FD-101", name: "Pierce pumper" }];
  const [update] = fleetUpdatesForClassicEdits(before, after, fleetAssets);
  assert.deepEqual(update.patch, { unitDesignation: "Engine 11" });
});

test("no fleet update when nothing Fleet shows has changed", () => {
  const units = [{ id: "APP-1", unit: "Engine 1", station: "Station 1", mileage: "100" }];
  const fleetAssets = [{ id: "APP-1", legacyApparatusId: "APP-1", unitDesignation: "Engine 1", station: "Station 1" }];
  assert.deepEqual(fleetUpdatesForClassicEdits(units, [{ ...units[0], mileage: "200" }], fleetAssets), []);
  assert.deepEqual(fleetUpdatesForClassicEdits(units, [{ id: "APP-2", unit: "Engine 2" }], fleetAssets), [], "new units are handled by the add sync");
});

test("renaming the second 'New Apparatus' doesn't rename the first unit's fleet record", () => {
  const before = [
    { id: "APP-A", unit: "New Apparatus" },
    { id: "APP-B", unit: "New Apparatus" },
  ];
  const after = [before[0], { id: "APP-B", unit: "Engine 5" }];
  // Only the first got a fleet record; the second was skipped for sharing its name.
  const fleetAssets = [{ id: "APP-A", legacyApparatusId: "APP-A", unitDesignation: "New Apparatus", fleetNumber: "New Apparatus", name: "New Apparatus" }];
  assert.deepEqual(fleetUpdatesForClassicEdits(before, after, fleetAssets), []);
  assert.equal(findFleetAssetForUnit(fleetAssets, before[1]), null, "the second unit has no fleet record of its own");
  assert.equal(findFleetAssetForUnit(fleetAssets, before[0]).id, "APP-A");
});

test("a name-only fleet record shared by two classic units is left alone", () => {
  const before = [{ id: "APP-1", unit: "Engine 1" }, { id: "APP-2", unit: "Engine 1" }];
  const after = [{ id: "APP-1", unit: "Engine 10" }, before[1]];
  const fleetAssets = [{ id: "FLT-1", unitDesignation: "Engine 1" }];
  assert.deepEqual(fleetUpdatesForClassicEdits(before, after, fleetAssets), []);
});
