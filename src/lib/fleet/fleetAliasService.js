import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { canonicalApparatusUnitName } from "../apparatusSchema.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { FLEET_ASSET_ALIASES_COLLECTION } from "./paths.js";

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetAssetAlias(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    legacyId: data.legacyId || "",
    alias: data.alias || "",
    aliasType: data.aliasType || "legacy_id",
    migrationBatchId: data.migrationBatchId || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listFleetAssetAliases(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_ASSET_ALIASES_COLLECTION);
  return rows.map((row) => normalizeFleetAssetAlias(row, departmentId));
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function upsertFleetAssetAlias(departmentId, input = {}, audit = {}) {
  const aliasValue = String(input.alias || input.legacyId || "").trim();
  const fleetAssetId = String(input.fleetAssetId || "").trim();
  if (!departmentId || !fleetAssetId || !aliasValue) {
    throw new Error("fleetAssetId and alias are required");
  }

  const id = input.id || `alias-${aliasValue.replace(/[^a-zA-Z0-9_-]+/g, "-").toLowerCase()}`;
  const stamp = new Date().toISOString();
  const record = normalizeFleetAssetAlias({
    ...input,
    id,
    departmentId,
    fleetAssetId,
    alias: aliasValue,
    legacyId: input.legacyId || aliasValue,
    aliasType: input.aliasType || "legacy_id",
    migrationBatchId: input.migrationBatchId || "",
    updatedAt: stamp,
    createdAt: input.createdAt || stamp,
  }, departmentId);

  const existing = (await listFleetAssetAliases(departmentId)).some((row) => row.id === id);
  if (existing) {
    await updateRecord(departmentId, FLEET_ASSET_ALIASES_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_ASSET_ALIASES_COLLECTION, id, record);
  }

  await writeFleetAuditLog(departmentId, {
    action: existing ? "update" : "create",
    recordId: id,
    summary: `Mapped alias ${aliasValue} → ${fleetAssetId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * Build planned aliases for a migrated asset (id + unit designation).
 * @param {object} asset
 * @param {string} migrationBatchId
 */
export function buildAliasPlansForAsset(asset = {}, migrationBatchId = "") {
  const plans = [];
  const fleetAssetId = asset.id;
  if (!fleetAssetId) return plans;

  if (asset.legacyApparatusId) {
    plans.push({
      id: `alias-legacy-${asset.legacyApparatusId}`,
      fleetAssetId,
      legacyId: asset.legacyApparatusId,
      alias: asset.legacyApparatusId,
      aliasType: "legacy_id",
      migrationBatchId,
    });
  }

  const unit = canonicalApparatusUnitName(asset.unitDesignation || asset.fleetNumber || "");
  if (unit && unit !== asset.legacyApparatusId) {
    plans.push({
      id: `alias-unit-${unit.replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
      fleetAssetId,
      legacyId: asset.legacyApparatusId || "",
      alias: unit,
      aliasType: "unit_designation",
      migrationBatchId,
    });
  }

  return plans;
}
