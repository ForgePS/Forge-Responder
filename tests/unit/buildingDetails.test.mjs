import test from "node:test";
import assert from "node:assert/strict";
import { buildingDetailsFrom, matchBuilding, mergeBuildingDetails } from "../../src/lib/neris/buildingDetails.js";

const inn = {
  id: "OCC-104", name: "Riverside Inn", address: "880 Riverfront Pkwy",
  constructionType: "Type V-A", sprinkler: "Wet Pipe (NFPA 13R)", alarm: "Monitored", knoxBox: "",
};

test("matches a building by address or name", () => {
  assert.equal(matchBuilding("880 Riverfront Pkwy, Riverside", [inn])?.id, "OCC-104");
  assert.equal(matchBuilding("Fire at the Riverside Inn", [inn])?.id, "OCC-104");
  assert.equal(matchBuilding("12 Oak St", [inn]), null);
});

test("preplan answers win over systems, occupancy and the classic list", () => {
  const { details, sources } = buildingDetailsFrom({
    occupancy: inn,
    answers: { constructionType: "Type V-A", roofConstruction: "Wood Truss", stories: "3", sprinkler: "Wet Pipe" },
    systems: [{ systemTypeId: "fire_alarm", name: "Main panel", monitoringProvider: "Riverside Alarm Co.", status: "active" }],
    legacyPreplan: { hazards: "Pool chemical storage, Knox box at front desk", waterSupply: "RV-1307" },
  });
  assert.equal(details.constructionType, "Type V-A · Wood Truss roof · 3 stories");
  assert.equal(details.sprinklerStatus, "Wet Pipe");
  assert.equal(sources.sprinklerStatus, "preplan");
  assert.equal(details.alarmStatus, "Main panel, monitored by Riverside Alarm Co.");
  assert.equal(sources.alarmStatus, "fire protection systems");
  assert.equal(details.knoxBox, "Present — at front desk");
  assert.equal(details.hazards, "Pool chemical storage, Knox box at front desk");
  assert.equal(details.waterSupply, "RV-1307");
});

test("an impaired system is flagged, and Unknown never counts as a value", () => {
  const { details } = buildingDetailsFrom({
    occupancy: { ...inn, sprinkler: "Unknown" },
    answers: { sprinkler: "Unknown" },
    systems: [{ systemTypeId: "sprinkler", name: "Wet riser", status: "impaired" }],
  });
  assert.equal(details.sprinklerStatus, "Wet riser — IMPAIRED");
});

test("last inspection summary uses the newest completed inspection", () => {
  const { details } = buildingDetailsFrom({
    occupancy: inn,
    inspections: [
      { status: "completed", completedAt: "2026-03-01T12:00:00", result: "Passed" },
      { status: "completed", completedAt: "2026-10-12T12:00:00", result: "Passed with conditions", openViolationCount: 1 },
      { status: "scheduled", dueAt: "2026-12-01" },
    ],
  });
  assert.equal(details.lastInspection, "Passed with conditions on Oct 12, 2026 · 1 open violation");
});

test("merge only fills blank or Unknown fields", () => {
  const { location, filled } = mergeBuildingDetails(
    { constructionType: "Typed by the crew", sprinklerStatus: "Unknown", alarmStatus: "" },
    { constructionType: "Type V-A", sprinklerStatus: "Wet Pipe", alarmStatus: "Monitored" },
  );
  assert.equal(location.constructionType, "Typed by the crew");
  assert.equal(location.sprinklerStatus, "Wet Pipe");
  assert.equal(location.alarmStatus, "Monitored");
  assert.deepEqual(filled.sort(), ["alarmStatus", "sprinklerStatus"]);
});
