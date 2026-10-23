/** Local draft / offline mutation queue for preplans (Fleet-style). */

const QUEUE_KEY = (departmentId) => `forge-preplan-offline-queue:${departmentId}`;
const DRAFT_KEY = (departmentId) => `forge-preplan-local-drafts:${departmentId}`;

function nowIso() {
  return new Date().toISOString();
}

function readJson(key, fallback) {
  if (typeof localStorage === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota
  }
}

/**
 * @param {string} departmentId
 * @returns {object[]}
 */
export function listPreplanOfflineQueue(departmentId) {
  if (!departmentId) return [];
  const list = readJson(QUEUE_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

/**
 * @param {string} departmentId
 * @param {{
 *   collection: string,
 *   recordId: string,
 *   operation?: "create"|"update",
 *   payload: object,
 *   baseUpdatedAt?: string,
 *   baseVersion?: number,
 * }} item
 */
export function enqueuePreplanOfflineMutation(departmentId, item = {}) {
  if (!departmentId || !item.collection || !item.recordId) return null;
  const queue = listPreplanOfflineQueue(departmentId);
  const entry = {
    id: `POQ-${Date.now().toString(36).toUpperCase()}`,
    departmentId,
    collection: item.collection,
    recordId: item.recordId,
    operation: item.operation || "update",
    payload: item.payload || {},
    baseUpdatedAt: item.baseUpdatedAt || "",
    baseVersion: Number(item.baseVersion) || 0,
    clientUpdatedAt: nowIso(),
    status: "queued",
    attempts: 0,
  };
  queue.unshift(entry);
  writeJson(QUEUE_KEY(departmentId), queue.slice(0, 200));
  return entry;
}

/**
 * @param {string} departmentId
 * @param {string} entryId
 */
export function removePreplanOfflineQueueEntry(departmentId, entryId) {
  const next = listPreplanOfflineQueue(departmentId).filter((row) => row.id !== entryId);
  writeJson(QUEUE_KEY(departmentId), next);
}

/**
 * @param {string} departmentId
 */
export function clearPreplanOfflineQueue(departmentId) {
  writeJson(QUEUE_KEY(departmentId), []);
}

/**
 * Autosave wizard drafts locally until Firestore write succeeds.
 * @param {string} departmentId
 * @returns {Record<string, object>}
 */
export function listPreplanLocalDrafts(departmentId) {
  if (!departmentId) return {};
  const map = readJson(DRAFT_KEY(departmentId), {});
  return map && typeof map === "object" ? map : {};
}

/**
 * @param {string} departmentId
 * @param {string} draftKey
 * @param {object} payload
 */
export function savePreplanLocalDraft(departmentId, draftKey, payload = {}) {
  if (!departmentId || !draftKey) return null;
  const map = listPreplanLocalDrafts(departmentId);
  const entry = {
    ...payload,
    draftKey,
    updatedAt: nowIso(),
  };
  map[draftKey] = entry;
  writeJson(DRAFT_KEY(departmentId), map);
  return entry;
}

/**
 * @param {string} departmentId
 * @param {string} draftKey
 */
export function getPreplanLocalDraft(departmentId, draftKey) {
  if (!departmentId || !draftKey) return null;
  return listPreplanLocalDrafts(departmentId)[draftKey] || null;
}

/**
 * @param {string} departmentId
 * @param {string} draftKey
 */
export function removePreplanLocalDraft(departmentId, draftKey) {
  const map = listPreplanLocalDrafts(departmentId);
  delete map[draftKey];
  writeJson(DRAFT_KEY(departmentId), map);
}

/**
 * @param {{ baseUpdatedAt?: string, baseVersion?: number }} local
 * @param {{ updatedAt?: string, version?: number }} server
 */
export function detectPreplanOfflineConflict(local = {}, server = {}) {
  const serverUpdatedAt = server?.updatedAt || "";
  const baseUpdatedAt = local?.baseUpdatedAt || "";
  const serverVersion = Number(server?.version) || 0;
  const baseVersion = Number(local?.baseVersion) || 0;

  if (serverUpdatedAt && baseUpdatedAt && serverUpdatedAt !== baseUpdatedAt) {
    return {
      conflict: true,
      reason: "server_updated_at_changed",
      message: "Server record changed since this offline draft was created.",
    };
  }
  if (serverVersion && baseVersion && serverVersion > baseVersion) {
    return {
      conflict: true,
      reason: "server_version_ahead",
      message: "Server version is newer than the offline base version.",
    };
  }
  return { conflict: false, reason: "", message: "" };
}

/**
 * Phase 6: Flush should converge with inspection offline sync (not a third subsystem).
 */
export function getPreplanOfflineFlushPlan(departmentId) {
  const queued = listPreplanOfflineQueue(departmentId);
  const drafts = listPreplanLocalDrafts(departmentId);
  return {
    departmentId: departmentId || "",
    queued: queued.length,
    drafts: Object.keys(drafts || {}).length,
    flushTarget: "inspectionOfflineSync",
    note: "Replay preplan offline mutations through the shared Prevention offline sync page/policy.",
  };
}

/**
 * Replay queued preplan mutations into Firestore.
 * Called from syncInspectionOfflineQueue so Prevention has one sync button.
 * @returns {Promise<{ synced: number, conflicts: number, failed: number }>}
 */
export async function flushPreplanOfflineQueue(departmentId, handlers = {}) {
  const {
    applyMutation,
    getServerRecord,
  } = handlers;
  if (!departmentId || typeof applyMutation !== "function") {
    return { synced: 0, conflicts: 0, failed: 0 };
  }

  let synced = 0;
  let conflicts = 0;
  let failed = 0;
  const queue = listPreplanOfflineQueue(departmentId).filter((row) => (
    row.status === "queued" || row.status === "failed"
  ));

  for (const entry of queue) {
    try {
      const server = typeof getServerRecord === "function"
        ? await getServerRecord(entry)
        : null;
      if (server) {
        const detection = detectPreplanOfflineConflict(entry, server);
        if (detection.conflict) {
          conflicts += 1;
          const next = listPreplanOfflineQueue(departmentId).map((row) => (
            row.id === entry.id
              ? { ...row, status: "failed", lastError: detection.message }
              : row
          ));
          writeJson(QUEUE_KEY(departmentId), next);
          continue;
        }
      }
      await applyMutation(entry);
      removePreplanOfflineQueueEntry(departmentId, entry.id);
      if (entry.recordId) removePreplanLocalDraft(departmentId, entry.recordId);
      synced += 1;
    } catch (error) {
      failed += 1;
      const next = listPreplanOfflineQueue(departmentId).map((row) => (
        row.id === entry.id
          ? { ...row, status: "failed", lastError: error?.message || "Sync failed", attempts: (row.attempts || 0) + 1 }
          : row
      ));
      writeJson(QUEUE_KEY(departmentId), next);
    }
  }

  return { synced, conflicts, failed };
}
