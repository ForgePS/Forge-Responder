import { listFleetAssets } from "./fleetAssetService.js";
import { listFleetChecks } from "./fleetCheckService.js";
import { countOpenDefectsByAsset } from "./fleetDefectService.js";
import { DEFAULT_READINESS_STATES } from "./checklistDefaults.js";

/**
 * Map fleet asset status → readiness board state.
 * @param {object} asset
 */
export function deriveReadinessState(asset = {}) {
  if (asset.readinessState) return asset.readinessState;
  const status = String(asset.status || "").toLowerCase();
  if (status === "out_of_service") return "out_of_service";
  if (status === "restricted") return "available_restricted";
  if (status === "reserve") return "reserve";
  if (status === "decommissioned") return "decommissioned";
  const today = new Date().toISOString().slice(0, 10);
  if (asset.pmDue && String(asset.pmDue).slice(0, 10) <= today) return "maintenance_due";
  return "available";
}

/**
 * Simple readiness score 0–100.
 * @param {object} asset
 * @param {object|null} lastCheck
 */
export function computeReadinessScore(asset = {}, lastCheck = null) {
  let score = 100;
  const state = deriveReadinessState(asset);
  if (state === "out_of_service") score -= 60;
  if (state === "available_restricted") score -= 25;
  if (state === "maintenance_due") score -= 15;
  if (state === "in_shop") score -= 40;
  if (lastCheck?.result === "Failed") score -= 20;
  if (!lastCheck) score -= 10;
  return Math.max(0, Math.min(100, score));
}

/**
 * Build readiness board cards for all fleet assets.
 * @param {string} departmentId
 * @param {{ station?: string, fleetClassId?: string }} [filters]
 */
export async function buildReadinessBoard(departmentId, filters = {}) {
  const [assets, checks, defectCounts] = await Promise.all([
    listFleetAssets(departmentId),
    listFleetChecks(departmentId),
    countOpenDefectsByAsset(departmentId),
  ]);

  const latestByAsset = new Map();
  for (const check of checks) {
    if (!check.fleetAssetId) continue;
    if (!latestByAsset.has(check.fleetAssetId)) {
      latestByAsset.set(check.fleetAssetId, check);
    }
  }

  let cards = assets.map((asset) => {
    const lastCheck = latestByAsset.get(asset.id) || null;
    const readinessState = deriveReadinessState(asset);
    const stateMeta = DEFAULT_READINESS_STATES.find((row) => row.id === readinessState);
    const defects = defectCounts.get(asset.id) || { total: 0, critical: 0 };
    return {
      assetId: asset.id,
      fleetNumber: asset.fleetNumber,
      unitDesignation: asset.unitDesignation,
      type: asset.type,
      station: asset.station || "Unassigned",
      fleetClassId: asset.fleetClassId || "",
      status: asset.status,
      readinessState,
      readinessLabel: stateMeta?.label || readinessState,
      readinessTone: stateMeta?.tone || "neutral",
      readinessScore: Math.max(0, computeReadinessScore(asset, lastCheck) - Math.min(20, defects.critical * 5)),
      mileage: asset.mileage,
      engineHours: asset.engineHours,
      pumpHours: asset.pumpHours,
      fuel: asset.fuel,
      pmDue: asset.pmDue,
      lastCheckAt: lastCheck?.completedAt || asset.lastCheckAt || "",
      lastCheckResult: lastCheck?.result || asset.lastCheckResult || "",
      lastCheckStatus: lastCheck?.status || "",
      openCheckId: lastCheck && ["draft", "in_progress"].includes(lastCheck.status)
        ? lastCheck.id
        : "",
      openDefectCount: defects.total,
      criticalDefectCount: defects.critical,
      activeRestriction: asset.activeRestriction || "",
      operator: asset.operator || "",
    };
  });

  if (filters.station) {
    cards = cards.filter((card) => card.station === filters.station);
  }
  if (filters.fleetClassId) {
    cards = cards.filter((card) => card.fleetClassId === filters.fleetClassId);
  }

  cards.sort((a, b) => {
    if (a.station !== b.station) return String(a.station).localeCompare(String(b.station));
    return String(a.fleetNumber).localeCompare(String(b.fleetNumber), undefined, { numeric: true });
  });

  const summary = {
    total: cards.length,
    available: cards.filter((c) => c.readinessState === "available").length,
    restricted: cards.filter((c) => c.readinessState === "available_restricted").length,
    outOfService: cards.filter((c) => c.readinessState === "out_of_service").length,
    maintenanceDue: cards.filter((c) => c.readinessState === "maintenance_due").length,
    checksInProgress: cards.filter((c) => c.openCheckId).length,
  };

  const stations = [...new Set(cards.map((c) => c.station))].sort();

  return { cards, summary, stations };
}
