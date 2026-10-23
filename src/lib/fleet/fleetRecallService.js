import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import {
  RECALL_CAMPAIGN_TYPES,
  RECALL_STATUSES,
  STARTER_RECALLS,
} from "./componentDefaults.js";
import { FLEET_RECALLS_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetRecall(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const affectedAssetIds = Array.isArray(data.affectedAssetIds)
    ? data.affectedAssetIds
    : typeof data.affectedAssetIds === "string" && data.affectedAssetIds
      ? data.affectedAssetIds.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const completedAssetIds = Array.isArray(data.completedAssetIds) ? data.completedAssetIds : [];
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    campaignNumber: data.campaignNumber || data.id || "",
    campaignType: data.campaignType || "recall",
    source: data.source || "manual",
    manufacturer: data.manufacturer || "",
    component: data.component || "",
    description: data.description || "",
    safetyRisk: data.safetyRisk || "moderate",
    remedy: data.remedy || "",
    publishDate: data.publishDate || "",
    effectiveDate: data.effectiveDate || "",
    yearFrom: data.yearFrom || "",
    yearTo: data.yearTo || "",
    make: data.make || "",
    model: data.model || "",
    vinRange: data.vinRange || "",
    affectedAssetIds,
    completedAssetIds,
    status: data.status || "open",
    partsAvailable: data.partsAvailable !== false,
    vendorName: data.vendorName || "",
    scheduledAt: data.scheduledAt || "",
    completedAt: data.completedAt || "",
    estimatedCost: Number(data.estimatedCost) || 0,
    actualCost: Number(data.actualCost) || 0,
    warrantyRecovery: Number(data.warrantyRecovery) || 0,
    oosRequired: Boolean(data.oosRequired),
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {{ status?: string, campaignType?: string, openOnly?: boolean }} [filters]
 */
export async function listFleetRecalls(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_RECALLS_COLLECTION);
  let list = rows.map((row) => normalizeFleetRecall(row, departmentId));
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  if (filters.campaignType) list = list.filter((row) => row.campaignType === filters.campaignType);
  if (filters.openOnly) {
    list = list.filter((row) => !["completed", "not_applicable"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.publishDate).localeCompare(String(a.updatedAt || a.publishDate)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetRecallsSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetRecalls(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_RECALLS) {
    const record = normalizeFleetRecall({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_RECALLS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_RECALLS_COLLECTION,
    summary: `Seeded ${created.length} recall / bulletin record(s)`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

/**
 * Match assets by year/make/model when affectedAssetIds empty.
 * @param {object} recall
 * @param {object[]} assets
 */
export function matchAssetsToRecall(recall = {}, assets = []) {
  if (Array.isArray(recall.affectedAssetIds) && recall.affectedAssetIds.length) {
    return assets.filter((asset) => recall.affectedAssetIds.includes(asset.id));
  }
  const yearFrom = Number(recall.yearFrom) || 0;
  const yearTo = Number(recall.yearTo) || 9999;
  const make = String(recall.make || "").trim().toLowerCase();
  const model = String(recall.model || "").trim().toLowerCase();
  if (!make && !model && !yearFrom && yearTo === 9999) return [];
  return assets.filter((asset) => {
    const year = Number(asset.year) || 0;
    if (year && (year < yearFrom || year > yearTo)) return false;
    if (make && String(asset.make || "").toLowerCase() !== make) return false;
    if (model && !String(asset.model || "").toLowerCase().includes(model)) return false;
    return true;
  });
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetRecall(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFleetRecall(record, departmentId);
  if (!normalized.id) normalized.id = `RCL-${Date.now().toString(36).toUpperCase()}`;
  if (!normalized.campaignNumber) normalized.campaignNumber = normalized.id;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listFleetRecalls(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_RECALLS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_RECALLS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "recall_update" : "recall_create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} ${normalized.campaignType} ${normalized.campaignNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Confirm / apply asset matches (human confirmation step).
 * @param {string} departmentId
 * @param {string} recallId
 * @param {string[]} assetIds
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function confirmRecallAssetMatches(departmentId, recallId, assetIds = [], audit = {}) {
  const existing = normalizeFleetRecall(
    await getRecord(departmentId, FLEET_RECALLS_COLLECTION, recallId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Recall not found");
  const merged = [...new Set([...(existing.affectedAssetIds || []), ...assetIds])];
  return saveFleetRecall(departmentId, {
    ...existing,
    affectedAssetIds: merged,
    status: existing.status === "open" ? "scheduled" : existing.status,
  }, audit);
}

/**
 * Mark recall complete for one asset.
 * @param {string} departmentId
 * @param {string} recallId
 * @param {string} fleetAssetId
 * @param {{ actorUid?: string, actorName?: string, cost?: number }} [audit]
 */
export async function completeRecallForAsset(departmentId, recallId, fleetAssetId, audit = {}) {
  const existing = normalizeFleetRecall(
    await getRecord(departmentId, FLEET_RECALLS_COLLECTION, recallId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Recall not found");
  const completedAssetIds = [...new Set([...(existing.completedAssetIds || []), fleetAssetId])];
  const affected = existing.affectedAssetIds || [];
  const allDone = affected.length > 0 && affected.every((id) => completedAssetIds.includes(id));
  return saveFleetRecall(departmentId, {
    ...existing,
    completedAssetIds,
    status: allDone ? "completed" : "in_progress",
    completedAt: allDone ? nowIso() : existing.completedAt,
    actualCost: (Number(existing.actualCost) || 0) + (Number(audit.cost) || 0),
  }, audit);
}

/**
 * @param {string} departmentId
 */
export async function buildRecallBoard(departmentId) {
  const [recalls, assets] = await Promise.all([
    ensureFleetRecallsSeeded(departmentId),
    listFleetAssets(departmentId),
  ]);
  const rows = recalls.map((recall) => {
    const matched = matchAssetsToRecall(recall, assets);
    const affected = recall.affectedAssetIds?.length
      ? assets.filter((asset) => recall.affectedAssetIds.includes(asset.id))
      : matched;
    const remaining = affected.filter((asset) => !(recall.completedAssetIds || []).includes(asset.id));
    return {
      ...recall,
      matchedAssets: matched,
      affectedAssets: affected,
      remainingCount: remaining.length,
      suggestedMatches: recall.affectedAssetIds?.length ? [] : matched,
    };
  });
  return {
    rows,
    summary: {
      total: rows.length,
      open: rows.filter((row) => !["completed", "not_applicable"].includes(row.status)).length,
      recalls: rows.filter((row) => row.campaignType === "recall").length,
      bulletins: rows.filter((row) => row.campaignType === "service_bulletin").length,
      oos: rows.filter((row) => row.oosRequired && !["completed", "not_applicable"].includes(row.status)).length,
      suggestedMatches: rows.reduce((sum, row) => sum + (row.suggestedMatches?.length || 0), 0),
    },
  };
}

export function getRecallStatuses() {
  return [...RECALL_STATUSES];
}

export function getRecallCampaignTypes() {
  return [...RECALL_CAMPAIGN_TYPES];
}
