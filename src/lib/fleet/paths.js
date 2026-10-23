/** Firestore collection / document names under departments/{departmentId}. */

export const FLEET_SETTINGS_COLLECTION = "fleetSettings";
export const FLEET_SETTINGS_DOC_ID = "main";
export const FLEET_CLASSES_COLLECTION = "fleetClasses";
export const FLEET_ASSETS_COLLECTION = "fleetAssets";
export const FLEET_ASSET_ALIASES_COLLECTION = "fleetAssetAliases";
export const FLEET_AUDIT_EVENTS_COLLECTION = "fleetAuditEvents";
export const FLEET_MIGRATION_REPORTS_COLLECTION = "fleetMigrationReports";
export const FLEET_CHECKLIST_TEMPLATES_COLLECTION = "fleetChecklistTemplates";
export const FLEET_CHECKLIST_TEMPLATE_VERSIONS_COLLECTION = "fleetChecklistTemplateVersions";
export const FLEET_CHECKS_COLLECTION = "fleetChecks";
export const FLEET_METER_READINGS_COLLECTION = "fleetMeterReadings";
export const FLEET_DEFECTS_COLLECTION = "fleetDefects";
export const FLEET_DEFECT_CATEGORIES_COLLECTION = "fleetDefectCategories";
export const FLEET_STATUS_EVENTS_COLLECTION = "fleetStatusEvents";
export const FLEET_RESERVE_REQUESTS_COLLECTION = "fleetReserveRequests";
export const FLEET_WORK_ORDERS_COLLECTION = "fleetWorkOrders";
export const FLEET_SHOPS_COLLECTION = "fleetShops";
export const FLEET_VENDORS_COLLECTION = "fleetVendors";
export const FLEET_PM_PROGRAMS_COLLECTION = "fleetPmPrograms";
export const FLEET_PM_SCHEDULES_COLLECTION = "fleetPmSchedules";
export const FLEET_TEST_PROGRAMS_COLLECTION = "fleetTestPrograms";
export const FLEET_TESTS_COLLECTION = "fleetTests";
export const FLEET_FUEL_SITES_COLLECTION = "fleetFuelSites";
export const FLEET_FUEL_TRANSACTIONS_COLLECTION = "fleetFuelTransactions";
export const FLEET_FUEL_EXCEPTION_RULES_COLLECTION = "fleetFuelExceptionRules";
export const FLEET_CHARGING_SESSIONS_COLLECTION = "fleetChargingSessions";
export const FLEET_TELEMATICS_ADAPTERS_COLLECTION = "fleetTelematicsAdapters";
export const FLEET_TELEMATICS_MAPPINGS_COLLECTION = "fleetTelematicsMappings";
export const FLEET_TELEMATICS_EVENTS_COLLECTION = "fleetTelematicsEvents";
export const FLEET_TIRES_COLLECTION = "fleetTires";
export const FLEET_BATTERIES_COLLECTION = "fleetBatteries";
export const FLEET_FLUID_EVENTS_COLLECTION = "fleetFluidEvents";
export const FLEET_RECALLS_COLLECTION = "fleetRecalls";
export const FLEET_WARRANTIES_COLLECTION = "fleetWarranties";
export const FLEET_WARRANTY_CLAIMS_COLLECTION = "fleetWarrantyClaims";
export const FLEET_ASSIGNMENTS_COLLECTION = "fleetAssignments";
export const FLEET_TRANSFERS_COLLECTION = "fleetTransfers";
export const FLEET_RESERVE_SWAPS_COLLECTION = "fleetReserveSwaps";
export const FLEET_CHECKOUTS_COLLECTION = "fleetCheckouts";
export const FLEET_POOL_RESERVATIONS_COLLECTION = "fleetPoolReservations";
export const FLEET_LOAD_PLANS_COLLECTION = "fleetLoadPlans";
export const FLEET_DECON_EVENTS_COLLECTION = "fleetDeconEvents";
export const FLEET_ACCIDENT_EVENTS_COLLECTION = "fleetAccidentEvents";
export const FLEET_INSURANCE_CLAIMS_COLLECTION = "fleetInsuranceClaims";
export const FLEET_TOW_PROVIDERS_COLLECTION = "fleetTowProviders";
export const FLEET_ROADSIDE_EVENTS_COLLECTION = "fleetRoadsideEvents";
export const FLEET_SAFETY_REVIEWS_COLLECTION = "fleetSafetyReviews";
export const FLEET_PROCUREMENT_REQUESTS_COLLECTION = "fleetProcurementRequests";
export const FLEET_SPECIFICATIONS_COLLECTION = "fleetSpecifications";
export const FLEET_BUILD_PROJECTS_COLLECTION = "fleetBuildProjects";
export const FLEET_GRANTS_COLLECTION = "fleetGrants";
export const FLEET_ASSET_INSURANCE_COLLECTION = "fleetAssetInsurance";
export const FLEET_COST_ENTRIES_COLLECTION = "fleetCostEntries";
export const FLEET_DOWNTIME_EVENTS_COLLECTION = "fleetDowntimeEvents";
export const FLEET_REPLACEMENT_MODELS_COLLECTION = "fleetReplacementModels";
export const FLEET_REPLACEMENT_CASES_COLLECTION = "fleetReplacementCases";
export const FLEET_CAPITAL_PLAN_ITEMS_COLLECTION = "fleetCapitalPlanItems";
export const FLEET_VALUATIONS_COLLECTION = "fleetValuations";
export const FLEET_DISPOSAL_RECORDS_COLLECTION = "fleetDisposalRecords";
export const FLEET_SAVED_REPORTS_COLLECTION = "fleetSavedReports";
export const FLEET_REPORT_RUNS_COLLECTION = "fleetReportRuns";
export const FLEET_AUTOMATIONS_COLLECTION = "fleetAutomations";
export const FLEET_AUTOMATION_RUNS_COLLECTION = "fleetAutomationRuns";
export const FLEET_WORKFLOWS_COLLECTION = "fleetWorkflows";
export const FLEET_INTEGRATION_ADAPTERS_COLLECTION = "fleetIntegrationAdapters";
export const FLEET_NERIS_MAPPINGS_COLLECTION = "fleetNerisMappings";
export const FLEET_CAD_MAPPINGS_COLLECTION = "fleetCadMappings";
export const FLEET_HARDENING_CHECKS_COLLECTION = "fleetHardeningChecks";

/**
 * @param {string} departmentId
 * @returns {string[]}
 */
export function fleetSettingsDocSegments(departmentId) {
  return ["departments", departmentId, FLEET_SETTINGS_COLLECTION, FLEET_SETTINGS_DOC_ID];
}

/**
 * @param {string} departmentId
 * @param {string} assetId
 * @returns {string[]}
 */
export function fleetAssetDocSegments(departmentId, assetId) {
  return ["departments", departmentId, FLEET_ASSETS_COLLECTION, assetId];
}

/**
 * @param {string} departmentId
 * @param {string} classId
 * @returns {string[]}
 */
export function fleetClassDocSegments(departmentId, classId) {
  return ["departments", departmentId, FLEET_CLASSES_COLLECTION, classId];
}

/**
 * @param {string} departmentId
 * @param {string} eventId
 * @returns {string[]}
 */
export function fleetAuditEventSegments(departmentId, eventId) {
  return ["departments", departmentId, FLEET_AUDIT_EVENTS_COLLECTION, eventId];
}
