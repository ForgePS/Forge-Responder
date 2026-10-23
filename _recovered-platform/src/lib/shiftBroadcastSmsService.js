import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseEnabled } from "./firebaseClient.js";

function getCallableFunctions() {
  if (!firebaseEnabled) return null;
  return getFunctions(undefined, "us-central1");
}

export async function sendShiftBroadcastSms({
  departmentId = "",
  broadcastId = "",
  personnelIds = [],
  message = "",
  record = {},
} = {}) {
  const functions = getCallableFunctions();
  if (!functions) {
    throw new Error("Firebase is not configured for SMS delivery.");
  }

  const callable = httpsCallable(functions, "sendShiftBroadcastSms");
  const result = await callable({
    departmentId,
    broadcastId,
    personnelIds,
    message,
    record,
  });

  return result.data || {};
}

export async function pingTwilioConfig(departmentId = "") {
  const functions = getCallableFunctions();
  if (!functions) return { configured: false };

  try {
    const callable = httpsCallable(functions, "pingTwilioConfig");
    const result = await callable({ departmentId });
    return result.data || { configured: false };
  } catch (error) {
    console.warn("Twilio config check failed:", error);
    return { configured: false, error: error.message || "Unavailable" };
  }
}
