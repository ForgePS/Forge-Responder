/**
 * Offline preplan packages, the server side: the department's settings and the
 * register of devices holding packages (`preplanOfflineDevices`), so preplan
 * managers can see what's out on devices and revoke a device.
 *
 * Revocation reaches a device the next time it is online and signed in; a
 * device that stays offline keeps its copy until then (it still expires on
 * its own). That limit is shown wherever revocation is offered.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, getRecord, listRecords, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import { PREPLAN_OFFLINE_DEVICES_COLLECTION } from "../inspections/paths.js";
import { deviceSummary, normalizeOfflineSettings } from "./offlinePackageModel.js";

const PREPLAN_SETTINGS_COLLECTION = "preplanSettings";
const SETTINGS_ID = "offline";

export async function getOfflineSettings(departmentId) {
  const stored = await getRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, SETTINGS_ID).catch(() => null);
  return { settings: normalizeOfflineSettings(stored), saved: Boolean(stored), updatedAt: stored?.updatedAt || "", updatedByName: stored?.updatedByName || "" };
}

export async function saveOfflineSettings(departmentId, settings, actor = {}) {
  const next = normalizeOfflineSettings(settings);
  await updateRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, SETTINGS_ID, {
    ...next,
    updatedBy: actor.actorUid || "",
    updatedByName: actor.actorName || "",
  });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanSettings",
    action: "update",
    recordId: SETTINGS_ID,
    summary: `Offline preplan settings: expire after ${next.packageDays} days, flag after ${next.staleHours} h, photos ${next.includePhotos ? "on" : "off"}, documents ${next.includeDocuments ? "on" : "off"}, ${next.maxFileMb} MB of files per plan`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return next;
}

/** "Chrome on Android" style label; nothing that identifies the person or the hardware. */
export function describeDevice(userAgent = "") {
  const ua = String(userAgent);
  const browser = /Edg\//.test(ua) ? "Edge" : /CriOS|Chrome\//.test(ua) ? "Chrome" : /FxiOS|Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const system = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : "device";
  return `${browser} on ${system}`;
}

export async function getOfflineDevice(departmentId, deviceId) {
  return getRecord(departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION, deviceId);
}

/** First registration of this device (status active, owned by the signed-in person). */
export async function registerOfflineDevice(departmentId, deviceId, actor = {}, label = "") {
  const record = await createRecord(departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION, deviceId, {
    id: deviceId,
    uid: actor.actorUid || "",
    userName: actor.actorName || "",
    label: String(label || "").slice(0, 80),
    status: "active",
    packages: [],
    lastSyncAt: new Date().toISOString(),
  });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanOfflineDevice",
    action: "create",
    recordId: deviceId,
    summary: `Device registered for offline preplans (${record.label || "device"})`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return record;
}

/** Report what the device now holds (the device's own record only). */
export async function reportOfflineDevice(departmentId, deviceId, packages = []) {
  return updateRecord(departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION, deviceId, {
    packages: deviceSummary(packages),
    lastSyncAt: new Date().toISOString(),
  });
}

export async function revokeOfflineDevice(departmentId, deviceId, actor = {}, reason = "") {
  await updateRecord(departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION, deviceId, {
    status: "revoked",
    revokedAt: new Date().toISOString(),
    revokedBy: actor.actorUid || "",
    revokedByName: actor.actorName || "",
    revokeReason: String(reason || "").slice(0, 300),
  });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanOfflineDevice",
    action: "revoke",
    recordId: deviceId,
    summary: `Offline preplans revoked on a device${reason ? `: ${String(reason).slice(0, 120)}` : ""}`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
}

/** Every device (preplan managers). */
export async function listOfflineDevices(departmentId) {
  const rows = await listRecords(departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION);
  return rows.sort((a, b) => String(b.lastSyncAt || "").localeCompare(String(a.lastSyncAt || "")));
}

/** The signed-in person's own devices. */
export async function listMyOfflineDevices(departmentId, uid) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !uid) return [];
  const snap = await getDocs(query(collection(db, "departments", departmentId, PREPLAN_OFFLINE_DEVICES_COLLECTION), where("uid", "==", uid)));
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }))
    .sort((a, b) => String(b.lastSyncAt || "").localeCompare(String(a.lastSyncAt || "")));
}
