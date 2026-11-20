/**
 * Delete an inspection or preplan with a reason. The server
 * (functions/lib/recordDeletion.js) checks the caller is an administrator,
 * keeps a copy of what was deleted and writes the audit log before deleting.
 */
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

export { DELETE_REASONS, OTHER_DELETE_REASON, deleteReasonProblem } from "./recordDeletionReasons.js";

/** @param {"inspection"|"preplan"} kind */
export async function deleteRecordWithReason(departmentId, { kind, recordId, reason, notes = "" }) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, "deleteRecordWithReason", { timeout: 60000 })({
    departmentId, kind, recordId, reason, notes,
  });
  return result.data || {};
}
