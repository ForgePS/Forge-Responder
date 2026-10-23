/** Editable starter defaults for hydrant damage reporting (tenant-overridable later). */

export const WATER_UTILITY_TYPES = [
  { id: "municipal", label: "Municipal water department" },
  { id: "county", label: "County utility" },
  { id: "pud", label: "Public utility district" },
  { id: "rural", label: "Rural water association" },
  { id: "private_utility", label: "Private utility" },
  { id: "private_property", label: "Private property system" },
  { id: "industrial", label: "Industrial system" },
  { id: "campus", label: "Campus system" },
  { id: "state_federal", label: "State or federal facility" },
  { id: "unknown", label: "Unknown" },
  { id: "other", label: "Other" },
];

export const WATER_CONTACT_TYPES = [
  { id: "primary", label: "Primary" },
  { id: "secondary", label: "Secondary" },
  { id: "emergency", label: "Emergency" },
  { id: "escalation", label: "Escalation" },
  { id: "maintenance", label: "Maintenance" },
  { id: "engineering", label: "Engineering" },
  { id: "gis", label: "GIS" },
  { id: "dispatch", label: "Utility dispatch" },
  { id: "other", label: "Other" },
];

export const WATER_CONTACT_GROUPS = [
  { id: "routine", label: "Routine reports" },
  { id: "emergency", label: "Emergency reports" },
  { id: "maintenance", label: "Hydrant maintenance" },
  { id: "dispatch", label: "Utility dispatch" },
  { id: "engineering", label: "Engineering" },
  { id: "gis", label: "GIS corrections" },
  { id: "escalation", label: "Escalation" },
  { id: "weekly_summary", label: "Weekly summary" },
  { id: "executive", label: "Executive notification" },
];

export const DAMAGE_SEVERITIES = [
  { id: "information", label: "Information only", rank: 0 },
  { id: "minor", label: "Minor", rank: 1 },
  { id: "moderate", label: "Moderate", rank: 2 },
  { id: "major", label: "Major", rank: 3 },
  { id: "critical", label: "Critical", rank: 4 },
  { id: "immediate_hazard", label: "Immediate hazard", rank: 5 },
];

export const DAMAGE_OPERATIONAL_STATUSES = [
  { id: "in_service", label: "In service" },
  { id: "in_service_limited", label: "In service with limitation" },
  { id: "reduced_flow", label: "Reduced flow" },
  { id: "difficult_access", label: "Difficult access" },
  { id: "unreliable", label: "Unreliable" },
  { id: "temporarily_unavailable", label: "Temporarily unavailable" },
  { id: "out_of_service", label: "Out of service" },
  { id: "missing", label: "Missing" },
  { id: "testing_required", label: "Testing required" },
  { id: "unknown", label: "Unknown" },
];

export const DAMAGE_REPORT_STATUSES = [
  { id: "draft", label: "Draft", queue: "open" },
  { id: "ownership_review_required", label: "Ownership review required", queue: "ownership" },
  { id: "ready_to_send", label: "Ready to send", queue: "open" },
  { id: "sent", label: "Sent", queue: "awaiting" },
  { id: "awaiting_acknowledgment", label: "Awaiting acknowledgment", queue: "awaiting" },
  { id: "acknowledged", label: "Acknowledged", queue: "repairs" },
  { id: "additional_info_requested", label: "Additional information requested", queue: "awaiting" },
  { id: "assigned_by_water_company", label: "Assigned by water company", queue: "repairs" },
  { id: "inspection_scheduled", label: "Inspection scheduled", queue: "repairs" },
  { id: "repair_scheduled", label: "Repair scheduled", queue: "repairs" },
  { id: "repair_in_progress", label: "Repair in progress", queue: "repairs" },
  { id: "awaiting_parts", label: "Awaiting parts", queue: "repairs" },
  { id: "temporary_repair_completed", label: "Temporary repair completed", queue: "verification" },
  { id: "repair_completed", label: "Repair completed", queue: "verification" },
  { id: "ready_for_verification", label: "Ready for verification", queue: "verification" },
  { id: "verification_scheduled", label: "Verification scheduled", queue: "verification" },
  { id: "verification_failed", label: "Verification failed", queue: "repairs" },
  { id: "returned_to_water_company", label: "Returned to water company", queue: "repairs" },
  { id: "verified", label: "Verified", queue: "closed" },
  { id: "closed", label: "Closed", queue: "closed" },
  { id: "cancelled", label: "Cancelled", queue: "closed" },
  { id: "duplicate", label: "Duplicate", queue: "closed" },
  { id: "reopened", label: "Reopened", queue: "open" },
  { id: "escalated", label: "Escalated", queue: "awaiting" },
];

export const DAMAGE_EMAIL_STATUSES = [
  { id: "not_sent", label: "Not sent" },
  { id: "queued", label: "Queued" },
  { id: "submitted", label: "Submitted" },
  { id: "accepted", label: "Accepted" },
  { id: "delivered", label: "Delivered" },
  { id: "deferred", label: "Deferred" },
  { id: "bounced", label: "Bounced" },
  { id: "rejected", label: "Rejected" },
  { id: "failed", label: "Failed" },
];

export const DAMAGE_REPAIR_STATUSES = [
  { id: "not_reviewed", label: "Not reviewed" },
  { id: "acknowledged", label: "Acknowledged" },
  { id: "assigned", label: "Assigned" },
  { id: "scheduled", label: "Scheduled" },
  { id: "in_progress", label: "In progress" },
  { id: "awaiting_parts", label: "Awaiting parts" },
  { id: "temporary_repair", label: "Temporary repair" },
  { id: "completed", label: "Completed" },
  { id: "further_repair_required", label: "Further repair required" },
  { id: "cancelled", label: "Cancelled" },
];

export const VERIFICATION_TYPES = [
  { id: "visual_inspection", label: "Visual inspection" },
  { id: "operational_inspection", label: "Operational inspection" },
  { id: "full_hydrant_inspection", label: "Full hydrant inspection" },
  { id: "flow_test", label: "Flow test" },
  { id: "pressure_test", label: "Pressure test" },
  { id: "photo_review", label: "Photo review" },
  { id: "utility_documentation", label: "Utility documentation review" },
  { id: "remote", label: "Remote verification" },
  { id: "none_required", label: "No verification required" },
];

export const VERIFICATION_RESULTS = [
  { id: "passed", label: "Passed" },
  { id: "passed_with_limitation", label: "Passed with limitation" },
  { id: "failed", label: "Failed" },
  { id: "incomplete", label: "Incomplete" },
  { id: "unable_to_access", label: "Unable to access" },
  { id: "further_repair_required", label: "Further repair required" },
  { id: "flow_test_required", label: "Flow test required" },
  { id: "no_verification_required", label: "No verification required" },
];

export const STARTER_DAMAGE_CATEGORIES = [
  { id: "vehicle_impact", name: "Vehicle impact" },
  { id: "knocked_over", name: "Hydrant knocked over" },
  { id: "leaning", name: "Hydrant leaning" },
  { id: "broken_operating_nut", name: "Broken operating nut" },
  { id: "missing_operating_nut", name: "Missing operating nut" },
  { id: "missing_cap", name: "Missing cap" },
  { id: "damaged_cap", name: "Damaged cap" },
  { id: "leaking_cap", name: "Leaking cap" },
  { id: "leaking_barrel", name: "Leaking barrel" },
  { id: "leaking_valve", name: "Leaking valve" },
  { id: "broken_stem", name: "Broken stem" },
  { id: "damaged_bonnet", name: "Damaged bonnet" },
  { id: "cracked_barrel", name: "Cracked barrel" },
  { id: "main_valve_issue", name: "Main valve issue" },
  { id: "cannot_open", name: "Cannot open" },
  { id: "cannot_close", name: "Cannot close" },
  { id: "low_pressure", name: "Low pressure" },
  { id: "no_water", name: "No water" },
  { id: "insufficient_flow", name: "Insufficient flow" },
  { id: "frozen", name: "Frozen" },
  { id: "buried", name: "Buried" },
  { id: "obstructed", name: "Obstructed" },
  { id: "inaccessible", name: "Inaccessible" },
  { id: "vegetation", name: "Vegetation obstruction" },
  { id: "construction", name: "Construction damage" },
  { id: "vandalism", name: "Vandalism" },
  { id: "corrosion", name: "Corrosion" },
  { id: "missing_hydrant", name: "Missing hydrant" },
  { id: "incorrect_gis", name: "Incorrect GIS location" },
  { id: "missing_marker", name: "Missing marker" },
  { id: "incorrect_marking", name: "Incorrect paint or marking" },
  { id: "unknown_ownership", name: "Unknown ownership" },
  { id: "other", name: "Other" },
];

export const DAMAGE_QUEUE_VIEWS = [
  { id: "open", label: "Open Damage Reports", statuses: ["draft", "ready_to_send", "reopened", "ownership_review_required"] },
  { id: "awaiting", label: "Awaiting Water Company", statuses: ["sent", "awaiting_acknowledgment", "additional_info_requested", "escalated"] },
  { id: "repairs", label: "Repairs in Progress", statuses: ["acknowledged", "assigned_by_water_company", "inspection_scheduled", "repair_scheduled", "repair_in_progress", "awaiting_parts", "verification_failed", "returned_to_water_company"] },
  { id: "verification", label: "Ready for Verification", statuses: ["temporary_repair_completed", "repair_completed", "ready_for_verification", "verification_scheduled"] },
  { id: "overdue", label: "Overdue Repairs", statuses: [] },
  { id: "closed", label: "Closed Reports", statuses: ["verified", "closed", "cancelled", "duplicate"] },
  { id: "all", label: "Damage Reports", statuses: [] },
];

/**
 * @param {string} statusId
 */
export function labelForDamageStatus(statusId = "") {
  return DAMAGE_REPORT_STATUSES.find((row) => row.id === statusId)?.label
    || String(statusId || "Unknown").replace(/_/g, " ");
}

/**
 * @param {string} severityId
 */
export function labelForSeverity(severityId = "") {
  return DAMAGE_SEVERITIES.find((row) => row.id === severityId)?.label
    || String(severityId || "Unknown").replace(/_/g, " ");
}
