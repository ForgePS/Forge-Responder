import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { DEFAULT_DEPARTMENT_ID } from "./tenantPaths.js";

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
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "User",
    role,
    status: "active",
    departmentId,
    createdAt: now,
    updatedAt: now
  };

  await setDoc(doc(firestoreDb, "departments", departmentId, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}

export async function ensureMembershipForUser(user, departmentId = DEFAULT_DEPARTMENT_ID) {
  const existing = await loadDepartmentMembership(departmentId, user.uid);
  if (existing?.status === "active") return existing;

  const hasUsers = await departmentHasUsers(departmentId);
  if (!hasUsers) {
    return createDepartmentMembership(departmentId, user, "department_admin");
  }

  return existing;
}

export function membershipInitials(membership, user) {
  const name = membership?.displayName || user?.displayName || user?.email || "U";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatRoleLabel(role = "") {
  return role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
