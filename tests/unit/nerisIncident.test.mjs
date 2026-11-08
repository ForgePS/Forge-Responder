import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const inc = require("../../functions/lib/nerisIncident.js");

export const sampleReport = {
  id: "NERIS-abc",
  reportNumber: "NERIS-2026-014",
  status: "Ready for Submission",
  incidentAddress: "1200 Riverfront Pkwy, Riverside, MS 38654",
  workspace: {
    cad: {
      receivedTime: "2026-07-04T14:00",
      dispatchTime: "2026-07-04T14:01",
      clearTime: "2026-07-04T15:30",
      cadCallNumber: "26-004512",
    },
    units: [
      { unitId: "Engine 1", dispatchTime: "2026-07-04T14:01", enrouteTime: "2026-07-04T14:02", arrivalTime: "2026-07-04T14:07", clearTime: "2026-07-04T15:20" },
      { unitId: "Medic 9", dispatchTime: "", arrivalTime: "2026-07-04T14:10" },
    ],
    personnel: [
      { name: "A", unitId: "Engine 1" }, { name: "B", unitId: "Engine 1" }, { name: "C", unitId: "Engine 1" },
    ],
    narrative: { body: "Crews arrived to find a room and contents fire." },
  },
  modules: {
    core_mod_incident: {
      incident_final_type: ["FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE", "RESCUE: OUTSIDE: BACKOUNTRY_RESCUE"],
      incident_people_present: "True",
    },
  },
};

export const sampleInputs = {
  report: sampleReport,
  nerisId: "FD24021886",
  profile: { timezone: "America/Chicago", stateId: "MS" },
  apparatus: [{ id: "APP-1", unit: "Engine 1" }, { id: "APP-9", unit: "Medic 9" }],
  unitLinks: { "APP-1": "FD24021886S001U001" },
};

test("incident types: FORGE codes become NERIS codes", () => {
  assert.equal(inc.toNerisIncidentType("FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE"), "FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE");
  assert.equal(inc.toNerisIncidentType("RESCUE: OUTSIDE: BACKOUNTRY_RESCUE"), "RESCUE||OUTSIDE||BACKCOUNTRY_RESCUE");
  assert.equal(inc.toNerisIncidentType("MEDICAL||ILLNESS||BACK_PAIN_NON_TRAUMA"), "MEDICAL||ILLNESS||BACK_PAIN_NON_TRAUMA");
  assert.equal(inc.toNerisIncidentType(""), "");
});

test("timestamps: local times get the department's offset, including DST", () => {
  assert.equal(inc.toNerisTimestamp("2026-07-04T14:01", "America/Chicago"), "2026-07-04T14:01:00-05:00");
  assert.equal(inc.toNerisTimestamp("2026-01-15T09:30", "America/Chicago"), "2026-01-15T09:30:00-06:00");
  assert.equal(inc.toNerisTimestamp("2026-01-15T09:30:15", "America/New_York"), "2026-01-15T09:30:15-05:00");
  assert.equal(inc.toNerisTimestamp("2026-07-04T14:01", "America/Phoenix"), "2026-07-04T14:01:00-07:00");
  // Day after the spring-forward change.
  assert.equal(inc.toNerisTimestamp("2026-03-09T01:30", "America/Chicago"), "2026-03-09T01:30:00-05:00");
  assert.equal(inc.toNerisTimestamp("2026-07-04T19:01:00Z"), "2026-07-04T19:01:00.000Z", "already zoned");
  assert.equal(inc.toNerisTimestamp("", "America/Chicago"), null);
  assert.equal(inc.toNerisTimestamp("not a time"), null);
  assert.equal(inc.toNerisTimestamp("2026-07-04T14:01", "Not/AZone"), "2026-07-04T14:01:00-05:00", "bad zone falls back to Central");
});

test("address: one line split into NERIS location fields", () => {
  assert.deepEqual(inc.parseAddress("1200 Riverfront Pkwy, Riverside, MS 38654"), {
    complete_number: "1200", number: 1200, street: "Riverfront Pkwy", state: "MS", postal_code: "38654",
    incorporated_municipality: "Riverside", country: "US",
  });
  assert.deepEqual(inc.parseAddress("123B Main St", "tn"), { complete_number: "123B", number: 123, number_suffix: "B", street: "Main St", state: "TN", country: "US" });
  assert.deepEqual(inc.parseAddress("I-55 mile marker 287", "MS"), { street: "I-55 mile marker 287", state: "MS", country: "US" });
  assert.equal(inc.parseAddress("9 Elm, Town, MS 38654-1234").postal_code_extension, "1234");
});

test("payload: required NERIS sections built from the report", () => {
  const { payload, problems, warnings } = inc.buildIncidentPayload(sampleInputs);
  assert.deepEqual(problems, []);
  assert.equal(payload.base.department_neris_id, "FD24021886");
  assert.equal(payload.base.incident_number, "NERIS-2026-014");
  assert.equal(payload.base.people_present, true);
  assert.match(payload.base.outcome_narrative, /room and contents/);
  assert.deepEqual(payload.incident_types, [
    { type: "FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE", primary: true },
    { type: "RESCUE||OUTSIDE||BACKCOUNTRY_RESCUE", primary: false },
  ]);
  assert.equal(payload.dispatch.incident_number, "26-004512", "CAD number when it fits NERIS's format");
  assert.equal(payload.dispatch.call_arrival, "2026-07-04T14:00:00-05:00");
  assert.equal(payload.dispatch.incident_clear, "2026-07-04T15:30:00-05:00");

  const [engine, medic] = payload.dispatch.unit_responses;
  assert.deepEqual(engine, {
    unit_neris_id: "FD24021886S001U001",
    reported_unit_id: "Engine 1",
    staffing: 3,
    dispatch: "2026-07-04T14:01:00-05:00",
    enroute_to_scene: "2026-07-04T14:02:00-05:00",
    on_scene: "2026-07-04T14:07:00-05:00",
    unit_clear: "2026-07-04T15:20:00-05:00",
  });
  assert.equal(medic.unit_neris_id, undefined, "not synced: sent by name only");
  assert.equal(medic.reported_unit_id, "Medic 9");
  assert.equal(medic.dispatch, "2026-07-04T14:01:00-05:00", "falls back to the incident dispatch time");
  assert.equal(medic.staffing, undefined);
  assert.deepEqual(payload.unit_responses, payload.dispatch.unit_responses);
  assert.ok(warnings.some((w) => /Medic 9/.test(w)));
});

test("payload: never includes crew names or CAD comments", () => {
  const withPii = {
    ...sampleInputs,
    report: {
      ...sampleReport,
      workspace: { ...sampleReport.workspace, cad: { ...sampleReport.workspace.cad, initialComments: "Caller Jane Doe 662-555-0199" }, ems: { patientName: "Bob Patient" } },
    },
  };
  const json = JSON.stringify(inc.buildIncidentPayload(withPii).payload);
  assert.ok(!/Jane|Bob|555-0199/.test(json));
  assert.ok(!json.includes('"name"'));
});

test("payload: problems instead of a payload when required things are missing", () => {
  const empty = inc.buildIncidentPayload({ report: { reportNumber: "bad number!", workspace: {} }, nerisId: "FD123", profile: {} });
  assert.equal(empty.payload, null);
  assert.deepEqual(empty.problems, [
    "The department's NERIS ID must look like FD followed by 8 digits.",
    "The report number can only use letters, numbers, dashes and colons.",
    "Choose an incident type.",
    "Add the incident address.",
    "Add the call received or dispatch time.",
    "Add at least one responding unit.",
  ]);
});

test("payload: dispatch time stands in for a missing call-received time", () => {
  const report = { ...sampleReport, workspace: { ...sampleReport.workspace, cad: { dispatchTime: "2026-07-04T14:01", cadCallNumber: "has spaces" } } };
  const { payload, warnings } = inc.buildIncidentPayload({ ...sampleInputs, report });
  assert.equal(payload.dispatch.call_arrival, "2026-07-04T14:01:00-05:00");
  assert.equal(payload.dispatch.incident_number, "NERIS-2026-014", "CAD number with spaces isn't valid for NERIS");
  assert.ok(warnings.some((w) => /call-received/.test(w)));
});

test("validation messages are readable", () => {
  assert.deepEqual(inc.validationMessages({ status: 422, data: { detail: [{ loc: ["body", "dispatch", "call_arrival"], msg: "Field required" }] } }),
    ["dispatch → call_arrival: Field required"]);
  assert.deepEqual(inc.validationMessages({ status: 403, data: {} }), ["NERIS refused. Check that FORGE is still enrolled for this department."]);
});
