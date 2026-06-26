import { getFirestoreDb } from "./firebaseClient.js";
import { doc, setDoc } from "firebase/firestore";
import { normalizeShiftRotation } from "../data/defaultShiftRotation.js";

export async function saveShiftRotation(departmentId, settings, shiftRotation, profileShifts = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Database unavailable");
  }

  const payload = {
    ...settings,
    departmentId,
    shiftRotation: normalizeShiftRotation(shiftRotation, profileShifts),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  return payload.shiftRotation;
}
