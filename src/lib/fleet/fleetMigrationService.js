import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { listDepartmentApparatus } from "../apparatusService.js";
import { normalizeApparatusRecord } from "../apparatusSchema.js";
import { loadTenantListFromFirestore } from "../tenantListLoader.js";
import { LIST_KEYS } from "../tenantListKeys.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import {
  buildAliasPlansForAsset,
  listFleetAssetAliases,
  upsertFleetAssetAlias,
} from "./fleetAliasService.js";
import {
  getFleetAsset,
  legacyApparatusToFleetAsset,
  listFleetAssets,
} from "./fleetAssetService.js";
import { loadFleetSettings, saveFleetSettings } from "./fleetSettings.js";
import {
  FLEET_ASSETS_COLLECTION,
  FLEET_ASSET_ALIASES_COLLECTION,
  FLEET_MIGRATION_REPORTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function makeBatchId() {
  return `MIG-${Date.now().toString(36).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeMigrationReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    mode: data.mode || "dry_run",
    status: data.status || "completed",
    migrationBatchId: data.migrationBatchId || "",
    startedAt: data.startedAt || "",
    completedAt: data.completedAt || "",
    sourceCount: Number(data.sourceCount) || 0,
    created: Number(data.created) || 0,
    updated: Number(data.updated) || 0,
    skipped: Number(data.skipped) || 0,
    aliasCount: Number(data.aliasCount) || 0,
    errorCount: Number(data.errorCount) || 0,
    errors: Array.isArray(data.errors) ? data.errors : [],
    duplicateLegacyIds: Array.isArray(data.duplicateLegacyIds) ? data.duplicateLegacyIds : [],
    workOrderUnitRefs: Array.isArray(data.workOrderUnitRefs) ? data.workOrderUnitRefs : [],
    unresolvedWorkOrderUnits: Array.isArray(data.unresolvedWorkOrderUnits)
      ? data.unresolvedWorkOrderUnits
      : [],
    rows: Array.isArray(data.rows) ? data.rows : [],
    rolledBackAt: data.rolledBackAt || "",
    actorUid: data.actorUid || "",
    actorName: data.actorName || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listMigrationReports(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_MIGRATION_REPORTS_COLLECTION);
  return rows
    .map((row) => normalizeMigrationReport(row, departmentId))
    .sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 */
export async function getMigrationReport(departmentId, reportId) {
  const row = await getRecord(departmentId, FLEET_MIGRATION_REPORTS_COLLECTION, reportId);
  return row ? normalizeMigrationReport(row, departmentId) : null;
}

/**
 * Collect unit designations referenced by classic work orders for reconciliation.
 * @param {string} departmentId
 * @param {object[]} [workOrderFallback]
 */
export async function collectWorkOrderUnitReferences(departmentId, workOrderFallback = []) {
  let items = [];
  try {
    const pack = await loadTenantListFromFirestore(departmentId, LIST_KEYS.workOrders);
    items = Array.isArray(pack?.items) ? pack.items : [];
  } catch {
    items = [];
  }
  if (!items.length && Array.isArray(workOrderFallback)) items = workOrderFallback;

  const counts = new Map();
  for (const row of items) {
    const unit = String(row?.unit || row?.apparatus || "").trim();
    if (!unit) continue;
    counts.set(unit, (counts.get(unit) || 0) + 1);
  }
  return [...counts.entries()].map(([unit, count]) => ({ unit, count }));
}

/**
 * Plan conversion rows without writing.
 * @param {string} departmentId
 * @param {{ apparatusFallback?: object[], workOrderFallback?: object[] }} [options]
 */
export async function planApparatusMigration(departmentId, options = {}) {
  let source = Array.isArray(options.apparatusFallback) ? options.apparatusFallback : null;
  if (!source) {
    source = await listDepartmentApparatus(departmentId);
  }
  source = (source || []).map((item, index) => normalizeApparatusRecord(item, index));

  const existingAssets = await listFleetAssets(departmentId);
  const byLegacy = new Map(
    existingAssets
      .filter((row) => row.legacyApparatusId || row.id)
      .map((row) => [row.legacyApparatusId || row.id, row])
  );

  const seenIds = new Map();
  const duplicateLegacyIds = [];
  for (const item of source) {
    const count = (seenIds.get(item.id) || 0) + 1;
    seenIds.set(item.id, count);
    if (count === 2) duplicateLegacyIds.push(item.id);
  }

  const workOrderUnitRefs = await collectWorkOrderUnitReferences(
    departmentId,
    options.workOrderFallback
  );

  const rows = [];
  for (const item of source) {
    const planned = legacyApparatusToFleetAsset(item, departmentId);
    const existing = byLegacy.get(item.id) || byLegacy.get(planned.id) || null;
    let action = "create";
    if (existing) {
      action = existing.migratedFromList || existing.legacyApparatusId === item.id
        ? "update"
        : "skip_conflict";
    }
    rows.push({
      legacyId: item.id,
      unit: item.unit || planned.unitDesignation,
      fleetAssetId: existing?.id || planned.id,
      action,
      unmappedKeys: planned.migrationUnmapped ? Object.keys(planned.migrationUnmapped) : [],
      statusMapped: planned.status,
      station: planned.station || "",
    });
  }

  const resolvableUnits = new Set(
    rows.flatMap((row) => [row.unit, row.legacyId, row.fleetAssetId].filter(Boolean))
  );
  const unresolvedWorkOrderUnits = workOrderUnitRefs
    .filter((ref) => !resolvableUnits.has(ref.unit))
    .map((ref) => ref.unit);

  return {
    sourceCount: source.length,
    existingAssetCount: existingAssets.length,
    duplicateLegacyIds,
    workOrderUnitRefs,
    unresolvedWorkOrderUnits,
    rows,
    created: rows.filter((row) => row.action === "create").length,
    updated: rows.filter((row) => row.action === "update").length,
    skipped: rows.filter((row) => row.action === "skip_conflict").length,
  };
}

/**
 * Dry-run or apply apparatus → fleetAssets migration with aliases + reconciliation report.
 *
 * @param {string} departmentId
 * @param {{
 *   dryRun?: boolean,
 *   apparatusFallback?: object[],
 *   workOrderFallback?: object[],
 *   batchSize?: number,
 *   resumeFromIndex?: number,
 *   migrationBatchId?: string,
 * }} [options]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function runApparatusMigration(departmentId, options = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");

  const dryRun = options.dryRun !== false;
  const batchSize = Math.max(1, Number(options.batchSize) || 50);
  const resumeFromIndex = Math.max(0, Number(options.resumeFromIndex) || 0);
  const migrationBatchId = options.migrationBatchId || makeBatchId();
  const startedAt = nowIso();
  const plan = await planApparatusMigration(departmentId, options);

  const errors = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let aliasCount = 0;
  const appliedRows = [];

  const slice = plan.rows.slice(resumeFromIndex, resumeFromIndex + batchSize);

  let sourceList = Array.isArray(options.apparatusFallback) ? options.apparatusFallback : null;
  if (!dryRun && !sourceList) {
    sourceList = await listDepartmentApparatus(departmentId);
  }
  const sourceById = new Map(
    (sourceList || []).map((item, index) => {
      const normalized = normalizeApparatusRecord(item, index);
      return [normalized.id, item];
    })
  );

  if (!dryRun) {
    for (const row of slice) {
      try {
        if (row.action === "skip_conflict") {
          skipped += 1;
          appliedRows.push({ ...row, result: "skipped" });
          continue;
        }

        const sourceItem = sourceById.get(row.legacyId);
        if (!sourceItem) {
          skipped += 1;
          appliedRows.push({ ...row, result: "missing_source" });
          continue;
        }

        const asset = legacyApparatusToFleetAsset(sourceItem, departmentId);
        asset.id = row.fleetAssetId || asset.id;
        asset.migrationBatchId = migrationBatchId;
        asset.migratedFromList = true;
        asset.updatedAt = startedAt;
        if (!asset.createdAt) asset.createdAt = startedAt;

        const existing = await getFleetAsset(departmentId, asset.id);
        if (existing) {
          await updateRecord(departmentId, FLEET_ASSETS_COLLECTION, asset.id, {
            ...existing,
            ...asset,
            createdAt: existing.createdAt || asset.createdAt,
          });
          updated += 1;
          appliedRows.push({ ...row, result: "updated" });
        } else {
          await createRecord(departmentId, FLEET_ASSETS_COLLECTION, asset.id, asset);
          created += 1;
          appliedRows.push({ ...row, result: "created" });
        }

        const aliasPlans = buildAliasPlansForAsset(asset, migrationBatchId);
        for (const aliasPlan of aliasPlans) {
          await upsertFleetAssetAlias(departmentId, aliasPlan, audit);
          aliasCount += 1;
        }
      } catch (rowError) {
        errors.push({
          legacyId: row.legacyId,
          message: rowError?.message || "Migration row failed",
        });
        appliedRows.push({ ...row, result: "error", error: rowError?.message || "failed" });
      }
    }
  } else {
    for (const row of slice) {
      if (row.action === "create") created += 1;
      else if (row.action === "update") updated += 1;
      else skipped += 1;
      appliedRows.push({ ...row, result: "planned" });
      if (row.action !== "skip_conflict") {
        aliasCount += buildAliasPlansForAsset({
          id: row.fleetAssetId,
          legacyApparatusId: row.legacyId,
          unitDesignation: row.unit,
          fleetNumber: row.unit,
        }, migrationBatchId).length;
      }
    }
  }

  const completedAt = nowIso();
  const reportId = `${dryRun ? "dry" : "apply"}-${migrationBatchId}`;
  const remaining = Math.max(0, plan.rows.length - (resumeFromIndex + slice.length));

  const report = normalizeMigrationReport({
    id: reportId,
    departmentId,
    mode: dryRun ? "dry_run" : "apply",
    status: errors.length ? "completed_with_errors" : "completed",
    migrationBatchId,
    startedAt,
    completedAt,
    sourceCount: plan.sourceCount,
    created,
    updated,
    skipped,
    aliasCount,
    errorCount: errors.length,
    errors,
    duplicateLegacyIds: plan.duplicateLegacyIds,
    workOrderUnitRefs: plan.workOrderUnitRefs,
    unresolvedWorkOrderUnits: plan.unresolvedWorkOrderUnits,
    rows: appliedRows,
    resumeFromIndex,
    batchSize,
    remaining,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
    createdAt: startedAt,
    updatedAt: completedAt,
  }, departmentId);

  await createRecord(departmentId, FLEET_MIGRATION_REPORTS_COLLECTION, reportId, report);

  if (!dryRun) {
    const settings = await loadFleetSettings(departmentId);
    await saveFleetSettings(departmentId, {
      ...settings,
      lastMigrationReportId: reportId,
      lastMigrationAt: completedAt,
      lastMigrationMode: "apply",
    }, audit);
  } else {
    const settings = await loadFleetSettings(departmentId);
    await saveFleetSettings(departmentId, {
      ...settings,
      lastMigrationReportId: reportId,
      lastMigrationAt: completedAt,
      lastMigrationMode: "dry_run",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: dryRun ? "migration_dry_run" : "migration_apply",
    recordId: reportId,
    summary: `${dryRun ? "Dry-run" : "Applied"} apparatus migration: +${created} ~${updated} skip ${skipped}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
    after: {
      created,
      updated,
      skipped,
      aliasCount,
      remaining,
      errorCount: errors.length,
    },
  }).catch(() => null);

  return report;
}

/**
 * Rollback assets/aliases created by an apply batch. Does not restore classic list (never deleted).
 * @param {string} departmentId
 * @param {string} migrationBatchId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function rollbackApparatusMigration(departmentId, migrationBatchId, audit = {}) {
  if (!departmentId || !migrationBatchId) {
    throw new Error("departmentId and migrationBatchId are required");
  }

  const assets = await listFleetAssets(departmentId);
  const aliases = await listFleetAssetAliases(departmentId);
  const toDeleteAssets = assets.filter((row) => row.migrationBatchId === migrationBatchId);
  // Also match via report rows if migrationBatchId wasn't stored on older imports
  const reports = await listMigrationReports(departmentId);
  const applyReport = reports.find((row) => (
    row.migrationBatchId === migrationBatchId && row.mode === "apply"
  ));

  let deletedAssets = 0;
  for (const asset of toDeleteAssets) {
    await deleteRecord(departmentId, FLEET_ASSETS_COLLECTION, asset.id);
    deletedAssets += 1;
  }

  // If batch id wasn't stamped (Phase 2 import), allow rollback of report-created ids only when flagged
  if (!toDeleteAssets.length && applyReport?.rows?.length) {
    for (const row of applyReport.rows) {
      if (row.result !== "created") continue;
      const asset = await getFleetAsset(departmentId, row.fleetAssetId);
      if (asset && asset.migratedFromList) {
        await deleteRecord(departmentId, FLEET_ASSETS_COLLECTION, asset.id);
        deletedAssets += 1;
      }
    }
  }

  let deletedAliases = 0;
  const aliasTargets = aliases.filter((row) => row.migrationBatchId === migrationBatchId);
  for (const alias of aliasTargets) {
    await deleteRecord(departmentId, FLEET_ASSET_ALIASES_COLLECTION, alias.id);
    deletedAliases += 1;
  }

  const settings = await loadFleetSettings(departmentId);
  await saveFleetSettings(departmentId, {
    ...settings,
    legacyApparatusWritesLocked: false,
    redirectApparatusToFleetAssets: false,
  }, audit);

  const stamp = nowIso();
  if (applyReport) {
    await updateRecord(departmentId, FLEET_MIGRATION_REPORTS_COLLECTION, applyReport.id, {
      ...applyReport,
      status: "rolled_back",
      rolledBackAt: stamp,
      updatedAt: stamp,
    });
  }

  await writeFleetAuditLog(departmentId, {
    action: "migration_rollback",
    recordId: migrationBatchId,
    summary: `Rolled back migration batch ${migrationBatchId} (${deletedAssets} assets, ${deletedAliases} aliases)`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return {
    migrationBatchId,
    deletedAssets,
    deletedAliases,
    unlockedLegacyWrites: true,
  };
}

/**
 * Lock classic apparatus list writes / enable Apparatus → Fleet Assets redirect after review.
 * @param {string} departmentId
 * @param {{ lock?: boolean, redirect?: boolean }} flags
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function setLegacyApparatusCutover(departmentId, flags = {}, audit = {}) {
  const settings = await loadFleetSettings(departmentId);
  const next = await saveFleetSettings(departmentId, {
    ...settings,
    legacyApparatusWritesLocked: flags.lock !== undefined
      ? Boolean(flags.lock)
      : settings.legacyApparatusWritesLocked,
    redirectApparatusToFleetAssets: flags.redirect !== undefined
      ? Boolean(flags.redirect)
      : settings.redirectApparatusToFleetAssets,
  }, audit);

  await writeFleetAuditLog(departmentId, {
    action: "migration_cutover",
    recordId: "fleetSettings",
    summary: `Cutover flags lock=${next.legacyApparatusWritesLocked} redirect=${next.redirectApparatusToFleetAssets}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return next;
}

/**
 * Build a human-readable reconciliation summary from a report.
 * @param {object} report
 */
export function formatMigrationReconciliationSummary(report = {}) {
  const r = normalizeMigrationReport(report);
  return {
    headline: `${r.mode === "dry_run" ? "Dry run" : "Apply"} — ${r.status}`,
    counts: {
      source: r.sourceCount,
      created: r.created,
      updated: r.updated,
      skipped: r.skipped,
      aliases: r.aliasCount,
      errors: r.errorCount,
    },
    warnings: [
      ...(r.duplicateLegacyIds.length
        ? [`Duplicate legacy ids: ${r.duplicateLegacyIds.join(", ")}`]
        : []),
      ...(r.unresolvedWorkOrderUnits.length
        ? [`Work-order units not in apparatus list: ${r.unresolvedWorkOrderUnits.join(", ")}`]
        : []),
    ],
  };
}
