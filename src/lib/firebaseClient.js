import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";
import { connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, collection } from "firebase/firestore";
import { connectStorageEmulator, deleteObject as deleteStorageObject, getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

/** Optional App Check (Phase 15 hardening). Set VITE_FIREBASE_APPCHECK_SITE_KEY to enable. */
const appCheckSiteKey = String(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY || "").trim();
const appCheckProvider = String(import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER || "recaptcha-v3").trim();
const appCheckDebugToken = String(import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || "").trim();

export const firebaseEnabled = Object.values(firebaseConfig).every(Boolean);
// Set only by .env.emulator (npm run dev:emulator) for local testing.
const useEmulators = import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true";
export const appCheckConfigured = Boolean(appCheckSiteKey);

let app;
let db;
let storage;
let auth;
let functions;
let appCheck;
let appCheckInitError = "";

function initAppCheck(firebaseApp) {
  if (!firebaseApp || !appCheckSiteKey || typeof window === "undefined") return null;
  try {
    if (appCheckDebugToken) {
      // eslint-disable-next-line no-undef
      self.FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken === "true" ? true : appCheckDebugToken;
    }
    const provider = appCheckProvider === "recaptcha-enterprise"
      ? new ReCaptchaEnterpriseProvider(appCheckSiteKey)
      : new ReCaptchaV3Provider(appCheckSiteKey);
    appCheck = initializeAppCheck(firebaseApp, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
    appCheckInitError = "";
    return appCheck;
  } catch (error) {
    appCheckInitError = error?.message || "App Check failed to initialize";
    console.warn("Firebase App Check unavailable", error);
    return null;
  }
}

function firebaseServices() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, "us-central1");
    if (useEmulators) {
      // Local testing only (npm run dev:emulator): never talks to the real project.
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
      connectStorageEmulator(storage, "127.0.0.1", 9199);
    } else {
      initAppCheck(app);
    }
  }
  return { app, auth, db, storage, functions, appCheck };
}

/**
 * App Check status for hardening / ops UI.
 */
export function getAppCheckStatus() {
  return {
    configured: appCheckConfigured,
    active: Boolean(appCheck),
    provider: appCheckConfigured ? appCheckProvider : "",
    debugTokenEnabled: Boolean(appCheckDebugToken),
    error: appCheckInitError,
  };
}

export function getFirebaseAppCheck() {
  return firebaseServices()?.appCheck ?? null;
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

export function tenantCollectionRef(departmentId, collectionName) {
  const services = firebaseServices();
  if (!services || !departmentId) return null;
  return collection(services.db, "departments", departmentId, collectionName);
}
