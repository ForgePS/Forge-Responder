import { doc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { loadDepartmentMembership } from "./departmentMembership.js";
import { ensureCreatorDepartmentAccess, loadPlatformCreator } from "./platformService.js";
import { ensureDefaultRoles } from "./roleService.js";
import { canAccessAdminRms, normalizeRoleIds } from "./permissions.js";
import { mergeMembershipPermissions } from "./userPermissions.js";
import { isPlatformBootstrapEmail } from "./platformBootstrap.js";
import { DEFAULT_DEPARTMENT_ID, isPlatformScope } from "./tenantPaths.js";

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

export function canSelfRestoreMembership(user, membership) {
  const safeUser = user || {};
  const safeMembership = membership || {};
  const email = normalizeEmail(safeUser.email || safeMembership.email);
  if (isPlatformBootstrapEmail(email)) return true;
  if (safeMembership.isPlatformCreator) return true;
  if (safeMembership.role === "creator" || safeMembership.role === "department_admin") return true;

  const roleIds = normalizeRoleIds(safeMembership);
  return roleIds.includes("creator") || roleIds.includes("fireChief");
}

function buildRestoredMembership(user, existing = {}, departmentId) {
  const wasCreator = Boolean(
    existing.isPlatformCreator ||
    existing.role === "creator" ||
    normalizeRoleIds(existing).includes("creator") ||
    isPlatformBootstrapEmail(user?.email)
  );

  return {
    uid: user.uid,
    email: user.email || existing.email || "",
    displayName: user.displayName || existing.displayName || user.email?.split("@")[0] || "Admin",
    role: wasCreator ? "creator" : "department_admin",
    roleIds: wasCreator ? ["creator"] : ["fireChief"],
    status: "active",
    departmentId,
    personnelId: existing.personnelId || "",
    assignedShift: existing.assignedShift || "",
    isPlatformCreator: wasCreator || existing.isPlatformCreator || false,
    updatedAt: new Date().toISOString()
  };
}

export async function recoverMembershipAccess(user, departmentId) {
  const db = getFirestoreDb();
  if (!db || !user?.uid || !departmentId) return null;

  const membershipDepartmentId = isPlatformScope(departmentId) ? DEFAULT_DEPARTMENT_ID : departmentId;

  const creator = await loadPlatformCreator(user.uid);
  if (String(creator?.status || "").toLowerCase() === "active") {
    return ensureCreatorDepartmentAccess(user, membershipDepartmentId);
  }

  const existing = (await loadDepartmentMembership(membershipDepartmentId, user.uid)) || {};
  if (!canSelfRestoreMembership(user, existing)) return null;

  try {
    await ensureDefaultRoles(membershipDepartmentId);
  } catch (error) {
    console.warn("Skipped role seed during membership recovery", error);
  }

  const payload = buildRestoredMembership(user, existing, membershipDepartmentId);
  if (!existing.createdAt) {
    payload.createdAt = new Date().toISOString();
  }

  await setDoc(doc(db, "departments", membershipDepartmentId, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}

export function resolveMembershipDepartmentId(departmentId) {
  return isPlatformScope(departmentId) ? DEFAULT_DEPARTMENT_ID : departmentId;
}

export async function bootstrapPlatformAccess(user, departmentId = DEFAULT_DEPARTMENT_ID) {
  if (!user?.uid || !isPlatformBootstrapEmail(user?.email)) return null;
  return recoverMembershipAccess(user, departmentId);
}

export function membershipNeedsAdminRecovery(user, membership, rolesById = {}, isCreator = false) {
  const safeUser = user || {};
  if (!safeUser.uid) return false;
  if (isCreator) return false;

  const safeMembership = membership || {};

  if (!membership || membership.status !== "active") {
    return canSelfRestoreMembership(safeUser, safeMembership);
  }

  if (canAccessAdminRms(mergeMembershipPermissions(membership, rolesById), isCreator)) {
    return false;
  }

  return canSelfRestoreMembership(safeUser, safeMembership);
}
