import { defaultRoles } from "../data/defaultRoles.js";
import { createRecord, deleteRecord, listRecords } from "./firestoreService.js";

export const BUILTIN_ROLE_IDS = new Set(defaultRoles.map((role) => role.id));
const BUILTIN_ROLE_ORDER = defaultRoles.map((role) => role.id);

export function isBuiltinRole(roleId = "") {
  return BUILTIN_ROLE_IDS.has(String(roleId || "").trim());
}

export function sortDepartmentRoles(roles = []) {
  return [...roles].sort((left, right) => {
    const leftIndex = BUILTIN_ROLE_ORDER.indexOf(left.id);
    const rightIndex = BUILTIN_ROLE_ORDER.indexOf(right.id);
    if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
    if (leftIndex !== -1) return -1;
    if (rightIndex !== -1) return 1;
    return String(left.name || left.id).localeCompare(String(right.name || right.id), undefined, {
      sensitivity: "base",
    });
  });
}

export function slugifyRoleId(name = "", existingIds = new Set()) {
  let base = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!base) base = "custom_role";

  let candidate = base;
  let counter = 2;
  while (existingIds.has(candidate) || candidate === "creator") {
    candidate = `${base}_${counter}`;
    counter += 1;
  }
  return candidate;
}

function clonePermissions(permissions = {}) {
  return Object.fromEntries(
    Object.entries(permissions).map(([key, value]) => [key, Boolean(value)])
  );
}

function resolveRoleTemplate(existingRoles = [], cloneFromRoleId = "readOnly") {
  const fromExisting = existingRoles.find((role) => role.id === cloneFromRoleId);
  if (fromExisting?.permissions) return fromExisting;
  const fromDefaults = defaultRoles.find((role) => role.id === cloneFromRoleId);
  if (fromDefaults?.permissions) return fromDefaults;
  return defaultRoles.find((role) => role.id === "readOnly") || defaultRoles[0];
}

export async function ensureDefaultRoles(departmentId) {
  let existing = await listRecords(departmentId, "roles");
  const existingIds = new Set(existing.map((item) => item.id));
  const missing = defaultRoles.filter((item) => !existingIds.has(item.id));

  if (!existing.length) {
    await Promise.all(defaultRoles.map((record) => createRecord(departmentId, "roles", record.id, record)));
    return sortDepartmentRoles(await listRecords(departmentId, "roles"));
  }

  if (missing.length) {
    await Promise.all(missing.map((record) => createRecord(departmentId, "roles", record.id, record)));
    existing = await listRecords(departmentId, "roles");
  }

  return sortDepartmentRoles(existing);
}

export async function loadRolesMap(departmentId) {
  const roles = await ensureDefaultRoles(departmentId);
  return Object.fromEntries(roles.map((role) => [role.id, role]));
}

export async function createDepartmentRole(
  departmentId,
  { name, description = "", cloneFromRoleId = "readOnly" } = {}
) {
  const existing = await ensureDefaultRoles(departmentId);
  const existingIds = new Set(existing.map((item) => item.id));
  const roleName = String(name || "").trim();
  if (!roleName) {
    throw new Error("Role name is required");
  }

  const id = slugifyRoleId(roleName, existingIds);
  const template = resolveRoleTemplate(existing, cloneFromRoleId);
  const role = {
    id,
    name: roleName,
    description: String(description || "").trim(),
    permissions: clonePermissions(template?.permissions || {}),
  };

  await createRecord(departmentId, "roles", id, role);
  return role;
}

export async function deleteDepartmentRole(departmentId, roleId) {
  const normalizedRoleId = String(roleId || "").trim();
  if (!normalizedRoleId) return;
  if (isBuiltinRole(normalizedRoleId)) {
    throw new Error("Built-in roles cannot be deleted");
  }

  const users = await listRecords(departmentId, "users");
  const assigned = users.some((user) => {
    const roleIds = Array.isArray(user.roleIds) ? user.roleIds : [];
    return roleIds.includes(normalizedRoleId) || user.role === normalizedRoleId;
  });
  if (assigned) {
    throw new Error("Remove this role from all users before deleting it");
  }

  await deleteRecord(departmentId, "roles", normalizedRoleId);
}

export function roleIsAssignedToUsers(roleId = "", users = []) {
  const normalizedRoleId = String(roleId || "").trim();
  return (Array.isArray(users) ? users : []).some((user) => {
    const roleIds = Array.isArray(user.roleIds) ? user.roleIds : [];
    return roleIds.includes(normalizedRoleId) || user.role === normalizedRoleId;
  });
}
