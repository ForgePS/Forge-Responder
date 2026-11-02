/**
 * Pure helpers for the single work-order flow (Employee Portal → Fleet Work Orders →
 * completion closes defect / PM / unit status). Firebase-free so it can be unit tested.
 */
import { DEFAULT_WORK_ORDER_PRIORITIES, DEFAULT_WORK_ORDER_STATUSES, DEFAULT_WORK_ORDER_TYPES } from "./workOrderDefaults.js";

const DOWN_STATUSES = new Set(["out_of_service", "restricted"]);

function labelFrom(list, id, fallback = "") {
  const key = String(id || "");
  const row = list.find((item) => item.id === key);
  if (row) return row.label;
  if (!key) return fallback;
  const spaced = key.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function workOrderStatusLabel(status) {
  return labelFrom(DEFAULT_WORK_ORDER_STATUSES, status, "Unknown");
}

export function workOrderPriorityLabel(priority) {
  return labelFrom(DEFAULT_WORK_ORDER_PRIORITIES, priority, "Medium");
}

export function workOrderTypeLabel(type) {
  return labelFrom(DEFAULT_WORK_ORDER_TYPES, type, "Other");
}

/**
 * Classic list items that are not yet in Fleet (matched by Fleet id or legacyWorkOrderId).
 * Items without an id are skipped (they cannot be matched, so copying them would repeat
 * on every load). Duplicate ids inside the classic list are copied once.
 * @param {object[]} legacyItems
 * @param {object[]} fleetOrders
 */
export function selectLegacyWorkOrdersToSync(legacyItems = [], fleetOrders = []) {
  const known = new Set();
  for (const row of Array.isArray(fleetOrders) ? fleetOrders : []) {
    if (row?.id) known.add(String(row.id).trim());
    if (row?.legacyWorkOrderId) known.add(String(row.legacyWorkOrderId).trim());
  }
  const picked = [];
  for (const item of Array.isArray(legacyItems) ? legacyItems : []) {
    const id = String(item?.id || "").trim();
    if (!id || known.has(id)) continue;
    known.add(id);
    picked.push(item);
  }
  return picked;
}

const OOS_PATTERN = /\bout[\s-]+of[\s-]+service\b|\bo\.?o\.?s\.?\b|\bdeadline[d]?\b|\bdo not (drive|operate|use)\b|\bcannot (drive|respond|be driven)\b/i;
const UNSAFE_PATTERN = /\bunsafe\b|\bnot safe\b|\bsafety (hazard|issue|concern)\b|\bhazard(ous)?\b|\bno brakes?\b|\bbrakes? (failed|failure|out)\b|\bfire hazard\b|\bleaking fuel\b|\bfuel leak\b/i;

/**
 * Read the member's words for "out of service" or "unsafe" so a defect can be raised.
 * @param {string} text
 * @returns {"out_of_service"|"unsafe"|""}
 */
export function detectUnitSafetyConcern(text = "") {
  const value = String(text || "");
  if (OOS_PATTERN.test(value)) return "out_of_service";
  if (UNSAFE_PATTERN.test(value)) return "unsafe";
  return "";
}

function mapReportPriority(value = "", concern = "") {
  if (concern === "out_of_service") return "critical";
  if (concern === "unsafe") return "high";
  const v = String(value || "").toLowerCase();
  if (v.includes("critical") || v.includes("urgent")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("low")) return "low";
  return "medium";
}

/**
 * Build createFleetWorkOrder input from an Employee Portal damage report.
 * @param {{ date?: string, location?: string, equipment?: string, damageDescription?: string, priority?: string }} form
 * @param {{ id?: string }} classicRecord - the classic list record (its id is kept as legacyWorkOrderId)
 * @param {string} reporterName
 */
export function portalReportToFleetWorkOrderInput(form = {}, classicRecord = {}, reporterName = "") {
  const equipment = String(form.equipment || "").trim();
  const description = String(form.damageDescription || "").trim();
  const unit = String(form.location || "").trim();
  // The checkbox is the member's own call; the word check is a backup for older forms.
  const concern = form.unitOutOfService ? "out_of_service" : detectUnitSafetyConcern(`${equipment} ${description}`);
  const complaint = [equipment, description].filter(Boolean).join(" — ") || "Damage report";
  return {
    unit,
    fleetNumber: unit,
    unitDesignation: unit,
    workOrderType: "corrective",
    priority: mapReportPriority(form.priority || classicRecord.priority, concern),
    status: "requested",
    source: "employee_portal",
    category: "Damage report",
    complaint,
    requestedBy: reporterName || "Employee",
    legacyWorkOrderId: classicRecord.id || "",
    oosRequired: concern === "out_of_service",
    safetyImpact: concern ? (concern === "out_of_service" ? "Reported out of service" : "Reported unsafe") : "",
    openedAt: new Date().toISOString(),
    photos: (Array.isArray(form.photos) ? form.photos : [])
      .filter((photo) => photo && photo.url)
      .map((photo) => ({ url: photo.url, storagePath: photo.storagePath || "", name: photo.name || "" })),
    concern,
  };
}

/** @param {{ status?: string }|null|undefined} asset */
export function isUnitDown(asset) {
  return Boolean(asset && DOWN_STATUSES.has(String(asset.status || "")));
}

/** @param {{ status?: string }|null|undefined} asset */
export function unitDownLabel(asset) {
  if (!asset) return "";
  if (asset.status === "out_of_service") return "out of service";
  if (asset.status === "restricted") return "on restricted service";
  return "";
}

/**
 * Plain message shown after a work order is completed.
 * @param {{
 *   workOrderNumber?: string,
 *   unitName?: string,
 *   defectClosed?: boolean,
 *   pmAdvanced?: boolean,
 *   pmProgramName?: string,
 *   returnedToService?: boolean,
 *   warnings?: string[],
 * }} outcome
 */
export function buildCompletionMessage(outcome = {}) {
  const parts = [`Work order ${outcome.workOrderNumber || ""}`.trim() + " completed."];
  if (outcome.defectClosed) parts.push("Defect closed.");
  if (outcome.pmAdvanced) {
    parts.push(outcome.pmProgramName
      ? `${outcome.pmProgramName} marked done and next due date set.`
      : "Preventive maintenance marked done and next due date set.");
  }
  if (outcome.returnedToService) parts.push(`${outcome.unitName || "The unit"} is back in service.`);
  for (const warning of outcome.warnings || []) {
    if (warning) parts.push(warning);
  }
  return parts.join(" ");
}
