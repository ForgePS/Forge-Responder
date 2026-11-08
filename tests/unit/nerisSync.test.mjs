import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const sync = require("../../functions/lib/nerisSync.js");

const profile = {
  name: "Forge Demo Fire Department",
  contactEmail: "chief@example.test",
  address: "100 Main St",
  city: "Springfield",
  stateId: "ms",
  zip: "38654",
  timezone: "America/Chicago",
  stationDetails: [
    { id: "station-station-1", name: "Station 1", address: "100 Main St", city: "Springfield", state: "MS", zip: "38654" },
    { id: "station-station-2", name: "Station 2", address: "200 Oak Ave", city: "Springfield", state: "MS", zip: "38654" },
    { id: "station-station-3", name: "Station 3", address: "", city: "", state: "", zip: "" },
  ],
};

const apparatus = [
  { id: "APP-1", unit: "Engine 1", type: "Pumper", station: "Station 1", status: "In Service" },
  { id: "APP-2", unit: "Medic 1", type: "Ambulance (ALS)", station: "Station 1", status: "In Service" },
  { id: "APP-3", unit: "Truck 3", type: "Aerial", station: "Station 3", status: "In Service" },
  { id: "APP-4", unit: "Engine 4", type: "Pumper (Reserve)", station: "Station 2", status: "Out of Service" },
  { id: "APP-5", unit: "Gator", type: "Side by side", station: "Station 2", status: "In Service" },
  { id: "APP-6", unit: "Bad/Name", type: "Pumper", station: "Station 2" },
];

// NERIS already has Station 2 (matched by name) with Engine 4 in it.
const entity = {
  name: "Forge Demo FD",
  email: "chief@example.test",
  address_line_1: "100 Main St",
  city: "Springfield",
  state: "MS",
  zip_code: "38654",
  time_zone: "America/Chicago",
  rms_software: null,
  stations: [{
    neris_id: "FD24021886S001",
    station_id: "station 2",
    address_line_1: "200 Oak Ave",
    city: "Springfield",
    state: "MS",
    zip_code: "38654",
    units: [{ neris_id: "FD24021886S001U001", cad_designation_1: "Engine 4", type: "ENGINE_STRUCT", staffing: 3, in_service: true }],
  }],
};

test("unit type guesses", () => {
  assert.equal(sync.guessUnitType("Pumper", "Engine 1"), "ENGINE_STRUCT");
  assert.equal(sync.guessUnitType("Ambulance (ALS)", "Medic 1"), "ALS_AMB");
  assert.equal(sync.guessUnitType("Ambulance", "Ambulance 3"), "BLS_AMB");
  assert.equal(sync.guessUnitType("Aerial", "Truck 3"), "LADDER_TALL");
  assert.equal(sync.guessUnitType("Tiller", "Truck 1"), "LADDER_TILLER");
  assert.equal(sync.guessUnitType("Heavy Rescue", "Rescue 1"), "RESCUE_HEAVY");
  assert.equal(sync.guessUnitType("Command", "Battalion 1"), "CHIEF_STAFF_COMMAND");
  assert.equal(sync.guessUnitType("Brush", "Brush 2"), "ENGINE_WUI");
  assert.equal(sync.guessUnitType("Tanker", "Tanker 5"), "TENDER");
  assert.equal(sync.guessUnitType("Side by side", "Gator"), "");
  for (const [, type] of Object.entries(sync.DEFAULT_STAFFING)) assert.ok(Number.isInteger(type));
});

test("plan: department sends only fields that differ", () => {
  const plan = sync.buildSyncPlan({ profile, apparatus, entity, connection: {} });
  const fields = plan.department.changes.map((c) => c.field).sort();
  assert.deepEqual(fields, ["name", "rms_software"]);
  const name = plan.department.changes.find((c) => c.field === "name");
  assert.equal(name.neris, "Forge Demo FD");
  assert.equal(name.forge, "Forge Demo Fire Department");
});

test("plan: stations are created, matched by name, or skipped with a reason", () => {
  const plan = sync.buildSyncPlan({ profile, apparatus, entity, connection: {} });
  const byName = Object.fromEntries(plan.stations.map((s) => [s.name, s]));
  assert.equal(byName["Station 1"].action, "create");
  assert.equal(byName["Station 2"].nerisStationId, "FD24021886S001");
  assert.equal(byName["Station 2"].action, "update", "station_id spelling and internal_id differ");
  assert.equal(byName["Station 3"].action, "skip");
  assert.match(byName["Station 3"].reason, /street address, city, state, ZIP code/);
});

test("plan: units", () => {
  const plan = sync.buildSyncPlan({ profile, apparatus, entity, connection: {} });
  const u = Object.fromEntries(plan.units.map((x) => [x.name, x]));
  assert.equal(u["Engine 1"].action, "create");
  assert.equal(u["Engine 1"].type, "ENGINE_STRUCT");
  assert.equal(u["Engine 1"].staffing, 3);
  assert.equal(u["Medic 1"].type, "ALS_AMB");
  assert.equal(u["Truck 3"].action, "skip", "its station has no address");
  assert.match(u["Truck 3"].reason, /Station 3/);
  assert.equal(u["Engine 4"].nerisUnitId, "FD24021886S001U001");
  assert.equal(u["Engine 4"].action, "update", "out of service in FORGE");
  assert.deepEqual(u["Engine 4"].changes, ["in_service"]);
  assert.equal(u.Gator.action, "skip");
  assert.match(u.Gator.reason, /Pick a NERIS unit type/);
  assert.equal(u["Bad/Name"].action, "skip");
});

test("plan: saved unit settings override the guess", () => {
  const plan = sync.buildSyncPlan({
    profile, apparatus, entity,
    connection: { unitSettings: { "APP-5": { type: "UTIL", staffing: 1 }, "APP-1": { staffing: 4 } } },
  });
  const u = Object.fromEntries(plan.units.map((x) => [x.name, x]));
  assert.equal(u.Gator.type, "UTIL");
  assert.equal(u.Gator.action, "create");
  assert.equal(u.Gator.typeGuessed, false);
  assert.equal(u["Engine 1"].staffing, 4);
});

test("cleanUnitSettings drops bad values", () => {
  assert.deepEqual(sync.cleanUnitSettings({ a: { type: "ENGINE_STRUCT", staffing: "3" }, b: { type: "NOPE", staffing: -1 }, c: null }),
    { a: { type: "ENGINE_STRUCT", staffing: 3 } });
});

test("apply: department, then stations, then units into the new station", async () => {
  const plan = sync.buildSyncPlan({ profile, apparatus, entity, connection: {} });
  const calls = [];
  const request = async (path, { method, body }) => {
    calls.push({ path, method, body });
    if (method === "POST" && path.endsWith("/station")) return { ok: true, status: 201, data: { neris_id: "FD24021886S002" } };
    if (method === "POST" && path.endsWith("/unit")) return { ok: true, status: 201, data: { neris_id: `U-${body.cad_designation_1}` } };
    if (method === "PATCH" && path.includes("/unit/")) return { ok: false, status: 422, data: { detail: [{ loc: ["body", "staffing"], msg: "bad" }] } };
    return { ok: true, status: 200, data: {} };
  };
  const { results, stationLinks, unitLinks } = await sync.applySyncPlan({
    plan,
    profile,
    nerisId: "FD24021886",
    selection: {
      departmentFields: ["rms_software"],
      stationIds: ["station-station-1", "station-station-2", "station-station-3"],
      unitIds: ["APP-1", "APP-4", "APP-3"],
    },
    request,
  });

  assert.deepEqual(calls.map((c) => `${c.method} ${c.path}`), [
    "PATCH /entity/FD24021886",
    "POST /entity/FD24021886/station",
    "PATCH /entity/FD24021886/station/FD24021886S001",
    "POST /entity/FD24021886/station/FD24021886S002/unit",
    "PATCH /entity/FD24021886/station/FD24021886S001/unit/FD24021886S001U001",
  ]);
  assert.deepEqual(calls[0].body, { rms_software: "FORGE RMS" }, "only the ticked field");
  assert.equal(calls[1].body.station_id, "Station 1");
  assert.equal(calls[1].body.internal_id, "station-station-1");
  assert.equal(calls[1].body.state, "MS");
  assert.deepEqual(calls[3].body, { type: "ENGINE_STRUCT", staffing: 3, in_service: true, cad_designation_1: "Engine 1" });

  assert.deepEqual(stationLinks, { "station-station-1": "FD24021886S002", "station-station-2": "FD24021886S001" });
  assert.deepEqual(unitLinks, { "APP-1": "U-Engine 1" });
  const failed = results.filter((r) => !r.ok);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].label, "Engine 4");
  assert.match(failed[0].message, /staffing: bad/);
});

test("apply: a unit whose new station failed is reported, not sent", async () => {
  const plan = sync.buildSyncPlan({ profile, apparatus, entity, connection: {} });
  const calls = [];
  const request = async (path, opts) => {
    calls.push(`${opts.method} ${path}`);
    return { ok: false, status: 422, data: { detail: "zip_code invalid" } };
  };
  const { results } = await sync.applySyncPlan({
    plan, profile, nerisId: "FD24021886", selection: { stationIds: ["station-station-1"], unitIds: ["APP-1"] }, request,
  });
  assert.deepEqual(calls, ["POST /entity/FD24021886/station"]);
  assert.match(results[0].message, /zip_code invalid/);
  assert.match(results[1].message, /Send the station first/);
});
