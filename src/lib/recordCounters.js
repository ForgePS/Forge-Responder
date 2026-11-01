import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { allocateYearNumber, counterKeyFor, nextCounterValue } from "./recordNumbering.js";

const CLAIM_TIMEOUT_MS = 8000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Record counter timed out.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Reserve the next number from departments/{departmentId}/counters/{counterKey}.
 * The counter only ever goes up, inside a transaction, so no two callers get the
 * same value. `floor` is the highest sequence already in use on screen, so a
 * department that already has records carries on from there instead of restarting at 1.
 * Writes only `value` and `updatedAt`. Throws if Firestore isn't reachable.
 *
 * @param {string} departmentId
 * @param {string} counterKey e.g. "preplan-2026"
 * @param {{ floor?: number }} [options]
 * @returns {Promise<number>}
 */
export async function claimNextNumber(departmentId, counterKey, { floor = 0 } = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !counterKey) throw new Error("Record counter unavailable.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Offline.");
  const ref = doc(db, "departments", departmentId, "counters", counterKey);
  return withTimeout(runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const stored = snap.exists() ? Number(snap.data()?.value) : 0;
    const next = nextCounterValue(stored, floor);
    tx.set(ref, { value: next, updatedAt: serverTimestamp() });
    return next;
  }), CLAIM_TIMEOUT_MS);
}

/**
 * Number for a new record of `kind` ("preplan", "inspection", "neris") in the format's year.
 * Uses the shared counter; falls back to "highest loaded + 1" when it can't be reached.
 *
 * @param {string} departmentId
 * @param {string} kind
 * @param {{prefix:string,separator?:string,padding:number,year:number}} format
 * @param {string[]} existingNumbers
 * @returns {Promise<{ number: string, shared: boolean }>}
 */
export function allocateRecordNumber(departmentId, kind, format, existingNumbers = []) {
  const counterKey = counterKeyFor(kind, format.year);
  return allocateYearNumber(format, existingNumbers, (floor) => claimNextNumber(departmentId, counterKey, { floor }));
}
