/**
 * Reseed a report from CAD when CAD has newer information (pure, unit tested).
 *
 * Each CAD import keeps a snapshot of what CAD said (report.cadSnapshot). When
 * the CAD record for the same incident changes later, only the fields CAD
 * changed are offered; anything a person typed by hand (different from the
 * snapshot) is kept.
 */
import { parseCadPayload } from "./cadImport.js";

export const CAD_FIELD_LABELS = {
  receivedTime: "Call received",
  dispatchTime: "Dispatched",
  enrouteTime: "En route",
  arrivalTime: "Arrived on scene",
  clearTime: "Cleared",
  priority: "Priority",
  alarmLevel: "Alarm level",
  initialComments: "Dispatch notes",
};

/** Priority and alarm level choices (CAD values outside the list are kept and shown). */
export const PRIORITY_OPTIONS = ["Emergency", "Urgent", "Routine", "Non-emergency"].map((value) => ({ value, label: value }));
export const ALARM_LEVEL_OPTIONS = [
  { value: "1", label: "1st alarm" },
  { value: "2", label: "2nd alarm" },
  { value: "3", label: "3rd alarm" },
  { value: "4", label: "4th alarm" },
  { value: "5", label: "5th alarm" },
  { value: "Box", label: "Box alarm" },
  { value: "Still", label: "Still alarm" },
];

/** Options plus the current value when it isn't one of them (e.g. "Priority 1" from CAD). */
export function withCurrentOption(options, value) {
  const current = String(value ?? "").trim();
  if (!current || options.some((option) => option.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

const text = (value) => String(value ?? "").trim();
const unitKey = (unit) => text(unit?.unitId).toLowerCase();

/** The CAD incident number a report is tied to ("" if none). */
export function reportCadNumber(report = {}) {
  const cad = report.workspace?.cad || {};
  return text(cad.cadCallNumber) || text(cad.incidentNumber) || text(report.cadSnapshot?.incidentNumber);
}

/** What to remember about an import, to tell later CAD changes from hand edits. */
export function buildCadSnapshot(payload = {}, importedAt = new Date().toISOString()) {
  const cad = Object.fromEntries(Object.keys(CAD_FIELD_LABELS).map((key) => [key, text(payload.cad?.[key])]));
  return {
    incidentNumber: text(payload.cad?.cadCallNumber) || text(payload.cad?.incidentNumber),
    cad,
    incidentAddress: text(payload.incidentAddress),
    units: (payload.units || []).map((unit) => ({ ...unit })),
    importedAt,
  };
}

/** Find the CAD record for this report among raw CAD runs (CAD JSON exports). */
export function findCadPayloadForReport(report, runs = []) {
  const number = reportCadNumber(report).toLowerCase();
  if (!number) return null;
  for (const run of runs) {
    const result = parseCadPayload(typeof run === "string" ? run : JSON.stringify(run));
    if (!result.ok || !result.payload) continue;
    const cad = result.payload.cad || {};
    if ([cad.cadCallNumber, cad.incidentNumber].some((value) => text(value).toLowerCase() === number)) return result.payload;
  }
  return null;
}

/**
 * Fields CAD now has that the report should take:
 *  - the report is blank and CAD has a value, or
 *  - CAD changed since the last import and nobody edited the field by hand.
 * Returns [{ key, label, from, to, kind: "cad" | "address" | "unit" | "unitTime" }].
 */
export function cadUpdates(report = {}, payload = null) {
  if (!payload) return [];
  const snapshot = report.cadSnapshot || null;
  const cad = report.workspace?.cad || {};
  const changes = [];
  const offer = (current, next, before) => {
    if (!next || next === current) return false;
    if (!current) return true;
    // Without a snapshot we can't tell CAD changes from hand edits: only fill blanks.
    return Boolean(snapshot) && current === before && next !== before;
  };

  Object.entries(CAD_FIELD_LABELS).forEach(([key, label]) => {
    const current = text(cad[key]);
    const next = text(payload.cad?.[key]);
    if (offer(current, next, text(snapshot?.cad?.[key]))) changes.push({ key, label, from: current, to: next, kind: "cad" });
  });

  const address = text(report.incidentAddress);
  const nextAddress = text(payload.incidentAddress);
  if (offer(address, nextAddress, text(snapshot?.incidentAddress))) {
    changes.push({ key: "incidentAddress", label: "Address", from: address, to: nextAddress, kind: "address" });
  }

  const units = new Map((report.workspace?.units || []).map((unit) => [unitKey(unit), unit]));
  const snapUnits = new Map((snapshot?.units || []).map((unit) => [unitKey(unit), unit]));
  (payload.units || []).forEach((unit) => {
    const key = unitKey(unit);
    if (!key) return;
    const existing = units.get(key);
    if (!existing) {
      // A unit removed by hand after the last import stays removed.
      if (snapshot && snapUnits.has(key)) return;
      changes.push({ key: `unit:${key}`, label: `${unit.unitId} added`, from: "", to: unit.unitId, kind: "unit", unit });
      return;
    }
    ["dispatchTime", "enrouteTime", "arrivalTime", "clearTime"].forEach((field) => {
      const current = text(existing[field]);
      const next = text(unit[field]);
      if (offer(current, next, text(snapUnits.get(key)?.[field]))) {
        changes.push({ key: `unit:${key}:${field}`, label: `${unit.unitId} ${CAD_FIELD_LABELS[field].toLowerCase()}`, from: current, to: next, kind: "unitTime", unitId: key, field });
      }
    });
  });
  return changes;
}

/** Apply the offered CAD updates and remember the new CAD snapshot. */
export function reseedFromCad(report = {}, payload, now = new Date().toISOString()) {
  const changes = cadUpdates(report, payload);
  const workspace = { ...(report.workspace || {}) };
  const cad = { ...(workspace.cad || {}) };
  let units = [...(workspace.units || [])];
  const patch = {};
  const autoPopulateSources = { ...(report.autoPopulateSources || {}) };
  changes.forEach((change) => {
    if (change.kind === "cad") {
      cad[change.key] = change.to;
      autoPopulateSources[`workspace.cad.${change.key}`] = "cad-reseed";
    } else if (change.kind === "address") {
      patch.incidentAddress = change.to;
      autoPopulateSources.incidentAddress = "cad-reseed";
    } else if (change.kind === "unit") {
      units = [...units, { ...change.unit, source: "cad-import" }];
    } else if (change.kind === "unitTime") {
      units = units.map((unit) => (unitKey(unit) === change.unitId ? { ...unit, [change.field]: change.to } : unit));
    }
  });
  const auditLog = [...(workspace.auditLog || []), { action: "cad_reseed", timestamp: now, fields: changes.map((change) => change.key) }];
  return {
    ...report,
    ...patch,
    workspace: { ...workspace, cad, units, auditLog },
    autoPopulateSources,
    cadSnapshot: buildCadSnapshot(payload, now),
    completionPercentage: undefined,
  };
}
