/**
 * Offline incident report sync engine (feature-flagged).
 * Persists drafts locally and syncs when connectivity returns.
 */

const OFFLINE_QUEUE_KEY = "neris-offline-queue";

/** @returns {Array<Record<string, unknown>>} */
export function loadOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch {
    return [];
  }
}

/** @param {Array<Record<string, unknown>>} queue */
function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Queue an incident for sync when back online.
 * @param {Record<string, unknown>} report
 */
export function queueOfflineReport(report) {
  const queue = loadOfflineQueue().filter((item) => item.id !== report.id);
  queue.push({
    ...report,
    syncStatus: "pending",
    isOfflineCreated: true,
    queuedAt: new Date().toISOString(),
  });
  saveOfflineQueue(queue);
  return queue;
}

/**
 * @param {Array<Record<string, unknown>>} serverReports
 * @param {(report: Record<string, unknown>) => Record<string, unknown>} mergeFn
 */
export function syncOfflineQueue(serverReports = [], mergeFn = (r) => r) {
  const queue = loadOfflineQueue();
  if (!queue.length) return { merged: serverReports, synced: 0, conflicts: [] };

  const byId = new Map(serverReports.map((r) => [r.id, r]));
  const conflicts = [];
  let synced = 0;

  for (const pending of queue) {
    const existing = byId.get(pending.id);
    if (existing && existing.updatedAt && pending.updatedAt
      && new Date(existing.updatedAt) > new Date(pending.updatedAt)) {
      conflicts.push({ id: pending.id, server: existing, local: pending });
      continue;
    }
    byId.set(pending.id, mergeFn({ ...existing, ...pending, syncStatus: "synced" }));
    synced += 1;
  }

  if (synced > 0) {
    saveOfflineQueue(queue.filter((item) =>
      conflicts.some((c) => c.id === item.id),
    ));
  } else if (!conflicts.length) {
    saveOfflineQueue([]);
  }

  return { merged: [...byId.values()], synced, conflicts };
}

/** @returns {'synced' | 'pending' | 'offline'} */
export function resolveSyncStatus(report) {
  if (report.syncStatus === "pending" || report.isOfflineCreated) {
    const inQueue = loadOfflineQueue().some((item) => item.id === report.id);
    return inQueue ? "pending" : (report.syncStatus || "synced");
  }
  return report.syncStatus || "synced";
}
