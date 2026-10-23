import { ADMIN_PERMISSION_KEYS } from "../data/adminRegistry.js";
import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { mergeRolePermissions, normalizeRoleIds } from "./permissions.js";

export function getRoleBasedPermissions(membership = {}, rolesById = {}) {
  const roleIds = normalizeRoleIds(membership);
  if (roleIds.includes("creator")) {
    return { ...CREATOR_PERMISSIONS };
  }
  return mergeRolePermissions(roleIds, rolesById);
}

export function getEffectiveUserPermissions(membership = {}, rolesById = {}) {
  const rolePerms = getRoleBasedPermissions(membership, rolesById);
  const effective = { ...rolePerms };
  const overrides = membership?.permissions || {};

  for (const key of ADMIN_PERMISSION_KEYS) {
    if (typeof overrides[key] === "boolean") {
      effective[key] = overrides[key];
    }
  }

  return effective;
}

export function buildUserPermissionOverrides(rolePerms = {}, effectivePerms = {}) {
  const overrides = {};

  for (const key of ADMIN_PERMISSION_KEYS) {
    const roleValue = Boolean(rolePerms[key]);
    const effectiveValue = Boolean(effectivePerms[key]);
    if (roleValue !== effectiveValue) {
      overrides[key] = effectiveValue;
    }
  }

  return overrides;
}

export function mergeMembershipPermissions(membership = {}, rolesById = {}) {
  const roleIds = normalizeRoleIds(membership);
  if (
    roleIds.includes("creator") ||
    membership?.isPlatformCreator ||
    membership?.role === "creator"
  ) {
    return { ...CREATOR_PERMISSIONS };
  }

  const rolePerms = mergeRolePermissions(roleIds, rolesById);
  const overrides = membership?.permissions;
  if (!overrides || typeof overrides !== "object") {
    return rolePerms;
  }

  const merged = { ...rolePerms };
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === "boolean") {
      merged[key] = value;
    }
  }
  return merged;
}
