/**
 * EMS equipment client. Every change goes through a Cloud Function
 * (functions/lib/emsEquipment/service.js) that checks membership, permissions and
 * the plan, and writes the record, its history event and the audit event together.
 * Firestore rules let the browser read with an equipment permission; nothing here
 * writes Firestore directly. Photos and documents upload to Storage first, then a
 * callable lists them on the record.
 */
import { httpsCallable } from "firebase/functions";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { getFirebaseFunctions, getFirebaseStorage, getFirestoreDb, uploadFirebaseFile } from "../firebaseClient.js";
import { newRequestId } from "./emsInventoryService.js";

export { newRequestId };

async function call(name, payload, timeout = 60000) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name, { timeout })(payload);
  return result.data || {};
}

export const saveEquipment = (departmentId, equipment) => call("emsEquipmentSave", { departmentId, equipment });
export const transferEquipment = (departmentId, equipmentId, requestId, to, reason) =>
  call("emsEquipmentTransfer", { departmentId, equipmentId, requestId, to, reason });
export const verifyEquipment = (departmentId, equipmentId, requestId, note) =>
  call("emsEquipmentVerify", { departmentId, equipmentId, requestId, note });
export const reportEquipmentProblem = (departmentId, equipmentId, requestId, { kind, description, takeOutOfService }) =>
  call("emsEquipmentReportProblem", { departmentId, equipmentId, requestId, kind, description, takeOutOfService });
export const recordEquipmentInspection = (departmentId, equipmentId, requestId, { kind, result, notes }) =>
  call("emsEquipmentRecordInspection", { departmentId, equipmentId, requestId, kind, result, notes });
export const completeEquipmentMaintenance = (departmentId, equipmentId, requestId, { notes, cost, vendorName, returnToService }) =>
  call("emsEquipmentCompleteMaintenance", { departmentId, equipmentId, requestId, notes, cost, vendorName, returnToService });
export const setEquipmentStatus = (departmentId, equipmentId, requestId, status, reason) =>
  call("emsEquipmentSetStatus", { departmentId, equipmentId, requestId, status, reason });
export const previewEquipmentImport = (departmentId, stations) => call("emsEquipmentPreviewImport", { departmentId, stations });
export const applyEquipmentImport = (departmentId, sourceIds, stations) =>
  call("emsEquipmentApplyImport", { departmentId, sourceIds, stations }, 300000);
export const rollbackEquipmentImport = (departmentId, batchId) => call("emsEquipmentRollbackImport", { departmentId, batchId }, 300000);

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Upload a photo or document into the record's folder, then list it on the record. */
export async function addEquipmentFile(departmentId, equipmentId, file, kind) {
  if (!file) throw new Error("Choose a file.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Files must be under 25 MB.");
  if (kind === "photo" && !/^image\//.test(file.type || "")) throw new Error("Photos must be images.");
  const safeName = String(file.name || "file").replace(/[^A-Za-z0-9._-]+/g, "-").slice(-80) || "file";
  const path = `departments/${departmentId}/emsEquipment/${equipmentId}/${newRequestId().slice(0, 12)}-${safeName}`;
  await uploadFirebaseFile(path, file);
  return call("emsEquipmentAddFile", { departmentId, equipmentId, requestId: newRequestId(), kind, path, name: file.name });
}

export const removeEquipmentFile = (departmentId, equipmentId, path) =>
  call("emsEquipmentRemoveFile", { departmentId, equipmentId, requestId: newRequestId(), path });

export async function fileUrl(path) {
  const storage = getFirebaseStorage();
  if (!storage || !path) return "";
  return getDownloadURL(ref(storage, path));
}

function tenantCollection(departmentId, name) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  return collection(db, "departments", departmentId, name);
}

const noop = () => () => {};

function watch(target, onChange, onError) {
  if (!target) return noop();
  return onSnapshot(target, (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (error) => onError?.(error));
}

export const watchEquipment = (departmentId, onChange, onError) => watch(tenantCollection(departmentId, "emsEquipment"), onChange, onError);

/** Newest history events, for one piece of equipment or the whole department. */
export function watchEquipmentEvents(departmentId, { equipmentId = "", max = 200 } = {}, onChange, onError) {
  const target = tenantCollection(departmentId, "emsEquipmentEvents");
  if (!target) return noop();
  const filters = equipmentId ? [where("equipmentId", "==", equipmentId)] : [];
  return watch(query(target, ...filters, orderBy("at", "desc"), limit(max)), onChange, onError);
}

export function watchEquipmentImports(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsEquipmentMigrations");
  return target ? watch(query(target, orderBy("createdAt", "desc"), limit(20)), onChange, onError) : noop();
}

export const watchStorageLocations = (departmentId, onChange, onError) =>
  watch(tenantCollection(departmentId, "emsInventoryLocations"), onChange, onError);

export { describeError } from "./emsInventoryService.js";
