/** Procurement and lifecycle defaults for Phase 12. */

export const PROCUREMENT_PRIORITIES = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
  { id: "critical", label: "Critical / safety gap" },
];

export const PROCUREMENT_REQUEST_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "submitted", label: "Submitted" },
  { id: "under_review", label: "Under review" },
  { id: "approved", label: "Approved" },
  { id: "funded", label: "Funded" },
  { id: "awarded", label: "Awarded" },
  { id: "in_build", label: "In build" },
  { id: "commissioning", label: "Commissioning" },
  { id: "in_service", label: "In service" },
  { id: "rejected", label: "Rejected" },
  { id: "cancelled", label: "Cancelled" },
];

export const SPEC_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "committee", label: "Committee review" },
  { id: "approved", label: "Approved" },
  { id: "solicitation", label: "In solicitation" },
  { id: "awarded", label: "Awarded" },
  { id: "archived", label: "Archived" },
];

export const BUILD_MILESTONE_TEMPLATES = [
  { id: "precon", name: "Preconstruction conference", sortOrder: 1 },
  { id: "engineering", name: "Engineering approval", sortOrder: 2 },
  { id: "chassis", name: "Chassis production", sortOrder: 3 },
  { id: "body", name: "Body production", sortOrder: 4 },
  { id: "paint", name: "Paint", sortOrder: 5 },
  { id: "pump", name: "Pump installation", sortOrder: 6 },
  { id: "aerial", name: "Aerial installation", sortOrder: 7 },
  { id: "electrical", name: "Electrical", sortOrder: 8 },
  { id: "equipment", name: "Equipment mounting", sortOrder: 9 },
  { id: "inspection", name: "Inspection trip", sortOrder: 10 },
  { id: "punch", name: "Punch list", sortOrder: 11 },
  { id: "delivery", name: "Delivery", sortOrder: 12 },
  { id: "acceptance", name: "Acceptance", sortOrder: 13 },
];

export const BUILD_PROJECT_STATUSES = [
  { id: "planned", label: "Planned" },
  { id: "in_production", label: "In production" },
  { id: "delayed", label: "Delayed" },
  { id: "delivered", label: "Delivered" },
  { id: "accepted", label: "Accepted" },
  { id: "commissioning", label: "Commissioning" },
  { id: "complete", label: "Complete" },
  { id: "cancelled", label: "Cancelled" },
];

export const COMMISSIONING_CHECKLIST = [
  { id: "factory_acceptance", label: "Factory acceptance" },
  { id: "delivery_inspection", label: "Delivery inspection" },
  { id: "third_party_test", label: "Third-party test" },
  { id: "punch_list", label: "Punch list closed" },
  { id: "warranty_docs", label: "Warranty documents" },
  { id: "manuals", label: "Manuals received" },
  { id: "training", label: "Operator training" },
  { id: "title_registration", label: "Title and registration" },
  { id: "asset_labels", label: "Asset labels" },
  { id: "radio_install", label: "Radio installation" },
  { id: "equipment_loading", label: "Equipment loading" },
  { id: "cad_setup", label: "CAD setup" },
  { id: "neris_mapping", label: "NERIS mapping" },
  { id: "insurance", label: "Insurance bound" },
  { id: "in_service_approval", label: "In-service approval" },
];

export const GRANT_STATUSES = [
  { id: "identified", label: "Identified" },
  { id: "applied", label: "Applied" },
  { id: "awarded", label: "Awarded" },
  { id: "active", label: "Active" },
  { id: "closed", label: "Closed" },
  { id: "denied", label: "Denied" },
];

export const ASSET_INSURANCE_TYPES = [
  { id: "liability", label: "Liability" },
  { id: "physical_damage", label: "Physical damage" },
  { id: "comprehensive", label: "Comprehensive" },
  { id: "fleet_blanket", label: "Fleet blanket" },
];
