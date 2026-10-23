import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { defaultRoles, legacyRoleMap } from "../data/defaultRoles.js";
import { filterNavGroupsTree } from "./navTree.js";

const defaultRolesById = Object.fromEntries(defaultRoles.map((role) => [role.id, role]));

const navPermissionMap = {
  Dashboard: "accessAdminRms",
  Personnel: "viewPersonnel",
  Certifications: "viewCertifications",
  Training: "viewTraining",
  Scheduling: "viewSchedule",
  "Time Sheets": "viewSchedule",
  "Daily Log": "viewDailyLog",
  Apparatus: "viewApparatus",
  Assets: "viewAssets",
  Maintenance: "viewApparatus",
  "Hose Testing": "viewApparatus",
  "Fleet Dashboard": "viewFleetDashboard",
  "Readiness Board": "viewFleetReadiness",
  "Fleet Defects": "viewFleetDefects",
  "Fleet Work Orders": "viewFleetWorkOrders",
  "PM Forecast": "viewFleetPm",
  "Fleet Tests": "viewFleetTests",
  "Fuel & Energy": "viewFleetFuel",
  "Components & Warranty": "viewFleetComponents",
  "Fleet Operations": "viewFleetOperations",
  "Accident & Risk": "viewFleetRisk",
  "Fleet Procurement": "viewFleetProcurement",
  "Cost & Replacement": "viewFleetCost",
  "Reporting & Automation": "viewFleetReporting",
  "Vendor Portal": "viewFleetVendorPortal",
  "Fleet Hardening": "manageFleetConfig",
  "All Fleet Assets": "viewFleetAssets",
  "Fleet Configuration Studio": "manageFleetConfig",
  Occupancies: "viewInspections",
  Inspections: "viewInspections",
  "Inspection Queue": "viewInspections",
  "Inspections Dashboard": "viewInspectionDashboard",
  "Prevention Dashboard": "viewInspectionDashboard",
  "Work Queue": "viewInspections",
  "Prevention Work Queue": "viewInspections",
  "All Inspections": "viewInspections",
  "My Inspections": "viewInspections",
  "Open Violations": "viewViolations",
  "Notices & Certificates": "viewInspectionNotices",
  Enforcement: "viewInspectionEnforcement",
  "Enforcement Cases": "viewInspectionEnforcement",
  "Fire Protection Systems": "viewFireProtectionSystems",
  "Fees & Payments": "viewInspectionFees",
  "Inspection Reports": "viewInspectionReports",
  "Offline & Sync": "viewInspectionOffline",
  "Automation & Integrations": "viewInspectionAutomation",
  "Import & Hardening": "viewInspectionHardening",
  "Import & Data Quality": "viewInspectionHardening",
  "Configuration Studio": "manageInspectionConfig",
  "Search Codes": "viewCodeLibrary",
  "Browse Codes": "viewCodeLibrary",
  "Frequently Used": "viewCodeLibrary",
  "Saved Sections": "viewCodeLibrary",
  "Local Amendments": "viewCodeLibrary",
  "Adopted Codes": "manageAdoptedCodes",
  "Code Administration": "manageCodeLibrary",
  "New Preplan": "createPreplans",
  "Preplan Work Queue": "viewPreplans",
  "All Preplans": "viewPreplans",
  "Preplan Dashboard": "viewPreplans",
  "My Preplans": "viewPreplans",
  "Draft Preplans": "viewPreplans",
  "Awaiting Review": "viewPreplans",
  "Approved Preplans": "viewPreplans",
  Templates: "managePreplanConfig",
  "Preplan Reports": "viewPreplans",
  "Nearby Preplans": "viewPreplans",
  "Target Hazards": "viewPreplans",
  "Preplan Offline": "viewPreplans",
  "QR Scan": "viewPreplans",
  Preplans: "viewPreplans",
  Hydrants: "viewHydrants",
  "Hydrant Overview": "viewHydrants",
  "Damage Reports": "viewHydrantDamageReports",
  "Open Damage Reports": "viewHydrantDamageReports",
  "Awaiting Water Company": "viewHydrantDamageReports",
  "Repairs in Progress": "viewHydrantDamageReports",
  "Ready for Verification": "viewHydrantDamageReports",
  "Overdue Repairs": "viewHydrantDamageReports",
  "Closed Reports": "viewHydrantDamageReports",
  "Water Company Directory": "viewWaterCompanies",
  "Water Districts": "viewWaterDistricts",
  "Damage Analytics": "viewHydrantDamageReports",
  "NERIS Fire Reports": "viewNerisReports",
  "SOGs / Policies": "viewDocuments",
  "EMS Protocols": "viewDocuments",
  Forms: "viewDocuments",
  Uploads: "viewDocuments",
  Analytics: "accessAdminRms",
  "Messages": "viewInternalEmail",
  "Digital Dashboard": "viewDigitalDashboard",
  "System Admin": "manageUsers",
  "Creator Console": "manageDepartments"
};

function parseRoleIds(value) {
  if (Array.isArray(value) && value.length) return value;
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch {
      const split = value.split(",").map((item) => item.trim()).filter(Boolean);
      if (split.length) return split;
    }
    return [value.trim()];
  }
  return [];
}

export function normalizeRoleIds(userRecord = {}) {
  const roleIds = parseRoleIds(userRecord.roleIds);
  if (roleIds.length) return roleIds;
  if (userRecord.role) {
    return [legacyRoleMap[userRecord.role] || userRecord.role];
  }
  return [];
}

export function mergeRolePermissions(roleIds = [], rolesById = {}) {
  if (roleIds.includes("creator")) {
    return { ...CREATOR_PERMISSIONS };
  }
  const merged = {};
  for (const roleId of roleIds) {
    const role = rolesById[roleId] || defaultRolesById[roleId];
    if (!role?.permissions) continue;
    Object.assign(merged, role.permissions);
  }
  return merged;
}

export function getDefaultRolePermissions(roleId) {
  return { ...(defaultRolesById[roleId]?.permissions || {}) };
}

export function isPlatformCreatorUser(membership = {}, permissions = {}) {
  return Boolean(
    membership?.isPlatformCreator ||
    membership?.role === "creator" ||
    permissions?.isPlatformCreator ||
    permissions?.manageDepartments
  );
}

export function hasPermission(permissions = {}, permissionKey) {
  if (!permissionKey) return true;
  return Boolean(permissions[permissionKey]);
}

export function canAccessSystemAdmin(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    permissions?.isPlatformCreator ||
    hasPermission(permissions, "manageUsers") ||
    hasPermission(permissions, "manageSystemSettings") ||
    hasPermission(permissions, "manageDepartments")
  );
}

export function canEditApparatus(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    permissions?.isPlatformCreator ||
    hasPermission(permissions, "editApparatus") ||
    canAccessSystemAdmin(permissions, isCreator)
  );
}

export function canEditAssets(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    permissions?.isPlatformCreator ||
    hasPermission(permissions, "editAssets") ||
    canAccessSystemAdmin(permissions, isCreator)
  );
}

export function canEditPersonnel(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    permissions?.isPlatformCreator ||
    hasPermission(permissions, "editPersonnel") ||
    canAccessSystemAdmin(permissions, isCreator)
  );
}

export function canEditScheduleRoster(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    permissions?.isPlatformCreator ||
    hasPermission(permissions, "editSchedule") ||
    hasPermission(permissions, "manageSystemSettings") ||
    hasPermission(permissions, "editPersonnel")
  );
}

export function canViewPersonnelPrivateInfo(permissions = {}, isCreator = false) {
  return canEditPersonnel(permissions, isCreator);
}

export function canAccessNavItem(itemName, permissions = {}, options = {}) {
  if (itemName === "System Admin") {
    return canAccessSystemAdmin(permissions, options.isCreator);
  }
  const required = navPermissionMap[itemName];
  if (!required) return true;
  if (hasPermission(permissions, required)) return true;
  // Backward compatible: existing roles with viewInspections unlock the new shell.
  if (
    required === "viewInspectionDashboard"
    && hasPermission(permissions, "viewInspections")
  ) {
    return true;
  }
  if (
    required === "manageInspectionConfig"
    && (
      hasPermission(permissions, "manageSystemSettings")
      || hasPermission(permissions, "editInspections")
    )
  ) {
    return true;
  }
  if (
    required === "viewViolations"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "editViolations")
    )
  ) {
    return true;
  }
  if (
    (required === "viewPreplans" || required === "createPreplans")
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "editInspections")
      || hasPermission(permissions, "viewPreplans")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionNotices"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewViolations")
      || hasPermission(permissions, "editInspectionNotices")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionEnforcement"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewViolations")
      || hasPermission(permissions, "editInspectionEnforcement")
    )
  ) {
    return true;
  }
  if (
    required === "viewFireProtectionSystems"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "editFireProtectionSystems")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionFees"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "editInspectionFees")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionReports"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewInspectionDashboard")
      || hasPermission(permissions, "editInspectionReports")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionOffline"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "conductInspections")
      || hasPermission(permissions, "manageInspectionOffline")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionAutomation"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "manageInspectionConfig")
      || hasPermission(permissions, "manageInspectionAutomation")
    )
  ) {
    return true;
  }
  if (
    required === "viewInspectionHardening"
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "manageInspectionConfig")
      || hasPermission(permissions, "manageInspectionHardening")
    )
  ) {
    return true;
  }
  if (
    (required === "viewHydrants" || required === "viewHydrantDamageReports" || required === "viewWaterCompanies" || required === "viewWaterDistricts")
    && (
      hasPermission(permissions, "viewInspections")
      || hasPermission(permissions, "viewHydrants")
      || hasPermission(permissions, "viewHydrantDamageReports")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetDashboard"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetReadiness"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetDashboard")
      || hasPermission(permissions, "viewFleetAssets")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetDefects"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetReadiness")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetDefects")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetWorkOrders"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetDefects")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetWorkOrders")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetPm"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetPm")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetTests"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetPm")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetTests")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetFuel"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetTelematics")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetFuel")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetTelematics"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetFuel")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetTelematics")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetComponents"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "editFleetComponents")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetOperations"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "viewFleetComponents")
      || hasPermission(permissions, "editFleetOperations")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetRisk"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetOperations")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetRisk")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetProcurement"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "manageFleetConfig")
      || hasPermission(permissions, "editFleetProcurement")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetCost"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "viewFleetProcurement")
      || hasPermission(permissions, "editFleetCost")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetReporting"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "viewFleetDashboard")
      || hasPermission(permissions, "editFleetReporting")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetVendorPortal"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetWorkOrders")
      || hasPermission(permissions, "viewFleetAssets")
      || hasPermission(permissions, "editFleetVendorPortal")
    )
  ) {
    return true;
  }
  if (
    required === "viewFleetAssets"
    && (
      hasPermission(permissions, "viewApparatus")
      || hasPermission(permissions, "viewFleetDashboard")
    )
  ) {
    return true;
  }
  if (
    required === "manageFleetConfig"
    && (
      hasPermission(permissions, "manageSystemSettings")
      || hasPermission(permissions, "editApparatus")
      || hasPermission(permissions, "editFleetAssets")
    )
  ) {
    return true;
  }
  return false;
}

export function filterNavGroups(navGroups, permissions = {}, options = {}) {
  return filterNavGroupsTree(navGroups, canAccessNavItem, permissions, options);
}

export function canAccessAdminRms(permissions = {}, isCreator = false) {
  return Boolean(
    isCreator ||
    hasPermission(permissions, "accessAdminRms") ||
    hasPermission(permissions, "manageUsers") ||
    hasPermission(permissions, "manageSystemSettings")
  );
}

export function canAccessEmployeePortal(permissions = {}) {
  return hasPermission(permissions, "accessEmployeePortal");
}

export function canManageBranchSubscription(isCreator = false) {
  return Boolean(isCreator);
}

export function canManagePlatformSecrets(permissions = {}, isCreator = false, membership = {}) {
  return Boolean(
    isCreator
    || membership?.isPlatformCreator
    || membership?.role === "creator"
    || permissions?.isPlatformCreator
    || permissions?.manageDepartments
  );
}

export function canViewBranchSubscription(permissions = {}, isCreator = false) {
  return canManageBranchSubscription(isCreator) || canAccessSystemAdmin(permissions, isCreator);
}

export function canEditNerisReports(permissions = {}, isCreator = false) {
  return Boolean(isCreator || hasPermission(permissions, "editNerisReports"));
}
