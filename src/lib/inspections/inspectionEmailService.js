/**
 * Email a completed inspection's report (PDF) to the occupancy.
 * The server (functions/lib/inspectionEmail.js) builds the report from the stored
 * inspection and checks the caller's permissions; this only picks recipients.
 */
import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "../firebaseClient.js";

export { MAX_REPORT_RECIPIENTS, occupancyEmails, parseRecipients } from "./inspectionEmailRecipients.js";

export async function emailInspectionReport(departmentId, inspectionId, { to = [], note = "" } = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, "emailInspectionReport", { timeout: 60000 })({ departmentId, inspectionId, to, note });
  return result.data || {};
}
