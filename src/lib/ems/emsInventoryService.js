/**
 * EMS supply inventory client. Every change goes through a Cloud Function
 * (functions/lib/emsInventory/service.js) that checks membership, permissions and
 * the plan, and writes the ledger record, balances and audit event together.
 * Firestore rules let the browser read (with an EMS inventory permission); nothing
 * here writes Firestore directly.
 */
import { httpsCallable } from "firebase/functions";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { getFirebaseFunctions, getFirestoreDb } from "../firebaseClient.js";

async function call(name, payload, timeout = 60000) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name, { timeout })(payload);
  return result.data || {};
}

/** A new id per user action. Retrying the same action re-sends the same id, so stock never moves twice. */
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export const saveEmsSettings = (departmentId, settings) => call("emsInventorySaveSettings", { departmentId, settings });
export const saveInventoryItem = (departmentId, item) => call("emsInventorySaveItem", { departmentId, item });
export const saveInventoryLocation = (departmentId, location) => call("emsInventorySaveLocation", { departmentId, location });
export const setInventoryPar = (departmentId, locationId, itemId, par) => call("emsInventorySetPar", { departmentId, locationId, itemId, par });
export const postInventoryTransaction = (departmentId, transaction) => call("emsInventoryPostTransaction", { departmentId, ...transaction });
export const reverseInventoryTransaction = (departmentId, transactionId, reason) =>
  call("emsInventoryReverseTransaction", { departmentId, transactionId, reason });
export const startInventoryCount = (departmentId, locationId, requestId) => call("emsInventoryStartCount", { departmentId, locationId, requestId });
export const saveInventoryCount = (departmentId, countId, rows, addRows = []) => call("emsInventorySaveCount", { departmentId, countId, rows, addRows });
export const submitInventoryCount = (departmentId, countId, rows) => call("emsInventorySubmitCount", { departmentId, countId, rows });
export const approveInventoryCount = (departmentId, countId, note) => call("emsInventoryApproveCount", { departmentId, countId, note });
export const rejectInventoryCount = (departmentId, countId, note) => call("emsInventoryRejectCount", { departmentId, countId, note });

// Medication recalls and lot holds (E4, functions/lib/emsMedications)
export const createMedicationRecall = (departmentId, recall) => call("emsMedicationsCreateRecall", { departmentId, recall });
export const closeMedicationRecall = (departmentId, recallId, outcome, note) => call("emsMedicationsCloseRecall", { departmentId, recallId, outcome, note });
export const placeLotHold = (departmentId, itemId, lotKey, reason) => call("emsMedicationsPlaceHold", { departmentId, itemId, lotKey, reason });
export const releaseLotHold = (departmentId, holdId, note) => call("emsMedicationsReleaseHold", { departmentId, holdId, note });

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

export const watchInventoryItems = (departmentId, onChange, onError) => watch(tenantCollection(departmentId, "emsInventoryItems"), onChange, onError);
export const watchInventoryLocations = (departmentId, onChange, onError) => watch(tenantCollection(departmentId, "emsInventoryLocations"), onChange, onError);
export const watchInventoryBalances = (departmentId, onChange, onError) => watch(tenantCollection(departmentId, "emsInventoryBalances"), onChange, onError);

/** Newest ledger records, optionally for one item, one location, or one item class ("medication"). */
export function watchInventoryTransactions(departmentId, { itemId = "", locationId = "", itemClass = "", max = 200 } = {}, onChange, onError) {
  const target = tenantCollection(departmentId, "emsInventoryTransactions");
  if (!target) return noop();
  const filters = [];
  if (itemId) filters.push(where("itemId", "==", itemId));
  else {
    if (itemClass) filters.push(where("itemClass", "==", itemClass));
    if (locationId) filters.push(where("locationIds", "array-contains", locationId));
  }
  return watch(query(target, ...filters, orderBy("createdAt", "desc"), limit(max)), onChange, onError);
}

/** Lots on hold now. */
export function watchLotHolds(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsLotHolds");
  return target ? watch(query(target, where("status", "==", "active")), onChange, onError) : noop();
}

/** Medication recalls, newest first. */
export function watchMedicationRecalls(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsMedicationRecalls");
  return target ? watch(query(target, orderBy("createdAt", "desc"), limit(200)), onChange, onError) : noop();
}

export function watchInventoryCounts(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsInventoryCounts");
  return target ? watch(query(target, orderBy("createdAt", "desc"), limit(100)), onChange, onError) : noop();
}

export function watchEmsAuditEvents(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "emsAuditEvents");
  return target ? watch(query(target, orderBy("at", "desc"), limit(200)), onChange, onError) : noop();
}

export function watchEmsSettings(departmentId, onChange, onError) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return noop();
  return onSnapshot(doc(db, "departments", departmentId, "emsSettings", "main"),
    (snap) => onChange(snap.exists() ? snap.data() : null), (error) => onError?.(error));
}

export function describeError(error) {
  const message = String(error?.message || "").trim();
  if (!message || /^internal$/i.test(message)) return "Something went wrong. Try again.";
  return message;
}
