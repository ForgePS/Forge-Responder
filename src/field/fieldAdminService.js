/**
 * Server reads and writes for FORGE Field settings, used by the RMS admin page
 * and by the field app's data download.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb, uploadFirebaseFile } from "../lib/firebaseClient.js";
import { createRecord, listRecords, updateRecord } from "../lib/firestoreService.js";
import { buildDepartmentLogoPath, fileExtension } from "../lib/storagePaths.js";
import { sanitizeForFirestore } from "../lib/firestoreSanitize.js";
import { FIELD_APP_SETTINGS_DOC, normalizeFieldAppConfig } from "./fieldAppConfig.js";
import { normalizeCheckoffList } from "./checkoffModel.js";

export const CHECKOFF_LISTS_COLLECTION = "fieldCheckoffLists";
export const CHECKOFFS_COLLECTION = "fieldCheckoffs";
export const PREPLAN_FIELD_UPDATES_COLLECTION = "fieldPlanUpdates";

export async function loadFieldAppConfig(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return normalizeFieldAppConfig(null);
  const snap = await getDoc(doc(db, "departments", departmentId, "settings", FIELD_APP_SETTINGS_DOC));
  return normalizeFieldAppConfig(snap.exists() ? snap.data() : null);
}

export async function saveFieldAppConfig(departmentId, config, actor = {}) {
  const db = getFirestoreDb();
  const payload = sanitizeForFirestore({
    ...normalizeFieldAppConfig(config),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.actorName || actor.actorUid || "",
  });
  await setDoc(doc(db, "departments", departmentId, "settings", FIELD_APP_SETTINGS_DOC), payload);
  return payload;
}

export async function uploadFieldAppLogo(departmentId, file) {
  const path = buildDepartmentLogoPath(departmentId, `field-app-${Date.now()}.${fileExtension(file.name, "png")}`);
  return uploadFirebaseFile(path, file);
}

export async function listCheckoffLists(departmentId) {
  const rows = await listRecords(departmentId, CHECKOFF_LISTS_COLLECTION);
  return rows
    .map(normalizeCheckoffList)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.target.localeCompare(b.target, undefined, { numeric: true }) || a.name.localeCompare(b.name));
}

export async function saveCheckoffList(departmentId, list, actor = {}) {
  const clean = normalizeCheckoffList(list);
  const now = new Date().toISOString();
  return createRecord(departmentId, CHECKOFF_LISTS_COLLECTION, clean.id, {
    ...clean,
    createdAt: clean.createdAt || now,
    updatedBy: actor.actorName || "",
  });
}

export async function archiveCheckoffList(departmentId, listId, actor = {}) {
  return updateRecord(departmentId, CHECKOFF_LISTS_COLLECTION, listId, { active: false, archivedBy: actor.actorName || "" });
}

export async function listRecentCheckoffs(departmentId, limit = 200) {
  const rows = await listRecords(departmentId, CHECKOFFS_COLLECTION);
  return rows.sort((a, b) => String(b.performedAt || "").localeCompare(String(a.performedAt || ""))).slice(0, limit);
}

export async function markCheckoffRestocked(departmentId, checkoffId, actor = {}) {
  return updateRecord(departmentId, CHECKOFFS_COLLECTION, checkoffId, {
    restockedAt: new Date().toISOString(),
    restockedBy: actor.actorName || "",
  });
}

export async function listPreplanFieldUpdates(departmentId) {
  const rows = await listRecords(departmentId, PREPLAN_FIELD_UPDATES_COLLECTION);
  return rows.sort((a, b) => String(b.submittedAt || "").localeCompare(String(a.submittedAt || "")));
}

export async function reviewPreplanFieldUpdate(departmentId, updateId, status, actor = {}, reviewNote = "") {
  return updateRecord(departmentId, PREPLAN_FIELD_UPDATES_COLLECTION, updateId, {
    status,
    reviewNote,
    reviewedAt: new Date().toISOString(),
    reviewedBy: actor.actorName || "",
  });
}
