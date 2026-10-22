/**
 * Which department data belongs to which module, for server-side enforcement.
 *
 * Module keys match src/data/adminRegistry.js ADMIN_MODULE_OPTIONS. The
 * Firestore rules carry the same mapping as literal maps (listModule /
 * collectionModule in firestore.rules); tests/unit/moduleCatalog.test.mjs
 * checks the two stay in step.
 */

const MODULE_KEYS = [
  "dashboard", "personnel", "certifications", "training", "scheduling",
  "timeSheets", "dailyLog", "apparatus", "assets", "maintenance", "hoseTesting",
  "occupancies", "inspections", "preplans", "hydrants", "documents",
  "analytics", "nerisFireReports", "internalEmail", "digitalDashboard",
  "administration",
];

/** Modules that can never be switched off (home page and the admin screens). */
const ALWAYS_ON_MODULES = ["dashboard", "administration"];

/** departments/<id>/lists/<listKey> -> module. Lists not named here are not gated. */
const LIST_MODULES = {
  "hlfd-rms-personnel": "personnel",
  "hlfd-rms-certifications": "certifications",
  "hlfd-rms-training": "training",
  "hlfd-rms-schedule-days": "scheduling",
  "hlfd-rms-roster": "scheduling",
  "hlfd-rms-leave-requests": "scheduling",
  "hlfd-rms-overtime-offers": "scheduling",
  "hlfd-rms-vacancy-pickups": "scheduling",
  "hlfd-rms-shift-trades": "scheduling",
  "hlfd-rms-call-shifts": "scheduling",
  "hlfd-rms-time-cards": "timeSheets",
  "hlfd-rms-daily-logs": "dailyLog",
  "hlfd-rms-apparatus": "apparatus",
  "hlfd-rms-assets": "assets",
  "hlfd-rms-work-orders": "maintenance",
  "hlfd-rms-hose-tests": "hoseTesting",
  "hlfd-rms-occupancies": "occupancies",
  "hlfd-rms-inspections": "inspections",
  "hlfd-rms-preplans": "preplans",
  "hlfd-rms-documents": "documents",
  "hlfd-rms-neris-fire-reports": "nerisFireReports",
  "hlfd-rms-dd-displays": "digitalDashboard",
  "hlfd-rms-dd-media": "digitalDashboard",
  "hlfd-rms-dd-playlists": "digitalDashboard",
  "hlfd-rms-dd-schedules": "digitalDashboard",
};

/** departments/<id>/<collection> -> module, for collections named exactly. */
const COLLECTION_MODULES = {
  personnel: "personnel",
  certifications: "certifications",
  training: "training",
  apparatus: "apparatus",
  assets: "assets",
  occupancies: "occupancies",
  documents: "documents",
  incidents: "nerisFireReports",
  internalEmails: "internalEmail",
  dashboardConfig: "digitalDashboard",
  hydrants: "hydrants",
  hydrantInspections: "hydrants",
  hydrantFlowTests: "hydrants",
  dailyActivity: "hydrants",
  damageForms: "hydrants",
  waterCompanies: "hydrants",
  waterCompanyContacts: "hydrants",
  waterDistricts: "hydrants",
  hydrantOwnershipReview: "hydrants",
  hydrantDamageReports: "hydrants",
  hydrantDamageEmailAttempts: "hydrants",
  hydrantDamageAcknowledgments: "hydrants",
  hydrantRepairVerifications: "hydrants",
  hydrantDamageAuditEvents: "hydrants",
  violationCatalog: "inspections",
  violations: "inspections",
  codeSets: "inspections",
  codeSections: "inspections",
  localAmendments: "inspections",
  adoptedCodeProfiles: "inspections",
  codeSavedSections: "inspections",
  codeSearchHistory: "inspections",
  codeExtractionIssues: "inspections",
  fireProtectionSystems: "inspections",
};

/** Name prefixes for the large families (fleet*, inspection*, fps*, preplan*). */
const COLLECTION_PREFIX_MODULES = [
  ["fleet", "apparatus"],
  ["inspection", "inspections"],
  ["fps", "inspections"],
  ["preplan", "preplans"],
];

/** Module for a collection under departments/<id>/, or "" when it isn't gated. */
function collectionModule(collection = "") {
  if (COLLECTION_MODULES[collection]) return COLLECTION_MODULES[collection];
  const prefix = COLLECTION_PREFIX_MODULES.find(([p]) => collection.startsWith(p));
  return prefix ? prefix[1] : "";
}

function listModule(listKey = "") {
  return LIST_MODULES[listKey] || "";
}

module.exports = {
  MODULE_KEYS,
  ALWAYS_ON_MODULES,
  LIST_MODULES,
  COLLECTION_MODULES,
  COLLECTION_PREFIX_MODULES,
  collectionModule,
  listModule,
};
