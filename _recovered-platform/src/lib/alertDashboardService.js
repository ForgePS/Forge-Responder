import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function callAlertDashboard(name, payload = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

export function geocodeAlertAddress(departmentId = "", address = "") {
  return callAlertDashboard("googleGeocode", { departmentId, address });
}

export function fetchAlertDirections(departmentId = "", options = {}) {
  return callAlertDashboard("googleDirections", { departmentId, ...options });
}

export function lookupAlertPlace(departmentId = "", options = {}) {
  return callAlertDashboard("googlePlacesLookup", { departmentId, ...options });
}
