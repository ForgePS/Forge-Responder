/** Firestore collection / document names under departments/{departmentId}. */

export const INSPECTION_SETTINGS_COLLECTION = "inspectionSettings";
export const INSPECTION_SETTINGS_DOC_ID = "main";
export const INSPECTIONS_COLLECTION = "inspections";
export const OCCUPANCIES_COLLECTION = "occupancies";
export const INSPECTION_AUDIT_EVENTS_COLLECTION = "inspectionAuditEvents";
export const INSPECTION_TYPES_COLLECTION = "inspectionTypes";
export const INSPECTION_TEMPLATES_COLLECTION = "inspectionTemplates";
export const INSPECTION_TEMPLATE_VERSIONS_COLLECTION = "inspectionTemplateVersions";
export const CODE_SETS_COLLECTION = "codeSets";
export const CODE_SECTIONS_COLLECTION = "codeSections";
export const LOCAL_AMENDMENTS_COLLECTION = "localAmendments";
export const ADOPTED_CODE_PROFILES_COLLECTION = "adoptedCodeProfiles";
export const VIOLATION_CATALOG_COLLECTION = "violationCatalog";
export const VIOLATIONS_COLLECTION = "violations";
export const PREPLANS_COLLECTION = "preplans";
export const PREPLAN_REVISIONS_COLLECTION = "preplanRevisions";
export const PREPLAN_TEMPLATES_COLLECTION = "preplanTemplates";
export const PREPLAN_TEMPLATE_VERSIONS_COLLECTION = "preplanTemplateVersions";
export const PREPLAN_SYMBOL_LIBRARIES_COLLECTION = "preplanSymbolLibraries";
export const PREPLAN_DIAGRAMS_COLLECTION = "preplanDiagrams";
export const PREPLAN_VERIFICATIONS_COLLECTION = "preplanVerifications";
export const PREPLAN_DROPDOWN_LIBRARIES_COLLECTION = "preplanDropdownLibraries";
export const PREPLAN_DROPDOWN_OPTIONS_COLLECTION = "preplanDropdownOptions";
export const PREPLAN_BUILDINGS_COLLECTION = "preplanBuildings";
export const PREPLAN_FILES_COLLECTION = "preplanFiles";
export const PREPLAN_QR_TOKENS_COLLECTION = "preplanQrTokens";
export const INSPECTION_DOCUMENT_TEMPLATES_COLLECTION = "inspectionDocumentTemplates";
export const INSPECTION_NOTICES_COLLECTION = "inspectionNotices";
export const INSPECTION_CERTIFICATES_COLLECTION = "inspectionCertificates";
export const INSPECTION_NOTICE_DELIVERIES_COLLECTION = "inspectionNoticeDeliveries";
export const INSPECTION_REINSPECTIONS_COLLECTION = "inspectionReinspections";
export const INSPECTION_ENFORCEMENT_ORDERS_COLLECTION = "inspectionEnforcementOrders";
export const INSPECTION_CITATIONS_COLLECTION = "inspectionCitations";
export const INSPECTION_APPEALS_COLLECTION = "inspectionAppeals";
export const INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION = "inspectionCorrectionSubmissions";
export const FIRE_PROTECTION_SYSTEMS_COLLECTION = "fireProtectionSystems";
export const FPS_TEST_REPORTS_COLLECTION = "fpsTestReports";
export const FPS_IMPAIRMENTS_COLLECTION = "fpsImpairments";
export const FPS_DEFICIENCIES_COLLECTION = "fpsDeficiencies";
export const FPS_CONTRACTORS_COLLECTION = "fpsContractors";
export const INSPECTION_FEE_SCHEDULES_COLLECTION = "inspectionFeeSchedules";
export const INSPECTION_FEES_COLLECTION = "inspectionFees";
export const INSPECTION_INVOICES_COLLECTION = "inspectionInvoices";
export const INSPECTION_PAYMENTS_COLLECTION = "inspectionPayments";
export const INSPECTION_FEE_ADJUSTMENTS_COLLECTION = "inspectionFeeAdjustments";
export const INSPECTION_SAVED_REPORTS_COLLECTION = "inspectionSavedReports";
export const INSPECTION_REPORT_RUNS_COLLECTION = "inspectionReportRuns";
export const INSPECTION_SCHEDULED_REPORTS_COLLECTION = "inspectionScheduledReports";
export const INSPECTION_DEVICE_POLICIES_COLLECTION = "inspectionDevicePolicies";
export const INSPECTION_DEVICE_POLICIES_DOC_ID = "main";
export const INSPECTION_AUTOMATIONS_COLLECTION = "inspectionAutomations";
export const INSPECTION_AUTOMATION_RUNS_COLLECTION = "inspectionAutomationRuns";
export const INSPECTION_WORKFLOWS_COLLECTION = "inspectionWorkflows";
export const INSPECTION_WEBHOOKS_COLLECTION = "inspectionWebhooks";
export const INSPECTION_CALENDAR_EVENTS_COLLECTION = "inspectionCalendarEvents";
export const INSPECTION_NERIS_MAPPINGS_COLLECTION = "inspectionNerisMappings";
export const INSPECTION_INTEGRATION_ADAPTERS_COLLECTION = "inspectionIntegrationAdapters";
export const INSPECTION_IMPORT_BATCHES_COLLECTION = "inspectionImportBatches";
export const INSPECTION_HARDENING_CHECKS_COLLECTION = "inspectionHardeningChecks";

/**
 * @param {string} departmentId
 * @returns {string[]}
 */
export function inspectionSettingsDocSegments(departmentId) {
  return ["departments", departmentId, INSPECTION_SETTINGS_COLLECTION, INSPECTION_SETTINGS_DOC_ID];
}

/**
 * @param {string} departmentId
 * @param {string} inspectionId
 * @returns {string[]}
 */
export function inspectionDocSegments(departmentId, inspectionId) {
  return ["departments", departmentId, INSPECTIONS_COLLECTION, inspectionId];
}

/**
 * @param {string} departmentId
 * @param {string} occupancyId
 * @returns {string[]}
 */
export function occupancyDocSegments(departmentId, occupancyId) {
  return ["departments", departmentId, OCCUPANCIES_COLLECTION, occupancyId];
}

/**
 * @param {string} departmentId
 * @param {string} preplanId
 * @returns {string[]}
 */
export function preplanDocSegments(departmentId, preplanId) {
  return ["departments", departmentId, PREPLANS_COLLECTION, preplanId];
}

/**
 * @param {string} departmentId
 * @param {string} eventId
 * @returns {string[]}
 */
export function inspectionAuditEventSegments(departmentId, eventId) {
  return ["departments", departmentId, INSPECTION_AUDIT_EVENTS_COLLECTION, eventId];
}

/**
 * @param {string} departmentId
 * @param {string} typeId
 * @returns {string[]}
 */
export function inspectionTypeDocSegments(departmentId, typeId) {
  return ["departments", departmentId, INSPECTION_TYPES_COLLECTION, typeId];
}

/**
 * @param {string} departmentId
 * @param {string} templateId
 * @returns {string[]}
 */
export function inspectionTemplateDocSegments(departmentId, templateId) {
  return ["departments", departmentId, INSPECTION_TEMPLATES_COLLECTION, templateId];
}

/**
 * @param {string} departmentId
 * @param {string} versionId
 * @returns {string[]}
 */
export function inspectionTemplateVersionDocSegments(departmentId, versionId) {
  return ["departments", departmentId, INSPECTION_TEMPLATE_VERSIONS_COLLECTION, versionId];
}

/**
 * @param {string} departmentId
 * @param {string} noticeId
 * @returns {string[]}
 */
export function inspectionNoticeDocSegments(departmentId, noticeId) {
  return ["departments", departmentId, INSPECTION_NOTICES_COLLECTION, noticeId];
}

/**
 * @param {string} departmentId
 * @param {string} templateId
 * @returns {string[]}
 */
export function inspectionDocumentTemplateDocSegments(departmentId, templateId) {
  return ["departments", departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION, templateId];
}
