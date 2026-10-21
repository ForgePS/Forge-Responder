import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  DEPARTMENT_CODE_LIBRARY_ACCESS_COLLECTION,
  IFC_2024_PUBLICATION_ID,
} from "./paths.js";
import { normalizeLibraryAccess, nowIso } from "./types.js";

export async function getDepartmentCodeLibraryAccess(departmentId) {
  if (!departmentId) {
    return normalizeLibraryAccess({ moduleEnabled: false, enabledPublicationIds: [] }, "");
  }
  const db = getFirestoreDb();
  if (!db) {
    return normalizeLibraryAccess({ moduleEnabled: false, enabledPublicationIds: [] }, departmentId);
  }
  const snap = await getDoc(doc(db, DEPARTMENT_CODE_LIBRARY_ACCESS_COLLECTION, departmentId));
  if (!snap.exists()) {
    return normalizeLibraryAccess(
      {
        id: departmentId,
        departmentId,
        moduleEnabled: false,
        enabledPublicationIds: [],
      },
      departmentId,
    );
  }
  return normalizeLibraryAccess({ id: snap.id, ...snap.data() }, departmentId);
}

export async function saveDepartmentCodeLibraryAccess(departmentId, input, actorUid = "") {
  if (!departmentId) throw new Error("departmentId is required.");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available.");
  const stamp = nowIso();
  const payload = normalizeLibraryAccess(
    {
      ...input,
      id: departmentId,
      departmentId,
      updatedAt: stamp,
      updatedBy: actorUid,
    },
    departmentId,
  );
  await setDoc(doc(db, DEPARTMENT_CODE_LIBRARY_ACCESS_COLLECTION, departmentId), payload, { merge: true });
  return payload;
}

export async function isCodeLibraryEnabledForDepartment(departmentId) {
  const access = await getDepartmentCodeLibraryAccess(departmentId);
  return Boolean(access.moduleEnabled && access.enabledPublicationIds.length);
}

export async function enableIfc2024ForDepartment(departmentId, actorUid = "") {
  const access = await getDepartmentCodeLibraryAccess(departmentId);
  const enabled = new Set(access.enabledPublicationIds);
  enabled.add(IFC_2024_PUBLICATION_ID);
  return saveDepartmentCodeLibraryAccess(
    departmentId,
    {
      moduleEnabled: true,
      enabledPublicationIds: [...enabled],
    },
    actorUid,
  );
}

export function canUsePublication(access, publicationId) {
  if (!access?.moduleEnabled) return false;
  return (access.enabledPublicationIds || []).includes(publicationId);
}
