import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

export function parseRecipientList(value = "") {
  return [...new Set(String(value || "").split(/[;,\n]/).map((email) => email.trim()).filter(Boolean))];
}

/**
 * Email the hydrant daily activity CSV via the sendHydrantDailyActivityEmail
 * callable. Throws when Functions are unavailable or the send fails.
 */
export async function sendHydrantDailyActivityEmail({
  departmentId = "",
  departmentName = "",
  date = "",
  emails = [],
  csv = "",
  summary = "",
} = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const callable = httpsCallable(functions, "sendHydrantDailyActivityEmail");
  const result = await callable({ departmentId, departmentName, date, emails, csv, summary });
  return result.data || {};
}
