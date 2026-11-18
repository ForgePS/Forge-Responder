/**
 * CAD for patient care reports (pure; unit tested).
 *
 * CAD records come from:
 *   - Active911 alerts the RMS syncs (the department's live dispatch feed): unit notified time, address, GPS, state
 *   - CAD exports: a pasted or uploaded CAD record, or the demo department's sample CAD runs, read by the NERIS CAD
 *     parser (src/lib/neris/cadImport.js), with call and per-unit times
 *
 * Both are turned into one shape (cadRecordFrom*), then into NEMSIS values for one unit (cadValues). A report keeps
 * what CAD said when it was last filled (report.cad.values). "Refresh from CAD" offers only fields CAD changed since
 * then, or blanks: anything a person typed by hand is kept.
 */
import { fromLocalInput, getValue, nemsisDateTime, setLeaf } from "../nemsis/pcrModel.js";
import { ansiStateCode, gpsLocation } from "../../field/fieldDispatch.js";

/** CAD values and the NEMSIS fields they fill. */
export const PCR_CAD_FIELDS = Object.freeze([
  { key: "incidentNumber", el: "eResponse.03", label: "Incident number" },
  { key: "psapCall", el: "eTimes.01", label: "Call received (PSAP)", time: true },
  { key: "dispatchNotified", el: "eTimes.02", label: "Dispatch notified", time: true },
  { key: "unitNotified", el: "eTimes.03", label: "Unit notified", time: true },
  { key: "enRoute", el: "eTimes.05", label: "Unit en route", time: true },
  { key: "onScene", el: "eTimes.06", label: "Arrived on scene", time: true },
  { key: "backInService", el: "eTimes.13", label: "Back in service", time: true },
  { key: "address", el: "eScene.15", label: "Scene address" },
  { key: "gps", el: "eScene.11", label: "Scene GPS" },
  { key: "stateCode", el: "eScene.18", label: "Scene state" },
]);

const FIELD_BY_EL = new Map(PCR_CAD_FIELDS.map((f) => [f.el, f]));
const text = (value, max = 255) => String(value ?? "").trim().slice(0, max);

/** A CAD time as NEMSIS date/time: values with an offset keep their instant; "2026-11-17T06:42" is local time. */
export function cadTime(value) {
  const raw = text(value, 40).replace(" ", "T");
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(raw)) return fromLocalInput(raw.slice(0, 19));
  const t = Date.parse(raw);
  return Number.isNaN(t) ? "" : nemsisDateTime(new Date(t));
}

/** "Medic 1", "MEDIC-1" and "M1" are the same unit. */
function unitKeys(name) {
  const norm = String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!norm) return [];
  const m = /^([a-z]+)(\d+[a-z]?)$/.exec(norm);
  return m ? [norm, `${m[1][0]}${m[2]}`] : [norm];
}

export function sameUnit(a, b) {
  const ka = unitKeys(a);
  const kb = unitKeys(b);
  if (!ka.length || !kb.length) return false;
  if (ka[0] === kb[0]) return true;
  // "M1" (already short) matches "Medic 1"; two different full names ("Medic 1", "Mutual 1") don't.
  const short = (keys) => keys.length > 1 && keys[0] === keys[1];
  return (short(ka) && ka[0] === kb[1]) || (short(kb) && kb[0] === ka[1]);
}

/**
 * A CAD export (parseCadPayload(...).payload) as a CAD record.
 * @param {object} payload
 * @param {{ source?: string }} [options]
 */
export function cadRecordFromPayload(payload, { source = "cad" } = {}) {
  const cad = payload?.cad || {};
  const raw = payload?.raw || {};
  const number = text(cad.incidentNumber, 50) || text(cad.cadCallNumber, 50);
  const location = payload?.location;
  return {
    source,
    id: number,
    incidentNumber: number,
    description: text(payload?.incidentTypeSummary, 120),
    address: text(payload?.incidentAddress),
    comments: text(cad.initialComments, 1000),
    sentAt: cadTime(cad.dispatchTime || cad.receivedTime),
    gps: location ? gpsLocation(location.latitude, location.longitude) : "",
    stateCode: ansiStateCode(raw.state),
    call: {
      psapCall: cadTime(cad.receivedTime),
      dispatchNotified: cadTime(cad.dispatchTime),
      enRoute: cadTime(cad.enrouteTime),
      onScene: cadTime(cad.arrivalTime),
      backInService: cadTime(cad.clearTime),
    },
    units: (payload?.units || []).filter((u) => text(u.unitId)).map((u) => ({
      id: text(u.unitId, 40),
      notified: cadTime(u.dispatchTime),
      enRoute: cadTime(u.enrouteTime),
      onScene: cadTime(u.arrivalTime),
      backInService: cadTime(u.clearTime),
    })),
  };
}

/** An Active911 alert (items of the hlfd-rms-active911-alerts list) as a CAD record. */
export function cadRecordFromAlert(alert = {}) {
  const sentAt = cadTime(alert.sentAt || alert.syncedAt);
  return {
    source: "active911",
    id: text(alert.id, 80),
    incidentNumber: text(alert.incidentNumber || alert.cadNumber, 50),
    description: text(alert.description, 120),
    address: text(alert.address),
    comments: "",
    sentAt,
    gps: gpsLocation(alert.latitude ?? null, alert.longitude ?? null),
    stateCode: ansiStateCode(alert.state),
    // The page went to the units: that is when they were notified.
    call: { unitNotified: sentAt },
    units: String(alert.units || "").split(/[;,]/).map((u) => text(u, 40)).filter(Boolean).map((id) => ({ id })),
  };
}

/**
 * NEMSIS values from a CAD record for one unit, as { "eTimes.03": "...", ... } (blanks left out).
 * Unit times come from the unit's own CAD times when CAD lists that unit, else from the call.
 */
export function cadValues(record, unitName = "") {
  if (!record) return {};
  const call = record.call || {};
  const unit = unitName ? (record.units || []).find((u) => sameUnit(u.id, unitName)) : null;
  const unitTime = (key) => (unit ? unit[key] || "" : call[key] || "");
  const values = {
    incidentNumber: record.incidentNumber,
    psapCall: call.psapCall,
    dispatchNotified: call.dispatchNotified,
    unitNotified: unit?.notified || call.unitNotified || call.dispatchNotified,
    enRoute: unitTime("enRoute"),
    onScene: unitTime("onScene"),
    backInService: unitTime("backInService"),
    address: record.address,
    gps: record.gps,
    stateCode: record.stateCode,
  };
  const out = {};
  for (const field of PCR_CAD_FIELDS) {
    const value = text(values[field.key]);
    if (value) out[field.el] = value;
  }
  return out;
}

/**
 * What CAD would change on a report: [{ el, label, from, to }].
 *  - `overwrite` (an import the person asked for): every value CAD has that differs
 *  - otherwise (refresh): blanks, and values CAD changed since `previous` that nobody edited by hand
 * @param {object} schema
 * @param {object} nemsis the report's NEMSIS document
 * @param {Record<string, string>} values cadValues(...)
 * @param {Record<string, string>|null} previous what CAD said last time (report.cad.values)
 */
export function cadChanges(schema, nemsis, values = {}, previous = null, { overwrite = false } = {}) {
  const changes = [];
  for (const [el, to] of Object.entries(values)) {
    const field = FIELD_BY_EL.get(el);
    if (!field || !to) continue;
    const raw = getValue(schema, nemsis, el);
    const from = raw === undefined || raw === null ? "" : String(raw);
    if (from === to) continue;
    const before = previous ? text(previous[el]) : "";
    // Without a record of what CAD said, a filled field can't be told apart from a hand edit: keep it.
    const offer = overwrite || !from || (Boolean(previous) && from === before && to !== before);
    if (offer) changes.push({ el, label: field.label, from, to, time: Boolean(field.time) });
  }
  return changes;
}

/** Apply cadChanges(...) to the NEMSIS document. */
export function applyCadChanges(schema, nemsis, changes = []) {
  return changes.reduce((pcr, change) => setLeaf(schema, pcr, change.el, change.to), nemsis || {});
}

/** What the report remembers about the CAD record it was filled from (report.cad). */
export function cadLink(record, values, importedAt = new Date().toISOString()) {
  return {
    source: record.source,
    id: record.id,
    incidentNumber: record.incidentNumber || "",
    description: record.description || "",
    comments: record.comments || "",
    values: { ...values },
    importedAt,
  };
}

/** The CAD record a report was filled from (same source and id), else one with the report's incident number. */
export function findCadRecord(report, records = []) {
  const link = report?.cad;
  if (link?.id) {
    const same = records.find((r) => r.source === link.source && r.id === link.id);
    if (same) return same;
  }
  const number = text(report?.incidentNumber || link?.incidentNumber).toLowerCase();
  if (!number) return null;
  return records.find((r) => text(r.incidentNumber).toLowerCase() === number) || null;
}

/**
 * Updates CAD has for an open report (refresh): { record, values, changes } or null when CAD has nothing new.
 */
export function cadRefresh(schema, report, records = []) {
  const record = findCadRecord(report, records);
  if (!record) return null;
  const values = cadValues(record, report.unit);
  const changes = cadChanges(schema, report.nemsis || {}, values, report.cad?.values || null);
  return { record, values, changes };
}

/** Newest first, for the "start from CAD" list; drops records older than `hours`. */
export function recentCadRecords(records = [], { now = new Date(), hours = 72, limit = 30 } = {}) {
  const since = now.getTime() - hours * 3600_000;
  return records
    .map((record) => ({ record, at: Date.parse(record.sentAt || "") }))
    .filter(({ at }) => !Number.isNaN(at) && at >= since && at <= now.getTime() + 300_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ record }) => record);
}
