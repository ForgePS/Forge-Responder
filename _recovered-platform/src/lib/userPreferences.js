import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";

export function normalizeUiTheme(value) {
  return value === "dark" ? "dark" : "light";
}

export async function saveUserThemePreference(departmentId, uid, theme) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !uid) return null;

  const ref = doc(db, "departments", departmentId, "users", uid);
  const snap = await getDoc(ref);
  const current = snap.exists() ? snap.data() : {};
  const preferences = {
    ...(current.preferences || {}),
    theme: normalizeUiTheme(theme),
  };
  const now = new Date().toISOString();
  const payload = {
    uid,
    preferences,
    updatedAt: now,
  };

  await setDoc(ref, payload, { merge: true });
  return preferences;
}
