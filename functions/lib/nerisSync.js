/**
 * Sends a department's profile, stations and units from FORGE to NERIS.
 *
 * Two steps, both server-side:
 *   buildSyncPlan  - compares FORGE's records with the department's NERIS entity
 *                    and lists what would be created or changed (nothing sent).
 *   applySyncPlan  - sends only the items an admin ticked, in order: department,
 *                    then stations, then units (a unit needs its station's NERIS ID).
 *
 * Links (FORGE station/apparatus ID -> NERIS ID) are stored on
 * departments/{id}/integrations/neris so later runs update instead of duplicating.
 *
 * NERIS API 1.5.3: PATCH /entity/{id}, POST /entity/{id}/station,
 * PATCH /entity/{id}/station/{sid}, POST /entity/{id}/station/{sid}/unit,
 * PATCH /entity/{id}/station/{sid}/unit/{uid}.
 */

// Shown to NERIS as the department's RMS.
const RMS_SOFTWARE = "FORGE RMS";

const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY",
  "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "AS", "GU", "MP", "PR", "VI",
]);

// NERIS TypeUnitValue (API 1.5.3).
const NERIS_UNIT_TYPES = [
  "AIR_EMS", "AIR_LIGHT", "AIR_RECON", "AIR_TANKER", "ALS_AMB", "ARFF", "ATV_EMS", "ATV_FIRE", "BLS_AMB", "BOAT",
  "BOAT_LARGE", "CHIEF_STAFF_COMMAND", "CREW", "CREW_TRANS", "DECON", "DOZER", "EMS_NOTRANS", "EMS_SUPV",
  "ENGINE_STRUCT", "ENGINE_WUI", "FOAM", "HAZMAT", "HELO_FIRE", "HELO_GENERAL", "HELO_RESCUE", "INVEST",
  "LADDER_QUINT", "LADDER_SMALL", "LADDER_TALL", "LADDER_TILLER", "MAB", "MOBILE_COMMS", "MOBILE_ICP",
  "OTHER_GROUND", "PLATFORM", "PLATFORM_QUINT", "POV", "QUINT_TALL", "REHAB", "RESCUE_HEAVY", "RESCUE_LIGHT",
  "RESCUE_MEDIUM", "RESCUE_USAR", "RESCUE_WATER", "SCBA", "TENDER", "UAS_FIRE", "UAS_RECON", "UTIL",
];
const NERIS_UNIT_TYPE_SET = new Set(NERIS_UNIT_TYPES);

// cad_designation_1 must match this (NERIS CreateUnitPayload).
const CAD_DESIGNATION_PATTERN = /^[\w()#\- ]{1,64}$/;

// First match wins. A guess only: admins confirm the type before sending.
const UNIT_TYPE_GUESSES = [
  [/tiller/i, "LADDER_TILLER"],
  [/platform|tower/i, "PLATFORM"],
  [/quint/i, "LADDER_QUINT"],
  [/ladder|aerial|truck/i, "LADDER_TALL"],
  [/brush|wildland|wui|type ?[3-7]\b/i, "ENGINE_WUI"],
  [/tanker|tender/i, "TENDER"],
  [/engine|pumper/i, "ENGINE_STRUCT"],
  [/\bals\b|paramedic|medic/i, "ALS_AMB"],
  [/\bbls\b|ambulance/i, "BLS_AMB"],
  [/heavy rescue/i, "RESCUE_HEAVY"],
  [/water rescue|dive/i, "RESCUE_WATER"],
  [/usar|technical rescue/i, "RESCUE_USAR"],
  [/squad|light rescue/i, "RESCUE_LIGHT"],
  [/rescue/i, "RESCUE_MEDIUM"],
  [/haz ?mat/i, "HAZMAT"],
  [/decon/i, "DECON"],
  [/command|chief|battalion|staff/i, "CHIEF_STAFF_COMMAND"],
  [/fire ?boat|large boat/i, "BOAT_LARGE"],
  [/boat/i, "BOAT"],
  [/air ?unit|scba|cascade/i, "SCBA"],
  [/rehab/i, "REHAB"],
  [/arff|crash/i, "ARFF"],
  [/drone|uas/i, "UAS_RECON"],
  [/invest|marshal/i, "INVEST"],
  [/utility|util|pickup|support/i, "UTIL"],
];

// Default minimum staffing by NERIS type; admins can change it.
const DEFAULT_STAFFING = {
  ENGINE_STRUCT: 3, ENGINE_WUI: 2, LADDER_TALL: 3, LADDER_TILLER: 3, LADDER_QUINT: 3, LADDER_SMALL: 3,
  PLATFORM: 3, PLATFORM_QUINT: 3, QUINT_TALL: 3, ALS_AMB: 2, BLS_AMB: 2, RESCUE_HEAVY: 3, RESCUE_MEDIUM: 2,
  RESCUE_LIGHT: 2, HAZMAT: 2, TENDER: 1, CHIEF_STAFF_COMMAND: 1,
};

const DEPARTMENT_FIELDS = [
  { field: "name", label: "Name" },
  { field: "email", label: "Email" },
  { field: "address_line_1", label: "Street address" },
  { field: "city", label: "City" },
  { field: "state", label: "State" },
  { field: "zip_code", label: "ZIP code" },
  { field: "time_zone", label: "Time zone" },
  { field: "rms_software", label: "RMS software" },
];

const text = (value) => String(value ?? "").trim();
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

function normalizeState(value) {
  const code = text(value).toUpperCase();
  return US_STATE_CODES.has(code) ? code : "";
}

function guessUnitType(apparatusType = "", unitName = "") {
  const haystack = `${apparatusType} ${unitName}`;
  for (const [pattern, type] of UNIT_TYPE_GUESSES) if (pattern.test(haystack)) return type;
  return "";
}

function isInService(apparatus = {}) {
  return !/out of service|retired|surplus|sold/i.test(text(apparatus.status));
}

/** FORGE's department profile as NERIS PatchDepartmentPayload fields. */
function departmentValues(profile = {}) {
  return {
    name: text(profile.name),
    email: text(profile.contactEmail),
    address_line_1: text(profile.address),
    city: text(profile.city),
    state: normalizeState(profile.stateId),
    zip_code: text(profile.zip),
    time_zone: text(profile.timezone),
    rms_software: RMS_SOFTWARE,
  };
}

function stationValues(station = {}) {
  return {
    station_id: text(station.name),
    internal_id: text(station.id),
    address_line_1: text(station.address),
    city: text(station.city),
    state: normalizeState(station.state),
    zip_code: text(station.zip),
  };
}

function stationProblems(values) {
  const missing = [];
  if (!values.address_line_1) missing.push("street address");
  if (!values.city) missing.push("city");
  if (!values.state) missing.push("state");
  if (!values.zip_code) missing.push("ZIP code");
  return missing.length ? `Add the station's ${missing.join(", ")} under System Admin → Department → Stations.` : "";
}

const STREET_WORDS = {
  street: "st", avenue: "ave", av: "ave", road: "rd", drive: "dr", parkway: "pkwy", boulevard: "blvd",
  lane: "ln", court: "ct", place: "pl", highway: "hwy", circle: "cir", terrace: "ter", trail: "trl",
  north: "n", south: "s", east: "e", west: "w",
};

/** "1200 Riverfront Parkway." -> "1200 riverfront pkwy", so the same street written two ways still matches. */
function streetKey(value) {
  return text(value).toLowerCase().replace(/[.,#]/g, " ").split(/\s+/).filter(Boolean)
    .map((word) => STREET_WORDS[word] || word).join(" ");
}

/** Same street, and the same ZIP (or the same city when either side has no ZIP). */
function sameAddress(nerisStation, forgeStation) {
  const street = streetKey(forgeStation.address);
  if (!street || street !== streetKey(nerisStation.address_line_1)) return false;
  const forgeZip = text(forgeStation.zip).slice(0, 5);
  const nerisZip = text(nerisStation.zip_code).slice(0, 5);
  if (forgeZip && nerisZip) return forgeZip === nerisZip;
  return Boolean(text(forgeStation.city)) && same(forgeStation.city, nerisStation.city);
}

/**
 * Finds the NERIS station for a FORGE station: the saved link, then FORGE's ID,
 * then the name, then the address. NERIS won't accept two stations at one
 * address, so an address match means it's the same station under another name.
 * `claimed` holds NERIS stations already matched to another FORGE station.
 */
function findNerisStation(nerisStations, forgeStation, linkedId, claimed = new Set(), { byAddress = true } = {}) {
  if (linkedId) {
    const linked = nerisStations.find((s) => s.neris_id === linkedId);
    if (linked) return { station: linked, by: "link" };
  }
  const open = nerisStations.filter((s) => !claimed.has(s.neris_id));
  const idMatch = open.find((s) => text(s.internal_id) && s.internal_id === forgeStation.id);
  if (idMatch) return { station: idMatch, by: "id" };
  const nameMatch = open.find((s) => same(s.station_id, forgeStation.name));
  if (nameMatch) return { station: nameMatch, by: "name" };
  const addressMatch = byAddress ? open.find((s) => sameAddress(s, forgeStation)) : null;
  if (addressMatch) return { station: addressMatch, by: "address" };
  return { station: null, by: "" };
}

/** Matches every FORGE station: links, IDs and names first, then addresses for the rest. */
function matchStations(forgeStations, nerisStations, stationLinks) {
  const claimed = new Set();
  const matches = new Map();
  for (const station of forgeStations) {
    const found = findNerisStation(nerisStations, station, stationLinks[station.id], claimed, { byAddress: false });
    if (found.station) {
      matches.set(station.id, found);
      claimed.add(found.station.neris_id);
    }
  }
  for (const station of forgeStations) {
    if (matches.has(station.id)) continue;
    const found = findNerisStation(nerisStations, station, "", claimed);
    if (found.station) {
      matches.set(station.id, found);
      claimed.add(found.station.neris_id);
    }
  }
  return matches;
}

function allNerisUnits(nerisStations) {
  return nerisStations.flatMap((station) => (station.units || []).map((unit) => ({ ...unit, stationNerisId: station.neris_id })));
}

/**
 * Compares FORGE with NERIS. Pure: takes plain data, returns the plan.
 * @param {object} input
 * @param {object} input.profile        departments/{id}/profile/main
 * @param {object[]} input.apparatus    apparatus list items
 * @param {object} input.entity         NERIS entity (GET /entity/{id})
 * @param {object} input.connection     integrations/neris (links + saved unit settings)
 */
function buildSyncPlan({ profile = {}, apparatus = [], entity = {}, connection = {} } = {}) {
  const stationLinks = connection.stationLinks || {};
  const unitLinks = connection.unitLinks || {};
  const unitSettings = connection.unitSettings || {};
  const nerisStations = Array.isArray(entity.stations) ? entity.stations : [];

  // Department: only fields FORGE has a value for and that differ.
  const forgeDept = departmentValues(profile);
  const departmentChanges = DEPARTMENT_FIELDS
    .filter(({ field }) => forgeDept[field] && !same(forgeDept[field], entity[field]))
    .map(({ field, label }) => ({ field, label, forge: forgeDept[field], neris: text(entity[field]) }));

  // Stations.
  const forgeStations = (Array.isArray(profile.stationDetails) ? profile.stationDetails : [])
    .filter((station) => text(station?.name))
    .map((station, index) => ({ ...station, id: text(station.id) || `station-${index + 1}`, name: text(station.name) }));
  const stationByName = new Map();
  const stationMatches = matchStations(forgeStations, nerisStations, stationLinks);
  const stations = forgeStations.map((station) => {
    const values = stationValues(station);
    const { station: match = null, by: matchedBy = "" } = stationMatches.get(station.id) || {};
    const problem = stationProblems(values);
    let action;
    let changes = [];
    if (match) {
      changes = ["station_id", "address_line_1", "city", "state", "zip_code", "internal_id"]
        .filter((field) => values[field] && !same(values[field], match[field]));
      action = problem ? "skip" : changes.length ? "update" : "linked";
    } else {
      action = problem ? "skip" : "create";
    }
    const row = {
      forgeId: station.id,
      name: station.name,
      action,
      nerisStationId: match?.neris_id || "",
      matchedBy,
      changes,
      reason: action === "skip" ? problem : "",
    };
    stationByName.set(station.name.toLowerCase(), row);
    return row;
  });

  // Units: one per apparatus record with a unit name.
  const nerisUnits = allNerisUnits(nerisStations);
  const units = apparatus
    .filter((item) => text(item?.unit) && text(item?.id))
    .map((item) => {
      const id = text(item.id);
      const name = text(item.unit);
      const saved = unitSettings[id] || {};
      const guessedType = guessUnitType(item.type, name);
      const type = NERIS_UNIT_TYPE_SET.has(saved.type) ? saved.type : guessedType;
      const staffing = Number.isInteger(saved.staffing) ? saved.staffing : (DEFAULT_STAFFING[type] ?? 1);
      const station = stationByName.get(text(item.station).toLowerCase()) || null;
      const linkedId = unitLinks[id];
      const match = (linkedId && nerisUnits.find((u) => u.neris_id === linkedId))
        || nerisUnits.find((u) => same(u.cad_designation_1, name))
        || null;
      const inService = isInService(item);

      let reason = "";
      if (!CAD_DESIGNATION_PATTERN.test(name)) reason = "NERIS only accepts letters, numbers, spaces and ( ) # - _ in a unit name.";
      else if (!station) reason = item.station ? `Station "${text(item.station)}" isn't in FORGE's station list.` : "Assign the unit to a station first.";
      else if (station.action === "skip" && !station.nerisStationId) reason = `Send ${station.name} to NERIS first (it needs an address).`;

      let action;
      let changes = [];
      if (match) {
        if (match.type !== type) changes.push("type");
        if (Number(match.staffing) !== staffing) changes.push("staffing");
        if (Boolean(match.in_service) !== inService) changes.push("in_service");
        if (!same(match.cad_designation_1, name)) changes.push("cad_designation_1");
        action = reason || !type ? "skip" : changes.length ? "update" : "linked";
      } else {
        action = reason || !type ? "skip" : "create";
      }
      if (!reason && !type) reason = "Pick a NERIS unit type.";

      return {
        apparatusId: id,
        name,
        apparatusType: text(item.type),
        stationName: station?.name || text(item.station),
        stationForgeId: station?.forgeId || "",
        action,
        nerisUnitId: match?.neris_id || "",
        nerisStationId: match?.stationNerisId || "",
        type,
        typeGuessed: !NERIS_UNIT_TYPE_SET.has(saved.type),
        staffing,
        inService,
        changes,
        reason,
      };
    });

  return {
    entityName: text(entity.name),
    department: { changes: departmentChanges },
    stations,
    units,
  };
}

/** Validates admin edits to unit type/staffing. Returns only usable values. */
function cleanUnitSettings(input = {}) {
  const out = {};
  for (const [id, value] of Object.entries(input || {})) {
    if (!id || typeof value !== "object" || !value) continue;
    const entry = {};
    if (NERIS_UNIT_TYPE_SET.has(value.type)) entry.type = value.type;
    const staffing = Number(value.staffing);
    if (Number.isInteger(staffing) && staffing >= 0 && staffing <= 99) entry.staffing = staffing;
    if (Object.keys(entry).length) out[String(id)] = entry;
  }
  return out;
}

function nerisErrorMessage(result) {
  const detail = result?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.slice(0, 3).map((d) => `${(d.loc || []).slice(1).join(".") || "field"}: ${d.msg || "invalid"}`).join("; ");
  }
  if (typeof detail === "string") return detail.slice(0, 300);
  if (result?.status === 403) return "NERIS refused. Check that FORGE is still enrolled for this department.";
  return `NERIS returned an error (${result?.status || "no response"}).`;
}

/**
 * Sends the selected items. `request(path, {method, body})` performs one NERIS
 * call and resolves to {ok, status, data}. Returns per-item results plus the
 * links to store. Keeps going after a failure so one bad station doesn't block
 * the rest.
 */
/** The NERIS station ID named in a "station already exists" error, if any. */
function existingStationId(result) {
  const message = typeof result?.data === "string" ? result.data : JSON.stringify(result?.data ?? "");
  if (!/matches|exists|already/i.test(message)) return "";
  return message.match(/FD[0-9]{8}S[0-9]{3}/)?.[0] || "";
}

async function applySyncPlan({ plan, profile = {}, nerisId, selection = {}, request }) {
  const results = [];
  const stationLinks = {};
  const unitLinks = {};
  const base = `/entity/${encodeURIComponent(nerisId)}`;

  // 1. Department.
  const wanted = new Set(selection.departmentFields || []);
  const deptChanges = plan.department.changes.filter((c) => wanted.has(c.field));
  if (deptChanges.length) {
    const values = departmentValues(profile);
    const body = Object.fromEntries(deptChanges.map((c) => [c.field, values[c.field]]));
    const result = await request(base, { method: "PATCH", body });
    results.push({ kind: "department", label: "Department profile", ok: result.ok, message: result.ok ? `Updated ${deptChanges.map((c) => c.label.toLowerCase()).join(", ")}` : nerisErrorMessage(result) });
  }

  // 2. Stations.
  const stationIds = new Set(selection.stationIds || []);
  const stationNerisIds = new Map(plan.stations.filter((s) => s.nerisStationId).map((s) => [s.forgeId, s.nerisStationId]));
  const forgeStations = new Map((profile.stationDetails || []).map((s, i) => [text(s.id) || `station-${i + 1}`, s]));
  for (const row of plan.stations) {
    if (!stationIds.has(row.forgeId) || !["create", "update"].includes(row.action)) continue;
    const values = stationValues({ ...forgeStations.get(row.forgeId), id: row.forgeId });
    const patchBody = Object.fromEntries(["station_id", "internal_id", "address_line_1", "city", "state", "zip_code"].map((f) => [f, values[f]]));
    if (row.action === "create") {
      const result = await request(`${base}/station`, { method: "POST", body: { ...values, in_service: true } });
      const newId = result.ok ? text(result.data?.neris_id) : "";
      if (newId) {
        stationNerisIds.set(row.forgeId, newId);
        stationLinks[row.forgeId] = newId;
        results.push({ kind: "station", label: row.name, ok: true, message: `Created in NERIS (${newId})` });
        continue;
      }
      // NERIS refuses a second station at the same address and names the one it
      // already has. NERIS may judge addresses differently from FORGE, so take
      // its word: update that station, unless another FORGE station owns it.
      const existingId = result.ok ? "" : existingStationId(result);
      if (!existingId) {
        results.push({ kind: "station", label: row.name, ok: false, message: nerisErrorMessage(result) });
        continue;
      }
      const owner = plan.stations.find((s) => s.forgeId !== row.forgeId && (s.nerisStationId === existingId || stationLinks[s.forgeId] === existingId));
      if (owner) {
        results.push({ kind: "station", label: row.name, ok: false, message: `NERIS already has a station at this address (${existingId}), and it's linked to ${owner.name}. NERIS allows one station per address. Check the addresses of ${row.name} and ${owner.name} in FORGE.` });
        continue;
      }
      const retry = await request(`${base}/station/${encodeURIComponent(existingId)}`, { method: "PATCH", body: patchBody });
      if (retry.ok) {
        stationNerisIds.set(row.forgeId, existingId);
        stationLinks[row.forgeId] = existingId;
      }
      results.push({ kind: "station", label: row.name, ok: retry.ok, message: retry.ok ? `NERIS already had this station (${existingId}), so FORGE linked it and updated it` : nerisErrorMessage(retry) });
    } else {
      const body = patchBody;
      const result = await request(`${base}/station/${encodeURIComponent(row.nerisStationId)}`, { method: "PATCH", body });
      if (result.ok) stationLinks[row.forgeId] = row.nerisStationId;
      results.push({ kind: "station", label: row.name, ok: result.ok, message: result.ok ? "Updated in NERIS" : nerisErrorMessage(result) });
    }
  }
  // Already-matching stations get linked too, so later runs don't depend on name matching.
  for (const row of plan.stations) if (row.action === "linked" && row.nerisStationId) stationLinks[row.forgeId] = row.nerisStationId;

  // 3. Units.
  const unitIds = new Set(selection.unitIds || []);
  for (const row of plan.units) {
    if (!unitIds.has(row.apparatusId) || !["create", "update"].includes(row.action)) continue;
    const body = {
      type: row.type,
      staffing: row.staffing,
      in_service: row.inService,
      cad_designation_1: row.name,
    };
    if (row.action === "create") {
      const stationNerisId = stationNerisIds.get(row.stationForgeId);
      if (!stationNerisId) {
        results.push({ kind: "unit", label: row.name, ok: false, message: `${row.stationName} isn't in NERIS yet. Send the station first.` });
        continue;
      }
      const result = await request(`${base}/station/${encodeURIComponent(stationNerisId)}/unit`, { method: "POST", body });
      const newId = result.ok ? text(result.data?.neris_id) : "";
      if (newId) unitLinks[row.apparatusId] = newId;
      results.push({ kind: "unit", label: row.name, ok: Boolean(newId), message: newId ? `Created in NERIS (${newId})` : nerisErrorMessage(result) });
    } else {
      const path = `${base}/station/${encodeURIComponent(row.nerisStationId)}/unit/${encodeURIComponent(row.nerisUnitId)}`;
      const result = await request(path, { method: "PATCH", body });
      if (result.ok) unitLinks[row.apparatusId] = row.nerisUnitId;
      results.push({ kind: "unit", label: row.name, ok: result.ok, message: result.ok ? "Updated in NERIS" : nerisErrorMessage(result) });
    }
  }
  for (const row of plan.units) if (row.action === "linked" && row.nerisUnitId) unitLinks[row.apparatusId] = row.nerisUnitId;

  return { results, stationLinks, unitLinks };
}

module.exports = {
  DEFAULT_STAFFING,
  NERIS_UNIT_TYPES,
  RMS_SOFTWARE,
  applySyncPlan,
  buildSyncPlan,
  cleanUnitSettings,
  departmentValues,
  guessUnitType,
  nerisErrorMessage,
  normalizeState,
};
