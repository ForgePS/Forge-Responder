/**
 * Field records saved on the device. A record is what a crew entered (a truck
 * check, a log, a report) plus its sync state. Records are never deleted by
 * sync; synced records are kept as history and pruned only when old.
 *
 * status:
 *  draft     - started, not finished (stays on the device)
 *  queued    - saved and waiting to go to the server
 *  syncing   - being sent now
 *  synced    - on the server
 *  attention - the server refused it or someone else changed the same record;
 *              kept on the device until the crew decides
 */
import { blobDelete, blobPut, recordDelete, recordGet, recordPut, recordsForScope } from "./fieldDb.js";

const listeners = new Set();
const HISTORY_LIMIT = 12;
const SYNCED_KEEP_DAYS = 30;

export function scopeKey(departmentId, uid) {
  return `${departmentId}::${uid}`;
}

export function newLocalId(prefix = "f") {
  const random = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "").slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

export function subscribeRecords(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function withHistory(record, status, note = "") {
  const entry = { at: new Date().toISOString(), status, note };
  return [...(record.history || []), entry].slice(-HISTORY_LIMIT);
}

export async function listRecords(departmentId, uid) {
  const rows = await recordsForScope(scopeKey(departmentId, uid));
  return rows.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function getRecord(localId) {
  return recordGet(localId);
}

/**
 * Create or update a record from a form. `finish` queues it for sync,
 * otherwise it stays a draft.
 */
export async function saveFieldRecord({
  localId,
  departmentId,
  uid,
  kind,
  title,
  subtitle = "",
  data,
  base = null,
  finish = true,
  attachments,
}) {
  const now = new Date().toISOString();
  const existing = localId ? await recordGet(localId) : null;
  if (existing && existing.status === "syncing") {
    throw new Error("This record is being sent right now. Try again in a moment.");
  }
  const status = finish ? "queued" : "draft";
  const record = {
    ...(existing || {}),
    localId: existing?.localId || localId || newLocalId(),
    scope: scopeKey(departmentId, uid),
    departmentId,
    uid,
    kind,
    title,
    subtitle,
    data,
    base: existing ? existing.base ?? base : base,
    status,
    attention: null,
    steps: existing?.steps || {},
    serverIds: existing?.serverIds || {},
    attachments: attachments ?? existing?.attachments ?? [],
    attempts: 0,
    lastError: "",
    nextAttemptAt: "",
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    savedAt: finish ? now : existing?.savedAt || "",
    syncedAt: existing?.syncedAt || "",
  };
  // Editing something already on the server sends it again.
  if (existing?.status === "synced" && finish) {
    record.steps = { ...record.steps, resend: true };
  }
  record.history = withHistory(existing || {}, status, existing ? "Edited on device" : "Saved on device");
  await recordPut(record);
  emit();
  return record;
}

/** Update sync bookkeeping (used by the sync engine). */
export async function patchRecord(localId, patch = {}, note = "") {
  const existing = await recordGet(localId);
  if (!existing) return null;
  const next = { ...existing, ...patch };
  if (patch.status && patch.status !== existing.status) {
    next.history = withHistory(existing, patch.status, note);
  }
  await recordPut(next);
  emit();
  return next;
}

export async function discardRecord(localId) {
  const existing = await recordGet(localId);
  if (!existing) return;
  for (const attachment of existing.attachments || []) {
    await blobDelete(attachment.id).catch(() => null);
  }
  await recordDelete(localId);
  emit();
}

/** Save a photo blob on the device; returns the attachment entry. */
export async function storeAttachment(blob, name = "photo.jpg") {
  const id = newLocalId("ph");
  await blobPut({ id, blob, name, type: blob.type || "image/jpeg", size: blob.size || 0, savedAt: new Date().toISOString() });
  return { id, name, type: blob.type || "image/jpeg", size: blob.size || 0 };
}

export async function removeAttachment(id) {
  await blobDelete(id).catch(() => null);
}

/** Drop synced history older than the keep window (unsynced records are never pruned). */
export async function pruneSyncedRecords(departmentId, uid) {
  const cutoff = new Date(Date.now() - SYNCED_KEEP_DAYS * 86_400_000).toISOString();
  const rows = await recordsForScope(scopeKey(departmentId, uid));
  let removed = 0;
  for (const row of rows) {
    if (row.status === "synced" && String(row.syncedAt || row.updatedAt) < cutoff) {
      await discardRecord(row.localId);
      removed += 1;
    }
  }
  return removed;
}

/**
 * The newest copy of a server record this device itself sent, if it's newer
 * than the downloaded copy (so re-editing starts from what was just sent).
 */
export function latestSentCopy(records = [], kind, id, downloadedUpdatedAt = "") {
  const sent = records
    .filter((row) => row.kind === kind && row.status === "synced" && row.data?.id === id && row.base)
    .sort((a, b) => String(b.syncedAt).localeCompare(String(a.syncedAt)))[0];
  if (!sent) return null;
  const sentAt = sent.base?.updatedAt || sent.syncedAt || "";
  return !downloadedUpdatedAt || String(sentAt) > String(downloadedUpdatedAt) ? sent : null;
}

export function summarizeRecords(records = []) {
  const counts = { draft: 0, queued: 0, syncing: 0, synced: 0, attention: 0 };
  records.forEach((row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
  });
  return counts;
}

/** Everything about a record as a downloadable JSON file (last-resort export). */
export function recordExportJson(record) {
  const { history, ...rest } = record;
  return JSON.stringify({ exportedAt: new Date().toISOString(), record: rest, history }, null, 2);
}
