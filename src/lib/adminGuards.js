/**
 * Small checks shared by the System Admin editors.
 */

// Same definition of "department admin" as firestore.rules isDepartmentAdmin().
export const ADMIN_ROLE_IDS = ["fireChief", "itAdmin"];

export function isAdminMembershipRoles(membership = {}) {
  const roleIds = Array.isArray(membership?.roleIds) ? membership.roleIds : [];
  return membership?.role === "department_admin"
    || roleIds.some((id) => ADMIN_ROLE_IDS.includes(id));
}

// Fire Chief and IT Admin always keep these, so a department can't lock itself out of System Admin.
export const LOCKED_ADMIN_PERMISSION_KEYS = ["manageUsers", "manageSystemSettings"];

export function isLockedAdminPermission(roleId, permissionKey) {
  return ADMIN_ROLE_IDS.includes(roleId) && LOCKED_ADMIN_PERMISSION_KEYS.includes(permissionKey);
}

export function withLockedAdminPermissions(roleId, permissions = {}) {
  if (!ADMIN_ROLE_IDS.includes(roleId)) return permissions;
  const next = { ...permissions };
  for (const key of LOCKED_ADMIN_PERMISSION_KEYS) next[key] = true;
  return next;
}

/** Plain-language message for a failed save. */
export function saveErrorMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) {
    return "Save failed: only a Fire Chief or IT Admin can change this. Ask your administrator.";
  }
  if (code.includes("unavailable") || code.includes("network")) {
    return "Save failed: you appear to be offline. Check your connection and try again.";
  }
  return "Save failed. Nothing was changed. Please try again.";
}
