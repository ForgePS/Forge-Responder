/** Phase 7 — reinspection & enforcement starter config. */

export const ENFORCEMENT_ORDER_TYPES = [
  { id: "fire_watch", label: "Fire-watch order" },
  { id: "stop_work", label: "Stop-work order" },
  { id: "closure", label: "Closure order" },
  { id: "unsafe_building", label: "Unsafe-building notice" },
  { id: "final_warning", label: "Final warning" },
  { id: "other", label: "Other enforcement order" },
];

export const ENFORCEMENT_ORDER_STATUSES = [
  "draft",
  "issued",
  "active",
  "lifted",
  "violated",
  "superseded",
  "void",
];

export const ENFORCEMENT_ORDER_STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  active: "Active",
  lifted: "Lifted",
  violated: "Violated",
  superseded: "Superseded",
  void: "Void",
};

export const CITATION_STATUSES = [
  "draft",
  "issued",
  "served",
  "paid",
  "appealed",
  "dismissed",
  "void",
];

export const CITATION_STATUS_LABELS = {
  draft: "Draft",
  issued: "Issued",
  served: "Served",
  paid: "Paid",
  appealed: "Appealed",
  dismissed: "Dismissed",
  void: "Void",
};

export const APPEAL_STATUSES = [
  "filed",
  "scheduled",
  "hearing_held",
  "upheld",
  "overturned",
  "modified",
  "withdrawn",
  "closed",
];

export const APPEAL_STATUS_LABELS = {
  filed: "Filed",
  scheduled: "Hearing scheduled",
  hearing_held: "Hearing held",
  upheld: "Upheld",
  overturned: "Overturned",
  modified: "Modified",
  withdrawn: "Withdrawn",
  closed: "Closed",
};

export const CORRECTION_SUBMISSION_STATUSES = [
  "submitted",
  "under_review",
  "accepted",
  "rejected",
  "more_info_requested",
  "reinspection_requested",
];

export const CORRECTION_SUBMISSION_STATUS_LABELS = {
  submitted: "Submitted",
  under_review: "Under review",
  accepted: "Accepted",
  rejected: "Rejected",
  more_info_requested: "More info requested",
  reinspection_requested: "Reinspection requested",
};

export const REINSPECTION_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "no_access",
  "cancelled",
];

export const REINSPECTION_STATUS_LABELS = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
  no_access: "No access",
  cancelled: "Cancelled",
};

export const DEFAULT_REINSPECTION_FEE = 0;

export const STARTER_ENFORCEMENT_SETTINGS = {
  id: "main",
  defaultReinspectionFee: DEFAULT_REINSPECTION_FEE,
  allowRemoteCloseOnAcceptedEvidence: true,
  requireSupervisorForOrders: false,
  citationNumberPrefix: "CIT",
  orderNumberPrefix: "ORD",
  appealNumberPrefix: "APL",
  notes: "Staff-mediated correction review. Public correction portal deferred.",
};

export function getEnforcementOrderTypeOptions() {
  return ENFORCEMENT_ORDER_TYPES.map((row) => ({ ...row }));
}

export function labelForOrderStatus(status) {
  return ENFORCEMENT_ORDER_STATUS_LABELS[status] || status || "—";
}

export function labelForCitationStatus(status) {
  return CITATION_STATUS_LABELS[status] || status || "—";
}

export function labelForAppealStatus(status) {
  return APPEAL_STATUS_LABELS[status] || status || "—";
}

export function labelForCorrectionStatus(status) {
  return CORRECTION_SUBMISSION_STATUS_LABELS[status] || status || "—";
}

export function labelForReinspectionStatus(status) {
  return REINSPECTION_STATUS_LABELS[status] || status || "—";
}
