/**
 * Plain-English model of a NERIS report for the guided editor: which fields
 * exist, what they're called, when they apply, and what's still missing.
 *
 * Data still lives where it always has (report.modules.<module>.<neris_field>
 * and report.workspace.*), so older reports open unchanged.
 */
import { getNerisValueSet } from "../nerisSchema.js";

// ---------- Incident kinds (the first question when starting a report) ----------

export const INCIDENT_KINDS = [
  { id: "fire", label: "Fire", hint: "Structure, vehicle, outside or cooking fire", typePrefix: "FIRE", discipline: "fire" },
  { id: "ems", label: "Medical", hint: "Illness, injury, cardiac, overdose", typePrefix: "MEDICAL", discipline: "ems" },
  { id: "rescue", label: "Rescue / Crash", hint: "Vehicle crash, extrication, water or technical rescue", typePrefix: "RESCUE", discipline: "rescue" },
  { id: "hazmat", label: "Hazardous condition", hint: "Gas leak, spill, CO, electrical", typePrefix: "HAZSIT", discipline: "hazmat" },
  { id: "service", label: "Public service", hint: "Lift assist, lockout, standby, assist", typePrefix: "PUBSERV", discipline: "public_assist" },
  { id: "noemerg", label: "No emergency", hint: "Good intent, false alarm, cancelled en route", typePrefix: "NOEMERG", discipline: "" },
];

// ---------- Option lists ----------

const KEEP_UPPER = new Set(["EMS", "CO", "DOT", "FF", "RIT", "PPE", "PV", "US", "AHJ", "CAD", "LP", "ESS", "MCI", "IV", "RV", "ATV", "UTV", "HVAC", "LPG", "CNG"]);

/** Many synced NERIS labels are all caps ("OPERATED ALERTED OCCUPANT"); show them in sentence case. */
export function friendlyLabel(label = "") {
  const raw = String(label);
  if (!/[A-Z]/.test(raw) || raw !== raw.toUpperCase()) return raw;
  const words = raw.split(/\s+/).map((w) => (KEEP_UPPER.has(w) ? w : w.toLowerCase()));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function options(valueSet) {
  return getNerisValueSet(valueSet).map((o) => ({ ...o, label: friendlyLabel(o.label) }));
}

export const YES_NO = [
  { value: "True", label: "Yes" },
  { value: "False", label: "No" },
];

// ---------- Small helpers ----------

export function asList(value) {
  if (Array.isArray(value)) return value.flat().filter((v) => v !== "" && v !== null && v !== undefined);
  return value === "" || value === null || value === undefined ? [] : [value];
}

export function isBlank(value) {
  return asList(value).length === 0;
}

export function core(report = {}) {
  return report.modules?.core_mod_incident || {};
}

/** NERIS incident types on the report, e.g. ["FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE"]. */
export function incidentTypes(report = {}) {
  return asList(core(report).incident_final_type).map(String);
}

function typeIncludes(report, pattern) {
  return incidentTypes(report).some((t) => pattern.test(t));
}

function hasDiscipline(report, id) {
  const list = report.disciplines || report.workspace?.disciplines || [];
  return list.includes(id);
}

/** Which detail sections apply to this report. */
export function applicability(report = {}) {
  const c = core(report);
  const fire = typeIncludes(report, /^FIRE/) || hasDiscipline(report, "fire") || c.fire === "True";
  const structureFire = typeIncludes(report, /STRUCTURE_FIRE/);
  const cookingFire = typeIncludes(report, /CONFINED_COOKING_APPLIANCE_FIRE/);
  const outsideFire = typeIncludes(report, /OUTSIDE_FIRE/);
  // NERIS reports every non-structure fire (outside, vehicle, special) with the outside-fire questions.
  const nonStructureFire = fire && !structureFire;
  const ems = typeIncludes(report, /^MEDICAL/) || hasDiscipline(report, "ems");
  const rescue = typeIncludes(report, /^RESCUE/) || hasDiscipline(report, "rescue") || hasDiscipline(report, "mva") || hasDiscipline(report, "technical_rescue");
  const hazmat = typeIncludes(report, /^HAZSIT/) || hasDiscipline(report, "hazmat");
  const wildland = outsideFire || hasDiscipline(report, "wildland") || Boolean(report.workspace?.wildland?.acresBurned);
  const casualties = fire || ems || rescue || c.incident_people_present === "True";
  // NERIS needs alarm and sprinkler details for structure fires, unless the only aid was support given to another department.
  const supportGivenOnly = asList(c.incident_aid_direction).includes("GIVEN") && asList(c.incident_aid_type).includes("SUPPORT_AID");
  const alarms = structureFire && !supportGivenOnly;
  return { fire, structureFire, cookingFire, outsideFire, nonStructureFire, alarms, ems, rescue, hazmat, wildland, casualties };
}

export function noAction(report = {}) {
  return !isBlank(core(report).incident_noaction);
}

export function aidInvolved(report = {}) {
  return !isBlank(core(report).incident_aid_direction);
}

// ---------- Friendly field definitions for NERIS modules ----------

/**
 * @typedef {{ name: string, label: string, help?: string, kind: 'select'|'multi'|'yesno'|'number'|'text'|'textarea',
 *   valueSet?: string, options?: Array<{ value: string, label: string }>, required?: boolean, when?: (report: object) => boolean }} FieldDef
 */

function codeList(values) {
  return values.map((value) => ({ value, label: value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (ch) => ch.toUpperCase()) }));
}

const PRESENCE = [
  { value: "PRESENT", label: "Present" },
  { value: "NOT_PRESENT", label: "Not present" },
  { value: "NOT_APPLICABLE", label: "Not applicable" },
];

// Not in FORGE's synced value sets; copied from the NERIS API (TypeSuppressApplianceValue, TypeSuppressNoOperationValue).
export const SUPPRESSION_APPLIANCES = codeList([
  "SMALL_DIAMETER_FIRE_HOSE", "MEDIUM_DIAMETER_FIRE_HOSE", "BOOSTER_FIRE_HOSE", "MASTER_STREAM", "AERIAL_MASTER_STREAM",
  "ELEVATED_MASTER_STREAM_STANDPIPE", "GROUND_MONITOR", "BUILDING_STANDPIPE", "BUILDING_FDC", "FIRE_EXTINGUISHER",
  "AIRATTACK_HELITACK", "OTHER", "NONE",
]);
const SPRINKLER_FAILURES = codeList([
  "INSUFFICIENT_SOURCE", "INSUFFICIENT_WATER_SUPPLY", "SYSTEM_DAMAGED_COMPROMISED", "SYSTEM_INOPERABLE", "SYSTEM_NOT_SUITABLE",
  "SYSTEM_SHUTOFF_DURING_INCIDENT", "SYSTEM_SHUTOFF_PRIOR_TO_INCIDENT", "UNABLE_TO_DETERMINE",
]);

const alarmValue = (r, name) => r.modules?.mod_alarms?.[name];
const present = (name) => (r) => alarmValue(r, name) === "PRESENT";

/** @type {Record<string, FieldDef[]>} */
export const MODULE_FIELDS = {
  mod_fire: [
    { name: "fire_water_supply", label: "Water supply", kind: "select", valueSet: "type_water_supply", required: true },
    { name: "fire_suppression_appliance", label: "Suppression equipment used", kind: "multi", options: SUPPRESSION_APPLIANCES },
    { name: "fire_investigation_need", label: "Does this fire need an investigation?", kind: "select", valueSet: "type_fire_invest_need", required: true },
    { name: "fire_investigation_type", label: "Investigation completed", kind: "multi", valueSet: "type_fire_invest" },
    { name: "structure_arrival_conditions", label: "Fire conditions on arrival", kind: "select", valueSet: "type_fire_condition_arrival", required: true, when: (r) => applicability(r).structureFire },
    { name: "structure_progression_conditions", label: "Did the fire extend beyond what crews found on arrival?", kind: "yesno", required: true, when: (r) => applicability(r).structureFire },
    { name: "structure_damage", label: "Damage to the building of origin", kind: "select", valueSet: "type_fire_bldg_damage", required: true, when: (r) => applicability(r).structureFire },
    { name: "structure_floor_of_origin", label: "Floor of origin", kind: "number", help: "Use negative numbers for basements (-1).", required: true, when: (r) => applicability(r).structureFire },
    { name: "structure_room_of_origin", label: "Room of origin", kind: "select", valueSet: "type_room", required: true, when: (r) => applicability(r).structureFire },
    { name: "structure_fire_cause", label: "Cause (or likely cause)", kind: "select", valueSet: "type_fire_cause_in", required: true, when: (r) => applicability(r).structureFire },
    { name: "outside_fire_cause", label: "Cause (or likely cause)", kind: "select", valueSet: "type_fire_cause_out", required: true, when: (r) => applicability(r).nonStructureFire },
    { name: "outside_fire_acres_burned", label: "Acres burned", kind: "number", required: true, when: (r) => applicability(r).outsideFire },
  ],
  mod_hazard: [
    { name: "hazsit_disposition", label: "Outcome", kind: "select", valueSet: "type_hazard_disposition", required: true },
    { name: "hazsit_evacuated", label: "Occupants or businesses evacuated", kind: "number", required: true },
    { name: "chemical_name", label: "Chemical or material", kind: "text" },
    { name: "chemical_dot_class", label: "DOT hazard class", kind: "select", valueSet: "type_hazard_dot", required: true, when: (r) => !isBlank(r.modules?.mod_hazard?.chemical_name) },
    { name: "chemical_release_occurred", label: "Was it released?", kind: "yesno", required: true, when: (r) => !isBlank(r.modules?.mod_hazard?.chemical_name) },
    { name: "chemical_amount_est", label: "Estimated amount released", kind: "number", when: (r) => r.modules?.mod_hazard?.chemical_release_occurred === "True" },
    { name: "chemical_amount_est_units", label: "Unit", kind: "select", valueSet: "type_hazard_unit", when: (r) => r.modules?.mod_hazard?.chemical_release_occurred === "True" },
    { name: "chemical_physical_state", label: "Physical state", kind: "select", valueSet: "type_hazard_physical_state", when: (r) => r.modules?.mod_hazard?.chemical_release_occurred === "True" },
    { name: "chemical_release_into", label: "Released into", kind: "select", valueSet: "type_hazard_released_into", when: (r) => r.modules?.mod_hazard?.chemical_release_occurred === "True" },
    { name: "chemical_release_cause", label: "Cause of release", kind: "select", valueSet: "type_hazard_cause", when: (r) => r.modules?.mod_hazard?.chemical_release_occurred === "True" },
  ],
  mod_medical: [
    { name: "patient_evaluation_care", label: "Patient care", kind: "select", valueSet: "type_medical_patient_care", required: true },
    { name: "patient_improved_status", label: "Patient status after our care", kind: "select", valueSet: "type_medical_patient_status" },
    { name: "medical_disposition", label: "Transport", kind: "select", valueSet: "type_medical_transport" },
    { name: "patient_care_report", label: "Patient care report (PCR) number", kind: "text" },
  ],
  // Structure fires only. nerisIncident.js turns these into NERIS's alarm and suppression modules.
  mod_alarms: [
    { name: "smoke_alarm_presence", label: "Smoke alarms", kind: "select", options: PRESENCE, required: true },
    { name: "smoke_alarm_types", label: "Smoke alarm type", kind: "multi", valueSet: "type_alarm_smoke", when: present("smoke_alarm_presence") },
    { name: "smoke_alarm_working", label: "Were the smoke alarms working?", kind: "yesno", when: present("smoke_alarm_presence") },
    { name: "smoke_alarm_operation", label: "What did the smoke alarms do?", kind: "select", valueSet: "type_alarm_operation", when: present("smoke_alarm_presence") },
    { name: "smoke_alarm_occupant_action", label: "What did occupants do?", kind: "select", valueSet: "type_occupant_response", when: (r) => present("smoke_alarm_presence")(r) && alarmValue(r, "smoke_alarm_operation") === "OPERATED_ALERTED_OCCUPANT" },
    { name: "smoke_alarm_failure", label: "Why didn't they work?", kind: "select", valueSet: "type_alarm_failure", when: (r) => present("smoke_alarm_presence")(r) && alarmValue(r, "smoke_alarm_operation") === "FAILED_TO_OPERATE" },
    { name: "fire_alarm_presence", label: "Fire alarm system", kind: "select", options: PRESENCE, required: true },
    { name: "fire_alarm_type", label: "Fire alarm type", kind: "select", valueSet: "type_alarm_fire", when: present("fire_alarm_presence") },
    { name: "fire_alarm_operation", label: "What did the fire alarm do?", kind: "select", valueSet: "type_alarm_operation", when: present("fire_alarm_presence") },
    { name: "other_alarm_presence", label: "Other alarms (CO, heat, gas)", kind: "select", options: PRESENCE, required: true },
    { name: "other_alarm_types", label: "Other alarm types", kind: "multi", valueSet: "type_alarm_other", when: present("other_alarm_presence") },
    { name: "sprinkler_presence", label: "Sprinklers or suppression system", kind: "select", options: PRESENCE, required: true },
    { name: "sprinkler_types", label: "System type", kind: "multi", valueSet: "type_suppress_fire", when: present("sprinkler_presence") },
    { name: "sprinkler_coverage", label: "Coverage", kind: "select", valueSet: "type_full_partial", when: present("sprinkler_presence") },
    { name: "sprinkler_operation", label: "Did it work?", kind: "select", valueSet: "type_suppress_operation", when: present("sprinkler_presence") },
    { name: "sprinklers_activated", label: "Sprinkler heads activated", kind: "number", when: (r) => present("sprinkler_presence")(r) && /^OPERATED/.test(alarmValue(r, "sprinkler_operation") || "") },
    { name: "sprinkler_failure", label: "Why not?", kind: "select", options: SPRINKLER_FAILURES, when: (r) => present("sprinkler_presence")(r) && ["OPERATED_NOT_EFFECTIVE", "NO_OPERATION"].includes(alarmValue(r, "sprinkler_operation")) },
    { name: "cooking_presence", label: "Cooking suppression (hood system, auto shutoff)", kind: "select", options: PRESENCE, required: true, when: (r) => applicability(r).cookingFire },
    { name: "cooking_types", label: "Cooking suppression type", kind: "multi", valueSet: "type_suppress_cooking", when: (r) => applicability(r).cookingFire && present("cooking_presence")(r) },
    { name: "cooking_operation", label: "Did it work?", kind: "select", valueSet: "type_suppress_operation", when: (r) => applicability(r).cookingFire && present("cooking_presence")(r) },
  ],
};

export function visibleFields(moduleId, report) {
  return (MODULE_FIELDS[moduleId] || []).filter((f) => !f.when || f.when(report));
}

// ---------- Steps ----------

export const STEPS = [
  { id: "basics", label: "Basics", description: "What happened, when and where" },
  { id: "response", label: "Response", description: "Times, units and crew" },
  { id: "scene", label: "Scene", description: "Location, property and people" },
  { id: "details", label: "Details", description: "Actions taken and incident details" },
  { id: "narrative", label: "Narrative", description: "Write it up, with AI help" },
  { id: "review", label: "Review", description: "Check, approve and submit" },
];

// ---------- Checklist (what's done, what's missing) ----------

function time(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

export function narrativeText(report = {}) {
  return String(report.workspace?.narrative?.body || core(report).incident_narrative_outcome || "").trim();
}

/**
 * Every check for this report, in step order.
 * @returns {Array<{ id: string, step: string, label: string, done: boolean, required: boolean, problem?: boolean }>}
 */
export function reportChecklist(report = {}) {
  const ws = report.workspace || {};
  const cad = ws.cad || {};
  const c = core(report);
  const a = applicability(report);
  const cancelled = noAction(report);
  const items = [];
  const add = (id, step, label, done, required = true, problem = false) => items.push({ id, step, label, done: Boolean(done), required, problem });

  add("type", "basics", "Incident type", incidentTypes(report).length > 0);
  add("date", "basics", "Incident date", report.incidentDate);
  add("address", "basics", "Address or location", String(report.incidentAddress || "").trim());
  add("people", "basics", "Were people present?", !isBlank(c.incident_people_present));

  add("dispatch", "response", "Dispatch time", cad.dispatchTime);
  add("arrival", "response", "Arrival time", cad.arrivalTime || (ws.units || []).some((u) => u.arrivalTime), !cancelled);
  add("clear", "response", "Clear time", cad.clearTime || (ws.units || []).some((u) => u.clearTime));
  add("units", "response", "Responding units", (ws.units || []).length > 0);
  const dispatch = time(cad.dispatchTime);
  const arrival = time(cad.arrivalTime);
  const clear = time(cad.clearTime);
  const received = time(cad.receivedTime);
  const enroute = time(cad.enrouteTime);
  if (received && dispatch && dispatch < received) add("order-received", "response", "Dispatch is before call received — check the times", false, true, true);
  if (dispatch && enroute && enroute < dispatch) add("order-enroute", "response", "En route is before dispatch — check the times", false, true, true);
  if (enroute && arrival && arrival < enroute) add("order-arrival-enroute", "response", "Arrival is before en route — check the times", false, true, true);
  if (dispatch && arrival && arrival < dispatch) add("order-arrival", "response", "Arrival is before dispatch — check the times", false, true, true);
  if (arrival && clear && clear < arrival) add("order-clear", "response", "Clear is before arrival — check the times", false, true, true);
  (ws.units || []).forEach((unit, index) => {
    const name = unit.unitId || `Unit ${index + 1}`;
    // Only the unit's own dispatch time: a unit already on scene (on-view) can arrive before CAD dispatch.
    const uDispatch = time(unit.dispatchTime);
    const uArrival = time(unit.arrivalTime);
    const uClear = time(unit.clearTime);
    if (uDispatch && uArrival && uArrival < uDispatch) add(`order-arrival-${index}`, "response", `${name}: on-scene time is before dispatch — check the times`, false, true, true);
    if (uClear && (uArrival || uDispatch) && uClear < (uArrival || uDispatch)) add(`order-clear-${index}`, "response", `${name}: clear time is before ${uArrival ? "on-scene" : "dispatch"} — check the times`, false, true, true);
  });
  if (aidInvolved(report)) {
    add("aid-type", "response", "Mutual aid type", !isBlank(c.incident_aid_type));
    add("aid-dept", "response", "Mutual aid department", !isBlank(c.incident_aid_department_name));
  }

  add("actions", "details", "Actions taken (or why no action)", !isBlank(c.incident_actions_taken) || (ws.actions || []).length > 0 || cancelled);
  for (const [moduleId, applies, title] of [["mod_fire", a.fire, "Fire"], ["mod_alarms", a.alarms, "Alarms"], ["mod_hazard", a.hazmat, "Hazardous condition"], ["mod_medical", a.ems, "Medical"]]) {
    if (!applies || cancelled) continue;
    for (const f of visibleFields(moduleId, report).filter((x) => x.required)) {
      add(`${moduleId}.${f.name}`, "details", `${title}: ${f.label}`, !isBlank(report.modules?.[moduleId]?.[f.name]));
    }
  }
  if (a.ems && !cancelled) add("ems-complaint", "details", "Medical: chief complaint", ws.ems?.chiefComplaint);

  add("narrative", "narrative", "Narrative", narrativeText(report));
  if (ws.narrative?.aiGenerated && !ws.narrative?.reviewedAt) {
    add("narrative-review", "narrative", "Read and confirm the AI draft", false);
  }
  return items;
}

export function checklistProgress(report = {}) {
  const required = reportChecklist(report).filter((i) => i.required);
  const done = required.filter((i) => i.done).length;
  return {
    done,
    total: required.length,
    percent: required.length ? Math.round((done / required.length) * 100) : 0,
    missing: required.filter((i) => !i.done),
  };
}

export function stepProgress(report, stepId) {
  const items = reportChecklist(report).filter((i) => i.step === stepId && i.required);
  return { done: items.filter((i) => i.done).length, total: items.length };
}

// ---------- Status ----------

export const STATUS_GROUPS = [
  { id: "all", label: "All", statuses: null },
  { id: "draft", label: "In progress", statuses: ["Draft", "In Progress", "Returned"] },
  { id: "review", label: "Needs review", statuses: ["Needs Review"] },
  { id: "ready", label: "Ready to submit", statuses: ["Approved", "Ready for Submission"] },
  { id: "submitted", label: "Submitted", statuses: ["Submitted"] },
];

export function statusTone(status = "") {
  if (/submitted/i.test(status)) return "done";
  if (/approved|ready/i.test(status)) return "ready";
  if (/review/i.test(status)) return "review";
  if (/returned/i.test(status)) return "returned";
  return "draft";
}

/** Human label for a NERIS coded value ("FIRE: STRUCTURE_FIRE: X" -> "Structure Fire — X"). */
export function codeLabel(value = "", valueSet = "type_incident") {
  const hit = getNerisValueSet(valueSet).find((o) => o.value === value);
  if (hit) return hit.label;
  return String(value).split(":").map((part) => part.trim().replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())).join(" — ");
}

/** Short label for the report's main incident type, e.g. "Room and Contents Fire". */
export function primaryTypeLabel(report = {}) {
  const first = incidentTypes(report)[0];
  if (!first) return report.incidentTypeSummary || "New incident";
  const label = codeLabel(first);
  const parts = label.split(" — ");
  return parts[parts.length - 1] || label;
}
