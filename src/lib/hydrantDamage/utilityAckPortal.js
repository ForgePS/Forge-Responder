import { httpsCallable } from "firebase/functions";
import { firebaseEnabled, getFirebaseFunctions } from "../firebaseClient.js";

/**
 * @param {string} name
 * @param {object} payload
 */
async function callPublicAck(name, payload = {}) {
  if (!firebaseEnabled) {
    throw new Error("Firebase is not configured.");
  }
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions is not available.");
  const callable = httpsCallable(functions, name);
  const result = await callable(payload);
  return result.data || {};
}

/**
 * Load a utility-facing report snapshot by acknowledgment token.
 * Never returns internal notes.
 * @param {string} token
 */
export async function fetchUtilityAckPortal(token) {
  return callPublicAck("hydrantDamageAckPortalView", { token: String(token || "").trim() });
}

/**
 * Submit acknowledgment / repair update from the utility portal.
 * @param {string} token
 * @param {object} input
 */
export async function submitUtilityAckPortal(token, input = {}) {
  return callPublicAck("hydrantDamageAckPortalSubmit", {
    token: String(token || "").trim(),
    ...input,
  });
}

/**
 * @param {string} [pathname]
 */
export function isUtilityAckPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const path = String(pathname || "").toLowerCase();
  return path === "/utility-ack" || path.startsWith("/utility-ack/");
}

/**
 * @param {string} [pathname]
 * @param {string} [search]
 */
export function readUtilityAckToken(pathname = "", search = "") {
  const path = String(pathname || (typeof window !== "undefined" ? window.location.pathname : "") || "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "utility-ack" && parts[1]) return decodeURIComponent(parts[1]);
  const params = new URLSearchParams(search || (typeof window !== "undefined" ? window.location.search : ""));
  return params.get("t") || params.get("token") || "";
}

/**
 * @param {string} token
 * @param {string} [origin]
 */
export function buildUtilityAckUrl(token, origin = typeof window !== "undefined" ? window.location.origin : "") {
  const base = String(origin || "https://rms.forgepublicsafety.com").replace(/\/$/, "");
  return `${base}/utility-ack?t=${encodeURIComponent(token)}`;
}
