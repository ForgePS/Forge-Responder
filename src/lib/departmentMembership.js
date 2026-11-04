import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { legacyRoleMap } from "../data/defaultRoles.js";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions, getFirestoreDb } from "./firebaseClient.js";
import { isPlatformScope } from "./tenantPaths.js";
import { ensureDefaultRoles } from "./roleService.js";
import { isPlatformBootstrapEmail } from "./platformBootstrap.js";
import { ensureCreatorDepartmentAccess, loadPlatformCreator } from "./platformService.js";

export async function loadDepartmentMembership(departmentId, uid) {
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb || !departmentId || !uid) return null;

  const snap = await getDoc(doc(firestoreDb, "departments", departmentId, "users", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function departmentHasUsers(departmentId) {
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb || !departmentId) return false;
  const snap = await getDocs(collection(firestoreDb, "departments", departmentId, "users"));
  return !snap.empty;
}

export async function createDepartmentMembership(departmentId, user, role = "read_only") {
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb || !departmentId || !user?.uid) return null;

  const now = new Date().toISOString();
  const roleId = legacyRoleMap[role] || role;
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "User",
    role,
    roleIds: [roleId],
    personnelId: "",
    assignedShift: "",
    assignedStation: "",
    status: "active",
    departmentId,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(firestoreDb, "departments", departmentId, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}

// The server links a member to their personnel record by their verified email
// (exact match). Members can't write personnelId themselves (firestore.rules).
async function linkMembershipToPersonnel(departmentId, membership) {
  if (membership?.personnelId || !membership?.email) return membership;
  const functions = getFirebaseFunctions();
  if (!functions) return membership;
  try {
    const result = await httpsCallable(functions, "linkMyPersonnelRecord")({ departmentId });
    const personnelId = result.data?.personnelId || "";
    if (!result.data?.linked || !personnelId) return membership;
    return { ...membership, personnelId, updatedAt: new Date().toISOString() };
  } catch (error) {
    console.warn("Could not link membership to personnel record", error);
    return membership;
  }
}

export async function ensureMembershipForUser(user, departmentId) {
  // No department selected (platform scope): nothing to join.
  if (!departmentId || isPlatformScope(departmentId)) return null;
  const creator = await loadPlatformCreator(user.uid);
  if (creator?.status === "active") {
    return ensureCreatorDepartmentAccess(user, departmentId);
  }

  if (isPlatformBootstrapEmail(user?.email)) {
    const { recoverMembershipAccess } = await import("./membershipRecovery.js");
    const bootstrapped = await recoverMembershipAccess(user, departmentId);
    if (bootstrapped?.status === "active") {
      return linkMembershipToPersonnel(departmentId, bootstrapped);
    }
  }

  try {
    await ensureDefaultRoles(departmentId);
  } catch (error) {
    console.warn("Skipped role seed while resolving membership", error);
  }

  const existing = await loadDepartmentMembership(departmentId, user.uid);
  if (existing?.status === "active") {
    let nextMembership = existing;
    if (!existing.roleIds?.length) {
      // Derive roleIds from the legacy role in memory. Users may not write their own
      // roleIds (firestore.rules); an admin or the back-fill script persists them.
      const roleId = legacyRoleMap[existing.role] || existing.role || "readOnly";
      nextMembership = { ...existing, roleIds: [roleId] };
    }
    return linkMembershipToPersonnel(departmentId, nextMembership);
  }

  // No self-service membership: the first admin is created when the department is
  // provisioned, and other users are added by a department admin.
  return existing;
}

export function membershipInitials(membership, user) {
  const name = membership?.displayName || user?.displayName || user?.email || "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export { formatRoleLabel } from "./roleLabels.js";
