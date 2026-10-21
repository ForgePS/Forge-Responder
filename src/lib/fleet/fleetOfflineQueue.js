/** Offline mutation queue + conflict helpers for Phase 15. */

const QUEUE_KEY = (departmentId) => `forge-fleet-offline-queue:${departmentId}`;
const CONFLICT_KEY = (departmentId) => `forge-fleet-offline-conflicts:${departmentId}`;

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
export function listOfflineQueue(departmentId) {
  if (!departmentId) return [];
  const list = readJson(QUEUE_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

/**
 * Enqueue a mutation for later sync.
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
export function enqueueOfflineMutation(departmentId, item = {}) {
  if (!departmentId || !item.collection || !item.recordId) return null;
  const queue = listOfflineQueue(departmentId);
  const entry = {
    id: `OQ-${Date.now().toString(36).toUpperCase()}`,
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
export function removeOfflineQueueEntry(departmentId, entryId) {
  const next = listOfflineQueue(departmentId).filter((row) => row.id !== entryId);
  writeJson(QUEUE_KEY(departmentId), next);
}

/**
 * @param {string} departmentId
 */
export function clearOfflineQueue(departmentId) {
  writeJson(QUEUE_KEY(departmentId), []);
}

/**
 * Compare local draft vs server record for silent-overwrite prevention.
 * @param {{ baseUpdatedAt?: string, baseVersion?: number, payload?: object }} local
 * @param {{ updatedAt?: string, version?: number }} server
 */
export function detectOfflineConflict(local = {}, server = {}) {
  const serverUpdatedAt = server?.updatedAt || "";
  const baseUpdatedAt = local?.baseUpdatedAt || "";
  const serverVersion = Number(server?.version) || 0;
  const baseVersion = Number(local?.baseVersion) || 0;

  if (serverUpdatedAt && baseUpdatedAt && serverUpdatedAt !== baseUpdatedAt) {
    return {
      conflict: true,
      reason: "server_updated_at_changed",
      message: "Server record changed since this offline draft was created.",
      serverUpdatedAt,
      baseUpdatedAt,
    };
  }
  if (serverVersion && baseVersion && serverVersion > baseVersion) {
    return {
      conflict: true,
      reason: "server_version_ahead",
      message: "Server version is newer than the offline base version.",
      serverVersion,
      baseVersion,
    };
  }
  return { conflict: false, reason: "", message: "" };
}

/**
 * @param {string} departmentId
 * @returns {object[]}
 */
export function listOfflineConflicts(departmentId) {
  if (!departmentId) return [];
  const list = readJson(CONFLICT_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

/**
 * @param {string} departmentId
 * @param {object} conflict
 */
export function recordOfflineConflict(departmentId, conflict = {}) {
  if (!departmentId) return null;
  const list = listOfflineConflicts(departmentId);
  const entry = {
    id: conflict.id || `OCF-${Date.now().toString(36).toUpperCase()}`,
    ...conflict,
    recordedAt: nowIso(),
    status: conflict.status || "open",
  };
  list.unshift(entry);
  writeJson(CONFLICT_KEY(departmentId), list.slice(0, 100));
  return entry;
}

/**
 * @param {string} departmentId
 * @param {string} conflictId
 * @param {"keep_local"|"keep_server"|"merged"} resolution
 * @param {string} [actorName]
 */
export function resolveOfflineConflict(departmentId, conflictId, resolution, actorName = "User") {
  const list = listOfflineConflicts(departmentId).map((row) => {
    if (row.id !== conflictId) return row;
    return {
      ...row,
      status: "resolved",
      resolution,
      resolvedAt: nowIso(),
      resolvedBy: actorName,
    };
  });
  writeJson(CONFLICT_KEY(departmentId), list);
  return list.find((row) => row.id === conflictId) || null;
}

/**
 * Summarize offline health for hardening board.
 * @param {string} departmentId
 */
export function getOfflineQueueSummary(departmentId) {
  const queue = listOfflineQueue(departmentId);
  const conflicts = listOfflineConflicts(departmentId);
  return {
    queued: queue.length,
    openConflicts: conflicts.filter((row) => row.status === "open").length,
    resolvedConflicts: conflicts.filter((row) => row.status === "resolved").length,
    oldestQueuedAt: queue[queue.length - 1]?.clientUpdatedAt || "",
    queue,
    conflicts,
  };
}
