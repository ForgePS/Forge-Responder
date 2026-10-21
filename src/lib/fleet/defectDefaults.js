/** Tenant-editable defect severity, statuses, and starter categories. */

export const DEFAULT_DEFECT_SEVERITIES = [
  { id: "observation", label: "Observation", rank: 1, defaultOos: false, defaultRestrict: false },
  { id: "low", label: "Low", rank: 2, defaultOos: false, defaultRestrict: false },
  { id: "moderate", label: "Moderate", rank: 3, defaultOos: false, defaultRestrict: false },
  { id: "high", label: "High", rank: 4, defaultOos: false, defaultRestrict: true },
  { id: "critical", label: "Critical", rank: 5, defaultOos: false, defaultRestrict: true },
  { id: "immediate_oos", label: "Immediate out of service", rank: 6, defaultOos: true, defaultRestrict: true },
];

export const DEFAULT_DEFECT_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "deferred",
  "work_order_created",
  "repair_in_progress",
  "ready_for_verification",
  "corrected",
  "closed",
  "reopened",
  "rejected",
];

export const STARTER_DEFECT_CATEGORIES = [
  { id: "cat-brakes", name: "Brakes", system: "Chassis", active: true },
  { id: "cat-lights", name: "Lights / warning", system: "Electrical", active: true },
  { id: "cat-pump", name: "Pump / waterway", system: "Fire systems", active: true },
  { id: "cat-body", name: "Body / cab", system: "Body", active: true },
  { id: "cat-ems", name: "EMS equipment", system: "EMS", active: true },
  { id: "cat-other", name: "Other", system: "General", active: true },
];

/**
 * Map check failAction → suggested severity.
 * @param {string} failAction
 */
export function severityFromFailAction(failAction = "") {
  if (failAction === "oos") return "immediate_oos";
  if (failAction === "restrict") return "high";
  return "moderate";
}
