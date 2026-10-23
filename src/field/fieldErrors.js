/** Errors a sync handler throws to say a record needs the crew, not a retry. */

export class FieldConflictError extends Error {
  constructor(message, { conflicts = [], server = null, merged = null } = {}) {
    super(message);
    this.name = "FieldConflictError";
    this.conflicts = conflicts;
    this.server = server;
    this.merged = merged;
  }
}

/** The server can't accept this record as it is (not a connection problem). */
export class FieldRejectedError extends Error {
  constructor(message) {
    super(message);
    this.name = "FieldRejectedError";
  }
}

const MAX_BACKOFF_MS = 10 * 60_000;

const REJECT_CODES = new Set([
  "permission-denied",
  "invalid-argument",
  "failed-precondition",
  "out-of-range",
  "unauthenticated",
  "storage/unauthorized",
  "storage/invalid-argument",
  "storage/quota-exceeded",
]);

export function classifySyncError(error) {
  if (error instanceof FieldConflictError) return "conflict";
  if (error instanceof FieldRejectedError) return "rejected";
  const code = String(error?.code || "").replace(/^firestore\//, "");
  if (REJECT_CODES.has(code)) return "rejected";
  return "retry";
}

export function friendlySyncError(error) {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  if (code === "permission-denied" || code === "storage/unauthorized") {
    return "The server refused this record: your account or your department's plan doesn't allow it.";
  }
  if (code === "unauthenticated") return "Your sign-in expired. Sign in again to send this record.";
  if (code === "unavailable" || code === "deadline-exceeded" || error?.name === "TimeoutError") {
    return "Connection too weak to reach the server.";
  }
  return error?.message || "Something went wrong while sending.";
}

export function isNetworkError(error) {
  const code = String(error?.code || "").replace(/^firestore\//, "");
  return error?.name === "TimeoutError"
    || code === "unavailable"
    || code === "deadline-exceeded"
    || code === "storage/retry-limit-exceeded"
    || /network|failed to fetch|offline/i.test(String(error?.message || ""));
}

export function backoffMs(attempts) {
  return Math.min(MAX_BACKOFF_MS, 15_000 * 2 ** Math.max(0, attempts - 1));
}
