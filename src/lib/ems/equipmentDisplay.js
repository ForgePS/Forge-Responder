/**
 * Labels and display rules for EMS equipment screens. The rules themselves live
 * on the server (functions/lib/emsEquipment/logic.js); the shared constants and
 * date helpers here are checked against it by tests/unit/emsEquipment.test.mjs.
 */
import { pageSlug } from "../pageUrl.js";

export const EQUIPMENT_PAGE = "EMS Equipment";
/** ?equipment=<id> on the EMS Equipment page opens that record (QR labels point here). */
export const EQUIPMENT_PARAM = "equipment";

export const STATUSES = [
  "available", "assigned", "in_service", "maintenance_required", "out_of_service", "missing", "retired", "disposed",
];
export const MANUAL_STATUSES = ["available", "in_service", "out_of_service", "retired", "disposed"];
export const CLOSED_STATUSES = ["retired", "disposed"];
export const REASON_REQUIRED_STATUSES = ["out_of_service", "retired", "disposed"];
export const CONDITIONS = ["new", "good", "fair", "poor", "damaged"];
export const DUE_SOON_DAYS = 30;

export const DEFAULT_EQUIPMENT_CATEGORIES = [
  "Cardiac Monitoring", "Defibrillation", "Airway Management", "Ventilation", "Suction", "Trauma",
  "Patient Movement", "Diagnostic", "Oxygen Delivery", "Immobilization", "Rescue", "PPE", "Communication",
  "General EMS Equipment", "Specialty Equipment",
];

/** Status labels and badge tones, including the worked-out "inspection due". */
export const STATUS_INFO = {
  available: { label: "Available", tone: "info" },
  assigned: { label: "Assigned", tone: "success" },
  in_service: { label: "In service", tone: "success" },
  inspection_due: { label: "Inspection due", tone: "warning" },
  maintenance_required: { label: "Maintenance required", tone: "warning" },
  out_of_service: { label: "Out of service", tone: "critical" },
  missing: { label: "Missing", tone: "critical" },
  retired: { label: "Retired", tone: "neutral" },
  disposed: { label: "Disposed", tone: "neutral" },
};

export const CONDITION_LABELS = { new: "New", good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged" };

export const EVENT_LABELS = {
  registered: "Registered",
  imported: "Imported from the Assets list",
  updated: "Details edited",
  transferred: "Moved",
  verified: "Verified present",
  found: "Found",
  reported_missing: "Reported missing",
  problem_reported: "Deficiency reported",
  maintenance_requested: "Maintenance requested",
  inspected: "Inspection",
  calibrated: "Calibration",
  maintenance_completed: "Maintenance completed",
  status_changed: "Status changed",
  retired: "Retired",
  disposed: "Disposed",
  file_added: "File added",
  file_removed: "File removed",
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function isIsoDate(value) {
  if (!ISO_DATE.test(String(value || ""))) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && todayIso(new Date(time)) === value;
}

export function daysUntil(date, today = todayIso()) {
  if (!isIsoDate(date)) return null;
  return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** "overdue" (on or before today), "soon" (within DUE_SOON_DAYS) or "". */
export function dueState(date, today = todayIso(), soonDays = DUE_SOON_DAYS) {
  const days = daysUntil(date, today);
  if (days === null) return "";
  if (days <= 0) return "overdue";
  if (days <= soonDays) return "soon";
  return "";
}

export function equipmentFlags(record = {}, today = todayIso()) {
  const s = record.schedules || {};
  const active = !CLOSED_STATUSES.includes(record.status);
  return {
    inspection: active ? dueState(s.nextInspectionDue, today) : "",
    calibration: active ? dueState(s.nextCalibrationDue, today) : "",
    maintenance: active ? dueState(s.nextMaintenanceDue, today) : "",
    warranty: active ? dueState(record.warrantyExpiration, today) : "",
    replacement: active ? dueState(record.replacementDate, today) : "",
  };
}

export function displayStatus(record = {}, today = todayIso()) {
  if (["available", "assigned", "in_service"].includes(record.status)
    && equipmentFlags(record, today).inspection === "overdue") return "inspection_due";
  return record.status || "available";
}

/** Badges for what's due: [{ label, tone }]. */
export function dueBadges(record = {}, today = todayIso()) {
  const flags = equipmentFlags(record, today);
  const s = record.schedules || {};
  const out = [];
  const add = (state, overdue, soon, date) => {
    if (state === "overdue") out.push({ label: overdue, tone: "critical" });
    else if (state === "soon") out.push({ label: `${soon} ${formatDate(date)}`, tone: "warning" });
  };
  add(flags.inspection, "Inspection overdue", "Inspection", s.nextInspectionDue);
  add(flags.calibration, "Calibration overdue", "Calibration", s.nextCalibrationDue);
  add(flags.maintenance, "Maintenance overdue", "Maintenance", s.nextMaintenanceDue);
  add(flags.warranty, "Warranty expired", "Warranty ends", record.warrantyExpiration);
  add(flags.replacement, "Replacement due", "Replace by", record.replacementDate);
  return out;
}

export function lookupKey(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 80);
}

export function describeAssignment(a = {}) {
  return [a.unitDesignation, a.locationName, a.stationName].filter(Boolean).join(" · ") || "Unassigned";
}

export function formatDate(value) {
  if (!isIsoDate(String(value || "").slice(0, 10))) return value ? String(value) : "";
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatWhen(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function formatMoney(value) {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "";
}

/** The address a QR label holds: this app's EMS Equipment page with the record's id. */
export function equipmentUrl(equipmentId, location = typeof window !== "undefined" ? window.location : null) {
  const base = location ? `${location.origin}${location.pathname}` : "";
  const params = new URLSearchParams({ page: pageSlug(EQUIPMENT_PAGE), [EQUIPMENT_PARAM]: equipmentId });
  return `${base}?${params.toString()}`;
}

/** The equipment id in a scanned label address, or "" when the text isn't one of ours. */
export function equipmentIdFromScan(textValue) {
  const value = String(textValue || "").trim();
  if (!/^https?:\/\//i.test(value)) return "";
  try {
    const url = new URL(value);
    return url.searchParams.get(EQUIPMENT_PARAM) || "";
  } catch {
    return "";
  }
}

/**
 * Find equipment from whatever was scanned or typed: a QR label address, the
 * record id, the equipment ID (asset number), a serial number or a barcode.
 * Returns { match, matches } — `matches` has more than one entry when a serial
 * or barcode is shared, so the person can pick.
 */
export function findEquipment(textValue, equipment = []) {
  const value = String(textValue || "").trim();
  if (!value) return { match: null, matches: [] };
  const fromUrl = equipmentIdFromScan(value);
  if (fromUrl) {
    const hit = equipment.find((e) => e.id === fromUrl);
    return { match: hit || null, matches: hit ? [hit] : [] };
  }
  const byId = equipment.find((e) => e.id === value);
  if (byId) return { match: byId, matches: [byId] };
  const key = lookupKey(value);
  if (!key) return { match: null, matches: [] };
  const byNumber = equipment.filter((e) => (e.assetNumberKey || lookupKey(e.assetNumber)) === key);
  if (byNumber.length === 1) return { match: byNumber[0], matches: byNumber };
  const matches = equipment.filter((e) => [e.assetNumberKey, e.serialKey, e.barcodeKey].includes(key));
  return { match: matches.length === 1 ? matches[0] : null, matches };
}

/** What each permission lets this person do on a record. */
export function equipmentAbilities(record = {}, can = {}) {
  const open = !CLOSED_STATUSES.includes(record.status);
  const missing = record.status === "missing";
  const check = Boolean(can.check || can.manage);
  return {
    verify: check && open,
    report: check && open && !missing,
    inspect: check && open && !missing,
    transfer: Boolean(can.transfer || can.manage) && open && !missing,
    maintain: Boolean(can.manage) && open && !missing,
    status: Boolean(can.manage) && record.status !== "disposed",
    edit: Boolean(can.manage),
    files: Boolean(can.manage),
  };
}
