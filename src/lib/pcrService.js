/**
 * RMS reads and actions on patient care reports (departments/{id}/pcrs) and EMS agency settings.
 *
 * PHI: reports hold patient data. Nothing here logs report contents; audit entries name the report number only.
 * Access is enforced by firestore.rules (crew on the report, or viewAllPcrs / unlockPcrs / exportPcrs) and, for
 * the NEMSIS check, by the checkPcr callable.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions, getFirestoreDb } from "./firebaseClient.js";
import { getRecord, listRecentRecords, updateRecord } from "./firestoreService.js";
import { writeAuditLog } from "./auditService.js";
import { EMS_SETTINGS_DOC, normalizeEmsSettings } from "./nemsis/emsSettings.js";

export const PCR_COLLECTION = "pcrs";
const AUDIT_MODULE = "EMS";

export async function loadEmsSettings(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return normalizeEmsSettings(null);
  const snap = await getDoc(doc(db, "departments", departmentId, "settings", EMS_SETTINGS_DOC));
  return normalizeEmsSettings(snap.exists() ? snap.data() : null);
}

export async function saveEmsSettings(departmentId, settings, actor = {}) {
  const db = getFirestoreDb();
  const payload = {
    ...normalizeEmsSettings(settings),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.actorName || actor.actorUid || "",
  };
  await setDoc(doc(db, "departments", departmentId, "settings", EMS_SETTINGS_DOC), payload);
  await writeAuditLog(departmentId, { ...actor, action: "ems.settings", module: AUDIT_MODULE, summary: "Updated EMS agency settings" });
  return payload;
}

/**
 * Newest reports this person may read: every report with a read-all permission, otherwise the ones they crewed
 * (the rules reject a query that could return reports they can't read).
 */
export async function listPcrs(departmentId, { uid, readAll }) {
  const filters = readAll ? [] : [["crewUids", "array-contains", uid]];
  return listRecentRecords(departmentId, PCR_COLLECTION, "updatedAt", 300, filters);
}

export async function getPcr(departmentId, pcrId, actor = {}) {
  const pcr = await getRecord(departmentId, PCR_COLLECTION, pcrId);
  if (pcr) {
    await writeAuditLog(departmentId, { ...actor, action: "pcr.view", module: AUDIT_MODULE, recordId: pcrId, summary: `Viewed patient care report ${pcr.number || pcrId}` });
  }
  return pcr;
}

/** Re-open a posted report for changes (unlockPcrs). */
export async function unlockPcr(departmentId, pcr, actor = {}, reason = "") {
  const now = new Date().toISOString();
  const patch = { status: "draft", unlockedAt: now, unlockedBy: actor.actorName || actor.actorUid || "", unlockReason: reason, id: pcr.id };
  await updateRecord(departmentId, PCR_COLLECTION, pcr.id, patch);
  await writeAuditLog(departmentId, {
    ...actor,
    action: "pcr.unlock",
    module: AUDIT_MODULE,
    recordId: pcr.id,
    summary: `Unlocked patient care report ${pcr.number || pcr.id}${reason ? `: ${reason}` : ""}`,
  });
  return { ...pcr, ...patch };
}

export async function recordPcrExport(departmentId, pcr, actor = {}) {
  await writeAuditLog(departmentId, { ...actor, action: "pcr.export", module: AUDIT_MODULE, recordId: pcr.id, summary: `Exported NEMSIS XML for patient care report ${pcr.number || pcr.id}` });
}

export async function recordPcrPrint(departmentId, pcr, actor = {}) {
  await writeAuditLog(departmentId, { ...actor, action: "pcr.print", module: AUDIT_MODULE, recordId: pcr.id, summary: `Printed patient care report ${pcr.number || pcr.id}` });
}

/** Server-side NEMSIS check (XSD-level checks + national and state Schematron). */
export async function checkPcrOnServer(departmentId, pcrId) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, "checkPcr", { timeout: 130000 })({ departmentId, pcrId });
  return result.data || {};
}
