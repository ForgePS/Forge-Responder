/** Soft lifecycle for uploaded objects — mirrors academy Disable/Disconnect. */

export const OBJECT_LIFECYCLE = {
  ACTIVE: "active",
  ARCHIVED: "archived",
  DELETED: "deleted",
};

export function normalizeObjectLifecycle(record = {}) {
  if (!record || typeof record !== "object") return OBJECT_LIFECYCLE.ACTIVE;
  const lifecycle = String(record.lifecycleStatus || "").toLowerCase();
  if (lifecycle === OBJECT_LIFECYCLE.ARCHIVED || lifecycle === "suspended") return OBJECT_LIFECYCLE.ARCHIVED;
  if (lifecycle === OBJECT_LIFECYCLE.DELETED || lifecycle === "disconnected") return OBJECT_LIFECYCLE.DELETED;
  return OBJECT_LIFECYCLE.ACTIVE;
}

export function isObjectActive(record) {
  return normalizeObjectLifecycle(record) === OBJECT_LIFECYCLE.ACTIVE;
}

export function isObjectArchived(record) {
  return normalizeObjectLifecycle(record) === OBJECT_LIFECYCLE.ARCHIVED;
}

export function isObjectDeleted(record) {
  return normalizeObjectLifecycle(record) === OBJECT_LIFECYCLE.DELETED;
}

/** Default list: hide archived + deleted (like academy hiding suspended/disconnected from primary ops). */
export function isObjectVisibleInActiveList(record) {
  return isObjectActive(record);
}

export function isObjectVisibleInArchivedList(record) {
  return isObjectArchived(record);
}

export function archiveObject(record, actor = {}) {
  const now = new Date().toISOString();
  return {
    ...record,
    lifecycleStatus: OBJECT_LIFECYCLE.ARCHIVED,
    archivedAt: now,
    archivedBy: actor.uid || actor.name || "",
    updatedAt: now,
  };
}

export function restoreObject(record, actor = {}) {
  const now = new Date().toISOString();
  const next = {
    ...record,
    lifecycleStatus: OBJECT_LIFECYCLE.ACTIVE,
    restoredAt: now,
    restoredBy: actor.uid || actor.name || "",
    updatedAt: now,
  };
  delete next.archivedAt;
  delete next.archivedBy;
  return next;
}

/**
 * Soft-delete (academy Disconnect analogue). Keeps metadata for audit; clears live URLs.
 * Pass { purgeUrls: true } to blank download/file URLs so the file is no longer openable.
 */
export function softDeleteObject(record, actor = {}, options = {}) {
  const now = new Date().toISOString();
  const next = {
    ...record,
    lifecycleStatus: OBJECT_LIFECYCLE.DELETED,
    deletedAt: now,
    deletedBy: actor.uid || actor.name || "",
    updatedAt: now,
    enabled: false,
  };
  if (options.purgeUrls !== false) {
    if ("fileUrl" in next) next.fileUrl = "";
    if ("documentUrl" in next) next.documentUrl = "";
    if ("downloadUrl" in next) next.downloadUrl = "";
    if ("photo_url" in next) next.photo_url = "";
    if ("url" in next) next.url = "";
  }
  return next;
}

export function withActiveLifecycle(record = {}) {
  return {
    ...record,
    lifecycleStatus: OBJECT_LIFECYCLE.ACTIVE,
  };
}
