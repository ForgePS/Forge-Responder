/**
 * Private personnel details: departments/{d}/personnelPrivate/{personnelId}.
 * Readable/writable by people who can see private info (editPersonnel,
 * manageUsers, manageSystemSettings, platform creators); each member may read
 * their own. See personnelPrivateFields.js for the key list.
 */
import { collection, deleteField, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import {
  PERSONNEL_PRIVATE_COLLECTION,
  PERSONNEL_PRIVATE_KEYS,
  hasPrivateValue,
  personnelPrivateDocId,
  pickPersonnelPrivateFields,
} from "./personnelPrivateFields.js";

const BATCH_LIMIT = 450;

export function personnelPrivateRef(db, departmentId, personnelId) {
  const docId = personnelPrivateDocId(personnelId);
  if (!db || !departmentId || !docId) return null;
  return doc(db, "departments", departmentId, PERSONNEL_PRIVATE_COLLECTION, docId);
}

/** Firestore write payload: only private keys; blanks delete the field. */
function privateWritePayload(fields = {}, userId = "") {
  const payload = {};
  PERSONNEL_PRIVATE_KEYS.forEach((key) => {
    if (!(key in fields)) return;
    payload[key] = hasPrivateValue(fields[key]) ? fields[key] : deleteField();
  });
  if (!Object.keys(payload).length) return null;
  payload.updatedAt = new Date().toISOString();
  payload.updatedBy = userId || "unknown";
  return payload;
}

/**
 * One person's private details.
 * @returns {Promise<{ exists: boolean, fields: object }>}
 */
export async function loadPersonnelPrivate(departmentId, personnelId, db = getFirestoreDb()) {
  const ref = personnelPrivateRef(db, departmentId, personnelId);
  if (!ref) return { exists: false, fields: {} };
  const snap = await getDoc(ref);
  return { exists: snap.exists(), fields: snap.exists() ? pickPersonnelPrivateFields(snap.data()) : {} };
}

/** Everyone's private details (only for people allowed to see them). Map id -> fields. */
export async function loadAllPersonnelPrivate(departmentId, db = getFirestoreDb()) {
  const result = new Map();
  if (!db || !departmentId) return result;
  const snap = await getDocs(collection(db, "departments", departmentId, PERSONNEL_PRIVATE_COLLECTION));
  snap.docs.forEach((d) => result.set(d.id, pickPersonnelPrivateFields(d.data())));
  return result;
}

/** Save one person's private details (only the keys given; "" clears a key). */
export async function savePersonnelPrivate(departmentId, personnelId, fields = {}, { userId = "", db = getFirestoreDb() } = {}) {
  const ref = personnelPrivateRef(db, departmentId, personnelId);
  if (!ref) throw new Error("This person has no record id yet, so private details can't be saved.");
  const payload = privateWritePayload(fields, userId);
  if (!payload) return false;
  await setDoc(ref, payload, { merge: true });
  return true;
}

/** Save private details for many people at once: { personnelId: fields }. */
export async function savePersonnelPrivateMany(db, departmentId, fieldsById = {}, userId = "") {
  const ops = Object.entries(fieldsById || {})
    .map(([personnelId, fields]) => [personnelPrivateRef(db, departmentId, personnelId), privateWritePayload(fields, userId)])
    .filter(([ref, payload]) => ref && payload);
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_LIMIT).forEach(([ref, payload]) => batch.set(ref, payload, { merge: true }));
    await batch.commit();
  }
  return ops.length;
}
