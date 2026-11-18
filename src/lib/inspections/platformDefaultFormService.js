/**
 * Read and set the platform's default inspection form
 * (platformConfig/defaultInspectionForm; see platformDefaultForm.js).
 * Any signed-in user can read it; only platform creators can set it (Firestore rules).
 */
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { normalizePlatformDefaultForm, platformDefaultFormRecord, PLATFORM_DEFAULT_FORM_DOC } from "./platformDefaultForm.js";

let cached = null;
let cachedAt = 0;
const CACHE_MS = 60_000;

/** The default form, or null when none is set or it can't be read. */
export async function loadPlatformDefaultForm({ fresh = false } = {}) {
  if (!fresh && cachedAt && Date.now() - cachedAt < CACHE_MS) return cached;
  const db = getFirestoreDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "platformConfig", PLATFORM_DEFAULT_FORM_DOC));
    cached = snap.exists() ? normalizePlatformDefaultForm(snap.data()) : null;
  } catch (error) {
    console.warn("Couldn't read the platform default inspection form", error);
    cached = null;
  }
  cachedAt = Date.now();
  return cached;
}

/** Make a published digital form the platform default (platform creators only). */
export async function setPlatformDefaultForm({ departmentId, form, definition }, actor = {}) {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore isn't available.");
  const record = platformDefaultFormRecord({ departmentId, form, definition }, { actorName: actor.actorName || "" });
  if (!normalizePlatformDefaultForm(record)) throw new Error("This form has no questions to use as the default.");
  await setDoc(doc(db, "platformConfig", PLATFORM_DEFAULT_FORM_DOC), record);
  cached = normalizePlatformDefaultForm(record);
  cachedAt = Date.now();
  return cached;
}

/** Go back to the built-in starter checklist (platform creators only). */
export async function clearPlatformDefaultForm() {
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore isn't available.");
  await deleteDoc(doc(db, "platformConfig", PLATFORM_DEFAULT_FORM_DOC));
  cached = null;
  cachedAt = Date.now();
}
