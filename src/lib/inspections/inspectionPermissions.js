import { hasPermission } from "../permissions.js";

/** Inspection + preplan permission keys. */
export const INSPECTION_PERMISSION_KEYS = {
  view: "viewInspections",
  edit: "editInspections",
  manageConfig: "manageInspectionConfig",
  viewDashboard: "viewInspectionDashboard",
  assign: "assignInspections",
  conduct: "conductInspections",
  approve: "approveInspections",
  viewViolations: "viewViolations",
  editViolations: "editViolations",
  viewPreplans: "viewPreplans",
  editPreplans: "editPreplans",
  createPreplans: "createPreplans",
  approvePreplans: "approvePreplans",
  managePreplanConfig: "managePreplanConfig",
  submitPreplans: "submitPreplans",
  reviewPreplans: "reviewPreplans",
  rejectPreplans: "rejectPreplans",
  archivePreplans: "archivePreplans",
  restorePreplans: "restorePreplans",
  uploadPreplanFiles: "uploadPreplanFiles",
  viewPreplanSensitive: "viewPreplanSensitive",
  viewPreplanKnox: "viewPreplanKnox",
  viewPreplanUtilities: "viewPreplanUtilities",
  viewPreplanHazmat: "viewPreplanHazmat",
  viewPreplanAudit: "viewPreplanAudit",
  viewInspectionNotices: "viewInspectionNotices",
  editInspectionNotices: "editInspectionNotices",
  manageInspectionDocuments: "manageInspectionDocuments",
  viewInspectionEnforcement: "viewInspectionEnforcement",
  editInspectionEnforcement: "editInspectionEnforcement",
  viewFireProtectionSystems: "viewFireProtectionSystems",
  editFireProtectionSystems: "editFireProtectionSystems",
  viewInspectionFees: "viewInspectionFees",
  editInspectionFees: "editInspectionFees",
  viewInspectionReports: "viewInspectionReports",
  editInspectionReports: "editInspectionReports",
  viewInspectionOffline: "viewInspectionOffline",
  manageInspectionOffline: "manageInspectionOffline",
  viewInspectionAutomation: "viewInspectionAutomation",
  manageInspectionAutomation: "manageInspectionAutomation",
  viewInspectionHardening: "viewInspectionHardening",
  manageInspectionHardening: "manageInspectionHardening",
  viewCodeLibrary: "viewCodeLibrary",
  citeCodeSections: "citeCodeSections",
  manageAdoptedCodes: "manageAdoptedCodes",
  manageCodeLibrary: "manageCodeLibrary",
};

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionsModule(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewDashboard)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionDashboard(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditInspectionsModule(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.conduct)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.assign)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageInspectionConfig(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "manageSystemSettings")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canApproveInspections(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approve)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewViolations(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewViolations)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewPreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditPreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.createPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canCreatePreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.createPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canApprovePreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approvePreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.managePreplanConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approve)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManagePreplanConfig(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.managePreplanConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "manageSystemSettings")
  );
}

export function canSubmitPreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.submitPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.createPreplans)
  );
}

export function canReviewPreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.reviewPreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approvePreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.managePreplanConfig)
  );
}

export function canArchivePreplans(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.archivePreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.managePreplanConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approvePreplans)
  );
}

export function canUploadPreplanFiles(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.uploadPreplanFiles)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editPreplans)
  );
}

export function canViewPreplanSensitive(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewPreplanSensitive)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewPreplanKnox)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewPreplanUtilities)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewPreplanHazmat)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.approvePreplans)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.managePreplanConfig)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionNotices(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionNotices)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewViolations)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditInspectionNotices(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editInspectionNotices)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editViolations)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageInspectionDocuments(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageInspectionDocuments)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "manageSystemSettings")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionEnforcement(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionEnforcement)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewViolations)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditInspectionEnforcement(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editInspectionEnforcement)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editViolations)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewFireProtectionSystems(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewFireProtectionSystems)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditFireProtectionSystems(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editFireProtectionSystems)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionFees(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionFees)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditInspectionFees(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editInspectionFees)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionReports(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionReports)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewDashboard)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canEditInspectionReports(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editInspectionReports)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionOffline(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionOffline)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.conduct)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageInspectionOffline(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageInspectionOffline)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionAutomation(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionAutomation)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageInspectionAutomation(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageInspectionAutomation)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewInspectionHardening(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewInspectionHardening)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageInspectionHardening(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageInspectionHardening)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.edit)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canViewCodeLibrary(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewCodeLibrary)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.viewViolations)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.view)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canCiteCodeSections(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.citeCodeSections)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.editViolations)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.conduct)
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageAdoptedCodes(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageAdoptedCodes)
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageConfig)
    || hasPermission(permissions, "manageSystemSettings")
  );
}

/**
 * @param {Record<string, boolean>} permissions
 * @param {boolean} [isCreator]
 */
export function canManageCodeLibrary(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator
    || hasPermission(permissions, INSPECTION_PERMISSION_KEYS.manageCodeLibrary)
  );
}

/**
 * Map Prevention nav item names to required permission keys.
 * @type {Record<string, string>}
 */
export const INSPECTION_NAV_PERMISSION_MAP = {
  "Inspections Dashboard": INSPECTION_PERMISSION_KEYS.viewDashboard,
  "Work Queue": INSPECTION_PERMISSION_KEYS.view,
  "All Inspections": INSPECTION_PERMISSION_KEYS.view,
  "My Inspections": INSPECTION_PERMISSION_KEYS.view,
  "Open Violations": INSPECTION_PERMISSION_KEYS.viewViolations,
  "Notices & Certificates": INSPECTION_PERMISSION_KEYS.viewInspectionNotices,
  "Enforcement": INSPECTION_PERMISSION_KEYS.viewInspectionEnforcement,
  "Enforcement Cases": INSPECTION_PERMISSION_KEYS.viewInspectionEnforcement,
  "Fire Protection Systems": INSPECTION_PERMISSION_KEYS.viewFireProtectionSystems,
  "Fees & Payments": INSPECTION_PERMISSION_KEYS.viewInspectionFees,
  "Inspection Reports": INSPECTION_PERMISSION_KEYS.viewInspectionReports,
  "Offline & Sync": INSPECTION_PERMISSION_KEYS.viewInspectionOffline,
  "Automation & Integrations": INSPECTION_PERMISSION_KEYS.viewInspectionAutomation,
  "Import & Hardening": INSPECTION_PERMISSION_KEYS.viewInspectionHardening,
  "Import & Data Quality": INSPECTION_PERMISSION_KEYS.viewInspectionHardening,
  "Configuration Studio": INSPECTION_PERMISSION_KEYS.manageConfig,
  "Search Codes": INSPECTION_PERMISSION_KEYS.viewCodeLibrary,
  "Browse Codes": INSPECTION_PERMISSION_KEYS.viewCodeLibrary,
  "Frequently Used": INSPECTION_PERMISSION_KEYS.viewCodeLibrary,
  "Saved Sections": INSPECTION_PERMISSION_KEYS.viewCodeLibrary,
  "Local Amendments": INSPECTION_PERMISSION_KEYS.viewCodeLibrary,
  "Adopted Codes": INSPECTION_PERMISSION_KEYS.manageAdoptedCodes,
  "Code Administration": INSPECTION_PERMISSION_KEYS.manageCodeLibrary,
  Occupancies: INSPECTION_PERMISSION_KEYS.view,
  "Inspection Queue": INSPECTION_PERMISSION_KEYS.view,
  Inspections: INSPECTION_PERMISSION_KEYS.view,
  "New Preplan": INSPECTION_PERMISSION_KEYS.createPreplans,
  "Preplan Work Queue": INSPECTION_PERMISSION_KEYS.viewPreplans,
  "All Preplans": INSPECTION_PERMISSION_KEYS.viewPreplans,
  Preplans: INSPECTION_PERMISSION_KEYS.viewPreplans,
  Hydrants: INSPECTION_PERMISSION_KEYS.view,
};
