import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

function getCallableFunctions() {
  return getFirebaseFunctions();
}

async function callActive911(name, payload = {}) {
  const functions = getCallableFunctions();
  if (!functions) {
    throw new Error("Firebase Functions are not configured.");
  }
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

export function connectActive911({
  departmentId = "",
  email = "",
  password = "",
  refreshToken = "",
} = {}) {
  return callActive911("active911Connect", {
    departmentId,
    email,
    password,
    refreshToken,
  });
}

export function disconnectActive911(departmentId = "") {
  return callActive911("active911Disconnect", { departmentId });
}

export function getActive911Status(departmentId = "") {
  return callActive911("active911GetStatus", { departmentId });
}

export function syncActive911Alerts(departmentId = "", options = {}) {
  return callActive911("active911SyncAlerts", {
    departmentId,
    alertDays: options.alertDays ?? 10,
    alertMinutes: options.alertMinutes ?? null,
  });
}
