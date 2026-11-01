/**
 * Sync engine: sends records saved on the device to the server once there is
 * a connection. One record at a time, oldest first.
 *
 *  - Every write uses an id fixed on the device, so a retry after a dropped
 *    connection overwrites the same record instead of creating a duplicate.
 *  - Multi-step records remember finished steps (record.steps) and resume.
 *  - Network trouble: the record stays queued and is retried with backoff.
 *  - Server refuses it, or someone else changed the same record: the record
 *    is marked "needs attention" and kept on the device for the crew to
 *    decide. Nothing is dropped.
 */
import { getFirebaseAuth } from "../lib/firebaseClient.js";
import { listRecords, patchRecord, pruneSyncedRecords } from "./fieldRecords.js";
import { SYNC_HANDLERS } from "./fieldSyncHandlers.js";
import {
  FieldConflictError,
  FieldRejectedError,
  backoffMs,
  classifySyncError,
  friendlySyncError,
  isNetworkError,
} from "./fieldErrors.js";

export { FieldConflictError, FieldRejectedError, backoffMs, classifySyncError, friendlySyncError, isNetworkError };

const RECORD_TIMEOUT_MS = 60_000;
const RETRY_INTERVAL_MS = 30_000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("Timed out waiting for the server.");
      error.name = "TimeoutError";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ------------------------------ engine state ------------------------------ */

const state = {
  online: typeof navigator === "undefined" ? true : navigator.onLine !== false,
  running: false,
  // False after the server couldn't be reached (dead zone, captive Wi-Fi) even
  // though the phone reports a connection; true again after a successful send.
  reachable: true,
  currentLocalId: "",
  lastSyncAt: "",
  lastError: "",
};
const listeners = new Set();
let context = null;
let timer = null;
let rerun = false;

function emit() {
  const snapshot = { ...state };
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // ignore
    }
  });
}

export function getSyncState() {
  return { ...state };
}

export function subscribeSync(listener) {
  listeners.add(listener);
  listener({ ...state });
  return () => listeners.delete(listener);
}

function handleOnline() {
  state.online = true;
  state.reachable = true;
  emit();
  syncNow();
}

function handleOffline() {
  state.online = false;
  state.reachable = false;
  emit();
}

/**
 * Start syncing for one signed-in person and department.
 * @param {{ departmentId: string, uid: string, actor: {actorUid:string, actorName:string}, getCaps: () => object, getRefData: () => object, getSnapshot: () => object }} ctx
 */
export function startSync(ctx) {
  stopSync();
  context = ctx;
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  document.addEventListener("visibilitychange", handleVisible);
  timer = window.setInterval(() => syncNow(), RETRY_INTERVAL_MS);
  syncNow();
  pruneSyncedRecords(ctx.departmentId, ctx.uid).catch(() => null);
}

function handleVisible() {
  if (document.visibilityState === "visible") syncNow();
}

export function stopSync() {
  if (timer) window.clearInterval(timer);
  timer = null;
  context = null;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  document.removeEventListener("visibilitychange", handleVisible);
}

/** Send everything that's due. Safe to call often. */
export async function syncNow({ force = false } = {}) {
  if (!context) return;
  state.online = navigator.onLine !== false;
  if (!state.online) {
    emit();
    return;
  }
  if (state.running) {
    rerun = true;
    return;
  }
  const auth = getFirebaseAuth();
  if (!auth?.currentUser || auth.currentUser.uid !== context.uid) {
    state.lastError = "Sign in to send saved records.";
    emit();
    return;
  }

  state.running = true;
  state.lastError = "";
  emit();
  const ctx = context;
  try {
    const records = await listRecords(ctx.departmentId, ctx.uid);
    // A record stuck in "syncing" means the app closed mid-send: send it again.
    const now = Date.now();
    const due = records
      .filter((row) => row.status === "queued" || row.status === "syncing")
      .filter((row) => force || !row.nextAttemptAt || new Date(row.nextAttemptAt).getTime() <= now)
      .sort((a, b) => String(a.savedAt || a.createdAt).localeCompare(String(b.savedAt || b.createdAt)));
    for (const record of due) {
      if (context !== ctx || navigator.onLine === false) break;
      await syncOne(record, ctx);
    }
    state.lastSyncAt = new Date().toISOString();
  } catch (error) {
    state.lastError = friendlySyncError(error);
  } finally {
    state.running = false;
    state.currentLocalId = "";
    emit();
  }
  if (rerun) {
    rerun = false;
    syncNow();
  }
}

async function syncOne(record, ctx) {
  const handler = SYNC_HANDLERS[record.kind];
  if (!handler) {
    await patchRecord(record.localId, {
      status: "attention",
      attention: { type: "rejected", message: "This version of the field app can't send this kind of record. Update the app." },
    }, "Unknown record type");
    return;
  }
  state.currentLocalId = record.localId;
  emit();
  let working = await patchRecord(record.localId, { status: "syncing" }, "Sending");
  const handlerCtx = {
    ...ctx,
    caps: ctx.getCaps(),
    refData: ctx.getRefData(),
    snapshot: ctx.getSnapshot(),
    get steps() {
      return working.steps || {};
    },
    async markStep(name, value = true) {
      working = await patchRecord(record.localId, { steps: { ...(working.steps || {}), [name]: value } });
      return working;
    },
    async setAttachments(attachments) {
      working = await patchRecord(record.localId, { attachments });
      return working;
    },
    getRecord: () => working,
  };
  try {
    const result = await withTimeout(handler(working, handlerCtx), RECORD_TIMEOUT_MS);
    state.reachable = true;
    await patchRecord(record.localId, {
      status: "synced",
      syncedAt: new Date().toISOString(),
      attention: null,
      attempts: 0,
      lastError: "",
      nextAttemptAt: "",
      warnings: result?.warnings || [],
      serverIds: { ...(working.serverIds || {}), ...(result?.serverIds || {}) },
      base: result?.base ?? working.base ?? null,
      steps: result?.keepSteps ? working.steps : {},
    }, result?.warnings?.length ? `Sent (${result.warnings.join("; ")})` : "Sent to the server");
  } catch (error) {
    const kind = classifySyncError(error);
    if (kind === "conflict") {
      await patchRecord(record.localId, {
        status: "attention",
        attention: {
          type: "conflict",
          message: error.message,
          conflicts: error.conflicts,
          server: error.server,
          merged: error.merged,
        },
        lastError: error.message,
      }, "Changed on the server too");
      return;
    }
    if (kind === "rejected") {
      await patchRecord(record.localId, {
        status: "attention",
        attention: { type: "rejected", message: friendlySyncError(error), code: error?.code || "" },
        lastError: friendlySyncError(error),
      }, "Server refused");
      return;
    }
    if (isNetworkError(error)) state.reachable = false;
    const attempts = (working.attempts || 0) + 1;
    await patchRecord(record.localId, {
      status: "queued",
      attempts,
      lastError: friendlySyncError(error),
      nextAttemptAt: new Date(Date.now() + backoffMs(attempts)).toISOString(),
    }, "Will retry");
    console.warn(`Field record ${record.localId} will retry`, error);
  }
}
