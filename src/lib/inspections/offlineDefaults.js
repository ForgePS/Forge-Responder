/** Phase 11 — offline / mobile hardening defaults. */

export const OFFLINE_QUEUE_STATUSES = [
  "queued",
  "syncing",
  "failed",
  "synced",
];

export const OFFLINE_QUEUE_STATUS_LABELS = {
  queued: "Queued",
  syncing: "Syncing",
  failed: "Failed",
  synced: "Synced",
};

export const CONFLICT_RESOLUTIONS = [
  { id: "keep_local", label: "Keep local" },
  { id: "keep_server", label: "Keep server" },
  { id: "merged", label: "Merged" },
  { id: "escalate", label: "Escalate to supervisor" },
];

export const DOWNLOAD_PACK_TYPES = [
  { id: "assigned_inspections", label: "Assigned inspections" },
  { id: "occupancies", label: "Occupancy details" },
  { id: "templates", label: "Template snapshots" },
  { id: "open_violations", label: "Open violations" },
  { id: "favorites", label: "Code / violation favorites" },
];

export const ATTACHMENT_QUEUE_STATUSES = [
  "queued",
  "uploading",
  "failed",
  "uploaded",
];

export const DEFAULT_DEVICE_POLICY = {
  id: "main",
  name: "Default device policy",
  maxCacheDays: 14,
  maxQueueItems: 200,
  maxAttachmentQueueItems: 50,
  maxLocalDrafts: 100,
  purgeOnLogout: true,
  allowOfflineDrafts: true,
  allowPhotoOffline: true,
  allowSignatureOffline: true,
  autoSyncOnReconnect: true,
  encryptSensitiveFlag: true,
  requireWifiForAttachments: false,
  notes: "Drafts, queues and attachments are kept on this device until the next sync. Encryption at rest depends on the device and browser.",
};

export function getDownloadPackTypes() {
  return DOWNLOAD_PACK_TYPES.map((row) => ({ ...row }));
}

export function getConflictResolutions() {
  return CONFLICT_RESOLUTIONS.map((row) => ({ ...row }));
}

export function labelForOfflineQueueStatus(status) {
  return OFFLINE_QUEUE_STATUS_LABELS[status] || status || "—";
}

export function normalizeDevicePolicy(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || DEFAULT_DEVICE_POLICY.id,
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || DEFAULT_DEVICE_POLICY.name).trim(),
    maxCacheDays: Math.max(1, Number(data.maxCacheDays) || DEFAULT_DEVICE_POLICY.maxCacheDays),
    maxQueueItems: Math.max(10, Number(data.maxQueueItems) || DEFAULT_DEVICE_POLICY.maxQueueItems),
    maxAttachmentQueueItems: Math.max(5, Number(data.maxAttachmentQueueItems) || DEFAULT_DEVICE_POLICY.maxAttachmentQueueItems),
    maxLocalDrafts: Math.max(10, Number(data.maxLocalDrafts) || DEFAULT_DEVICE_POLICY.maxLocalDrafts),
    purgeOnLogout: data.purgeOnLogout !== false,
    allowOfflineDrafts: data.allowOfflineDrafts !== false,
    allowPhotoOffline: data.allowPhotoOffline !== false,
    allowSignatureOffline: data.allowSignatureOffline !== false,
    autoSyncOnReconnect: data.autoSyncOnReconnect !== false,
    encryptSensitiveFlag: data.encryptSensitiveFlag !== false,
    requireWifiForAttachments: Boolean(data.requireWifiForAttachments),
    notes: data.notes || DEFAULT_DEVICE_POLICY.notes,
    updatedAt: data.updatedAt || "",
    updatedBy: data.updatedBy || "",
    updatedByName: data.updatedByName || "",
  };
}
