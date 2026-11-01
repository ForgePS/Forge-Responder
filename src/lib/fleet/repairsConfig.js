/**
 * Plain-language helpers for the Fleet "Repairs" configuration tab
 * (defect categories, repair shops, vendors). Firebase-free so it can be
 * unit tested directly.
 */

export const SHOP_TYPE_OPTIONS = [
  { id: "internal", label: "In-house shop" },
  { id: "station", label: "Station (repairs done at the station)" },
  { id: "vendor", label: "Outside vendor's shop" },
];

/** Short label for list rows. */
export function shopTypeLabel(shopType = "") {
  if (shopType === "internal") return "In-house shop";
  if (shopType === "station") return "Station";
  if (shopType === "vendor") return "Outside vendor's shop";
  return "Repair shop";
}

/** Common apparatus systems offered when classifying a defect category. */
export const COMMON_DEFECT_SYSTEMS = [
  "Chassis",
  "Engine / drivetrain",
  "Electrical",
  "Fire systems",
  "Aerial / ladder",
  "Body",
  "EMS",
  "Tools & equipment",
  "General",
];

/** Plain-English explanation of each default severity, in order of urgency. */
export const SEVERITY_HELP = [
  { label: "Observation", text: "Worth noting. No repair needed right now." },
  { label: "Low", text: "Fix when convenient." },
  { label: "Moderate", text: "Schedule a repair soon. The unit stays in service." },
  { label: "High", text: "The unit can respond with limits until it is fixed." },
  { label: "Critical", text: "The unit can respond with limits; repair right away." },
  { label: "Immediate out of service", text: "Take the unit out of service now." },
];

const CLOSED_WORK_ORDER_STATUSES = ["closed", "cancelled"];
const CLOSED_DEFECT_STATUSES = ["closed", "rejected", "voided", "corrected"];

export function isOpenWorkOrder(row = {}) {
  return !CLOSED_WORK_ORDER_STATUSES.includes(row?.status);
}

export function isOpenDefect(row = {}) {
  return !CLOSED_DEFECT_STATUSES.includes(row?.status);
}

/**
 * Count open records whose `field` equals `id`.
 * @param {object[]} rows
 * @param {string} field
 * @param {string} id
 * @param {(row: object) => boolean} isOpen
 */
export function countOpenReferences(rows = [], field, id, isOpen = () => true) {
  if (!id) return 0;
  return (rows || []).filter((row) => row && row[field] === id && isOpen(row)).length;
}

/**
 * Options for a picker: active rows only, plus the currently selected row
 * even if it has been turned off (so existing records still display it).
 * @param {{ id: string, active?: boolean }[]} rows
 * @param {string} [selectedId]
 */
export function activeOptionsWithSelected(rows = [], selectedId = "") {
  return (rows || []).filter((row) => row && (row.active !== false || (selectedId && row.id === selectedId)));
}

/** First active row's id, or "". */
export function firstActiveId(rows = []) {
  return (rows || []).find((row) => row && row.active !== false)?.id || "";
}

/**
 * Validate a name for a new or edited row. Returns an error message or "".
 * @param {string} name
 * @param {{ id: string, name: string }[]} rows
 * @param {string} [ownId]
 * @param {string} [noun]
 */
export function validateConfigName(name, rows = [], ownId = "", noun = "item") {
  const clean = String(name || "").trim();
  if (!clean) return `Give the ${noun} a name.`;
  const lower = clean.toLowerCase();
  const duplicate = (rows || []).some(
    (row) => row && row.id !== ownId && String(row.name || "").trim().toLowerCase() === lower
  );
  if (duplicate) return `There is already a ${noun} named "${clean}".`;
  return "";
}

export function sortByName(rows = []) {
  return [...(rows || [])].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
}
