/** Phase 8 — fire protection systems starter config. */

export const FPS_SYSTEM_TYPES = [
  { id: "fire_alarm", label: "Fire alarm" },
  { id: "sprinkler", label: "Automatic sprinkler" },
  { id: "standpipe", label: "Standpipe" },
  { id: "fire_pump", label: "Fire pump" },
  { id: "water_tank", label: "Water tank" },
  { id: "clean_agent", label: "Clean agent" },
  { id: "cooking_suppression", label: "Commercial cooking suppression" },
  { id: "foam", label: "Foam system" },
  { id: "dry_chemical", label: "Dry chemical" },
  { id: "wet_chemical", label: "Wet chemical" },
  { id: "smoke_control", label: "Smoke control" },
  { id: "emergency_generator", label: "Emergency generator" },
  { id: "emergency_lighting", label: "Emergency lighting" },
  { id: "exit_signage", label: "Exit signage" },
  { id: "fire_doors", label: "Fire doors" },
  { id: "dampers", label: "Dampers" },
  { id: "private_hydrants", label: "Private hydrants" },
  { id: "errc", label: "Emergency responder radio coverage" },
  { id: "other", label: "Other" },
];

export const FPS_SYSTEM_STATUSES = [
  "active",
  "impaired",
  "out_of_service",
  "pending_acceptance",
  "decommissioned",
];

export const FPS_SYSTEM_STATUS_LABELS = {
  active: "Active",
  impaired: "Impaired",
  out_of_service: "Out of service",
  pending_acceptance: "Pending acceptance",
  decommissioned: "Decommissioned",
};

export const FPS_TEST_RESULT_STATUSES = [
  "pass",
  "pass_with_deficiencies",
  "fail",
  "incomplete",
  "not_tested",
];

export const FPS_TEST_RESULT_LABELS = {
  pass: "Pass",
  pass_with_deficiencies: "Pass with deficiencies",
  fail: "Fail",
  incomplete: "Incomplete",
  not_tested: "Not tested",
};

export const FPS_IMPAIRMENT_STATUSES = [
  "active",
  "restored",
  "extended",
  "cancelled",
];

export const FPS_IMPAIRMENT_STATUS_LABELS = {
  active: "Active",
  restored: "Restored",
  extended: "Extended",
  cancelled: "Cancelled",
};

export const FPS_DEFICIENCY_STATUSES = [
  "open",
  "under_repair",
  "converted_to_violation",
  "closed",
  "dismissed",
];

export const FPS_DEFICIENCY_STATUS_LABELS = {
  open: "Open",
  under_repair: "Under repair",
  converted_to_violation: "Converted to violation",
  closed: "Closed",
  dismissed: "Dismissed",
};

export const FPS_CONTRACTOR_STATUSES = [
  "active",
  "pending_verification",
  "suspended",
  "inactive",
];

export const FPS_CONTRACTOR_STATUS_LABELS = {
  active: "Active",
  pending_verification: "Pending verification",
  suspended: "Suspended",
  inactive: "Inactive",
};

export function getFpsSystemTypeOptions() {
  return FPS_SYSTEM_TYPES.map((row) => ({ ...row }));
}

export function labelForFpsSystemStatus(status) {
  return FPS_SYSTEM_STATUS_LABELS[status] || status || "—";
}

export function labelForFpsTestResult(status) {
  return FPS_TEST_RESULT_LABELS[status] || status || "—";
}

export function labelForFpsImpairmentStatus(status) {
  return FPS_IMPAIRMENT_STATUS_LABELS[status] || status || "—";
}

export function labelForFpsDeficiencyStatus(status) {
  return FPS_DEFICIENCY_STATUS_LABELS[status] || status || "—";
}

export function labelForFpsContractorStatus(status) {
  return FPS_CONTRACTOR_STATUS_LABELS[status] || status || "—";
}
