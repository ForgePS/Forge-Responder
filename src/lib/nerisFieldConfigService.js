import { doc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { normalizeNerisFieldConfig } from "./neris/fieldConfig.js";

/**
 * @param {Record<string, Record<string, unknown>>} fieldConfig
 * @param {Record<string, unknown>} existingSettings
 */
export async function saveNerisFieldConfig(departmentId, fieldConfig, existingSettings = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Department is required to save NERIS field settings.");
  }

  const normalized = normalizeNerisFieldConfig(fieldConfig);
  const payload = {
    ...existingSettings,
    departmentId,
    nerisFieldConfig: normalized,
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  return normalized;
}
