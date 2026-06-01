import { initializeApp } from "firebase/app";
import { deleteDoc, doc, getDoc, getDocs, getFirestore, setDoc, collection } from "firebase/firestore";
import { getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";

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

function firebaseServices() {
  if (!firebaseEnabled) return null;
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    storage = getStorage(app);
  }
  return { db, storage };
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
  if (!services || !file) return null;
  const fileRef = ref(services.storage, storagePath);
  const snapshot = await uploadBytes(fileRef, file, { contentType: file.type || "application/octet-stream" });
  const url = await getDownloadURL(snapshot.ref);
  return { storagePath, downloadUrl: url, contentType: file.type || "application/octet-stream" };
}
