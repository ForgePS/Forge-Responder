import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function callPublicAlertDashboard(name, payload = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

export function fetchPublicAlertDashboard(gatewaySlug = "", displayKey = "") {
  return callPublicAlertDashboard("alertDashboardPublicView", { gatewaySlug, displayKey });
}
