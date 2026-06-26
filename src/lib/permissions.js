import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { defaultRoles, legacyRoleMap } from "../data/defaultRoles.js";

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
  Occupancies: "viewInspections",
  Inspections: "viewInspections",
  Preplans: "viewInspections",
  Hydrants: "viewInspections",
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
  return hasPermission(permissions, required);
}

export function filterNavGroups(navGroups, permissions = {}, options = {}) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => canAccessNavItem(name, permissions, options))
    }))
    .filter((group) => group.items.length > 0);
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
