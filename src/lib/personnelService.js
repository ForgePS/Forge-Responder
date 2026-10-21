import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { restoreItemsFromFirestore } from "./firestoreSanitize.js";
import { listRecords } from "./firestoreService.js";
import { departmentListSegments } from "./tenantPaths.js";

export const PERSONNEL_LIST_KEY = "hlfd-rms-personnel";

export function resolvePersonnelRecordId(person = {}) {
  return String(person.id || person.agencyPersonnelId || "").trim();
}

export async function listDepartmentPersonnel(departmentId) {
  if (!departmentId) return [];

  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const snap = await getDoc(doc(db, ...departmentListSegments(departmentId, PERSONNEL_LIST_KEY)));
    if (snap.exists()) {
      const items = Array.isArray(snap.data()?.items) ? snap.data().items : [];
      return restoreItemsFromFirestore(items, PERSONNEL_LIST_KEY);
    }
  } catch (error) {
    console.error("Failed to load department personnel list", error);
  }

  try {
    const records = await listRecords(departmentId, "personnel");
    if (records.length) {
      return restoreItemsFromFirestore(records, PERSONNEL_LIST_KEY);
    }
  } catch (error) {
    console.error("Failed to load personnel subcollection", error);
  }

  return [];
}
