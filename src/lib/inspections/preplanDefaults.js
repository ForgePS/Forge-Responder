/** Starter preplan config — statuses, types, template sections, symbols, verification. */

export const PREPLAN_STATUSES = [
  "draft",
  "field_survey_scheduled",
  "field_survey_in_progress",
  "awaiting_information",
  "ready_for_review",
  "returned_for_revision",
  "approved",
  "published",
  "operational",
  "verification_due",
  "verification_overdue",
  "revision_in_progress",
  "temporarily_unavailable",
  "superseded",
  "archived",
  "cancelled",
];

export const PREPLAN_STATUS_LABELS = {
  draft: "Draft",
  field_survey_scheduled: "Field survey scheduled",
  field_survey_in_progress: "Field survey in progress",
  awaiting_information: "Awaiting information",
  ready_for_review: "Ready for review",
  returned_for_revision: "Returned for revision",
  approved: "Approved",
  published: "Published",
  operational: "Operational",
  verification_due: "Verification due",
  verification_overdue: "Verification overdue",
  revision_in_progress: "Revision in progress",
  temporarily_unavailable: "Temporarily unavailable",
  superseded: "Superseded",
  archived: "Archived",
  cancelled: "Cancelled",
  // Master-command display aliases (resolve to canonical before persist)
  in_progress: "In progress",
  site_visit_required: "Site visit required",
  awaiting_review: "Awaiting review",
  revisions_required: "Revisions required",
  expiring: "Expiring",
  overdue: "Overdue",
};

/** Map master-command / alternate status strings onto canonical PREPLAN_STATUSES. */
export const PREPLAN_STATUS_ALIASES = {
  in_progress: "field_survey_in_progress",
  site_visit_required: "field_survey_scheduled",
  awaiting_review: "ready_for_review",
  revisions_required: "returned_for_revision",
  expiring: "verification_due",
  overdue: "verification_overdue",
};

export function resolvePreplanStatus(raw) {
  const value = String(raw || "draft").trim();
  if (PREPLAN_STATUS_ALIASES[value]) return PREPLAN_STATUS_ALIASES[value];
  if (PREPLAN_STATUSES.includes(value)) return value;
  return "draft";
}

export const PREPLAN_OPERATIONAL_VALIDITY = [
  "current",
  "verification_due",
  "verification_overdue",
  "superseded",
  "unavailable",
];

export const PREPLAN_TYPES = [
  { id: "commercial", label: "Commercial / mercantile" },
  { id: "industrial", label: "Industrial / manufacturing" },
  { id: "multifamily", label: "Multifamily residential" },
  { id: "assembly", label: "Assembly / public" },
  { id: "educational", label: "Educational" },
  { id: "healthcare", label: "Healthcare / institutional" },
  { id: "high_rise", label: "High-rise" },
  { id: "warehouse", label: "Warehouse / storage" },
  { id: "special_hazard", label: "Special hazard" },
  { id: "event", label: "Temporary / event" },
];

export const PREPLAN_RISK_LEVELS = ["Low", "Moderate", "High", "Critical", "Target Hazard"];

export const PREPLAN_PRIORITIES = [
  "routine",
  "moderate",
  "high",
  "critical",
  "target_hazard",
  "low",
  "normal",
  "urgent",
];

/** Creator / tenant feature flags for the Pre-Fire Plan module. */
export const PREPLAN_FEATURE_KEYS = {
  dashboard: "dashboard",
  workQueue: "workQueue",
  occupancyInfo: "occupancyInfo",
  construction: "construction",
  fireProtection: "fireProtection",
  waterSupply: "waterSupply",
  apparatusAccess: "apparatusAccess",
  tactical: "tactical",
  hazmat: "hazmat",
  utilities: "utilities",
  contacts: "contacts",
  floorPlans: "floorPlans",
  sitePlans: "sitePlans",
  photos: "photos",
  documents: "documents",
  mapIntegration: "mapIntegration",
  hydrantIntegration: "hydrantIntegration",
  inspectionIntegration: "inspectionIntegration",
  incidentIntegration: "incidentIntegration",
  qrCodes: "qrCodes",
  offlineAccess: "offlineAccess",
  reviewWorkflow: "reviewWorkflow",
  approvalWorkflow: "approvalWorkflow",
  reports: "reports",
  importCenter: "importCenter",
  templateBuilder: "templateBuilder",
  dropdownConfig: "dropdownConfig",
  customFields: "customFields",
  auditHistory: "auditHistory",
};

export const PREPLAN_FEATURE_LABELS = {
  dashboard: "Preplan Dashboard",
  workQueue: "Work Queue",
  occupancyInfo: "Occupancy Information",
  construction: "Building Construction",
  fireProtection: "Fire Protection Systems",
  waterSupply: "Water Supply",
  apparatusAccess: "Apparatus Access",
  tactical: "Tactical Considerations",
  hazmat: "Hazardous Materials",
  utilities: "Utility Shutoffs",
  contacts: "Emergency Contacts",
  floorPlans: "Floor Plans",
  sitePlans: "Site Plans",
  photos: "Photo Gallery",
  documents: "Documents",
  mapIntegration: "Map Integration",
  hydrantIntegration: "Hydrant Integration",
  inspectionIntegration: "Inspection Integration",
  incidentIntegration: "Incident Integration",
  qrCodes: "QR Codes",
  offlineAccess: "Offline Access",
  reviewWorkflow: "Review Workflow",
  approvalWorkflow: "Approval Workflow",
  reports: "Reports",
  importCenter: "Import Center",
  templateBuilder: "Template Builder",
  dropdownConfig: "Dropdown Configuration",
  customFields: "Custom Fields",
  auditHistory: "Audit History",
};

export const PREPLAN_REVISION_STATUSES = [
  "draft",
  "in_review",
  "returned",
  "approved",
  "published",
  "superseded",
];

export const DEFAULT_VERIFICATION_CYCLE_DAYS = 365;

export const VERIFICATION_CHECKLIST_ITEMS = [
  { id: "access", label: "Access / Knox / gates verified" },
  { id: "water", label: "Water supply / hydrants confirmed" },
  { id: "fp_systems", label: "Fire protection systems current" },
  { id: "hazards", label: "Hazards and special ops reviewed" },
  { id: "contacts", label: "Emergency contacts verified" },
  { id: "diagram", label: "Diagram / symbol placement accurate" },
  { id: "tactics", label: "Tactical notes still valid" },
];

/** Symbol catalog — IDs and labels only (no CAD geometry in MVP). */
export const STARTER_PREPLAN_SYMBOLS = [
  { id: "hydrant", label: "Hydrant", category: "water" },
  { id: "fdc", label: "Fire department connection", category: "water" },
  { id: "standpipe", label: "Standpipe", category: "water" },
  { id: "knox", label: "Knox / key box", category: "access" },
  { id: "primary_entry", label: "Primary entry", category: "access" },
  { id: "secondary_entry", label: "Secondary entry", category: "access" },
  { id: "elevator", label: "Elevator", category: "access" },
  { id: "stairwell", label: "Stairwell", category: "access" },
  { id: "alarm_panel", label: "Alarm / FACP", category: "systems" },
  { id: "sprinkler_riser", label: "Sprinkler riser", category: "systems" },
  { id: "gas_shutoff", label: "Gas shutoff", category: "utilities" },
  { id: "electric_shutoff", label: "Electric shutoff", category: "utilities" },
  { id: "water_shutoff", label: "Water shutoff", category: "utilities" },
  { id: "hazmat", label: "Hazardous materials", category: "hazards" },
  { id: "truss", label: "Lightweight / truss", category: "hazards" },
  { id: "staging", label: "Staging area", category: "tactics" },
  { id: "command", label: "Command post", category: "tactics" },
  { id: "exposures", label: "Exposure concern", category: "tactics" },
];

export const STARTER_PREPLAN_TEMPLATE_SECTIONS = [
  {
    id: "construction",
    title: "Building construction",
    fields: [
      { key: "constructionType", label: "Construction type", type: "select", dropdownLibrary: "constructionType" },
      { key: "roofConstruction", label: "Roof construction", type: "select", dropdownLibrary: "roofConstruction" },
      { key: "stories", label: "Stories / floors", type: "text" },
      { key: "squareFootage", label: "Approx. square footage", type: "text" },
      { key: "yearBuilt", label: "Year built", type: "text" },
      { key: "constructionNotes", label: "Construction notes", type: "long_text" },
    ],
  },
  {
    id: "access",
    title: "Access & approach",
    fields: [
      { key: "primaryAccess", label: "Primary access", type: "long_text" },
      { key: "secondaryAccess", label: "Secondary access", type: "long_text" },
      { key: "knoxBox", label: "Knox / key box", type: "select", dropdownLibrary: "knoxBoxStatus" },
      { key: "gatesCodes", label: "Gates / codes (restricted)", type: "text", sensitive: true },
      { key: "apparatusLimitations", label: "Apparatus limitations", type: "long_text" },
    ],
  },
  {
    id: "water",
    title: "Water supply",
    fields: [
      { key: "waterSupplyType", label: "Water supply type", type: "select", dropdownLibrary: "waterSupplyType" },
      { key: "nearestHydrants", label: "Nearest hydrants", type: "long_text" },
      { key: "fdcLocation", label: "FDC location", type: "text" },
      { key: "staticWater", label: "Static / alternate water", type: "text" },
      { key: "supplyNotes", label: "Supply notes", type: "long_text" },
    ],
  },
  {
    id: "fire_protection",
    title: "Fire protection systems",
    fields: [
      { key: "sprinkler", label: "Sprinkler", type: "select", dropdownLibrary: "sprinklerSystemType" },
      { key: "standpipe", label: "Standpipe", type: "text" },
      { key: "alarm", label: "Alarm / monitoring", type: "text" },
      { key: "specialSuppression", label: "Special suppression", type: "text" },
      { key: "panelLocation", label: "Panel / riser location", type: "text" },
    ],
  },
  {
    id: "utilities",
    title: "Utilities",
    fields: [
      { key: "gas", label: "Gas shutoff", type: "text", sensitive: true },
      { key: "electric", label: "Electric shutoff", type: "text", sensitive: true },
      { key: "water", label: "Water shutoff", type: "text" },
      { key: "hvac", label: "HVAC / other", type: "text" },
    ],
  },
  {
    id: "hazards",
    title: "Hazards & occupancy",
    fields: [
      { key: "occupancyClassification", label: "Occupancy classification", type: "select", dropdownLibrary: "occupancyClassification" },
      { key: "buildingStatus", label: "Building status", type: "select", dropdownLibrary: "buildingStatus" },
      { key: "construction", label: "Construction / truss", type: "text" },
      { key: "hazmat", label: "HazMat / special hazards", type: "long_text", sensitive: true },
      { key: "hazardType", label: "Primary hazard type", type: "select", dropdownLibrary: "hazardType" },
      { key: "occupancyNotes", label: "Occupancy / populations", type: "long_text" },
      { key: "exposures", label: "Exposures", type: "long_text" },
    ],
  },
  {
    id: "contacts",
    title: "Emergency contacts",
    fields: [
      { key: "primaryContact", label: "Primary contact", type: "text" },
      { key: "primaryPhone", label: "Primary phone", type: "text" },
      { key: "afterHours", label: "After-hours contact", type: "text" },
      { key: "managementCompany", label: "Management / owner", type: "text" },
      { key: "contactNotes", label: "Contact notes", type: "long_text" },
    ],
  },
  {
    id: "tactics",
    title: "Tactical plan",
    fields: [
      { key: "initialActions", label: "Initial actions", type: "long_text" },
      { key: "staging", label: "Staging", type: "text" },
      { key: "evacuation", label: "Evacuation considerations", type: "long_text" },
      { key: "specialOps", label: "Special operations", type: "long_text" },
      { key: "dispatchSummary", label: "Dispatch summary", type: "long_text" },
    ],
  },
];

export const STARTER_PREPLAN_TEMPLATES = [
  {
    id: "tpl-standard-commercial",
    name: "Standard commercial",
    preplanTypeId: "commercial",
    description: "Default commercial / mercantile preplan survey sections.",
    sections: STARTER_PREPLAN_TEMPLATE_SECTIONS,
    active: true,
  },
  {
    id: "tpl-multifamily",
    name: "Multifamily residential",
    preplanTypeId: "multifamily",
    description: "Apartment / condo oriented access and life-safety focus.",
    sections: STARTER_PREPLAN_TEMPLATE_SECTIONS,
    active: true,
  },
  {
    id: "tpl-special-hazard",
    name: "Special hazard",
    preplanTypeId: "special_hazard",
    description: "Elevated hazard / industrial survey template.",
    sections: STARTER_PREPLAN_TEMPLATE_SECTIONS,
    active: true,
  },
];

export const STARTER_SYMBOL_LIBRARY = {
  id: "default-symbols",
  name: "Default operational symbols",
  symbols: STARTER_PREPLAN_SYMBOLS,
  active: true,
};

export function getPreplanStatusOptions() {
  return PREPLAN_STATUSES.map((id) => ({
    id,
    label: PREPLAN_STATUS_LABELS[id] || id,
  }));
}

export function getPreplanTypeOptions() {
  return PREPLAN_TYPES.map((row) => ({ ...row }));
}

export function labelForPreplanStatus(status) {
  return PREPLAN_STATUS_LABELS[status] || status || "—";
}
