/**
 * A posted report a supervisor unlocked in the RMS goes back to draft on the server. The crew's device still holds
 * it as posted and read-only, so when the report is opened with signal, check the server copy and reopen it here.
 */
import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "../lib/firebaseClient.js";
import { getRecord, patchRecord } from "./fieldRecords.js";
import { PCR_COLLECTION, mayBeUnlocked, reopenPatch } from "./fieldPcr.js";

/** @returns {Promise<boolean>} true when the record was reopened. Never throws (the chart opens read-only instead). */
export async function reopenIfUnlocked({ departmentId, localId }) {
  try {
    const record = await getRecord(localId);
    if (!mayBeUnlocked(record)) return false;
    const db = getFirestoreDb();
    if (!db || !departmentId) return false;
    const snap = await getDoc(doc(db, "departments", departmentId, PCR_COLLECTION, record.data.id));
    const patch = reopenPatch(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    if (!patch) return false;
    await patchRecord(localId, patch, "Unlocked by a supervisor");
    return true;
  } catch {
    return false;
  }
}
