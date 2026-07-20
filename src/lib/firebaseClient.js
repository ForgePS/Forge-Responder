import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, collection } from "firebase/firestore";
import { deleteObject as deleteStorageObject, getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const firebaseEnabled = Object.values(firebaseConfig).every(Boolean);

let app;
let db;
let storage;
let auth;
let functions;

function firebaseServices() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, "us-central1");
  }
  return { app, auth, db, storage, functions };
}

export function getFirebaseFunctions() {
  return firebaseServices()?.functions ?? null;
}

export function getFirebaseAuth() {
  return firebaseServices()?.auth ?? null;
}

export function getFirestoreDb() {
  return firebaseServices()?.db ?? null;
}

export function getFirebaseStorage() {
  return firebaseServices()?.storage ?? null;
}

export async function loadFirebaseList(key, fallback = []) {
  const services = firebaseServices();
  if (!services) return fallback;
  try {
    const snap = await getDoc(doc(services.db, "appData", key));
    if (!snap.exists()) return loadFirebaseCollection(key, fallback);
    const data = snap.data();
    if (data.collection) return loadFirebaseCollection(data.collection, fallback);
    return Array.isArray(data.items) ? data.items : Array.isArray(data.data) ? data.data : fallback;
  } catch (error) {
    console.warn(`Firebase appData/${key} unavailable; trying collection fallback`, error);
    return loadFirebaseCollection(key, fallback);
  }
}

export async function loadFirebaseCollection(name, fallback = []) {
  const services = firebaseServices();
  if (!services) return fallback;
  try {
    const snap = await getDocs(collection(services.db, name));
    return snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch (error) {
    console.warn(`Firebase collection/${name} unavailable`, error);
    return fallback;
  }
}

export async function saveFirebaseRecord(collectionName, id, data) {
  const services = firebaseServices();
  if (!services) return null;
  await setDoc(doc(services.db, collectionName, id), data, { merge: true });
  return data;
}

export async function deleteFirebaseRecord(collectionName, id) {
  const services = firebaseServices();
  if (!services) return false;
  await deleteDoc(doc(services.db, collectionName, id));
  return true;
}

export async function uploadFirebaseFile(storagePath, file) {
  const services = firebaseServices();
  if (!services) {
    throw new Error("Firebase Storage is not configured (check VITE_FIREBASE_* env).");
  }
  if (!file) {
    throw new Error("No file selected.");
  }
  if (!storagePath) {
    throw new Error("Upload path is missing.");
  }
  try {
    const fileRef = ref(services.storage, storagePath);
    const snapshot = await uploadBytes(fileRef, file, {
      contentType: file.type || "application/octet-stream",
    });
    const url = await getDownloadURL(snapshot.ref);
    return { storagePath, downloadUrl: url, contentType: file.type || "application/octet-stream" };
  } catch (error) {
    const code = error?.code || "storage/unknown";
    const message = error?.message || "Upload failed";
    console.error("Firebase Storage upload failed", { storagePath, code, message, error });
    const enriched = new Error(message);
    enriched.code = code;
    enriched.cause = error;
    throw enriched;
  }
}

export async function deleteFirebaseFile(storagePath) {
  const services = firebaseServices();
  if (!services || !storagePath) return false;
  try {
    await deleteStorageObject(ref(services.storage, storagePath));
    return true;
  } catch (error) {
    // Missing object is fine — metadata can still be soft-deleted.
    if (error?.code === "storage/object-not-found") return true;
    console.warn("Firebase Storage delete failed", storagePath, error);
    return false;
  }
}

export async function loadTenantList(departmentId, listKey, fallback = []) {
  const services = firebaseServices();
  if (!services || !departmentId) return fallback;
  try {
    const tenantSnap = await getDoc(doc(services.db, "departments", departmentId, "lists", listKey));
    if (tenantSnap.exists()) {
      const data = tenantSnap.data();
      return Array.isArray(data.items) ? data.items : fallback;
    }
    const legacySnap = await getDoc(doc(services.db, "rmsData", listKey));
    if (legacySnap.exists()) {
      const data = legacySnap.data();
      return Array.isArray(data.items) ? data.items : fallback;
    }
    return fallback;
  } catch (error) {
    console.warn(`Tenant list ${departmentId}/lists/${listKey} unavailable`, error);
    return fallback;
  }
}

export async function saveTenantList(departmentId, listKey, items, options = {}) {
  const services = firebaseServices();
  if (!services || !departmentId) return null;
  const payload = {
    items,
    departmentId,
    updated_at: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: options.userId || "system"
  };
  await setDoc(doc(services.db, "departments", departmentId, "lists", listKey), payload, { merge: true });
  return payload;
}

export function tenantCollectionRef(departmentId, collectionName) {
  const services = firebaseServices();
  if (!services || !departmentId) return null;
  return collection(services.db, "departments", departmentId, collectionName);
}
