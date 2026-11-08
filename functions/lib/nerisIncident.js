/**
 * Turns a FORGE NERIS report into a NERIS API IncidentPayload (API 1.5.3).
 *
 * NERIS requires: base (department, incident number, location),
 * incident_types (at least one), and dispatch (incident number, call times,
 * location, unit responses). Detail
 * sections (actions, aid, fire, alarms, hazsit, medical) are added when the
 * report has the matching incident type, as NERIS requires.
 *
 * Pure functions: no Firestore, no network. See nerisSubmit in index.js.
 */

// FORGE's value set predates a NERIS spelling fix.
const INCIDENT_TYPE_FIXES = {
  "RESCUE||OUTSIDE||BACKOUNTRY_RESCUE": "RESCUE||OUTSIDE||BACKCOUNTRY_RESCUE",
};

const NERIS_DEPT_ID = /^FD\d{8}$/;
const NERIS_INCIDENT_NUMBER = /^[\w\-:]+$/;

const text = (value) => String(value ?? "").trim();

/**
 * FORGE stores NERIS codes with ": " between levels; the API uses "||".
 * "SUPPRESSION: OUTSIDE_FIRE_SUPPRESSION: ESTABLISH FIRE LINES" -> "SUPPRESSION||OUTSIDE_FIRE_SUPPRESSION||ESTABLISH_FIRE_LINES"
 */
function toNerisCode(value) {
  const raw = text(value);
  if (!raw) return "";
  const parts = raw.includes("||") ? raw.split("||") : raw.split(":");
  return parts.map((p) => p.trim().replace(/\s+/g, "_")).filter(Boolean).join("||");
}

/** "FIRE: STRUCTURE_FIRE: ROOM_AND_CONTENTS_FIRE" -> "FIRE||STRUCTURE_FIRE||ROOM_AND_CONTENTS_FIRE" */
function toNerisIncidentType(value) {
  const converted = toNerisCode(value);
  return INCIDENT_TYPE_FIXES[converted] || converted;
}

function asList(value) {
  if (Array.isArray(value)) return value.flat().filter((v) => v !== "" && v !== null && v !== undefined);
  return value === "" || value === null || value === undefined ? [] : [value];
}

function yesNo(value) {
  if (value === true || value === "True" || value === "true") return true;
  if (value === false || value === "False" || value === "false") return false;
  return null;
}

/** Offset (minutes) of an IANA zone at a given UTC instant, e.g. America/Chicago in July -> -300. */
function zoneOffsetMinutes(timeZone, utcMs) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - utcMs) / 60000);
}

function formatOffset(minutes) {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/**
 * FORGE stores report times as local wall-clock values ("2026-10-20T14:02")
 * from datetime-local inputs. NERIS needs a full timestamp, so read them in the
 * department's time zone. Values that already carry a zone pass through.
 */
function toNerisTimestamp(value, timeZone = "America/Chicago") {
  const raw = text(value);
  if (!raw) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const t = new Date(raw);
    return Number.isNaN(t.getTime()) ? null : t.toISOString();
  }
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "00"] = m;
  const wallAsUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  let zone = timeZone;
  try { new Intl.DateTimeFormat("en-US", { timeZone: zone }); } catch { zone = "America/Chicago"; }
  // Two passes handle the hour around a DST change.
  let offset = zoneOffsetMinutes(zone, wallAsUtc);
  offset = zoneOffsetMinutes(zone, wallAsUtc - offset * 60000);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${formatOffset(offset)}`;
}

/**
 * Best-effort split of a one-line address ("123 Main St, Springfield, MS 38654")
 * into NERIS LocationPayload fields. Anything we can't split stays in `street`.
 */
function parseAddress(address = "", fallbackState = "") {
  const parts = text(address).split(",").map((p) => p.trim()).filter(Boolean);
  const location = {};
  const streetLine = parts.shift() || "";
  const numbered = streetLine.match(/^(\d+)([A-Za-z]?)\s+(.+)$/);
  if (numbered) {
    location.complete_number = `${numbered[1]}${numbered[2]}`;
    location.number = Number(numbered[1]);
    if (numbered[2]) location.number_suffix = numbered[2].toUpperCase();
    location.street = numbered[3];
  } else if (streetLine) {
    location.street = streetLine;
  }
  let state = "";
  let zip = "";
  const last = parts[parts.length - 1] || "";
  const stateZip = last.match(/^([A-Za-z]{2})(?:\s+(\d{5})(?:-(\d{4}))?)?$/);
  if (stateZip) {
    state = stateZip[1].toUpperCase();
    zip = stateZip[2] || "";
    if (stateZip[3]) location.postal_code_extension = stateZip[3];
    parts.pop();
  }
  if (parts.length) location.incorporated_municipality = parts.join(", ");
  location.state = state || text(fallbackState).toUpperCase() || undefined;
  if (zip) location.postal_code = zip;
  location.country = "US";
  return Object.fromEntries(Object.entries(location).filter(([, v]) => v !== undefined && v !== ""));
}

// ---------- Detail sections ----------
// Field names match MODULE_FIELDS in src/lib/neris/reportModel.js.

const first = (value) => toNerisCode(asList(value)[0]);
const codes = (value) => [...new Set(asList(value).map(toNerisCode).filter(Boolean))];

function integer(value) {
  const n = Number(asList(value)[0]);
  return Number.isFinite(n) && String(asList(value)[0]).trim() !== "" ? Math.round(n) : null;
}

function decimal(value) {
  const n = Number(asList(value)[0]);
  return Number.isFinite(n) && String(asList(value)[0]).trim() !== "" ? n : null;
}

/** Drop null/undefined/empty values so optional NERIS fields are left out. `keep` names required arrays that may be empty. */
function compact(object, keep = []) {
  return Object.fromEntries(Object.entries(object).filter(([k, v]) => {
    if (v === null || v === undefined || v === "") return false;
    return !(Array.isArray(v) && !v.length) || keep.includes(k);
  }));
}

const SUPPRESSION_APPLIANCES = new Set([
  "AERIAL_MASTER_STREAM", "AIRATTACK_HELITACK", "BOOSTER_FIRE_HOSE", "BUILDING_FDC", "BUILDING_STANDPIPE", "ELEVATED_MASTER_STREAM_STANDPIPE",
  "FIRE_EXTINGUISHER", "GROUND_MONITOR", "MASTER_STREAM", "MEDIUM_DIAMETER_FIRE_HOSE", "NONE", "OTHER", "SMALL_DIAMETER_FIRE_HOSE",
]);

/** NERIS: if NONE is picked it must be the only item. */
function noneAlone(list) {
  return list.includes("NONE") && list.length > 1 ? list.filter((v) => v !== "NONE") : list;
}

function buildFireDetail(report, types, need, warnings) {
  const fire = report.modules?.mod_fire || {};
  const structure = types.some((t) => t.startsWith("FIRE||STRUCTURE_FIRE"));
  const label = "Fire";
  const waterSupply = first(fire.fire_water_supply);
  const investigationNeeded = first(fire.fire_investigation_need);
  need(waterSupply, `${label}: choose the water supply.`);
  need(investigationNeeded, `${label}: say whether the fire needs an investigation.`);

  let locationDetail;
  if (structure) {
    const floor = integer(fire.structure_floor_of_origin);
    const arrival = first(fire.structure_arrival_conditions);
    const damage = first(fire.structure_damage);
    const room = first(fire.structure_room_of_origin);
    const cause = first(fire.structure_fire_cause);
    need(arrival, `${label}: choose the fire conditions on arrival.`);
    need(damage, `${label}: choose the damage to the building.`);
    need(floor !== null, `${label}: enter the floor of origin.`);
    need(room, `${label}: choose the room of origin.`);
    need(cause, `${label}: choose the cause.`);
    locationDetail = compact({
      type: "STRUCTURE",
      floor_of_origin: floor,
      arrival_condition: arrival,
      damage_type: damage,
      room_of_origin_type: room,
      cause,
      progression_evident: yesNo(asList(fire.structure_progression_conditions)[0]),
    });
  } else {
    const cause = first(fire.outside_fire_cause);
    need(cause, `${label}: choose the cause.`);
    locationDetail = compact({ type: "OUTSIDE", cause, acres_burned: decimal(fire.outside_fire_acres_burned) });
  }

  const applianceInput = asList(fire.fire_suppression_appliance);
  const appliances = noneAlone(codes(applianceInput).filter((v) => SUPPRESSION_APPLIANCES.has(v)));
  if (applianceInput.length && appliances.length < applianceInput.length) {
    warnings.push("Some suppression equipment was typed in and isn't sent. Pick it from the list instead.");
  }

  return compact({
    location_detail: locationDetail,
    water_supply: waterSupply,
    investigation_needed: investigationNeeded,
    investigation_types: noneAlone(codes(fire.fire_investigation_type)),
    suppression_appliances: appliances,
  }, ["investigation_types"]);
}

const NOT_PRESENT = new Set(["NOT_PRESENT", "NOT_APPLICABLE"]);

/** One NERIS alarm/suppression module from a presence answer and the details when present. */
function presenceModule(presence, details) {
  if (NOT_PRESENT.has(presence)) return { presence: { type: presence } };
  if (presence === "PRESENT") return { presence: { type: "PRESENT", ...compact(details) } };
  return null;
}

function buildAlarmModules(report, { cooking }, need) {
  const m = report.modules?.mod_alarms || {};
  const presence = (name) => first(m[name]);
  const label = "Alarms";

  const smokeOperation = first(m.smoke_alarm_operation);
  let operation = null;
  if (smokeOperation === "OPERATED_ALERTED_OCCUPANT") operation = { alerted_failed_other: compact({ type: smokeOperation, occupant_action: first(m.smoke_alarm_occupant_action) }) };
  else if (smokeOperation === "FAILED_TO_OPERATE") operation = { alerted_failed_other: compact({ type: smokeOperation, failure_reason: first(m.smoke_alarm_failure) }) };
  else if (smokeOperation) operation = { alerted_failed_other: { type: smokeOperation } };

  const sprinklerOperation = first(m.sprinkler_operation);
  let effectiveness = null;
  if (sprinklerOperation) {
    effectiveness = compact({
      type: sprinklerOperation,
      sprinklers_activated: sprinklerOperation === "NO_OPERATION" ? null : integer(m.sprinklers_activated),
      failure_reason: sprinklerOperation === "OPERATED_EFFECTIVE" ? null : first(m.sprinkler_failure),
    });
  }
  const coverage = first(m.sprinkler_coverage);

  const modules = {
    smoke_alarm: presenceModule(presence("smoke_alarm_presence"), {
      working: yesNo(asList(m.smoke_alarm_working)[0]),
      alarm_types: codes(m.smoke_alarm_types),
      operation,
    }),
    fire_alarm: presenceModule(presence("fire_alarm_presence"), {
      alarm_types: codes(m.fire_alarm_type),
      operation_type: first(m.fire_alarm_operation),
    }),
    other_alarm: presenceModule(presence("other_alarm_presence"), { alarm_types: codes(m.other_alarm_types) }),
    fire_suppression: presenceModule(presence("sprinkler_presence"), {
      suppression_types: codes(m.sprinkler_types).map((type) => compact({ type, full_partial: coverage })),
      operation_type: effectiveness ? { effectiveness } : null,
    }),
  };
  need(modules.smoke_alarm, `${label}: say whether there were smoke alarms.`);
  need(modules.fire_alarm, `${label}: say whether there was a fire alarm system.`);
  need(modules.other_alarm, `${label}: say whether there were other alarms (CO, heat, gas).`);
  need(modules.fire_suppression, `${label}: say whether there were sprinklers or a suppression system.`);
  if (cooking) {
    modules.cooking_fire_suppression = presenceModule(presence("cooking_presence"), {
      suppression_types: codes(m.cooking_types),
      operation_type: first(m.cooking_operation),
    });
    need(modules.cooking_fire_suppression, `${label}: say whether there was cooking suppression.`);
  }
  return compact(modules);
}

function buildHazsitDetail(report, need, warnings) {
  const h = report.modules?.mod_hazard || {};
  const disposition = first(h.hazsit_disposition);
  const evacuated = integer(h.hazsit_evacuated);
  need(disposition, "Hazardous condition: choose the outcome.");
  need(evacuated !== null, "Hazardous condition: enter how many were evacuated (0 if none).");

  const chemicals = [];
  const name = text(asList(h.chemical_name)[0]);
  if (name) {
    const dotClass = first(h.chemical_dot_class);
    const released = yesNo(asList(h.chemical_release_occurred)[0]);
    need(dotClass, "Hazardous condition: choose the DOT hazard class.");
    need(released !== null, "Hazardous condition: say whether the material was released.");
    if (asList(h.chemical_dot_class).length > 1 || asList(h.chemical_release_into).length > 1) {
      warnings.push("NERIS takes one DOT class and one release area per material, so only the first is sent.");
    }
    const release = released ? compact({
      estimated_amount: decimal(h.chemical_amount_est),
      unit_of_measurement: first(h.chemical_amount_est_units),
      physical_state: first(h.chemical_physical_state),
      released_into: first(h.chemical_release_into),
      cause: first(h.chemical_release_cause),
    }) : null;
    chemicals.push(compact({ name: name.slice(0, 255), release_occurred: released, dot_class: dotClass, release: release && Object.keys(release).length ? release : null }));
  }
  return compact({ evacuated, disposition, chemicals });
}

function buildMedicalDetails(report, need) {
  const m = report.modules?.mod_medical || {};
  const care = first(m.patient_evaluation_care);
  need(care, "Medical: choose the patient care.");
  return [compact({
    patient_care_evaluation: care,
    patient_status: first(m.patient_improved_status),
    transport_disposition: first(m.medical_disposition),
    patient_care_report_id: text(asList(m.patient_care_report)[0]).slice(0, 255),
  })];
}

function buildActions(core) {
  const noAction = first(core.incident_noaction);
  if (noAction) return { action_noaction: { type: "NOACTION", noaction_type: noAction } };
  const actions = codes(core.incident_actions_taken);
  return actions.length ? { action_noaction: { type: "ACTION", actions } } : null;
}

const AID_DEPT_ID = /^F[DM]\d{8}$/;

function buildAids(core, nerisId, warnings) {
  const direction = first(core.incident_aid_direction);
  const aidType = first(core.incident_aid_type);
  const departments = asList(core.incident_aid_department_name).map(text).filter(Boolean);
  if (!direction || direction === "NONE" || !departments.length) return [];
  if (!aidType) {
    warnings.push("Mutual aid isn't sent: choose the type of aid.");
    return [];
  }
  const ids = [...new Set(departments.map((d) => d.toUpperCase()).filter((d) => AID_DEPT_ID.test(d) && d !== nerisId))];
  const names = departments.filter((d) => !AID_DEPT_ID.test(d.toUpperCase()));
  if (names.length) {
    warnings.push(`Mutual aid not sent for ${names.join(", ")}: NERIS needs each department's NERIS ID (FD followed by 8 digits).`);
  }
  return ids.map((id) => ({ department_neris_id: id, aid_type: aidType, aid_direction: direction }));
}

function narrativeText(report = {}) {
  return text(report.workspace?.narrative?.body || report.modules?.core_mod_incident?.incident_narrative_outcome);
}

/**
 * @param {object} input
 * @param {object} input.report        FORGE NERIS report (list item)
 * @param {string} input.nerisId       department NERIS ID (FD########)
 * @param {object} input.profile       departments/{id}/profile/main (time zone, state)
 * @param {object[]} input.apparatus   apparatus list items
 * @param {object} input.unitLinks     { apparatusId: neris unit id } from the sync
 * @returns {{ payload: object|null, problems: string[], warnings: string[] }}
 */
function buildIncidentPayload({ report = {}, nerisId = "", profile = {}, apparatus = [], unitLinks = {} } = {}) {
  const problems = [];
  const warnings = [];
  const ws = report.workspace || {};
  const cad = ws.cad || {};
  const core = report.modules?.core_mod_incident || {};
  const timeZone = text(profile.timezone) || "America/Chicago";
  const ts = (value) => toNerisTimestamp(value, timeZone);

  if (!NERIS_DEPT_ID.test(text(nerisId))) problems.push("The department's NERIS ID must look like FD followed by 8 digits.");

  const incidentNumber = text(report.reportNumber);
  if (!NERIS_INCIDENT_NUMBER.test(incidentNumber)) problems.push("The report number can only use letters, numbers, dashes and colons.");

  // Incident types: first one is primary.
  const types = asList(core.incident_final_type).map(toNerisIncidentType).filter(Boolean);
  if (!types.length) problems.push("Choose an incident type.");
  const incidentTypes = types.map((type, index) => ({ type, primary: index === 0 }));

  // Location.
  if (!text(report.incidentAddress)) problems.push("Add the incident address.");
  const location = parseAddress(report.incidentAddress, profile.stateId);
  if (!location.state) warnings.push("No state on the address or the department profile.");

  // Times.
  const received = ts(cad.receivedTime);
  const dispatched = ts(cad.dispatchTime);
  const callTime = received || dispatched;
  if (!callTime) problems.push("Add the call received or dispatch time.");
  if (!received && dispatched) warnings.push("No call-received time, so the dispatch time is sent as the call time.");

  // Units: match by unit name to apparatus, then to the NERIS unit created by the sync.
  const crew = Array.isArray(ws.personnel) ? ws.personnel : [];
  const apparatusByName = new Map(apparatus.map((a) => [text(a.unit).toLowerCase(), a]));
  const units = (Array.isArray(ws.units) ? ws.units : []).filter((u) => text(u.unitId));
  if (!units.length) problems.push("Add at least one responding unit.");
  const notInNeris = [];
  const unitResponses = units.map((unit) => {
    const name = text(unit.unitId);
    const rig = apparatusByName.get(name.toLowerCase());
    const nerisUnitId = rig ? text(unitLinks[text(rig.id)]) : "";
    if (!nerisUnitId) notInNeris.push(name);
    const staffing = crew.filter((p) => text(p.unitId) === name).length;
    const response = {
      unit_neris_id: nerisUnitId || null,
      reported_unit_id: name,
      staffing: staffing || null,
      dispatch: ts(unit.dispatchTime) || dispatched,
      enroute_to_scene: ts(unit.enrouteTime),
      on_scene: ts(unit.arrivalTime),
      unit_clear: ts(unit.clearTime),
    };
    return Object.fromEntries(Object.entries(response).filter(([, v]) => v !== null && v !== ""));
  });
  if (notInNeris.length) {
    warnings.push(`Not in NERIS yet, sent by name only: ${notInNeris.join(", ")}. Send units from System Admin → Connected Services.`);
  }

  // Detail sections. NERIS only accepts each one when a matching incident type is on the report.
  const need = (ok, message) => { if (!ok) problems.push(message); };
  const hasType = (prefix) => types.some((t) => t.startsWith(prefix));
  const details = {};
  const actions = buildActions(core);
  if (actions) details.actions_tactics = actions;
  const aids = buildAids(core, text(nerisId), warnings);
  if (aids.length) details.aids = aids;
  const nonfdAids = codes(core.incident_aid_nonfd);
  if (nonfdAids.length) details.nonfd_aids = nonfdAids;
  if (hasType("FIRE||")) details.fire_detail = buildFireDetail(report, types, need, warnings);
  if (hasType("FIRE||STRUCTURE_FIRE")) {
    // Not required when every aid was support given to another department.
    const supportGivenOnly = aids.length > 0 && aids.every((a) => a.aid_type === "SUPPORT_AID" && a.aid_direction === "GIVEN");
    const optional = () => {};
    Object.assign(details, buildAlarmModules(report, { cooking: hasType("FIRE||STRUCTURE_FIRE||CONFINED_COOKING_APPLIANCE_FIRE") }, supportGivenOnly ? optional : need));
  }
  if (hasType("HAZSIT||")) details.hazsit_detail = buildHazsitDetail(report, need, warnings);
  if (hasType("MEDICAL||")) details.medical_details = buildMedicalDetails(report, need);

  if (problems.length) return { payload: null, problems, warnings };

  const peoplePresent = yesNo(core.incident_people_present);
  const animalsRescued = integer(core.incident_rescue_animal);
  const displacementCauses = ws.location?.displaced === "True" ? codes(core.incident_displaced_cause) : [];
  const answered = ts(cad.psapAnswerTime);
  const narrative = narrativeText(report);
  const dispatchNumber = NERIS_INCIDENT_NUMBER.test(text(cad.cadCallNumber)) ? text(cad.cadCallNumber) : incidentNumber;

  const base = {
    department_neris_id: text(nerisId),
    incident_number: incidentNumber,
    location,
    ...(peoplePresent === null ? {} : { people_present: peoplePresent }),
    ...(narrative ? { outcome_narrative: narrative.slice(0, 100000) } : {}),
    ...(animalsRescued !== null ? { animals_rescued: Math.max(0, animalsRescued) } : {}),
    ...(displacementCauses.length ? { displacement_causes: displacementCauses } : {}),
  };

  const dispatch = {
    incident_number: dispatchNumber,
    call_arrival: callTime,
    call_answered: answered || callTime,
    call_create: callTime,
    location,
    unit_responses: unitResponses,
    ...(ts(cad.clearTime) ? { incident_clear: ts(cad.clearTime) } : {}),
  };

  return {
    payload: {
      base,
      incident_types: incidentTypes,
      dispatch,
      unit_responses: unitResponses,
      ...details,
    },
    problems,
    warnings,
  };
}

/** NERIS 422 detail -> short readable lines. */
function validationMessages(result) {
  const detail = result?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.slice(0, 10).map((d) => {
      const where = (d.loc || []).filter((p) => p !== "body").join(" → ");
      return `${where || "report"}: ${d.msg || "invalid"}`;
    });
  }
  if (typeof detail === "string") return [detail.slice(0, 300)];
  if (result?.status === 403) return ["NERIS refused. Check that FORGE is still enrolled for this department."];
  if (result?.status === 404) return ["NERIS couldn't find that incident or department."];
  return [`NERIS returned an error (${result?.status || "no response"}).`];
}

module.exports = {
  buildIncidentPayload,
  parseAddress,
  toNerisCode,
  toNerisIncidentType,
  toNerisTimestamp,
  validationMessages,
};
