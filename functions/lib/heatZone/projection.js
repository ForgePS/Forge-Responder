/**
 * NERIS report -> Heat Zone analytics record ("projection").
 *
 * The projection is a derived, server-only read model. The NERIS report list
 * stays the single authoritative record; a projection can always be rebuilt
 * from it (see service.rebuildDepartment).
 */
const crypto = require("node:crypto");
const { inBbox, pointInGeometry, validLatLng } = require("./geo");
const { localParts, parseToUtcMs, safeTimeZone } = require("./time");

const SOURCE_LIST_KEY = "hlfd-rms-neris-fire-reports";
const PROJECTION_VERSION = 1;
const UNASSIGNED = "unassigned";
const MAX_RESPONSE_SECONDS = 3 * 3600;

const text = (value) => (value === null || value === undefined ? "" : String(value).trim());

function titleCase(value) {
  return text(value)
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function asList(value) {
  if (Array.isArray(value)) return value.flat().filter((v) => text(v));
  return text(value) ? [value] : [];
}

/** NERIS codes look like "FIRE: STRUCTURE_FIRE: ..." or "FIRE||STRUCTURE_FIRE||...". */
function codeSegments(code) {
  return text(code).split(/\s*(?:\|\||:)\s*/).filter(Boolean);
}

// NERIS incident-type categories (first segment of the code) as readable labels.
const NERIS_CATEGORIES = {
  FIRE: "Fire",
  MEDICAL: "Medical",
  RESCUE: "Rescue",
  HAZSIT: "Hazardous Situation",
  NOEMERG: "Non-Emergency",
  PUBSERV: "Public Service",
  LAWENFORCE: "Law Enforcement",
};

function classify(report) {
  const core = report.modules?.core_mod_incident || {};
  const finalType = asList(core.incident_final_type)[0] || asList(core.incident_initial_type)[0] || "";
  const source = text(finalType) || text(report.incidentTypeSummary);
  const segments = codeSegments(source);
  if (segments.length >= 2 && /^[A-Z_]+$/.test(segments[0])) {
    return {
      classification: NERIS_CATEGORIES[segments[0]] || titleCase(segments[0]),
      classificationDetail: titleCase(segments[1]),
      typeCode: source,
    };
  }
  if (source) return { classification: source.slice(0, 80), classificationDetail: "", typeCode: source };
  const discipline = asList(report.disciplines)[0];
  return { classification: discipline ? titleCase(discipline) : "Unclassified", classificationDetail: "", typeCode: "" };
}

/** Derived: the platform has no incident-level disposition field (see database-schema.md). */
function disposition(report) {
  const core = report.modules?.core_mod_incident || {};
  if (text(core.incident_noaction)) return titleCase(core.incident_noaction);
  const medical = text(report.modules?.mod_medical?.medical_disposition) || text(report.workspace?.ems?.disposition);
  if (medical) return titleCase(medical);
  if (asList(core.incident_actions_taken).length) return "Action Taken";
  return "Unspecified";
}

function units(report) {
  return (Array.isArray(report.workspace?.units) ? report.workspace.units : []).filter((u) => u && typeof u === "object");
}

function firstTime(values, timeZone, pick = Math.min) {
  const times = values.map((v) => parseToUtcMs(v, timeZone)).filter((v) => v !== null);
  return times.length ? pick(...times) : null;
}

function occurredAtMs(report, timeZone) {
  const cad = report.workspace?.cad || {};
  return parseToUtcMs(cad.receivedTime || cad.callReceivedTime || cad.psapAnswerTime, timeZone)
    ?? parseToUtcMs(cad.dispatchTime, timeZone)
    ?? firstTime(units(report).map((u) => u.dispatchTime), timeZone)
    ?? parseToUtcMs(report.incidentDate, timeZone);
}

/** Dispatch -> first arrival, in seconds (same rule as src/lib/neris/analytics.js). */
function responseSeconds(report, timeZone) {
  const cad = report.workspace?.cad || {};
  const list = units(report);
  const dispatch = parseToUtcMs(cad.dispatchTime, timeZone) ?? firstTime(list.map((u) => u.dispatchTime), timeZone);
  const arrival = parseToUtcMs(cad.arrivalTime || cad.onSceneTime, timeZone) ?? firstTime(list.map((u) => u.arrivalTime), timeZone);
  if (dispatch === null || arrival === null) return null;
  const seconds = Math.round((arrival - dispatch) / 1000);
  return seconds > 0 && seconds <= MAX_RESPONSE_SECONDS ? seconds : null;
}

function coordinates(report) {
  const loc = report.workspace?.location || {};
  return validLatLng(loc.latitude ?? loc.lat, loc.longitude ?? loc.lng ?? loc.lon)
    || validLatLng(report.latitude, report.longitude)
    || validLatLng(report.location?.lat ?? report.location?.latitude, report.location?.lng ?? report.location?.longitude);
}

/** Normalised address used to group repeat locations. */
function locationKey(address, point) {
  const normal = text(address).toLowerCase().replace(/[.,#]/g, " ").replace(/\s+/g, " ").trim();
  if (normal) return `a:${normal}`;
  if (point) return `p:${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
  return "";
}

/** First district (and every response zone) containing the point. Zones: [{id, kind, bbox, geometry}] */
function assignZones(point, zones = []) {
  if (!point) return { districtId: UNASSIGNED, zoneIds: [] };
  let districtId = UNASSIGNED;
  const zoneIds = [];
  const sorted = [...zones].sort((a, b) => (a.priority || 0) - (b.priority || 0) || String(a.id).localeCompare(String(b.id)));
  for (const zone of sorted) {
    if (zone.active === false) continue;
    if (zone.bbox && !inBbox(point.lat, point.lng, zone.bbox)) continue;
    if (!pointInGeometry(point.lng, point.lat, zone.geometry)) continue;
    if (zone.kind === "district") {
      if (districtId === UNASSIGNED) districtId = zone.id;
    } else {
      zoneIds.push(zone.id);
    }
  }
  return { districtId, zoneIds };
}

function isVoided(report) {
  return report.voided === true
    || ["voided", "void", "deleted"].includes(text(report.status).toLowerCase())
    || ["deleted", "voided"].includes(text(report.lifecycleStatus).toLowerCase());
}

function hashOf(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

/**
 * @param {object} report NERIS report item
 * @param {{departmentId:string, timeZone?:string, zones?:object[], zonesVersion?:number|string}} ctx
 * @returns {object|null} projection, or null when the record cannot be analysed (no usable time)
 */
function projectReport(report, ctx) {
  if (!report || typeof report !== "object" || !text(report.id)) return null;
  const timeZone = safeTimeZone(ctx.timeZone);
  const occurredAt = occurredAtMs(report, timeZone);
  if (occurredAt === null) return null;
  const local = localParts(occurredAt, timeZone);
  const point = coordinates(report);
  const { districtId, zoneIds } = assignZones(point, ctx.zones);
  const unitList = units(report);
  const cad = report.workspace?.cad || {};
  const projection = {
    departmentId: ctx.departmentId,
    sourceId: text(report.id),
    source: SOURCE_LIST_KEY,
    reportNumber: text(report.reportNumber) || text(cad.incidentNumber) || text(cad.cadCallNumber),
    occurredAt,
    localDate: local.date,
    localMonth: local.month,
    localHour: local.hour,
    localMinute: local.minute,
    localDow: local.dow,
    timeZone,
    lat: point ? point.lat : null,
    lng: point ? point.lng : null,
    mapped: Boolean(point),
    address: text(report.incidentAddress).slice(0, 200),
    locationKey: locationKey(report.incidentAddress, point),
    ...classify(report),
    priority: text(cad.priority) ? titleCase(cad.priority) : "Unspecified",
    disposition: disposition(report),
    status: text(report.status) || "Draft",
    unitTypes: [...new Set(unitList.map((u) => text(u.apparatusType)).filter(Boolean))].sort(),
    units: [...new Set(unitList.map((u) => text(u.unitId)).filter(Boolean))].slice(0, 20),
    stations: [...new Set(unitList.map((u) => text(u.station)).filter(Boolean))].sort(),
    responseSeconds: responseSeconds(report, timeZone),
    districtId,
    zoneIds,
    voided: isVoided(report),
    projectionVersion: PROJECTION_VERSION,
  };
  projection.contentHash = hashOf({ ...projection, zonesVersion: ctx.zonesVersion ?? 0 });
  return projection;
}

module.exports = {
  PROJECTION_VERSION,
  SOURCE_LIST_KEY,
  UNASSIGNED,
  assignZones,
  classify,
  codeSegments,
  disposition,
  locationKey,
  projectReport,
  responseSeconds,
};
