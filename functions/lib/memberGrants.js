/**
 * What each member may do, kept by the server so the Firestore rules can check it.
 *
 *   departments/<id>/memberGrants/<uid> = { permissions: { editPersonnel: true, ... },
 *                                           roleIds, computedAt }
 *
 * Same result as the app's mergeMembershipPermissions (src/lib/userPermissions.js):
 * the member's roles (department role records, with built-in defaults filling any
 * missing keys), then the member's own on/off overrides. Only true keys are stored.
 * Inactive or removed members get no grant record. Only Cloud Functions write it.
 */
const DEFAULT_ROLE_PERMISSIONS = require("./defaultRolePermissions.json");

const LEGACY_ROLE_MAP = {
  creator: "creator",
  platform_creator: "creator",
  department_admin: "fireChief",
  system_owner: "fireChief",
  fire_chief: "fireChief",
  read_only: "readOnly",
  firefighter: "firefighter",
};

function parseRoleIds(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
    return [value.trim()];
  }
  return [];
}

/** Same as normalizeRoleIds in src/lib/permissions.js. */
function normalizeRoleIds(membership = {}) {
  const roleIds = parseRoleIds(membership.roleIds);
  if (roleIds.length) return roleIds;
  if (membership.role) return [LEGACY_ROLE_MAP[membership.role] || membership.role];
  return [];
}

/** A department role record with built-in defaults filling missing keys. */
function rolePermissions(roleId, storedRolesById = {}) {
  const defaults = DEFAULT_ROLE_PERMISSIONS[roleId] || null;
  const stored = storedRolesById[roleId]?.permissions;
  if (!stored && !defaults) return {};
  return { ...(defaults || {}), ...(stored || {}) };
}

/**
 * @param {object} membership departments/<id>/users/<uid>
 * @param {Record<string, {permissions?: object}>} storedRolesById departments/<id>/roles
 * @returns {Record<string, true>}
 */
function computeMemberPermissions(membership = {}, storedRolesById = {}) {
  const roleIds = normalizeRoleIds(membership);
  let merged;
  if (roleIds.includes("creator") || membership.isPlatformCreator === true || membership.role === "creator") {
    merged = { ...DEFAULT_ROLE_PERMISSIONS.creator };
  } else {
    merged = {};
    for (const roleId of roleIds) Object.assign(merged, rolePermissions(roleId, storedRolesById));
    const overrides = membership.permissions;
    if (overrides && typeof overrides === "object") {
      for (const [key, value] of Object.entries(overrides)) {
        if (typeof value === "boolean") merged[key] = value;
      }
    }
  }
  const out = {};
  for (const key of Object.keys(merged).sort()) {
    if (merged[key] === true) out[key] = true;
  }
  return out;
}

function samePermissions(a = {}, b = {}) {
  const left = Object.keys(a || {}).filter((k) => a[k] === true).sort();
  const right = Object.keys(b || {}).filter((k) => b[k] === true).sort();
  return left.length === right.length && left.every((key, i) => key === right[i]);
}

async function loadRoles(db, departmentId) {
  const snap = await db.collection("departments").doc(departmentId).collection("roles").get();
  return Object.fromEntries(snap.docs.map((doc) => [doc.id, doc.data() || {}]));
}

/**
 * Bring one member's grant record up to date. Returns "written" | "removed" | "unchanged".
 */
async function refreshMember(db, departmentId, uid, { roles = null, dryRun = false } = {}) {
  const deptRef = db.collection("departments").doc(departmentId);
  const grantRef = deptRef.collection("memberGrants").doc(uid);
  const [memberSnap, grantSnap] = await Promise.all([
    deptRef.collection("users").doc(uid).get(),
    grantRef.get(),
  ]);
  const membership = memberSnap.exists ? memberSnap.data() || {} : null;
  if (!membership || membership.status !== "active") {
    if (!grantSnap.exists) return "unchanged";
    if (!dryRun) await grantRef.delete();
    return "removed";
  }
  const permissions = computeMemberPermissions(membership, roles || await loadRoles(db, departmentId));
  if (grantSnap.exists && samePermissions(grantSnap.data()?.permissions, permissions)) return "unchanged";
  if (!dryRun) {
    await grantRef.set({
      uid,
      permissions,
      roleIds: normalizeRoleIds(membership),
      computedAt: new Date().toISOString(),
    });
  }
  return "written";
}

/** Every member of a department (after a role record changes, or for a backfill). */
async function refreshDepartment(db, departmentId, { dryRun = false } = {}) {
  const deptRef = db.collection("departments").doc(departmentId);
  const roles = await loadRoles(db, departmentId);
  const [members, grants] = await Promise.all([
    deptRef.collection("users").listDocuments(),
    deptRef.collection("memberGrants").listDocuments(),
  ]);
  const uids = new Set([...members.map((ref) => ref.id), ...grants.map((ref) => ref.id)]);
  const counts = { written: 0, removed: 0, unchanged: 0 };
  for (const uid of uids) {
    const result = await refreshMember(db, departmentId, uid, { roles, dryRun });
    counts[result] += 1;
  }
  return counts;
}

/** Did a role record's permissions change (create/delete count as changed)? */
function rolePermissionsChanged(before, after) {
  if (!before || !after) return true;
  return !samePermissions(before.permissions, after.permissions);
}

module.exports = {
  computeMemberPermissions,
  normalizeRoleIds,
  refreshMember,
  refreshDepartment,
  rolePermissionsChanged,
  samePermissions,
};
