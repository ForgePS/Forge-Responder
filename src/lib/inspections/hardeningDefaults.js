/** Phase 13 — import, accessibility, and production hardening defaults. */

import {
  CODE_SECTIONS_COLLECTION,
  CODE_SETS_COLLECTION,
  FIRE_PROTECTION_SYSTEMS_COLLECTION,
  FPS_CONTRACTORS_COLLECTION,
  FPS_DEFICIENCIES_COLLECTION,
  FPS_IMPAIRMENTS_COLLECTION,
  FPS_TEST_REPORTS_COLLECTION,
  INSPECTION_APPEALS_COLLECTION,
  INSPECTION_AUTOMATIONS_COLLECTION,
  INSPECTION_AUTOMATION_RUNS_COLLECTION,
  INSPECTION_CALENDAR_EVENTS_COLLECTION,
  INSPECTION_CERTIFICATES_COLLECTION,
  INSPECTION_CITATIONS_COLLECTION,
  INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION,
  INSPECTION_DEVICE_POLICIES_COLLECTION,
  INSPECTION_DOCUMENT_TEMPLATES_COLLECTION,
  INSPECTION_ENFORCEMENT_ORDERS_COLLECTION,
  INSPECTION_FEE_ADJUSTMENTS_COLLECTION,
  INSPECTION_FEE_SCHEDULES_COLLECTION,
  INSPECTION_FEES_COLLECTION,
  INSPECTION_HARDENING_CHECKS_COLLECTION,
  INSPECTION_IMPORT_BATCHES_COLLECTION,
  INSPECTION_INTEGRATION_ADAPTERS_COLLECTION,
  INSPECTION_INVOICES_COLLECTION,
  INSPECTION_NERIS_MAPPINGS_COLLECTION,
  INSPECTION_NOTICES_COLLECTION,
  INSPECTION_NOTICE_DELIVERIES_COLLECTION,
  INSPECTION_PAYMENTS_COLLECTION,
  INSPECTION_REINSPECTIONS_COLLECTION,
  INSPECTION_REPORT_RUNS_COLLECTION,
  INSPECTION_SAVED_REPORTS_COLLECTION,
  INSPECTION_SCHEDULED_REPORTS_COLLECTION,
  INSPECTION_TEMPLATES_COLLECTION,
  INSPECTION_TEMPLATE_VERSIONS_COLLECTION,
  INSPECTION_TYPES_COLLECTION,
  INSPECTION_WEBHOOKS_COLLECTION,
  INSPECTION_WORKFLOWS_COLLECTION,
  INSPECTIONS_COLLECTION,
  LOCAL_AMENDMENTS_COLLECTION,
  OCCUPANCIES_COLLECTION,
  PREPLAN_DIAGRAMS_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
  PREPLAN_SYMBOL_LIBRARIES_COLLECTION,
  PREPLAN_TEMPLATES_COLLECTION,
  PREPLAN_TEMPLATE_VERSIONS_COLLECTION,
  PREPLAN_VERIFICATIONS_COLLECTION,
  PREPLANS_COLLECTION,
  VIOLATION_CATALOG_COLLECTION,
  VIOLATIONS_COLLECTION,
} from "./paths.js";

export const INSPECTION_RULES_COLLECTION_CHECKLIST = [
  OCCUPANCIES_COLLECTION,
  INSPECTIONS_COLLECTION,
  INSPECTION_TYPES_COLLECTION,
  INSPECTION_TEMPLATES_COLLECTION,
  INSPECTION_TEMPLATE_VERSIONS_COLLECTION,
  CODE_SETS_COLLECTION,
  CODE_SECTIONS_COLLECTION,
  LOCAL_AMENDMENTS_COLLECTION,
  VIOLATION_CATALOG_COLLECTION,
  VIOLATIONS_COLLECTION,
  PREPLANS_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
  PREPLAN_TEMPLATES_COLLECTION,
  PREPLAN_TEMPLATE_VERSIONS_COLLECTION,
  PREPLAN_SYMBOL_LIBRARIES_COLLECTION,
  PREPLAN_DIAGRAMS_COLLECTION,
  PREPLAN_VERIFICATIONS_COLLECTION,
  INSPECTION_DOCUMENT_TEMPLATES_COLLECTION,
  INSPECTION_NOTICES_COLLECTION,
  INSPECTION_CERTIFICATES_COLLECTION,
  INSPECTION_NOTICE_DELIVERIES_COLLECTION,
  INSPECTION_REINSPECTIONS_COLLECTION,
  INSPECTION_ENFORCEMENT_ORDERS_COLLECTION,
  INSPECTION_CITATIONS_COLLECTION,
  INSPECTION_APPEALS_COLLECTION,
  INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION,
  FIRE_PROTECTION_SYSTEMS_COLLECTION,
  FPS_TEST_REPORTS_COLLECTION,
  FPS_IMPAIRMENTS_COLLECTION,
  FPS_DEFICIENCIES_COLLECTION,
  FPS_CONTRACTORS_COLLECTION,
  INSPECTION_FEE_SCHEDULES_COLLECTION,
  INSPECTION_FEES_COLLECTION,
  INSPECTION_INVOICES_COLLECTION,
  INSPECTION_PAYMENTS_COLLECTION,
  INSPECTION_FEE_ADJUSTMENTS_COLLECTION,
  INSPECTION_SAVED_REPORTS_COLLECTION,
  INSPECTION_REPORT_RUNS_COLLECTION,
  INSPECTION_SCHEDULED_REPORTS_COLLECTION,
  INSPECTION_DEVICE_POLICIES_COLLECTION,
  INSPECTION_AUTOMATIONS_COLLECTION,
  INSPECTION_AUTOMATION_RUNS_COLLECTION,
  INSPECTION_WORKFLOWS_COLLECTION,
  INSPECTION_WEBHOOKS_COLLECTION,
  INSPECTION_CALENDAR_EVENTS_COLLECTION,
  INSPECTION_NERIS_MAPPINGS_COLLECTION,
  INSPECTION_INTEGRATION_ADAPTERS_COLLECTION,
  INSPECTION_IMPORT_BATCHES_COLLECTION,
  INSPECTION_HARDENING_CHECKS_COLLECTION,
];

export const INSPECTION_PERMISSION_MATRIX = [
  { area: "Dashboard", view: "viewInspectionDashboard", edit: "—" },
  { area: "Inspections", view: "viewInspections", edit: "editInspections" },
  { area: "Configuration", view: "manageInspectionConfig", edit: "manageInspectionConfig" },
  { area: "Violations", view: "viewViolations", edit: "editViolations" },
  { area: "Preplans", view: "viewPreplans", edit: "editPreplans" },
  { area: "Notices", view: "viewInspectionNotices", edit: "editInspectionNotices" },
  { area: "Enforcement", view: "viewInspectionEnforcement", edit: "editInspectionEnforcement" },
  { area: "Fire protection systems", view: "viewFireProtectionSystems", edit: "editFireProtectionSystems" },
  { area: "Fees & payments", view: "viewInspectionFees", edit: "editInspectionFees" },
  { area: "Reports", view: "viewInspectionReports", edit: "editInspectionReports" },
  { area: "Offline & sync", view: "viewInspectionOffline", edit: "manageInspectionOffline" },
  { area: "Automation", view: "viewInspectionAutomation", edit: "manageInspectionAutomation" },
  { area: "Hardening / import", view: "viewInspectionHardening", edit: "manageInspectionHardening" },
];

export const INSPECTION_HARDENING_CHECKLIST = [
  { id: "routes_permissioned", label: "Prevention routes permission-checked", category: "security" },
  { id: "rules_deployed", label: "Firestore rules cover inspection collections", category: "security" },
  { id: "audit_actions", label: "Official actions write inspection audit events", category: "security" },
  { id: "tenant_isolation", label: "Tenant isolation via departments/{id} paths", category: "security" },
  { id: "offline_drafts", label: "Offline drafts + sync supported", category: "offline" },
  { id: "offline_conflicts", label: "Offline conflict resolution available", category: "offline" },
  { id: "a11y_nav", label: "Module nav keyboard / aria labels", category: "accessibility" },
  { id: "a11y_status", label: "Status not color-only (text labels)", category: "accessibility" },
  { id: "a11y_forms", label: "Form fields use visible labels", category: "accessibility" },
  { id: "reports_export", label: "Reports generate with CSV/JSON export", category: "reporting" },
  { id: "import_reconcile", label: "CSV import with reconciliation batches", category: "import" },
  { id: "docs_admin", label: "Administrator documentation available", category: "docs" },
  { id: "docs_deploy", label: "Deployment checklist available", category: "docs" },
  { id: "load_smoke", label: "Load smoke runner available", category: "performance" },
  { id: "templates_versioned", label: "Inspection templates are versioned", category: "data" },
  { id: "snapshots_retained", label: "Completed inspections retain historical snapshots", category: "data" },
  { id: "build_passes", label: "Production build passes", category: "release" },
  { id: "module_coverage", label: "Phases 1–12 surfaces present in nav", category: "release" },
];

export const IMPORT_RECORD_TYPES = [
  {
    id: "occupancies",
    label: "Occupancies",
    requiredColumns: ["name", "address"],
    optionalColumns: ["city", "state", "zip", "occupancyType", "hazard", "status", "externalId"],
    sampleHeaders: "name,address,city,state,zip,occupancyType,hazard,status,externalId",
  },
  {
    id: "violations",
    label: "Violations",
    requiredColumns: ["description"],
    optionalColumns: ["occupancyName", "occupancyId", "codeCitation", "severity", "status", "dueAt", "externalId"],
    sampleHeaders: "description,occupancyName,codeCitation,severity,status,dueAt,externalId",
  },
];

export const DEPLOYMENT_CHECKLIST_ITEMS = [
  "npm run build succeeds",
  "firebase deploy --only hosting,firestore:rules",
  "Confirm Prevention nav items load for admin role",
  "Run Hardening readiness checks and save a run",
  "Import a small occupancy CSV and review reconciliation",
  "Verify Offline & Sync download pack on a mobile viewport",
  "Confirm fee schedule seeded and a test fee can be created",
  "Confirm Automation dry-run returns matches without errors",
];

export const ADMIN_DOC_SECTIONS = [
  {
    id: "overview",
    title: "Module overview",
    body: "Prevention covers occupancies, inspections, violations, preplans, notices, enforcement, FPS, fees, reports, offline sync, and automation under departments/{departmentId}.",
  },
  {
    id: "permissions",
    title: "Permissions",
    body: "Grant view/edit pairs per area. Creators inherit all keys. Use the permission matrix export from Hardening for role design.",
  },
  {
    id: "imports",
    title: "Imports",
    body: "Upload CSV, map columns, validate, resolve duplicates by externalId/name+address, then commit. Each batch stores created/updated/skipped/error counts for reconciliation.",
  },
  {
    id: "offline",
    title: "Offline",
    body: "Inspectors download packs, save drafts offline, and sync on reconnect. Conflicts never silently overwrite completed records.",
  },
  {
    id: "cutover",
    title: "Cutover",
    body: "Run readiness checks, import legacy CSV where needed, lock classic list writes only after reconciliation sign-off.",
  },
];

export function getInspectionHardeningChecklist() {
  return INSPECTION_HARDENING_CHECKLIST.map((row) => ({ ...row }));
}

export function getInspectionPermissionMatrix() {
  return INSPECTION_PERMISSION_MATRIX.map((row) => ({ ...row }));
}

export function getInspectionRulesCollectionChecklist() {
  return [...INSPECTION_RULES_COLLECTION_CHECKLIST];
}

export function getImportRecordTypes() {
  return IMPORT_RECORD_TYPES.map((row) => ({
    ...row,
    requiredColumns: [...row.requiredColumns],
    optionalColumns: [...row.optionalColumns],
  }));
}

export function getDeploymentChecklistItems() {
  return [...DEPLOYMENT_CHECKLIST_ITEMS];
}

export function getAdminDocSections() {
  return ADMIN_DOC_SECTIONS.map((row) => ({ ...row }));
}
