import { getFirestoreDb } from "./firebaseClient.js";
import { restoreItemsFromFirestore } from "./firestoreSanitize.js";
import { listRecords } from "./firestoreService.js";
import { readTenantList } from "./tenantListStore.js";

export const PERSONNEL_LIST_KEY = "hlfd-rms-personnel";

export function resolvePersonnelRecordId(person = {}) {
  return String(person.id || person.agencyPersonnelId || "").trim();
}

export async function listDepartmentPersonnel(departmentId) {
  if (!departmentId) return [];

  const db = getFirestoreDb();
  if (!db) return [];

  try {
    const list = await readTenantList(db, departmentId, PERSONNEL_LIST_KEY);
    if (list.exists) {
      return restoreItemsFromFirestore(list.items, PERSONNEL_LIST_KEY);
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
