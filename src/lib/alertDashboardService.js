import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

async function callAlertDashboard(name, payload = {}) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

export function geocodeAlertAddress(departmentId = "", address = "", gatewaySlug = "") {
  return callAlertDashboard("googleGeocode", { departmentId, address, gatewaySlug });
}

export function fetchAlertDirections(departmentId = "", options = {}) {
  const { gatewaySlug = "", ...rest } = options;
  return callAlertDashboard("googleDirections", { departmentId, gatewaySlug, ...rest });
}

export function lookupAlertPlace(departmentId = "", options = {}) {
  const { gatewaySlug = "", ...rest } = options;
  return callAlertDashboard("googlePlacesLookup", { departmentId, gatewaySlug, ...rest });
}
