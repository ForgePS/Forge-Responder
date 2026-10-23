/** Unified offline queue, cache, attachments, and conflicts for inspections Phase 11. */

import { listPreplanLocalDrafts, listPreplanOfflineQueue } from "./preplanOfflineQueue.js";
import { DEFAULT_DEVICE_POLICY, normalizeDevicePolicy } from "./offlineDefaults.js";

const QUEUE_KEY = (departmentId) => `forge-insp-offline-queue:${departmentId}`;
const CONFLICT_KEY = (departmentId) => `forge-insp-offline-conflicts:${departmentId}`;
const DRAFT_KEY = (departmentId) => `forge-insp-local-drafts:${departmentId}`;
const CACHE_KEY = (departmentId) => `forge-insp-download-cache:${departmentId}`;
const ATTACH_KEY = (departmentId) => `forge-insp-attachment-queue:${departmentId}`;
const SYNC_META_KEY = (departmentId) => `forge-insp-sync-meta:${departmentId}`;
const POLICY_CACHE_KEY = (departmentId) => `forge-insp-device-policy:${departmentId}`;

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

export function isBrowserOnline() {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine !== false;
}

export function getInspectionSyncMeta(departmentId) {
  if (!departmentId) return { lastSuccessfulSyncAt: "", lastAttemptAt: "", lastError: "" };
  const meta = readJson(SYNC_META_KEY(departmentId), {});
  return {
    lastSuccessfulSyncAt: meta.lastSuccessfulSyncAt || "",
    lastAttemptAt: meta.lastAttemptAt || "",
    lastError: meta.lastError || "",
  };
}

export function setInspectionSyncMeta(departmentId, patch = {}) {
  if (!departmentId) return null;
  const next = { ...getInspectionSyncMeta(departmentId), ...patch };
  writeJson(SYNC_META_KEY(departmentId), next);
  return next;
}

export function getCachedDevicePolicy(departmentId) {
  if (!departmentId) return normalizeDevicePolicy(DEFAULT_DEVICE_POLICY);
  const cached = readJson(POLICY_CACHE_KEY(departmentId), null);
  return normalizeDevicePolicy(cached || DEFAULT_DEVICE_POLICY, departmentId);
}

export function cacheDevicePolicy(departmentId, policy = {}) {
  const next = normalizeDevicePolicy(policy, departmentId);
  writeJson(POLICY_CACHE_KEY(departmentId), next);
  return next;
}

export function listInspectionOfflineQueue(departmentId) {
  if (!departmentId) return [];
  const list = readJson(QUEUE_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

export function enqueueInspectionOfflineMutation(departmentId, item = {}) {
  if (!departmentId || !item.collection || !item.recordId) return null;
  const policy = getCachedDevicePolicy(departmentId);
  const queue = listInspectionOfflineQueue(departmentId).filter(
    (row) => !(row.collection === item.collection && row.recordId === item.recordId && row.status === "queued")
  );
  const entry = {
    id: item.id || `IOQ-${Date.now().toString(36).toUpperCase()}`,
    departmentId,
    collection: item.collection,
    recordId: item.recordId,
    operation: item.operation || "update",
    entityLabel: item.entityLabel || item.recordId,
    payload: item.payload || {},
    baseUpdatedAt: item.baseUpdatedAt || "",
    baseVersion: Number(item.baseVersion) || 0,
    clientUpdatedAt: item.clientUpdatedAt || nowIso(),
    originalClientAt: item.originalClientAt || nowIso(),
    status: item.status || "queued",
    attempts: Number(item.attempts) || 0,
    lastError: item.lastError || "",
  };
  queue.unshift(entry);
  writeJson(QUEUE_KEY(departmentId), queue.slice(0, policy.maxQueueItems));
  return entry;
}

export function updateInspectionOfflineQueueEntry(departmentId, entryId, patch = {}) {
  const next = listInspectionOfflineQueue(departmentId).map((row) => (
    row.id === entryId ? { ...row, ...patch } : row
  ));
  writeJson(QUEUE_KEY(departmentId), next);
  return next.find((row) => row.id === entryId) || null;
}

export function removeInspectionOfflineQueueEntry(departmentId, entryId) {
  const next = listInspectionOfflineQueue(departmentId).filter((row) => row.id !== entryId);
  writeJson(QUEUE_KEY(departmentId), next);
}

export function clearInspectionOfflineQueue(departmentId) {
  writeJson(QUEUE_KEY(departmentId), []);
}

export function listInspectionLocalDrafts(departmentId) {
  if (!departmentId) return {};
  const map = readJson(DRAFT_KEY(departmentId), {});
  return map && typeof map === "object" ? map : {};
}

export function saveInspectionLocalDraft(departmentId, draftKey, payload = {}) {
  if (!departmentId || !draftKey) return null;
  const policy = getCachedDevicePolicy(departmentId);
  const map = listInspectionLocalDrafts(departmentId);
  map[draftKey] = {
    ...payload,
    draftKey,
    updatedAt: nowIso(),
  };
  const keys = Object.keys(map).sort((a, b) => String(map[b].updatedAt).localeCompare(String(map[a].updatedAt)));
  const trimmed = {};
  for (const key of keys.slice(0, policy.maxLocalDrafts)) trimmed[key] = map[key];
  writeJson(DRAFT_KEY(departmentId), trimmed);
  return trimmed[draftKey] || null;
}

export function getInspectionLocalDraft(departmentId, draftKey) {
  if (!departmentId || !draftKey) return null;
  return listInspectionLocalDrafts(departmentId)[draftKey] || null;
}

export function removeInspectionLocalDraft(departmentId, draftKey) {
  const map = listInspectionLocalDrafts(departmentId);
  delete map[draftKey];
  writeJson(DRAFT_KEY(departmentId), map);
}

export function listInspectionDownloadCache(departmentId) {
  if (!departmentId) {
    return { downloadedAt: "", packs: {}, inspections: [], occupancies: [], violations: [], templates: [] };
  }
  const cache = readJson(CACHE_KEY(departmentId), null);
  if (!cache || typeof cache !== "object") {
    return { downloadedAt: "", packs: {}, inspections: [], occupancies: [], violations: [], templates: [] };
  }
  return {
    downloadedAt: cache.downloadedAt || "",
    packs: cache.packs || {},
    inspections: Array.isArray(cache.inspections) ? cache.inspections : [],
    occupancies: Array.isArray(cache.occupancies) ? cache.occupancies : [],
    violations: Array.isArray(cache.violations) ? cache.violations : [],
    templates: Array.isArray(cache.templates) ? cache.templates : [],
  };
}

export function saveInspectionDownloadCache(departmentId, cache = {}) {
  if (!departmentId) return null;
  const next = {
    downloadedAt: cache.downloadedAt || nowIso(),
    packs: cache.packs || {},
    inspections: Array.isArray(cache.inspections) ? cache.inspections : [],
    occupancies: Array.isArray(cache.occupancies) ? cache.occupancies : [],
    violations: Array.isArray(cache.violations) ? cache.violations : [],
    templates: Array.isArray(cache.templates) ? cache.templates : [],
  };
  writeJson(CACHE_KEY(departmentId), next);
  return next;
}

export function clearInspectionDownloadCache(departmentId) {
  writeJson(CACHE_KEY(departmentId), {
    downloadedAt: "",
    packs: {},
    inspections: [],
    occupancies: [],
    violations: [],
    templates: [],
  });
}

export function listInspectionAttachmentQueue(departmentId) {
  if (!departmentId) return [];
  const list = readJson(ATTACH_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

export function enqueueInspectionAttachment(departmentId, item = {}) {
  if (!departmentId || !item.inspectionId || !item.fileName) return null;
  const policy = getCachedDevicePolicy(departmentId);
  const queue = listInspectionAttachmentQueue(departmentId);
  const entry = {
    id: item.id || `IAT-${Date.now().toString(36).toUpperCase()}`,
    departmentId,
    inspectionId: item.inspectionId,
    occupancyId: item.occupancyId || "",
    fileName: item.fileName,
    mimeType: item.mimeType || "application/octet-stream",
    sizeBytes: Number(item.sizeBytes) || 0,
    kind: item.kind || "photo",
    status: item.status || "queued",
    note: item.note || "",
    clientUpdatedAt: nowIso(),
    attempts: 0,
    lastError: "",
  };
  queue.unshift(entry);
  writeJson(ATTACH_KEY(departmentId), queue.slice(0, policy.maxAttachmentQueueItems));
  return entry;
}

export function updateInspectionAttachment(departmentId, attachmentId, patch = {}) {
  const next = listInspectionAttachmentQueue(departmentId).map((row) => (
    row.id === attachmentId ? { ...row, ...patch } : row
  ));
  writeJson(ATTACH_KEY(departmentId), next);
  return next.find((row) => row.id === attachmentId) || null;
}

export function removeInspectionAttachment(departmentId, attachmentId) {
  const next = listInspectionAttachmentQueue(departmentId).filter((row) => row.id !== attachmentId);
  writeJson(ATTACH_KEY(departmentId), next);
}

export function clearInspectionAttachmentQueue(departmentId) {
  writeJson(ATTACH_KEY(departmentId), []);
}

export function detectInspectionOfflineConflict(local = {}, server = {}) {
  const serverUpdatedAt = server?.updatedAt || "";
  const baseUpdatedAt = local?.baseUpdatedAt || "";
  const serverVersion = Number(server?.version) || 0;
  const baseVersion = Number(local?.baseVersion) || 0;
  const serverStatus = String(server?.status || "").toLowerCase();

  if (["completed", "archived", "cancelled"].includes(serverStatus) && local?.payload) {
    return {
      conflict: true,
      reason: "server_locked",
      message: "Server record is completed/locked and cannot be overwritten by an offline draft.",
      escalate: true,
    };
  }
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

export function listInspectionOfflineConflicts(departmentId) {
  if (!departmentId) return [];
  const list = readJson(CONFLICT_KEY(departmentId), []);
  return Array.isArray(list) ? list : [];
}

export function recordInspectionOfflineConflict(departmentId, conflict = {}) {
  if (!departmentId) return null;
  const list = listInspectionOfflineConflicts(departmentId);
  const entry = {
    id: conflict.id || `ICF-${Date.now().toString(36).toUpperCase()}`,
    ...conflict,
    recordedAt: nowIso(),
    status: conflict.status || "open",
  };
  list.unshift(entry);
  writeJson(CONFLICT_KEY(departmentId), list.slice(0, 100));
  return entry;
}

export function resolveInspectionOfflineConflict(departmentId, conflictId, resolution, actorName = "User") {
  const list = listInspectionOfflineConflicts(departmentId).map((row) => {
    if (row.id !== conflictId) return row;
    return {
      ...row,
      status: resolution === "escalate" ? "escalated" : "resolved",
      resolution,
      resolvedAt: nowIso(),
      resolvedBy: actorName,
    };
  });
  writeJson(CONFLICT_KEY(departmentId), list);
  return list.find((row) => row.id === conflictId) || null;
}

/**
 * Purge local offline data per device policy (age / caps).
 */
export function purgeInspectionLocalData(departmentId, policyInput = null) {
  if (!departmentId) return { purgedDrafts: 0, purgedQueue: 0, purgedAttachments: 0, purgedCache: false };
  const policy = normalizeDevicePolicy(policyInput || getCachedDevicePolicy(departmentId), departmentId);
  const cutoff = Date.now() - policy.maxCacheDays * 24 * 60 * 60 * 1000;
  let purgedDrafts = 0;
  let purgedQueue = 0;
  let purgedAttachments = 0;

  const drafts = listInspectionLocalDrafts(departmentId);
  const nextDrafts = {};
  for (const [key, value] of Object.entries(drafts)) {
    const ts = Date.parse(value?.updatedAt || "");
    if (Number.isFinite(ts) && ts < cutoff) {
      purgedDrafts += 1;
      continue;
    }
    nextDrafts[key] = value;
  }
  writeJson(DRAFT_KEY(departmentId), nextDrafts);

  const queue = listInspectionOfflineQueue(departmentId).filter((row) => {
    const ts = Date.parse(row.clientUpdatedAt || "");
    if (Number.isFinite(ts) && ts < cutoff) {
      purgedQueue += 1;
      return false;
    }
    return true;
  });
  writeJson(QUEUE_KEY(departmentId), queue.slice(0, policy.maxQueueItems));

  const attachments = listInspectionAttachmentQueue(departmentId).filter((row) => {
    const ts = Date.parse(row.clientUpdatedAt || "");
    if (Number.isFinite(ts) && ts < cutoff) {
      purgedAttachments += 1;
      return false;
    }
    return true;
  });
  writeJson(ATTACH_KEY(departmentId), attachments.slice(0, policy.maxAttachmentQueueItems));

  const cache = listInspectionDownloadCache(departmentId);
  let purgedCache = false;
  const cacheTs = Date.parse(cache.downloadedAt || "");
  if (Number.isFinite(cacheTs) && cacheTs < cutoff) {
    clearInspectionDownloadCache(departmentId);
    purgedCache = true;
  }

  return { purgedDrafts, purgedQueue, purgedAttachments, purgedCache };
}

export function clearAllInspectionLocalData(departmentId) {
  clearInspectionOfflineQueue(departmentId);
  clearInspectionAttachmentQueue(departmentId);
  clearInspectionDownloadCache(departmentId);
  writeJson(DRAFT_KEY(departmentId), {});
  writeJson(CONFLICT_KEY(departmentId), []);
  setInspectionSyncMeta(departmentId, { lastError: "", lastAttemptAt: nowIso() });
}

/**
 * Combined offline health summary (inspections + preplan local queues).
 */
export function getInspectionOfflineSummary(departmentId) {
  const queue = listInspectionOfflineQueue(departmentId);
  const conflicts = listInspectionOfflineConflicts(departmentId);
  const drafts = Object.values(listInspectionLocalDrafts(departmentId));
  const attachments = listInspectionAttachmentQueue(departmentId);
  const cache = listInspectionDownloadCache(departmentId);
  const preplanQueue = listPreplanOfflineQueue(departmentId);
  const preplanDrafts = Object.keys(listPreplanLocalDrafts(departmentId));
  const meta = getInspectionSyncMeta(departmentId);
  const policy = getCachedDevicePolicy(departmentId);

  return {
    online: isBrowserOnline(),
    queued: queue.length,
    failed: queue.filter((row) => row.status === "failed").length,
    openConflicts: conflicts.filter((row) => row.status === "open" || row.status === "escalated").length,
    resolvedConflicts: conflicts.filter((row) => row.status === "resolved").length,
    localDrafts: drafts.length,
    attachmentsQueued: attachments.filter((row) => row.status === "queued" || row.status === "failed").length,
    cachedInspections: cache.inspections.length,
    cachedOccupancies: cache.occupancies.length,
    cachedViolations: cache.violations.length,
    preplanQueued: preplanQueue.length,
    preplanDrafts: preplanDrafts.length,
    lastSuccessfulSyncAt: meta.lastSuccessfulSyncAt,
    lastAttemptAt: meta.lastAttemptAt,
    lastError: meta.lastError,
    policy,
    queue,
    conflicts,
    drafts,
    attachments,
    cache,
  };
}
