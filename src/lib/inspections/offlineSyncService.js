import {
  createRecord,
  getRecord,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { listInspectionRecords } from "./inspectionRecords.js";
import { listOccupancyRecords } from "./occupancyService.js";
import { listViolations } from "./violationService.js";
import { listInspectionTypes, listTemplateVersions } from "./inspectionConfigService.js";
import { addInspectionAttachment, getInspectionRecord, saveInspectionDraft } from "./inspectionWorkflow.js";
import { deleteAttachmentBlob, readAttachmentBlob, saveAttachmentBlob } from "./attachmentBlobStore.js";
import { uploadFirebaseFile } from "../firebaseClient.js";
import {
  DEFAULT_DEVICE_POLICY,
  normalizeDevicePolicy,
} from "./offlineDefaults.js";
import {
  cacheDevicePolicy,
  clearInspectionOfflineQueue,
  detectInspectionOfflineConflict,
  enqueueInspectionAttachment,
  enqueueInspectionOfflineMutation,
  getCachedDevicePolicy,
  getInspectionOfflineSummary,
  isBrowserOnline,
  listInspectionAttachmentQueue,
  listInspectionOfflineQueue,
  purgeInspectionLocalData,
  recordInspectionOfflineConflict,
  removeInspectionAttachment,
  removeInspectionLocalDraft,
  removeInspectionOfflineQueueEntry,
  resolveInspectionOfflineConflict,
  saveInspectionDownloadCache,
  saveInspectionLocalDraft,
  setInspectionSyncMeta,
  updateInspectionAttachment,
  updateInspectionOfflineQueueEntry,
} from "./inspectionOfflineQueue.js";
import {
  flushPreplanOfflineQueue,
  getPreplanOfflineFlushPlan,
} from "./preplanOfflineQueue.js";
import {
  INSPECTION_DEVICE_POLICIES_COLLECTION,
  INSPECTION_DEVICE_POLICIES_DOC_ID,
  INSPECTIONS_COLLECTION,
  PREPLANS_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

export async function loadInspectionDevicePolicy(departmentId) {
  if (!departmentId) return normalizeDevicePolicy(DEFAULT_DEVICE_POLICY);
  const existing = await getRecord(
    departmentId,
    INSPECTION_DEVICE_POLICIES_COLLECTION,
    INSPECTION_DEVICE_POLICIES_DOC_ID
  );
  const policy = normalizeDevicePolicy(existing || DEFAULT_DEVICE_POLICY, departmentId);
  cacheDevicePolicy(departmentId, policy);
  return policy;
}

export async function saveInspectionDevicePolicy(departmentId, draft = {}, actor = {}) {
  const stamp = nowIso();
  const record = normalizeDevicePolicy({
    ...DEFAULT_DEVICE_POLICY,
    ...draft,
    id: INSPECTION_DEVICE_POLICIES_DOC_ID,
    updatedAt: stamp,
    updatedBy: actor.actorUid || "",
    updatedByName: actor.actorName || "",
  }, departmentId);

  const existing = await getRecord(
    departmentId,
    INSPECTION_DEVICE_POLICIES_COLLECTION,
    INSPECTION_DEVICE_POLICIES_DOC_ID
  );
  if (existing) {
    await updateRecord(
      departmentId,
      INSPECTION_DEVICE_POLICIES_COLLECTION,
      INSPECTION_DEVICE_POLICIES_DOC_ID,
      record
    );
  } else {
    await createRecord(
      departmentId,
      INSPECTION_DEVICE_POLICIES_COLLECTION,
      INSPECTION_DEVICE_POLICIES_DOC_ID,
      record
    );
  }
  cacheDevicePolicy(departmentId, record);
  await writeInspectionAuditLog(departmentId, {
    action: "offline.policy.update",
    entityType: "device_policy",
    entityId: INSPECTION_DEVICE_POLICIES_DOC_ID,
    summary: "Updated inspection device policy",
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

/**
 * Download assigned (or all open) inspections + related occupancy/violation/template packs.
 */
export async function downloadInspectionOfflinePack(departmentId, options = {}, actor = {}) {
  const inspectorId = options.inspectorId || "";
  const [inspections, occupancies, violations, types, policy] = await Promise.all([
    listInspectionRecords(departmentId, inspectorId ? { assignedInspectorId: inspectorId } : {}),
    listOccupancyRecords(departmentId),
    listViolations(departmentId),
    listInspectionTypes(departmentId).catch(() => []),
    loadInspectionDevicePolicy(departmentId),
  ]);

  const openStatuses = new Set(["draft", "scheduled", "in_progress", "awaiting_approval", "overdue"]);
  let packInspections = inspections.filter((row) => openStatuses.has(String(row.status || "").toLowerCase()));
  if (options.includeCompleted) {
    packInspections = inspections;
  }

  const occupancyIds = new Set(packInspections.map((row) => row.occupancyId).filter(Boolean));
  const packOccupancies = occupancies.filter((row) => occupancyIds.has(row.id));
  const packViolations = violations.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    if (["closed", "corrected", "dismissed", "void"].includes(status)) return false;
    return !row.occupancyId || occupancyIds.has(row.occupancyId);
  });

  const templateIds = [...new Set(packInspections.map((row) => row.templateId || row.templateSnapshot?.id).filter(Boolean))];
  const templates = [];
  for (const templateId of templateIds.slice(0, 40)) {
    const versions = await listTemplateVersions(departmentId, templateId).catch(() => []);
    if (versions[0]) templates.push(versions[0]);
    else {
      const fromInspection = packInspections.find((row) => (row.templateId || row.templateSnapshot?.id) === templateId);
      if (fromInspection?.templateSnapshot) templates.push(fromInspection.templateSnapshot);
    }
  }

  const cache = saveInspectionDownloadCache(departmentId, {
    downloadedAt: nowIso(),
    packs: {
      assigned_inspections: true,
      occupancies: true,
      open_violations: true,
      templates: true,
      favorites: Boolean(options.includeFavorites),
    },
    inspections: packInspections,
    occupancies: packOccupancies,
    violations: packViolations,
    templates,
  });

  purgeInspectionLocalData(departmentId, policy);

  await writeInspectionAuditLog(departmentId, {
    action: "offline.pack.download",
    entityType: "offline_pack",
    entityId: "download",
    summary: `Downloaded offline pack (${packInspections.length} inspections, ${packOccupancies.length} occupancies)`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return {
    cache,
    counts: {
      inspections: packInspections.length,
      occupancies: packOccupancies.length,
      violations: packViolations.length,
      templates: templates.length,
    },
  };
}

/**
 * Save draft online when possible; always keep a local copy and queue when offline/failed.
 */
export async function saveInspectionDraftWithOffline(departmentId, inspectionId, draftPayload = {}, audit = {}) {
  const policy = getCachedDevicePolicy(departmentId);
  const existing = await getInspectionRecord(departmentId, inspectionId).catch(() => null);
  const localPayload = {
    inspectionId,
    ...draftPayload,
    baseUpdatedAt: existing?.updatedAt || "",
    baseVersion: Number(existing?.version) || 0,
    occupancyId: existing?.occupancyId || "",
    inspectionNumber: existing?.inspectionNumber || inspectionId,
  };

  if (policy.allowOfflineDrafts) {
    saveInspectionLocalDraft(departmentId, inspectionId, localPayload);
  }

  const online = isBrowserOnline();
  if (online) {
    try {
      const saved = await saveInspectionDraft(departmentId, inspectionId, draftPayload, audit);
      removeInspectionLocalDraft(departmentId, inspectionId);
      return { record: saved, mode: "online", queued: false };
    } catch (error) {
      if (!policy.allowOfflineDrafts) throw error;
      enqueueInspectionOfflineMutation(departmentId, {
        collection: INSPECTIONS_COLLECTION,
        recordId: inspectionId,
        operation: "update",
        entityLabel: existing?.inspectionNumber || inspectionId,
        payload: draftPayload,
        baseUpdatedAt: existing?.updatedAt || "",
        baseVersion: Number(existing?.version) || 0,
        lastError: error?.message || "Online save failed",
      });
      return {
        record: existing ? { ...existing, ...draftPayload, updatedAt: nowIso() } : localPayload,
        mode: "queued_after_error",
        queued: true,
        error: error?.message || "Online save failed",
      };
    }
  }

  if (!policy.allowOfflineDrafts) {
    throw new Error("Device is offline and offline drafts are disabled by policy.");
  }

  enqueueInspectionOfflineMutation(departmentId, {
    collection: INSPECTIONS_COLLECTION,
    recordId: inspectionId,
    operation: "update",
    entityLabel: existing?.inspectionNumber || inspectionId,
    payload: draftPayload,
    baseUpdatedAt: existing?.updatedAt || "",
    baseVersion: Number(existing?.version) || 0,
  });

  return {
    record: existing ? { ...existing, ...draftPayload, updatedAt: nowIso() } : localPayload,
    mode: "offline",
    queued: true,
  };
}

/** Queue a file captured offline. `input.file` is the File/Blob; it is kept on the device until sync. */
export async function queueInspectionAttachment(departmentId, input = {}, actor = {}) {
  const policy = getCachedDevicePolicy(departmentId);
  if (!policy.allowPhotoOffline && input.kind === "photo") {
    throw new Error("Photo offline capture is disabled by device policy.");
  }
  if (!policy.allowSignatureOffline && input.kind === "signature") {
    throw new Error("Signature offline capture is disabled by device policy.");
  }
  if (policy.requireWifiForAttachments && !isBrowserOnline()) {
    throw new Error("Attachments require Wi-Fi per device policy.");
  }
  if (!input.file) throw new Error("Choose a file to attach.");
  const entry = enqueueInspectionAttachment(departmentId, {
    ...input,
    fileName: input.fileName || input.file.name || "attachment",
    mimeType: input.file.type || "application/octet-stream",
    sizeBytes: input.file.size || 0,
  });
  if (!entry) throw new Error("Enter the inspection and choose a file.");
  try {
    await saveAttachmentBlob(entry.id, input.file);
  } catch (error) {
    removeInspectionAttachment(departmentId, entry.id);
    throw error;
  }
  await writeInspectionAuditLog(departmentId, {
    action: "offline.attachment.queue",
    entityType: "attachment_queue",
    entityId: entry?.id || "",
    summary: `Queued offline attachment ${input.fileName || ""}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return entry;
}

/**
 * Flush mutation + attachment queues. Attachments are uploaded to Storage and added to their inspection.
 */
let syncInProgress = false;

export async function syncInspectionOfflineQueue(departmentId, actor = {}) {
  if (syncInProgress) return { synced: 0, conflicts: 0, failed: 0, attachments: 0, message: "A sync is already running." };
  syncInProgress = true;
  try {
    return await runInspectionOfflineSync(departmentId, actor);
  } finally {
    syncInProgress = false;
  }
}

async function runInspectionOfflineSync(departmentId, actor = {}) {
  setInspectionSyncMeta(departmentId, { lastAttemptAt: nowIso(), lastError: "" });
  if (!isBrowserOnline()) {
    const message = "Device is offline — sync deferred.";
    setInspectionSyncMeta(departmentId, { lastError: message });
    return { synced: 0, conflicts: 0, failed: 0, attachments: 0, message };
  }

  const policy = await loadInspectionDevicePolicy(departmentId);
  let synced = 0;
  let conflicts = 0;
  let failed = 0;

  const queue = listInspectionOfflineQueue(departmentId).filter((row) => row.status === "queued" || row.status === "failed");
  for (const entry of queue) {
    updateInspectionOfflineQueueEntry(departmentId, entry.id, { status: "syncing", attempts: (entry.attempts || 0) + 1 });
    try {
      if (entry.collection === INSPECTIONS_COLLECTION) {
        const server = await getInspectionRecord(departmentId, entry.recordId);
        if (!server) throw new Error("Inspection not found on server.");
        const detection = detectInspectionOfflineConflict(entry, server);
        if (detection.conflict) {
          recordInspectionOfflineConflict(departmentId, {
            queueEntryId: entry.id,
            collection: entry.collection,
            recordId: entry.recordId,
            entityLabel: entry.entityLabel,
            reason: detection.reason,
            message: detection.message,
            escalate: Boolean(detection.escalate),
            localPayload: entry.payload,
            serverUpdatedAt: server.updatedAt,
            status: detection.escalate ? "escalated" : "open",
          });
          updateInspectionOfflineQueueEntry(departmentId, entry.id, {
            status: "failed",
            lastError: detection.message,
          });
          conflicts += 1;
          continue;
        }
        await saveInspectionDraft(departmentId, entry.recordId, entry.payload || {}, actor);
        removeInspectionLocalDraft(departmentId, entry.recordId);
      } else {
        throw new Error(`Unsupported offline collection: ${entry.collection}`);
      }
      removeInspectionOfflineQueueEntry(departmentId, entry.id);
      synced += 1;
    } catch (error) {
      updateInspectionOfflineQueueEntry(departmentId, entry.id, {
        status: "failed",
        lastError: error?.message || "Sync failed",
      });
      failed += 1;
    }
  }

  let attachments = 0;
  // "uploading" here means an earlier sync was interrupted (page closed mid-upload): retry it.
  for (const item of listInspectionAttachmentQueue(departmentId).filter((row) => ["queued", "failed", "uploading"].includes(row.status))) {
    updateInspectionAttachment(departmentId, item.id, { status: "uploading", attempts: (item.attempts || 0) + 1 });
    try {
      const blob = await readAttachmentBlob(item.id);
      if (!blob) throw new Error("The file is no longer on this device. Capture it again.");
      const safeName = String(item.fileName || "attachment").replace(/[^A-Za-z0-9._-]+/g, "_");
      const storagePath = `departments/${departmentId}/inspections/${item.inspectionId}/attachments/${item.id}-${safeName}`;
      const file = blob instanceof File ? blob : new File([blob], safeName, { type: item.mimeType || blob.type || "application/octet-stream" });
      const uploaded = await uploadFirebaseFile(storagePath, file);
      await addInspectionAttachment(departmentId, item.inspectionId, {
        id: item.id,
        kind: item.kind || "photo",
        fileName: item.fileName,
        note: item.note || "",
        storagePath: uploaded.storagePath,
        downloadUrl: uploaded.downloadUrl,
        contentType: uploaded.contentType,
        sizeBytes: item.sizeBytes || 0,
        capturedAt: item.clientUpdatedAt || "",
        uploadedAt: nowIso(),
        uploadedBy: actor.actorName || "",
      }, actor);
      updateInspectionAttachment(departmentId, item.id, { status: "uploaded", lastError: "", uploadedAt: nowIso(), storagePath });
      await deleteAttachmentBlob(item.id);
      attachments += 1;
    } catch (error) {
      updateInspectionAttachment(departmentId, item.id, { status: "failed", lastError: error?.message || "Upload failed" });
      failed += 1;
    }
  }

  purgeInspectionLocalData(departmentId, policy);
  const stamp = nowIso();

  const preplanFlush = await flushPreplanOfflineQueue(departmentId, {
    getServerRecord: async (entry) => {
      if (entry.collection === PREPLANS_COLLECTION) {
        return getRecord(departmentId, PREPLANS_COLLECTION, entry.recordId);
      }
      if (entry.collection === PREPLAN_REVISIONS_COLLECTION) {
        return getRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, entry.recordId);
      }
      return null;
    },
    applyMutation: async (entry) => {
      const payload = entry.payload || {};
      if (entry.collection === PREPLANS_COLLECTION) {
        const existing = await getRecord(departmentId, PREPLANS_COLLECTION, entry.recordId);
        if (entry.operation === "create" && !existing) {
          const preplan = payload.preplan || payload;
          await createRecord(departmentId, PREPLANS_COLLECTION, entry.recordId, preplan);
          if (payload.revision?.id) {
            await createRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, payload.revision.id, payload.revision);
          }
          return;
        }
        await updateRecord(departmentId, PREPLANS_COLLECTION, entry.recordId, {
          ...(existing || {}),
          ...(payload.preplan || payload),
          updatedAt: nowIso(),
        });
        return;
      }
      if (entry.collection === PREPLAN_REVISIONS_COLLECTION) {
        const existing = await getRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, entry.recordId);
        if (entry.operation === "create" && !existing) {
          await createRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, entry.recordId, payload);
          return;
        }
        await updateRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, entry.recordId, {
          ...(existing || {}),
          ...payload,
          updatedAt: nowIso(),
        });
        return;
      }
      throw new Error(`Unsupported preplan offline collection: ${entry.collection}`);
    },
  });

  synced += preplanFlush.synced;
  conflicts += preplanFlush.conflicts;
  failed += preplanFlush.failed;

  setInspectionSyncMeta(departmentId, {
    lastSuccessfulSyncAt: failed === 0 ? stamp : getInspectionOfflineSummary(departmentId).lastSuccessfulSyncAt,
    lastAttemptAt: stamp,
    lastError: failed ? `${failed} mutation(s) failed` : "",
  });

  const preplanPlan = getPreplanOfflineFlushPlan(departmentId);
  await writeInspectionAuditLog(departmentId, {
    action: "offline.sync",
    entityType: "offline_queue",
    entityId: "sync",
    summary: `Synced ${synced} mutations (${preplanFlush.synced} preplan), ${attachments} attachments; ${conflicts} conflicts; ${failed} failed; preplan queue remaining ${preplanPlan.queued}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return {
    synced,
    conflicts,
    failed,
    attachments,
    preplanSynced: preplanFlush.synced,
    message: `Synced ${synced} · attachments ${attachments} · conflicts ${conflicts} · failed ${failed}`,
  };
}

export async function resolveInspectionConflictAndSync(departmentId, conflictId, resolution, actor = {}) {
  const conflict = resolveInspectionOfflineConflict(departmentId, conflictId, resolution, actor.actorName || "User");
  if (!conflict) throw new Error("Conflict not found.");

  if (resolution === "keep_local" && conflict.queueEntryId) {
    const entry = listInspectionOfflineQueue(departmentId).find((row) => row.id === conflict.queueEntryId);
    if (entry?.collection === INSPECTIONS_COLLECTION) {
      await saveInspectionDraft(departmentId, entry.recordId, entry.payload || {}, actor);
      removeInspectionOfflineQueueEntry(departmentId, entry.id);
      removeInspectionLocalDraft(departmentId, entry.recordId);
    }
  } else if (resolution === "keep_server" && conflict.queueEntryId) {
    removeInspectionOfflineQueueEntry(departmentId, conflict.queueEntryId);
    removeInspectionLocalDraft(departmentId, conflict.recordId);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "offline.conflict.resolve",
    entityType: "offline_conflict",
    entityId: conflictId,
    summary: `Resolved conflict via ${resolution}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return conflict;
}

export async function loadInspectionOfflineBoard(departmentId) {
  const policy = await loadInspectionDevicePolicy(departmentId).catch(() => getCachedDevicePolicy(departmentId));
  const summary = getInspectionOfflineSummary(departmentId);
  return {
    ...summary,
    policy,
  };
}
