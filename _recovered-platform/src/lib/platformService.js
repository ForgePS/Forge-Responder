import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { defaultDepartmentProfile, defaultDepartmentSettings } from "../data/defaultDepartment.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { DEFAULT_DEPARTMENT_ID } from "./tenantPaths.js";
import { ensureDefaultRoles } from "./roleService.js";

export async function loadPlatformCreator(uid) {
  const db = getFirestoreDb();
  if (!db || !uid) return null;
  const snap = await getDoc(doc(db, "platformCreators", uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function listPlatformDepartments() {
  const db = getFirestoreDb();
  if (!db) return [];

  const snap = await getDocs(collection(db, "platformDepartments"));
  const departments = snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((item) => item.status !== "disabled")
    .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

  if (departments.length) return departments;

  return [{
    id: DEFAULT_DEPARTMENT_ID,
    name: defaultDepartmentProfile.name,
    shortName: defaultDepartmentProfile.shortName,
    status: "active"
  }];
}

export async function ensureDepartmentRegistry(departmentId, profile = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;

  const payload = {
    id: departmentId,
    name: profile.name || departmentId,
    shortName: profile.shortName || departmentId,
    status: profile.status || "active",
    updatedAt: new Date().toISOString()
  };

  await setDoc(doc(db, "platformDepartments", departmentId), payload, { merge: true });
  return payload;
}

export async function ensureCreatorDepartmentAccess(user, departmentId) {
  const db = getFirestoreDb();
  if (!db || !user?.uid || !departmentId) return null;

  await ensureDefaultRoles(departmentId);
  await ensureDepartmentRegistry(departmentId, defaultDepartmentProfile);

  const now = new Date().toISOString();
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "Creator",
    role: "creator",
    roleIds: ["creator"],
    status: "active",
    departmentId,
    isPlatformCreator: true,
    updatedAt: now
  };

  const existing = await getDoc(doc(db, "departments", departmentId, "users", user.uid));
  if (!existing.exists()) {
    payload.createdAt = now;
  }

  await setDoc(doc(db, "departments", departmentId, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}

export async function registerPlatformDepartment(departmentId, profile = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;

  const now = new Date().toISOString();
  const departmentProfile = {
    ...defaultDepartmentProfile,
    ...profile,
    id: departmentId,
    status: profile.status || "active"
  };

  await setDoc(doc(db, "departments", departmentId, "profile", "main"), departmentProfile, { merge: true });
  await setDoc(
    doc(db, "departments", departmentId, "settings", "main"),
    { ...defaultDepartmentSettings, departmentId, updatedAt: now },
    { merge: true }
  );
  await ensureDefaultRoles(departmentId);
  await ensureDepartmentRegistry(departmentId, departmentProfile);

  return departmentProfile;
}
