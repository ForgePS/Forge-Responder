import { legacyRoleMap } from "../data/defaultRoles.js";

const navPermissionMap = {
  Dashboard: "accessAdminRms",
  Personnel: "viewPersonnel",
  Certifications: "viewCertifications",
  Training: "viewTraining",
  Scheduling: "viewSchedule",
  "Shift Trades": "viewSchedule",
  Apparatus: "viewApparatus",
  Assets: "viewAssets",
  Maintenance: "viewApparatus",
  "Hose Testing": "viewApparatus",
  Occupancies: "viewInspections",
  Inspections: "viewInspections",
  Preplans: "viewInspections",
  Hydrants: "viewInspections",
  "SOGs / Policies": "viewDocuments",
  "EMS Protocols": "viewDocuments",
  Forms: "viewDocuments",
  Uploads: "viewDocuments",
  Analytics: "accessAdminRms",
  Administration: "manageUsers"
};

export function normalizeRoleIds(userRecord = {}) {
  if (Array.isArray(userRecord.roleIds) && userRecord.roleIds.length) {
    return userRecord.roleIds;
  }
  if (userRecord.role) {
    return [legacyRoleMap[userRecord.role] || userRecord.role];
  }
  return [];
}

export function mergeRolePermissions(roleIds = [], rolesById = {}) {
  const merged = {};
  for (const roleId of roleIds) {
    const role = rolesById[roleId];
    if (!role?.permissions) continue;
    Object.assign(merged, role.permissions);
  }
  return merged;
}

export function hasPermission(permissions = {}, permissionKey) {
  if (!permissionKey) return true;
  return Boolean(permissions[permissionKey]);
}

export function canAccessNavItem(itemName, permissions = {}) {
  const required = navPermissionMap[itemName];
  if (!required) return true;
  return hasPermission(permissions, required);
}

export function filterNavGroups(navGroups, permissions = {}) {
  return navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(([name]) => canAccessNavItem(name, permissions))
    }))
    .filter((group) => group.items.length > 0);
}

export function canAccessAdminRms(permissions = {}) {
  return hasPermission(permissions, "accessAdminRms") || hasPermission(permissions, "manageUsers");
}

export function canAccessEmployeePortal(permissions = {}) {
  return hasPermission(permissions, "accessEmployeePortal");
}
