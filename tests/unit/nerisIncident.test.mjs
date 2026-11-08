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
      incident_actions_taken: ["SUPPRESSION: STRUCTURAL_FIRE_SUPPRESSION: INTERIOR", "SUPPRESSION: OUTSIDE_FIRE_SUPPRESSION: ESTABLISH FIRE LINES"],
      incident_rescue_animal: "1",
    },
    mod_fire: {
      fire_water_supply: "HYDRANT_LESS_500",
      fire_suppression_appliance: ["SMALL_DIAMETER_FIRE_HOSE", "1.75 handline"],
      fire_investigation_need: "NO_CAUSE_OBVIOUS",
      structure_arrival_conditions: "SMOKE_SHOWING",
      structure_progression_conditions: "False",
      structure_damage: "MINOR_DAMAGE",
      structure_floor_of_origin: "1",
      structure_room_of_origin: "KITCHEN",
      structure_fire_cause: "COOKING",
    },
    mod_alarms: {
      smoke_alarm_presence: "PRESENT",
      smoke_alarm_types: ["HARDWIRED"],
      smoke_alarm_working: "True",
      smoke_alarm_operation: "OPERATED_ALERTED_OCCUPANT",
      smoke_alarm_occupant_action: "EVACUATED",
      fire_alarm_presence: "NOT_PRESENT",
      other_alarm_presence: "NOT_APPLICABLE",
      sprinkler_presence: "PRESENT",
      sprinkler_types: ["WET_PIPE_SPRINKLER_SYSTEM"],
      sprinkler_coverage: "PARTIAL",
      sprinkler_operation: "OPERATED_EFFECTIVE",
      sprinklers_activated: "2",
      sprinkler_failure: "SYSTEM_INOPERABLE",
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

const withModules = (patch, core = {}) => ({
  ...sampleInputs,
  report: { ...sampleReport, modules: { ...sampleReport.modules, ...patch, core_mod_incident: { ...sampleReport.modules.core_mod_incident, ...core } } },
});

test("structure fire: fire detail, alarms and actions", () => {
  const { payload, problems, warnings } = inc.buildIncidentPayload(sampleInputs);
  assert.deepEqual(problems, []);
  assert.deepEqual(payload.fire_detail, {
    location_detail: {
      type: "STRUCTURE", floor_of_origin: 1, arrival_condition: "SMOKE_SHOWING", damage_type: "MINOR_DAMAGE",
      room_of_origin_type: "KITCHEN", cause: "COOKING", progression_evident: false,
    },
    water_supply: "HYDRANT_LESS_500",
    investigation_needed: "NO_CAUSE_OBVIOUS",
    investigation_types: [],
    suppression_appliances: ["SMALL_DIAMETER_FIRE_HOSE"],
  });
  assert.ok(warnings.some((w) => /typed in/.test(w)), "free-text equipment is flagged, not sent");
  assert.deepEqual(payload.smoke_alarm, {
    presence: { type: "PRESENT", working: true, alarm_types: ["HARDWIRED"], operation: { alerted_failed_other: { type: "OPERATED_ALERTED_OCCUPANT", occupant_action: "EVACUATED" } } },
  });
  assert.deepEqual(payload.fire_alarm, { presence: { type: "NOT_PRESENT" } });
  assert.deepEqual(payload.other_alarm, { presence: { type: "NOT_APPLICABLE" } });
  assert.deepEqual(payload.fire_suppression, {
    presence: {
      type: "PRESENT",
      suppression_types: [{ type: "WET_PIPE_SPRINKLER_SYSTEM", full_partial: "PARTIAL" }],
      operation_type: { effectiveness: { type: "OPERATED_EFFECTIVE", sprinklers_activated: 2 } },
    },
  });
  assert.equal(payload.cooking_fire_suppression, undefined, "only for confined cooking fires");
  assert.deepEqual(payload.actions_tactics, {
    action_noaction: { type: "ACTION", actions: ["SUPPRESSION||STRUCTURAL_FIRE_SUPPRESSION||INTERIOR", "SUPPRESSION||OUTSIDE_FIRE_SUPPRESSION||ESTABLISH_FIRE_LINES"] },
  });
  assert.equal(payload.base.animals_rescued, 1);
  assert.equal(payload.hazsit_detail, undefined);
  assert.equal(payload.medical_details, undefined);
});

test("structure fire: missing fire and alarm answers block the submit", () => {
  const { payload, problems } = inc.buildIncidentPayload(withModules({ mod_fire: { fire_water_supply: "TANK_WATER" }, mod_alarms: {} }));
  assert.equal(payload, null);
  assert.ok(problems.includes("Fire: choose the room of origin."));
  assert.ok(problems.includes("Alarms: say whether there were smoke alarms."));
  assert.ok(!problems.some((p) => /water supply/.test(p)));
});

test("structure fire: alarms optional when only support aid was given", () => {
  const { payload, problems, warnings } = inc.buildIncidentPayload(withModules({ mod_alarms: {} }, {
    incident_aid_direction: "GIVEN", incident_aid_type: "SUPPORT_AID", incident_aid_department_name: ["FD24000001", "Oak Grove FD"],
    incident_aid_nonfd: ["LAW_ENFORCEMENT"],
  }));
  assert.deepEqual(problems, []);
  assert.equal(payload.smoke_alarm, undefined);
  assert.deepEqual(payload.aids, [{ department_neris_id: "FD24000001", aid_type: "SUPPORT_AID", aid_direction: "GIVEN" }]);
  assert.deepEqual(payload.nonfd_aids, ["LAW_ENFORCEMENT"]);
  assert.ok(warnings.some((w) => /Oak Grove FD/.test(w)), "names without a NERIS ID are flagged");
});

test("cooking fire: cooking suppression is required", () => {
  const cooking = { incident_final_type: ["FIRE: STRUCTURE_FIRE: CONFINED_COOKING_APPLIANCE_FIRE"] };
  assert.ok(inc.buildIncidentPayload(withModules({}, cooking)).problems.includes("Alarms: say whether there was cooking suppression."));
  const { payload } = inc.buildIncidentPayload(withModules({ mod_alarms: { ...sampleReport.modules.mod_alarms, cooking_presence: "PRESENT", cooking_types: ["RESIDENTIAL_HOOD_MOUNTED"], cooking_operation: "NO_OPERATION" } }, cooking));
  assert.deepEqual(payload.cooking_fire_suppression, { presence: { type: "PRESENT", suppression_types: ["RESIDENTIAL_HOOD_MOUNTED"], operation_type: "NO_OPERATION" } });
});

test("vehicle fire: outside-fire details, no alarms", () => {
  const { payload, problems } = inc.buildIncidentPayload(withModules(
    { mod_fire: { fire_water_supply: "TANK_WATER", fire_investigation_need: "NO", outside_fire_cause: "EQUIPMENT_VEHICLE_USE", fire_investigation_type: ["NONE", "INVESTIGATED_ON_SCENE_RESOURCE"] }, mod_alarms: {} },
    { incident_final_type: ["FIRE: TRANSPORTATION_FIRE: VEHICLE_FIRE_PASSENGER"] },
  ));
  assert.deepEqual(problems, []);
  assert.deepEqual(payload.fire_detail.location_detail, { type: "OUTSIDE", cause: "EQUIPMENT_VEHICLE_USE" });
  assert.deepEqual(payload.fire_detail.investigation_types, ["INVESTIGATED_ON_SCENE_RESOURCE"], "NONE can't sit with other choices");
  assert.equal(payload.smoke_alarm, undefined);
});

test("hazardous condition and medical details", () => {
  const { payload, problems, warnings } = inc.buildIncidentPayload(withModules({
    mod_fire: {},
    mod_alarms: {},
    mod_hazard: {
      hazsit_disposition: "COMPLETED_FIRE_SERVICE_ONLY", hazsit_evacuated: "0", chemical_name: "Natural gas",
      chemical_dot_class: ["GASES", "FLAMMABLE_LIQUIDS"], chemical_release_occurred: "True", chemical_amount_est: "12.5",
      chemical_amount_est_units: "GAS_CUBIC_FOOT", chemical_release_into: ["AIR"], chemical_release_cause: "UNINTENTIONAL",
    },
    mod_medical: { patient_evaluation_care: "PATIENT_EVALUATED_CARE_PROVIDED", medical_disposition: "TRANSPORT_BY_EMS_UNIT", patient_care_report: "PCR-77" },
  }, { incident_final_type: ["HAZSIT: HAZARDOUS_MATERIALS: GAS_LEAK_ODOR", "MEDICAL: ILLNESS: ALTERED_MENTAL_STATUS"], incident_actions_taken: [], incident_noaction: "" }));
  assert.deepEqual(problems, []);
  assert.equal(payload.fire_detail, undefined, "no FIRE type, so no fire detail");
  assert.deepEqual(payload.hazsit_detail, {
    evacuated: 0,
    disposition: "COMPLETED_FIRE_SERVICE_ONLY",
    chemicals: [{ name: "Natural gas", release_occurred: true, dot_class: "GASES", release: { estimated_amount: 12.5, unit_of_measurement: "GAS_CUBIC_FOOT", released_into: "AIR", cause: "UNINTENTIONAL" } }],
  });
  assert.ok(warnings.some((w) => /only the first/.test(w)));
  assert.deepEqual(payload.medical_details, [{ patient_care_evaluation: "PATIENT_EVALUATED_CARE_PROVIDED", transport_disposition: "TRANSPORT_BY_EMS_UNIT", patient_care_report_id: "PCR-77" }]);
  assert.equal(payload.actions_tactics, undefined);
});

test("no action taken is sent as NOACTION", () => {
  const { payload } = inc.buildIncidentPayload(withModules({}, { incident_noaction: "CANCELLED" }));
  assert.deepEqual(payload.actions_tactics, { action_noaction: { type: "NOACTION", noaction_type: "CANCELLED" } });
});

test("medical incident needs patient care", () => {
  const { problems } = inc.buildIncidentPayload(withModules({ mod_medical: {} }, { incident_final_type: ["MEDICAL: ILLNESS: BACK_PAIN_NON_TRAUMA"] }));
  assert.deepEqual(problems, ["Medical: choose the patient care."]);
});

test("validation messages are readable", () => {
  assert.deepEqual(inc.validationMessages({ status: 422, data: { detail: [{ loc: ["body", "dispatch", "call_arrival"], msg: "Field required" }] } }),
    ["dispatch → call_arrival: Field required"]);
  assert.deepEqual(inc.validationMessages({ status: 403, data: {} }), ["NERIS refused. Check that FORGE is still enrolled for this department."]);
});
