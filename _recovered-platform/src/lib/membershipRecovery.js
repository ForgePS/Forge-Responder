import { doc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { loadDepartmentMembership } from "./departmentMembership.js";
import { ensureCreatorDepartmentAccess, loadPlatformCreator } from "./platformService.js";
import { canAccessAdminRms } from "./permissions.js";
import { mergeRolePermissions, normalizeRoleIds } from "./permissions.js";

const BOOTSTRAP_ADMIN_EMAILS = new Set([
  "jpowell@hornlake.org"
]);

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

export function canSelfRestoreMembership(user = {}, membership = {}) {
  const email = normalizeEmail(user.email || membership.email);
  if (BOOTSTRAP_ADMIN_EMAILS.has(email)) return true;
  if (membership.isPlatformCreator) return true;
  if (membership.role === "creator" || membership.role === "department_admin") return true;

  const roleIds = normalizeRoleIds(membership);
  return roleIds.includes("creator") || roleIds.includes("fireChief");
}

function buildRestoredMembership(user, existing = {}, departmentId) {
  const wasCreator = Boolean(
    existing.isPlatformCreator ||
    existing.role === "creator" ||
    normalizeRoleIds(existing).includes("creator")
  );

  return {
    uid: user.uid,
    email: user.email || existing.email || "",
    displayName: user.displayName || existing.displayName || user.email?.split("@")[0] || "Admin",
    role: wasCreator ? "creator" : "department_admin",
    roleIds: wasCreator ? ["creator"] : ["fireChief"],
    status: "active",
    departmentId,
    isPlatformCreator: wasCreator,
    updatedAt: new Date().toISOString()
  };
}

export async function recoverMembershipAccess(user, departmentId) {
  const db = getFirestoreDb();
  if (!db || !user?.uid || !departmentId) return null;

  const creator = await loadPlatformCreator(user.uid);
  if (String(creator?.status || "").toLowerCase() === "active") {
    return ensureCreatorDepartmentAccess(user, departmentId);
  }

  const existing = await loadDepartmentMembership(departmentId, user.uid);
  if (!existing || !canSelfRestoreMembership(user, existing)) return null;

  const payload = buildRestoredMembership(user, existing, departmentId);
  if (!existing.createdAt) {
    payload.createdAt = new Date().toISOString();
  }

  await setDoc(doc(db, "departments", departmentId, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}

export function membershipNeedsAdminRecovery(user, membership, rolesById = {}, isCreator = false) {
  if (!membership || membership.status !== "active") return Boolean(user?.uid);
  if (isCreator || canAccessAdminRms(mergeRolePermissions(normalizeRoleIds(membership), rolesById), isCreator)) {
    return false;
  }
  return canSelfRestoreMembership(user, membership);
}
