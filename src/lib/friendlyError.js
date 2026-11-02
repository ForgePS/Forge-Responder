/**
 * Turns an error into a message a firefighter can act on.
 *
 * Firebase / Firestore / Storage / Functions errors carry a `code`; those map
 * to plain-language text. Errors we throw ourselves (`new Error("human text")`)
 * have no code, so their message is shown as-is unless it looks technical.
 */

const PERMISSION = "You don't have permission to do that. Ask your administrator if you need access.";
const OFFLINE = "Can't reach FORGE right now. Check your connection and try again.";
const NOT_FOUND = "That record no longer exists.";
const BUSY = "Too many requests. Wait a moment and try again.";
const SIGNED_OUT = "Your session expired. Sign in again.";

const CODE_MESSAGES = {
  "permission-denied": PERMISSION,
  unauthorized: PERMISSION,
  unavailable: OFFLINE,
  "network-request-failed": OFFLINE,
  "deadline-exceeded": OFFLINE,
  "retry-limit-exceeded": OFFLINE,
  "not-found": NOT_FOUND,
  "object-not-found": NOT_FOUND,
  "resource-exhausted": BUSY,
  "quota-exceeded": BUSY,
  "too-many-requests": BUSY,
  unauthenticated: SIGNED_OUT,
  "user-token-expired": SIGNED_OUT,
  "requires-recent-login": SIGNED_OUT,
};

const TECHNICAL_PATTERN = /firebase|firestore|auth\/|storage\/|functions\/|missing or insufficient permissions|permission[-_ ]denied|\bat\s+\S+\s*\(|\bat\s+\S+:\d+|\bundefined\b|\bnull\b|is not a function|is not defined|cannot read propert|typeerror|referenceerror|syntaxerror|unexpected token|status code|internal error|https?:\/\/|[{}<>]|=>/i;

function normalizeCode(code) {
  // "storage/unauthorized" → "unauthorized", "functions/not-found" → "not-found"
  return String(code || "").trim().toLowerCase().replace(/^[a-z]+\//, "");
}

/** True when a message reads like plain language rather than a stack trace or SDK error. */
export function isHumanMessage(message) {
  const text = String(message || "").trim();
  if (!text || text.length > 300) return false;
  if (text.includes("\n")) return false;
  return !TECHNICAL_PATTERN.test(text);
}

/**
 * @param {unknown} error
 * @param {string} [fallback]
 * @returns {string}
 */
export function friendlyError(error, fallback = "Something went wrong. Please try again.") {
  if (!error) return fallback;
  if (typeof error === "string") return isHumanMessage(error) ? error : fallback;

  const code = normalizeCode(error.code);
  if (code) return CODE_MESSAGES[code] || fallback;

  const message = String(error.message || "");
  if (/missing or insufficient permissions/i.test(message)) return PERMISSION;
  if (/failed to fetch|network ?error|offline/i.test(message)) return OFFLINE;
  return isHumanMessage(message) ? message.trim() : fallback;
}

export default friendlyError;
