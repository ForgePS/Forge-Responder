import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";

function departmentCollection(departmentId, collectionName) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  return collection(db, "departments", departmentId, collectionName);
}

function departmentDoc(departmentId, collectionName, recordId) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !recordId) return null;
  return doc(db, "departments", departmentId, collectionName, recordId);
}

export async function listRecords(departmentId, collectionName) {
  const ref = departmentCollection(departmentId, collectionName);
  if (!ref) return [];
  const snap = await getDocs(ref);
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export async function getRecord(departmentId, collectionName, recordId) {
  const ref = departmentDoc(departmentId, collectionName, recordId);
  if (!ref) return null;
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function createRecord(departmentId, collectionName, recordId, data) {
  const ref = departmentDoc(departmentId, collectionName, recordId);
  if (!ref) return null;
  const now = new Date().toISOString();
  const payload = { ...data, createdAt: data.createdAt || now, updatedAt: now };
  await setDoc(ref, payload, { merge: true });
  return { id: recordId, ...payload };
}

export async function updateRecord(departmentId, collectionName, recordId, data) {
  const ref = departmentDoc(departmentId, collectionName, recordId);
  if (!ref) return null;
  const payload = { ...data, updatedAt: new Date().toISOString() };
  await updateDoc(ref, payload);
  return { id: recordId, ...payload };
}

export async function deleteRecord(departmentId, collectionName, recordId) {
  const ref = departmentDoc(departmentId, collectionName, recordId);
  if (!ref) return false;
  await deleteDoc(ref);
  return true;
}

export function subscribeCollection(departmentId, collectionName, onData, onError) {
  const ref = departmentCollection(departmentId, collectionName);
  if (!ref) {
    onData([]);
    return () => {};
  }
  return onSnapshot(
    ref,
    (snap) => onData(snap.docs.map((item) => ({ id: item.id, ...item.data() }))),
    onError
  );
}

export async function seedCollectionIfEmpty(departmentId, collectionName, records = []) {
  const existing = await listRecords(departmentId, collectionName);
  if (existing.length) return existing;
  await Promise.all(records.map((record) => createRecord(departmentId, collectionName, record.id, record)));
  return listRecords(departmentId, collectionName);
}
