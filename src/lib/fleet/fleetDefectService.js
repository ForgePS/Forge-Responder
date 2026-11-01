import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import {
  DEFAULT_DEFECT_SEVERITIES,
  DEFAULT_DEFECT_STATUSES,
  STARTER_DEFECT_CATEGORIES,
  severityFromFailAction,
} from "./defectDefaults.js";
import {
  FLEET_DEFECTS_COLLECTION,
  FLEET_DEFECT_CATEGORIES_COLLECTION,
} from "./paths.js";
import { getFleetAsset } from "./fleetAssetService.js";

function nowIso() {
  return new Date().toISOString();
}

function newDefectNumber() {
  return `DEF-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeDefectCategory(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled category").trim(),
    system: data.system || "General",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeDefectRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const severity = data.severity || "moderate";
  const severityMeta = DEFAULT_DEFECT_SEVERITIES.find((row) => row.id === severity);
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    defectNumber: data.defectNumber || data.id || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    unitDesignation: data.unitDesignation || "",
    station: data.station || "",
    reportedBy: data.reportedBy || "",
    reportedByUid: data.reportedByUid || "",
    reportedAt: data.reportedAt || "",
    source: data.source || "manual",
    checkId: data.checkId || "",
    checkItemKey: data.checkItemKey || "",
    checkItemLabel: data.checkItemLabel || "",
    categoryId: data.categoryId || "",
    categoryName: data.categoryName || "",
    system: data.system || "",
    component: data.component || "",
    location: data.location || "",
    description: data.description || "",
    severity,
    severityLabel: severityMeta?.label || severity,
    safetyImpact: data.safetyImpact || "",
    operationalImpact: data.operationalImpact || "",
    oosRecommendation: data.oosRecommendation
      || (severityMeta?.defaultOos ? "out_of_service" : severityMeta?.defaultRestrict ? "restrict" : "none"),
    restriction: data.restriction || "",
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    status: data.status || "submitted",
    workOrderId: data.workOrderId || "",
    resolution: data.resolution || "",
    verifiedBy: data.verifiedBy || "",
    closedAt: data.closedAt || "",
    reopenedAt: data.reopenedAt || "",
    reopenHistory: Array.isArray(data.reopenHistory) ? data.reopenHistory : [],
    statusEventId: data.statusEventId || "",
    reserveRequestId: data.reserveRequestId || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listDefectCategories(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_DEFECT_CATEGORIES_COLLECTION);
  return rows
    .map((row) => normalizeDefectCategory(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureDefectCategoriesSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listDefectCategories(departmentId);
  if (existing.length) return existing;

  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_DEFECT_CATEGORIES) {
    const record = normalizeDefectCategory({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, FLEET_DEFECT_CATEGORIES_COLLECTION, record.id, record);
    created.push(record);
  }

  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_DEFECT_CATEGORIES_COLLECTION,
    summary: `Seeded ${created.length} defect categories`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return created;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveDefectCategory(departmentId, record = {}, audit = {}) {
  const normalized = normalizeDefectCategory(record, departmentId);
  if (!normalized.id) normalized.id = `cat-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listDefectCategories(departmentId)).some((row) => row.id === normalized.id);
  if (exists) {
    await updateRecord(departmentId, FLEET_DEFECT_CATEGORIES_COLLECTION, normalized.id, normalized);
  } else {
    await createRecord(departmentId, FLEET_DEFECT_CATEGORIES_COLLECTION, normalized.id, normalized);
  }
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} defect category ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Permanently remove a defect category. Existing defects keep their copied
 * category name, so history still reads correctly.
 * @param {string} departmentId
 * @param {{ id: string, name?: string }} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function deleteDefectCategory(departmentId, record = {}, audit = {}) {
  if (!departmentId || !record?.id) throw new Error("Nothing to remove.");
  await deleteRecord(departmentId, FLEET_DEFECT_CATEGORIES_COLLECTION, record.id);
  await writeFleetAuditLog(departmentId, {
    action: "delete",
    recordId: record.id,
    summary: `Removed defect category ${record.name || ""}`.trim(),
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return true;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, openOnly?: boolean, status?: string }} [filters]
 */
export async function listDefects(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_DEFECTS_COLLECTION);
  let list = rows.map((row) => normalizeDefectRecord(row, departmentId));
  if (filters.fleetAssetId) {
    list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  }
  if (filters.openOnly) {
    list = list.filter((row) => !["closed", "rejected", "voided", "corrected"].includes(row.status));
  }
  if (filters.status) {
    list = list.filter((row) => row.status === filters.status);
  }
  return list.sort((a, b) => String(b.reportedAt || b.createdAt).localeCompare(String(a.reportedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {string} defectId
 */
export async function getDefect(departmentId, defectId) {
  const row = await getRecord(departmentId, FLEET_DEFECTS_COLLECTION, defectId);
  return row ? normalizeDefectRecord(row, departmentId) : null;
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createDefect(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  if (!input.fleetAssetId && !input.description) {
    throw new Error("fleetAssetId or description is required");
  }

  let asset = null;
  if (input.fleetAssetId) {
    asset = await getFleetAsset(departmentId, input.fleetAssetId);
  }

  const stamp = nowIso();
  const id = input.id || newDefectNumber();
  const severity = input.severity || "moderate";
  const severityMeta = DEFAULT_DEFECT_SEVERITIES.find((row) => row.id === severity);

  const record = normalizeDefectRecord({
    ...input,
    id,
    defectNumber: id,
    departmentId,
    fleetNumber: input.fleetNumber || asset?.fleetNumber || "",
    unitDesignation: input.unitDesignation || asset?.unitDesignation || "",
    station: input.station || asset?.station || "",
    reportedBy: audit.actorName || input.reportedBy || "User",
    reportedByUid: audit.actorUid || "",
    reportedAt: input.reportedAt || stamp,
    severity,
    oosRecommendation: input.oosRecommendation
      || (severityMeta?.defaultOos ? "out_of_service" : severityMeta?.defaultRestrict ? "restrict" : "none"),
    status: input.status || "submitted",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_DEFECTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "defect_create",
    recordId: id,
    summary: `Created defect ${id} on ${record.fleetNumber || record.fleetAssetId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * Create defects from failed check items.
 * @param {string} departmentId
 * @param {object} check
 * @param {object[]} failedItems
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createDefectsFromCheckFailures(departmentId, check = {}, failedItems = [], audit = {}) {
  const created = [];
  for (const item of failedItems) {
    const severity = severityFromFailAction(item.failAction);
    const defect = await createDefect(departmentId, {
      fleetAssetId: check.fleetAssetId,
      fleetNumber: check.fleetNumber,
      unitDesignation: check.unitDesignation,
      station: check.station,
      source: "check",
      checkId: check.id,
      checkItemKey: item.fieldKey,
      checkItemLabel: item.label,
      description: item.note || `Failed check item: ${item.label}`,
      severity,
      categoryName: "Check failure",
      status: "submitted",
    }, audit);
    created.push(defect);
  }
  return created;
}

/**
 * @param {string} departmentId
 * @param {string} defectId
 * @param {object} patch
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function updateDefect(departmentId, defectId, patch = {}, audit = {}) {
  const existing = await getDefect(departmentId, defectId);
  if (!existing) throw new Error("Defect not found");
  const next = normalizeDefectRecord({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_DEFECTS_COLLECTION, defectId, next);
  await writeFleetAuditLog(departmentId, {
    action: "defect_update",
    recordId: defectId,
    summary: `Updated defect ${existing.defectNumber} → ${next.status}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

/**
 * @param {string} departmentId
 * @param {string} defectId
 * @param {{ resolution?: string }} [input]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function closeDefect(departmentId, defectId, input = {}, audit = {}) {
  return updateDefect(departmentId, defectId, {
    status: "closed",
    resolution: input.resolution || "",
    verifiedBy: audit.actorName || "User",
    closedAt: nowIso(),
  }, audit);
}

/**
 * @param {string} departmentId
 * @param {string} defectId
 * @param {{ reason?: string }} [input]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function reopenDefect(departmentId, defectId, input = {}, audit = {}) {
  const existing = await getDefect(departmentId, defectId);
  if (!existing) throw new Error("Defect not found");
  const stamp = nowIso();
  return updateDefect(departmentId, defectId, {
    status: "reopened",
    reopenedAt: stamp,
    reopenHistory: [
      { at: stamp, reason: input.reason || "", by: audit.actorName || "User" },
      ...(existing.reopenHistory || []),
    ],
  }, audit);
}

/**
 * @param {string} departmentId
 * @param {string} defectId
 * @param {{ type?: string, notes?: string }} evidence
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function addDefectEvidence(departmentId, defectId, evidence = {}, audit = {}) {
  const existing = await getDefect(departmentId, defectId);
  if (!existing) throw new Error("Defect not found");
  const item = {
    id: `ev-${Date.now().toString(36)}`,
    type: evidence.type || "note",
    notes: evidence.notes || "",
    addedAt: nowIso(),
    addedBy: audit.actorName || "User",
  };
  return updateDefect(departmentId, defectId, {
    evidence: [item, ...(existing.evidence || [])],
  }, audit);
}

export function getDefaultDefectSeverities() {
  return [...DEFAULT_DEFECT_SEVERITIES];
}

export function getDefaultDefectStatuses() {
  return [...DEFAULT_DEFECT_STATUSES];
}

/**
 * Count open defects by asset id.
 * @param {string} departmentId
 */
export async function countOpenDefectsByAsset(departmentId) {
  const open = await listDefects(departmentId, { openOnly: true });
  const map = new Map();
  for (const defect of open) {
    if (!defect.fleetAssetId) continue;
    const current = map.get(defect.fleetAssetId) || { total: 0, critical: 0 };
    current.total += 1;
    if (["critical", "immediate_oos", "high"].includes(defect.severity)) {
      current.critical += 1;
    }
    map.set(defect.fleetAssetId, current);
  }
  return map;
}
