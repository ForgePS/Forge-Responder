import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { legacyRoleMap } from "../data/defaultRoles.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { DEFAULT_DEPARTMENT_ID, departmentListSegments } from "./tenantPaths.js";
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

async function resolvePersonnelIdByEmail(departmentId, email) {
  if (!email) return "";
  const firestoreDb = getFirestoreDb();
  if (!firestoreDb) return "";

  const snap = await getDoc(doc(firestoreDb, ...departmentListSegments(departmentId, "hlfd-rms-personnel")));
  if (!snap.exists()) return "";

  const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
  const normalizedEmail = email.toLowerCase();
  const match = items.find((person) => String(person.email || "").toLowerCase() === normalizedEmail);
  if (match?.id) return match.id;

  const emailLocal = normalizedEmail.split("@")[0];
  const localMatch = items.find((person) => (
    String(person.email || "").toLowerCase().split("@")[0] === emailLocal
  ));
  return localMatch?.id || "";
}

async function linkMembershipToPersonnel(departmentId, membership) {
  if (membership?.personnelId || !membership?.email) return membership;

  const personnelId = await resolvePersonnelIdByEmail(departmentId, membership.email);
  if (!personnelId) return membership;

  const updated = {
    ...membership,
    personnelId,
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(getFirestoreDb(), "departments", departmentId, "users", membership.uid), updated, { merge: true });
  return updated;
}

export async function ensureMembershipForUser(user, departmentId = DEFAULT_DEPARTMENT_ID) {
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
      const roleId = legacyRoleMap[existing.role] || existing.role || "readOnly";
      nextMembership = { ...existing, roleIds: [roleId], updatedAt: new Date().toISOString() };
      await setDoc(doc(getFirestoreDb(), "departments", departmentId, "users", user.uid), nextMembership, { merge: true });
    }
    return linkMembershipToPersonnel(departmentId, nextMembership);
  }

  let hasUsers = true;
  try {
    hasUsers = await departmentHasUsers(departmentId);
  } catch (error) {
    console.warn("Unable to check department user count", error);
  }
  if (!hasUsers) {
    const created = await createDepartmentMembership(departmentId, user, "department_admin");
    return linkMembershipToPersonnel(departmentId, created);
  }

  return existing;
}

export function membershipInitials(membership, user) {
  const name = membership?.displayName || user?.displayName || user?.email || "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatRoleLabel(role = "", membership = {}) {
  if (membership?.isPlatformCreator || role === "creator") return "Creator";
  const normalizedRole = String(role || "member");
  return normalizedRole
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
