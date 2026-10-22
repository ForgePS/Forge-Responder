import { getFirestoreDb } from "./firebaseClient.js";
import { doc, setDoc } from "firebase/firestore";
import { normalizeShiftRotation } from "../data/defaultShiftRotation.js";

export async function saveShiftRotation(departmentId, settings, shiftRotation, profileShifts = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Database unavailable");
  }

  // Only this field (merge keeps the rest): the in-memory settings carry
  // display-only values (effective modules, subscription) that rules refuse.
  const payload = {
    departmentId,
    shiftRotation: normalizeShiftRotation(shiftRotation, profileShifts),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  return payload.shiftRotation;
}
