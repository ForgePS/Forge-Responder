import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets, getFleetAsset, saveFleetAsset } from "./fleetAssetService.js";
import { listFleetWorkOrders } from "./fleetWorkOrderService.js";
import { listFuelTransactions } from "./fleetFuelService.js";
import {
  COST_CATEGORIES,
  DECOMMISSION_CHECKLIST,
  DEFAULT_REPLACEMENT_FACTORS,
  DEPRECIATION_METHODS,
  DISPOSAL_METHODS,
  DISPOSAL_STATUSES,
  DOWNTIME_REASONS,
  REPLACEMENT_CASE_STATUSES,
  REPLACEMENT_PRIORITIES,
  STANDARD_LIFE_YEARS,
} from "./costDefaults.js";
import {
  FLEET_CAPITAL_PLAN_ITEMS_COLLECTION,
  FLEET_COST_ENTRIES_COLLECTION,
  FLEET_DISPOSAL_RECORDS_COLLECTION,
  FLEET_DOWNTIME_EVENTS_COLLECTION,
  FLEET_REPLACEMENT_CASES_COLLECTION,
  FLEET_REPLACEMENT_MODELS_COLLECTION,
  FLEET_VALUATIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function assetAgeYears(asset) {
  const year = Number(asset?.year);
  if (!Number.isFinite(year) || year < 1900) return 0;
  return Math.max(0, new Date().getFullYear() - year);
}

function standardLifeForAsset(asset) {
  const type = String(asset?.type || asset?.fleetClassId || "").toLowerCase();
  for (const [key, years] of Object.entries(STANDARD_LIFE_YEARS)) {
    if (key !== "default" && type.includes(key)) return years;
  }
  return STANDARD_LIFE_YEARS.default;
}

function clampScore(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function priorityFromScore(score) {
  if (score >= 75) return "urgent";
  if (score >= 55) return "near_term";
  if (score >= 35) return "plan";
  return "monitor";
}

function recommendedYearFromScore(score, leadTimeYears = 1) {
  const current = new Date().getFullYear();
  if (score >= 75) return current;
  if (score >= 55) return current + Math.max(1, Math.round(leadTimeYears));
  if (score >= 35) return current + 3;
  return current + 5;
}

function defaultDecommissionItems() {
  return DECOMMISSION_CHECKLIST.map((row) => ({
    id: row.id,
    label: row.label,
    completed: false,
    completedAt: "",
    completedBy: "",
  }));
}

/** @param {object} raw @param {string} departmentId */
export function normalizeCostEntry(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const amount = num(data.amount);
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    category: data.category || "other",
    amount,
    isCredit: Boolean(data.isCredit) || amount < 0 || ["warranty_credit", "grant_credit"].includes(data.category),
    occurredAt: data.occurredAt || "",
    fiscalYear: data.fiscalYear || (data.occurredAt ? String(data.occurredAt).slice(0, 4) : String(new Date().getFullYear())),
    source: data.source || "manual",
    sourceRecordId: data.sourceRecordId || "",
    vendorName: data.vendorName || "",
    description: data.description || "",
    glAccount: data.glAccount || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeDowntimeEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const startedAt = data.startedAt || "";
  const endedAt = data.endedAt || "";
  let lostServiceHours = num(data.lostServiceHours);
  if (!lostServiceHours && startedAt) {
    const start = new Date(startedAt).getTime();
    const end = endedAt ? new Date(endedAt).getTime() : Date.now();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      lostServiceHours = Number(((end - start) / 3600000).toFixed(2));
    }
  }
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    startedAt,
    endedAt,
    reason: data.reason || "corrective",
    planned: Boolean(data.planned),
    workOrderId: data.workOrderId || "",
    defectId: data.defectId || "",
    serviceImpact: data.serviceImpact || "",
    reserveAssetId: data.reserveAssetId || "",
    reserveFleetNumber: data.reserveFleetNumber || "",
    lostServiceHours,
    status: data.status || (endedAt ? "closed" : "open"),
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeReplacementModel(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const factors = Array.isArray(data.factors) && data.factors.length
    ? data.factors.map((row) => ({
      id: row.id || "",
      label: row.label || row.id || "",
      weight: num(row.weight, 10),
      maxPoints: num(row.maxPoints, 100),
    }))
    : DEFAULT_REPLACEMENT_FACTORS.map((row) => ({ ...row }));
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Default replacement model").trim(),
    version: data.version || "1.0",
    published: data.published !== false,
    inflationRate: num(data.inflationRate, 0.03),
    defaultLeadTimeYears: num(data.defaultLeadTimeYears, 1.5),
    factors,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeReplacementCase(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    modelId: data.modelId || "",
    modelVersion: data.modelVersion || "",
    score: num(data.score),
    factorScores: data.factorScores && typeof data.factorScores === "object" ? data.factorScores : {},
    recommendedYear: num(data.recommendedYear) || new Date().getFullYear() + 3,
    proposedType: data.proposedType || "",
    estimatedCost: num(data.estimatedCost),
    inflationAssumption: num(data.inflationAssumption, 0.03),
    leadTimeYears: num(data.leadTimeYears, 1.5),
    fundingSource: data.fundingSource || "",
    grantEligible: Boolean(data.grantEligible),
    priority: data.priority || "monitor",
    status: data.status || "draft",
    approvalNotes: data.approvalNotes || "",
    approvedBy: data.approvedBy || "",
    approvedAt: data.approvedAt || "",
    replacementAssetId: data.replacementAssetId || "",
    disposalPlan: data.disposalPlan || "",
    notes: data.notes || "",
    scoredAt: data.scoredAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeCapitalPlanItem(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    planYear: num(data.planYear) || new Date().getFullYear(),
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    replacementCaseId: data.replacementCaseId || "",
    description: data.description || "",
    estimatedCost: num(data.estimatedCost),
    fundingSource: data.fundingSource || "",
    priority: data.priority || "plan",
    deferred: Boolean(data.deferred),
    riskImpact: data.riskImpact || "",
    scenario: data.scenario || "baseline",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeValuation(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const originalBasis = num(data.originalBasis);
  const improvements = num(data.capitalImprovements);
  const residual = num(data.residual);
  const usefulLifeYears = num(data.usefulLifeYears, 15);
  const method = data.method || "straight_line";
  const startYear = num(data.depreciationStartYear) || num(String(data.depreciationStart || "").slice(0, 4)) || new Date().getFullYear();
  const yearsElapsed = Math.max(0, new Date().getFullYear() - startYear);
  let accumulated = num(data.accumulatedDepreciation);
  if (!data.accumulatedDepreciation && method === "straight_line" && usefulLifeYears > 0) {
    const depreciable = Math.max(0, originalBasis + improvements - residual);
    accumulated = Math.min(depreciable, (depreciable / usefulLifeYears) * yearsElapsed);
  } else if (!data.accumulatedDepreciation && method === "declining_balance" && usefulLifeYears > 0) {
    const rate = 2 / usefulLifeYears;
    let book = originalBasis + improvements;
    for (let i = 0; i < yearsElapsed; i += 1) {
      const yearDep = Math.max(0, (book - residual) * rate);
      book -= yearDep;
      accumulated += yearDep;
    }
  }
  const bookValue = method === "none"
    ? originalBasis + improvements
    : Math.max(residual, originalBasis + improvements - accumulated);
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    method,
    originalBasis,
    capitalImprovements: improvements,
    depreciationStart: data.depreciationStart || `${startYear}-01-01`,
    depreciationStartYear: startYear,
    usefulLifeYears,
    residual,
    accumulatedDepreciation: Number(accumulated.toFixed(2)),
    bookValue: Number(bookValue.toFixed(2)),
    marketValue: num(data.marketValue),
    insuredValue: num(data.insuredValue),
    replacementValue: num(data.replacementValue),
    appraisalDate: data.appraisalDate || "",
    source: data.source || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeDisposalRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const salePrice = num(data.salePrice);
  const fees = num(data.fees);
  const checklist = Array.isArray(data.decommissionChecklist) && data.decommissionChecklist.length
    ? data.decommissionChecklist.map((row) => ({
      id: row.id || "",
      label: row.label || row.id || "",
      completed: Boolean(row.completed),
      completedAt: row.completedAt || "",
      completedBy: row.completedBy || "",
    }))
    : defaultDecommissionItems();
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    replacementCaseId: data.replacementCaseId || "",
    method: data.method || "auction",
    status: data.status || "planned",
    authorization: data.authorization || "",
    buyerRecipient: data.buyerRecipient || "",
    disposalDate: data.disposalDate || "",
    decommissionDate: data.decommissionDate || "",
    salePrice,
    fees,
    netProceeds: Number((salePrice - fees).toFixed(2)),
    titleTransferred: Boolean(data.titleTransferred),
    odometerStatement: Boolean(data.odometerStatement),
    asIsDisclosure: Boolean(data.asIsDisclosure),
    equipmentRemoved: Boolean(data.equipmentRemoved),
    dataRemoved: Boolean(data.dataRemoved),
    finalMeter: data.finalMeter || "",
    decommissionChecklist: checklist,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

// ——— Cost entries ———

export async function listCostEntries(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_COST_ENTRIES_COLLECTION))
    .map((row) => normalizeCostEntry(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.category) list = list.filter((row) => row.category === filters.category);
  if (filters.fiscalYear) list = list.filter((row) => String(row.fiscalYear) === String(filters.fiscalYear));
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

export async function createCostEntry(departmentId, input = {}, audit = {}) {
  const asset = input.fleetAssetId ? await getFleetAsset(departmentId, input.fleetAssetId) : null;
  const stamp = nowIso();
  const id = input.id || `COST-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeCostEntry({
    ...input,
    id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    occurredAt: input.occurredAt || stamp.slice(0, 10),
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_COST_ENTRIES_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "cost_entry_create",
    recordId: id,
    summary: `Cost ${record.category} ${record.amount} for ${record.fleetNumber || "fleet"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * Pull WO totals and fuel spend into cost ledger (idempotent by sourceRecordId).
 */
export async function syncCostsFromOperations(departmentId, audit = {}) {
  if (!departmentId) return { created: 0 };
  const [existing, workOrders, fuel] = await Promise.all([
    listCostEntries(departmentId),
    listFleetWorkOrders(departmentId),
    listFuelTransactions(departmentId).catch(() => []),
  ]);
  const known = new Set(existing.map((row) => row.sourceRecordId).filter(Boolean));
  let created = 0;

  for (const wo of workOrders) {
    const sourceId = `wo:${wo.id}`;
    if (known.has(sourceId)) continue;
    const amount = num(wo.actualCost) || num(wo.estimatedCost);
    if (!amount) continue;
    const category = wo.workOrderType === "preventive" || wo.workOrderType === "pm"
      ? "preventive_maintenance"
      : "corrective_maintenance";
    await createCostEntry(departmentId, {
      fleetAssetId: wo.fleetAssetId,
      fleetNumber: wo.fleetNumber,
      category,
      amount,
      occurredAt: (wo.completedAt || wo.createdAt || "").slice(0, 10),
      source: "work_order",
      sourceRecordId: sourceId,
      vendorName: wo.vendorName || "",
      description: wo.complaint || wo.workOrderNumber || wo.id,
    }, audit);
    known.add(sourceId);
    created += 1;
  }

  for (const tx of fuel) {
    const sourceId = `fuel:${tx.id}`;
    if (known.has(sourceId)) continue;
    const amount = num(tx.totalCost);
    if (!amount) continue;
    await createCostEntry(departmentId, {
      fleetAssetId: tx.fleetAssetId,
      fleetNumber: tx.fleetNumber,
      category: "fuel",
      amount,
      occurredAt: (tx.occurredAt || tx.createdAt || "").slice(0, 10),
      source: "fuel",
      sourceRecordId: sourceId,
      description: `${tx.quantity || ""} ${tx.unit || "gal"}`.trim(),
    }, audit);
    known.add(sourceId);
    created += 1;
  }

  return { created };
}

export function summarizeCosts(entries = [], assets = []) {
  const byCategory = {};
  let total = 0;
  let credits = 0;
  const byAsset = {};
  const currentYear = String(new Date().getFullYear());

  for (const row of entries) {
    const signed = row.isCredit ? -Math.abs(row.amount) : Math.abs(row.amount);
    total += signed;
    if (signed < 0) credits += Math.abs(signed);
    byCategory[row.category] = (byCategory[row.category] || 0) + signed;
    if (row.fleetAssetId) {
      byAsset[row.fleetAssetId] = (byAsset[row.fleetAssetId] || 0) + signed;
    }
  }

  const annual = entries
    .filter((row) => String(row.fiscalYear) === currentYear)
    .reduce((sum, row) => sum + (row.isCredit ? -Math.abs(row.amount) : Math.abs(row.amount)), 0);

  const assetMetrics = assets.map((asset) => {
    const cost = byAsset[asset.id] || 0;
    const miles = num(asset.mileage);
    const hours = num(asset.engineHours);
    return {
      fleetAssetId: asset.id,
      fleetNumber: asset.fleetNumber,
      totalCost: Number(cost.toFixed(2)),
      costPerMile: miles > 0 ? Number((cost / miles).toFixed(2)) : null,
      costPerHour: hours > 0 ? Number((cost / hours).toFixed(2)) : null,
    };
  }).sort((a, b) => b.totalCost - a.totalCost);

  return {
    total: Number(total.toFixed(2)),
    annual: Number(annual.toFixed(2)),
    monthly: Number((annual / 12).toFixed(2)),
    credits: Number(credits.toFixed(2)),
    byCategory,
    assetMetrics,
  };
}

// ——— Downtime / reliability ———

export async function listDowntimeEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_DOWNTIME_EVENTS_COLLECTION))
    .map((row) => normalizeDowntimeEvent(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.openOnly) list = list.filter((row) => row.status === "open" || !row.endedAt);
  return list.sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

export async function createDowntimeEvent(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");
  const stamp = nowIso();
  const id = input.id || `DT-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeDowntimeEvent({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    startedAt: input.startedAt || stamp,
    status: input.endedAt ? "closed" : "open",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_DOWNTIME_EVENTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "downtime_create",
    recordId: id,
    summary: `Downtime for ${record.fleetNumber}: ${record.reason}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateDowntimeEvent(departmentId, eventId, patch = {}, audit = {}) {
  const existing = normalizeDowntimeEvent(
    await getRecord(departmentId, FLEET_DOWNTIME_EVENTS_COLLECTION, eventId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Downtime event not found");
  const next = normalizeDowntimeEvent({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  if (patch.endedAt && next.status === "open") next.status = "closed";
  await updateRecord(departmentId, FLEET_DOWNTIME_EVENTS_COLLECTION, eventId, next);
  return next;
}

export function summarizeReliability(downtime = [], assets = []) {
  const byAsset = {};
  let plannedHours = 0;
  let unplannedHours = 0;
  for (const row of downtime) {
    const hours = num(row.lostServiceHours);
    if (row.planned) plannedHours += hours;
    else unplannedHours += hours;
    if (!byAsset[row.fleetAssetId]) {
      byAsset[row.fleetAssetId] = { hours: 0, events: 0, fleet: downtime.find((d) => d.fleetAssetId === row.fleetAssetId)?.fleetNumber };
    }
    byAsset[row.fleetAssetId].hours += hours;
    byAsset[row.fleetAssetId].events += 1;
  }

  const yearHours = 365 * 24;
  const assetMetrics = assets.map((asset) => {
    const bucket = byAsset[asset.id] || { hours: 0, events: 0 };
    const availability = Number((Math.max(0, 1 - bucket.hours / yearHours) * 100).toFixed(1));
    const mtbf = bucket.events > 0 ? Number((yearHours / bucket.events).toFixed(1)) : null;
    return {
      fleetAssetId: asset.id,
      fleetNumber: asset.fleetNumber,
      downtimeHours: Number(bucket.hours.toFixed(2)),
      events: bucket.events,
      availability,
      mtbfHours: mtbf,
    };
  }).sort((a, b) => b.downtimeHours - a.downtimeHours);

  return {
    plannedHours: Number(plannedHours.toFixed(2)),
    unplannedHours: Number(unplannedHours.toFixed(2)),
    totalHours: Number((plannedHours + unplannedHours).toFixed(2)),
    openEvents: downtime.filter((row) => row.status === "open" || !row.endedAt).length,
    assetMetrics,
  };
}

// ——— Replacement models & cases ———

export async function listReplacementModels(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_REPLACEMENT_MODELS_COLLECTION))
    .map((row) => normalizeReplacementModel(row, departmentId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function ensureReplacementModel(departmentId, audit = {}) {
  const existing = await listReplacementModels(departmentId);
  if (existing.length) return existing.find((row) => row.published) || existing[0];
  const stamp = nowIso();
  const id = "MODEL-DEFAULT";
  const record = normalizeReplacementModel({
    id,
    departmentId,
    name: "Default replacement model",
    version: "1.0",
    published: true,
    factors: DEFAULT_REPLACEMENT_FACTORS,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_REPLACEMENT_MODELS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "replacement_model_seed",
    recordId: id,
    summary: "Seeded default replacement scoring model",
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function saveReplacementModel(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `MODEL-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeReplacementModel(await getRecord(departmentId, FLEET_REPLACEMENT_MODELS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeReplacementModel({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_REPLACEMENT_MODELS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_REPLACEMENT_MODELS_COLLECTION, id, record);
  }
  return record;
}

/**
 * Score one asset against a model using available cost/downtime context.
 */
export function scoreAssetForReplacement(asset, model, context = {}) {
  const factors = model?.factors || DEFAULT_REPLACEMENT_FACTORS;
  const age = assetAgeYears(asset);
  const life = standardLifeForAsset(asset);
  const mileage = num(asset.mileage);
  const hours = num(asset.engineHours);
  const downtimeHours = num(context.downtimeHours);
  const maintenanceCost = num(context.maintenanceCost);
  const conditionMap = { excellent: 10, good: 25, fair: 55, poor: 80, critical: 95 };
  const conditionScore = conditionMap[String(asset.condition || "").toLowerCase()] ?? 40;

  const raw = {
    age: clampScore((age / Math.max(life, 1)) * 100),
    mileage: clampScore((mileage / 150000) * 100),
    engine_hours: clampScore((hours / 10000) * 100),
    condition: clampScore(conditionScore),
    reliability: clampScore((downtimeHours / 500) * 100),
    maintenance_cost: clampScore((maintenanceCost / 100000) * 100),
    safety_risk: asset.status === "out_of_service" || asset.status === "restricted" ? 80 : 25,
    obsolescence: age >= life ? 70 : age >= life * 0.8 ? 50 : 20,
    mission_fit: asset.status === "reserve" ? 40 : 20,
  };

  const weightSum = factors.reduce((sum, f) => sum + num(f.weight), 0) || 1;
  let weighted = 0;
  const factorScores = {};
  for (const factor of factors) {
    const points = clampScore(raw[factor.id] ?? 30);
    factorScores[factor.id] = points;
    weighted += (points * num(factor.weight)) / weightSum;
  }
  const score = Number(weighted.toFixed(1));
  return {
    score,
    factorScores,
    priority: priorityFromScore(score),
    recommendedYear: recommendedYearFromScore(score, model?.defaultLeadTimeYears),
    standardLifeYears: life,
    ageYears: age,
  };
}

export async function listReplacementCases(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_REPLACEMENT_CASES_COLLECTION))
    .map((row) => normalizeReplacementCase(row, departmentId));
  if (filters.openOnly) {
    list = list.filter((row) => !["replaced", "cancelled"].includes(row.status));
  }
  return list.sort((a, b) => (b.score - a.score) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function scoreFleetReplacements(departmentId, audit = {}) {
  const [assets, model, downtime, costs, existing] = await Promise.all([
    listFleetAssets(departmentId),
    ensureReplacementModel(departmentId, audit),
    listDowntimeEvents(departmentId),
    listCostEntries(departmentId),
    listReplacementCases(departmentId),
  ]);
  const byAssetCase = Object.fromEntries(existing.map((row) => [row.fleetAssetId, row]));
  const costByAsset = {};
  for (const row of costs) {
    if (!["preventive_maintenance", "corrective_maintenance", "parts", "labor", "vendor"].includes(row.category)) continue;
    costByAsset[row.fleetAssetId] = (costByAsset[row.fleetAssetId] || 0) + Math.abs(row.amount);
  }
  const downByAsset = {};
  for (const row of downtime) {
    downByAsset[row.fleetAssetId] = (downByAsset[row.fleetAssetId] || 0) + num(row.lostServiceHours);
  }

  const stamp = nowIso();
  const results = [];
  for (const asset of assets) {
    if (["decommissioned", "disposed", "sold"].includes(asset.status)) continue;
    const scored = scoreAssetForReplacement(asset, model, {
      downtimeHours: downByAsset[asset.id] || 0,
      maintenanceCost: costByAsset[asset.id] || 0,
    });
    const prior = byAssetCase[asset.id];
    const id = prior?.id || `RC-${asset.id}`;
    const record = normalizeReplacementCase({
      ...(prior || {}),
      id,
      departmentId,
      fleetAssetId: asset.id,
      fleetNumber: asset.fleetNumber,
      modelId: model.id,
      modelVersion: model.version,
      score: scored.score,
      factorScores: scored.factorScores,
      recommendedYear: scored.recommendedYear,
      proposedType: prior?.proposedType || asset.type || "",
      estimatedCost: prior?.estimatedCost || 0,
      inflationAssumption: model.inflationRate,
      leadTimeYears: model.defaultLeadTimeYears,
      priority: scored.priority,
      status: prior?.status && !["draft", "scored"].includes(prior.status) ? prior.status : "scored",
      scoredAt: stamp,
      createdAt: prior?.createdAt || stamp,
      updatedAt: stamp,
    }, departmentId);
    if (prior?.id) {
      await updateRecord(departmentId, FLEET_REPLACEMENT_CASES_COLLECTION, id, record);
    } else {
      await createRecord(departmentId, FLEET_REPLACEMENT_CASES_COLLECTION, id, record);
    }
    results.push(record);
  }

  await writeFleetAuditLog(departmentId, {
    action: "replacement_score_run",
    recordId: model.id,
    summary: `Scored ${results.length} assets with ${model.name} v${model.version}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return results.sort((a, b) => b.score - a.score);
}

export async function updateReplacementCase(departmentId, caseId, patch = {}, audit = {}) {
  const existing = normalizeReplacementCase(
    await getRecord(departmentId, FLEET_REPLACEMENT_CASES_COLLECTION, caseId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Replacement case not found");
  const next = normalizeReplacementCase({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_REPLACEMENT_CASES_COLLECTION, caseId, next);
  return next;
}

// ——— Capital plan ———

export async function listCapitalPlanItems(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_CAPITAL_PLAN_ITEMS_COLLECTION))
    .map((row) => normalizeCapitalPlanItem(row, departmentId));
  if (filters.planYear) list = list.filter((row) => row.planYear === num(filters.planYear));
  return list.sort((a, b) => a.planYear - b.planYear || b.estimatedCost - a.estimatedCost);
}

export async function saveCapitalPlanItem(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `CAP-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeCapitalPlanItem(await getRecord(departmentId, FLEET_CAPITAL_PLAN_ITEMS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeCapitalPlanItem({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_CAPITAL_PLAN_ITEMS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_CAPITAL_PLAN_ITEMS_COLLECTION, id, record);
  }
  return record;
}

/**
 * Build / refresh a 10-year capital plan from scored replacement cases.
 */
export async function generateCapitalPlanFromScores(departmentId, options = {}, audit = {}) {
  const [cases, model] = await Promise.all([
    listReplacementCases(departmentId),
    ensureReplacementModel(departmentId, audit),
  ]);
  const inflation = num(options.inflationRate, model.inflationRate || 0.03);
  const horizon = num(options.horizonYears, 10);
  const startYear = new Date().getFullYear();
  const created = [];

  for (const row of cases) {
    if (!["scored", "recommended", "funded", "near_term", "plan"].includes(row.status) && row.priority === "monitor") {
      if (row.score < 35) continue;
    }
    if (["replaced", "cancelled"].includes(row.status)) continue;
    const year = Math.min(Math.max(row.recommendedYear, startYear), startYear + horizon - 1);
    const yearsOut = Math.max(0, year - startYear);
    const baseCost = row.estimatedCost > 0 ? row.estimatedCost : 750000;
    const estimatedCost = Number((baseCost * ((1 + inflation) ** yearsOut)).toFixed(0));
    const id = `CAP-${row.fleetAssetId}-${year}`;
    const item = await saveCapitalPlanItem(departmentId, {
      id,
      planYear: year,
      fleetAssetId: row.fleetAssetId,
      fleetNumber: row.fleetNumber,
      replacementCaseId: row.id,
      description: `Replace ${row.fleetNumber} (${row.proposedType || "apparatus"})`,
      estimatedCost,
      fundingSource: row.fundingSource || "",
      priority: row.priority,
      scenario: options.scenario || "baseline",
      riskImpact: row.priority === "urgent" ? "High — reliability / safety exposure" : "",
    }, audit);
    created.push(item);
  }

  return created;
}

export function summarizeCapitalPlan(items = []) {
  const byYear = {};
  for (const row of items) {
    if (row.deferred) continue;
    byYear[row.planYear] = (byYear[row.planYear] || 0) + row.estimatedCost;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  return {
    byYear,
    years,
    total: Number(Object.values(byYear).reduce((sum, v) => sum + v, 0).toFixed(0)),
    annualAverage: years.length
      ? Number((Object.values(byYear).reduce((sum, v) => sum + v, 0) / years.length).toFixed(0))
      : 0,
  };
}

// ——— Valuation ———

export async function listValuations(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_VALUATIONS_COLLECTION))
    .map((row) => normalizeValuation(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function saveValuation(departmentId, input = {}, audit = {}) {
  const asset = input.fleetAssetId ? await getFleetAsset(departmentId, input.fleetAssetId) : null;
  const stamp = nowIso();
  const id = input.id || `VAL-${input.fleetAssetId || Date.now().toString(36).toUpperCase()}`;
  const existing = await getRecord(departmentId, FLEET_VALUATIONS_COLLECTION, id);
  const record = normalizeValuation({
    ...(existing || {}),
    ...input,
    id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || existing?.fleetNumber || "",
    usefulLifeYears: input.usefulLifeYears || standardLifeForAsset(asset || {}),
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_VALUATIONS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_VALUATIONS_COLLECTION, id, record);
  }
  return record;
}

// ——— Disposal / decommission ———

export async function listDisposalRecords(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION))
    .map((row) => normalizeDisposalRecord(row, departmentId));
  if (filters.openOnly) list = list.filter((row) => row.status !== "complete" && row.status !== "cancelled");
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createDisposalRecord(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");
  const stamp = nowIso();
  const id = input.id || `DISP-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeDisposalRecord({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    decommissionChecklist: input.decommissionChecklist || defaultDecommissionItems(),
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION, id, record);

  if (input.moveToReserve) {
    await saveFleetAsset(departmentId, { ...asset, status: "reserve" }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "disposal_create",
    recordId: id,
    summary: `Decommission/disposal started for ${record.fleetNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateDisposalRecord(departmentId, recordId, patch = {}, audit = {}) {
  const existing = normalizeDisposalRecord(
    await getRecord(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION, recordId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Disposal record not found");
  const next = normalizeDisposalRecord({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION, recordId, next);
  return next;
}

export async function toggleDecommissionItem(departmentId, recordId, itemId, completed, audit = {}) {
  const existing = normalizeDisposalRecord(
    await getRecord(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION, recordId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Disposal record not found");
  const stamp = nowIso();
  const checklist = existing.decommissionChecklist.map((row) => {
    if (row.id !== itemId) return row;
    return {
      ...row,
      completed: Boolean(completed),
      completedAt: completed ? stamp : "",
      completedBy: completed ? (audit.actorName || "User") : "",
    };
  });
  return updateDisposalRecord(departmentId, recordId, {
    decommissionChecklist: checklist,
    status: checklist.every((row) => row.completed) ? "in_progress" : existing.status,
  }, audit);
}

export async function completeDisposal(departmentId, recordId, patch = {}, audit = {}) {
  const existing = normalizeDisposalRecord(
    await getRecord(departmentId, FLEET_DISPOSAL_RECORDS_COLLECTION, recordId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Disposal record not found");
  const stamp = nowIso();
  const next = await updateDisposalRecord(departmentId, recordId, {
    ...patch,
    status: "complete",
    disposalDate: patch.disposalDate || existing.disposalDate || stamp.slice(0, 10),
    decommissionDate: patch.decommissionDate || existing.decommissionDate || stamp.slice(0, 10),
  }, audit);

  const asset = await getFleetAsset(departmentId, existing.fleetAssetId);
  if (asset) {
    await saveFleetAsset(departmentId, {
      ...asset,
      status: "decommissioned",
      notes: `${asset.notes || ""}\nDisposed ${next.disposalDate} via ${next.method}`.trim(),
    }, audit);
  }

  if (next.netProceeds) {
    await createCostEntry(departmentId, {
      fleetAssetId: existing.fleetAssetId,
      fleetNumber: existing.fleetNumber,
      category: "disposal",
      amount: -Math.abs(next.netProceeds),
      isCredit: true,
      occurredAt: next.disposalDate,
      source: "disposal",
      sourceRecordId: `disposal:${recordId}`,
      description: `Net proceeds (${next.method})`,
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "disposal_complete",
    recordId,
    summary: `Disposed ${next.fleetNumber} via ${next.method}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return next;
}

/**
 * @param {string} departmentId
 */
export async function buildCostReplacementBoard(departmentId) {
  const [assets, costs, downtime, cases, capital, valuations, disposals, model] = await Promise.all([
    listFleetAssets(departmentId),
    listCostEntries(departmentId),
    listDowntimeEvents(departmentId),
    listReplacementCases(departmentId),
    listCapitalPlanItems(departmentId),
    listValuations(departmentId),
    listDisposalRecords(departmentId),
    ensureReplacementModel(departmentId),
  ]);

  const costSummary = summarizeCosts(costs, assets);
  const reliability = summarizeReliability(downtime, assets);
  const capitalSummary = summarizeCapitalPlan(capital);

  return {
    assets,
    costs,
    downtime,
    cases,
    capital,
    valuations,
    disposals,
    model,
    costSummary,
    reliability,
    capitalSummary,
    summary: {
      assets: assets.length,
      totalCost: costSummary.total,
      annualCost: costSummary.annual,
      downtimeHours: reliability.totalHours,
      openDowntime: reliability.openEvents,
      urgentReplacements: cases.filter((row) => row.priority === "urgent").length,
      capitalTotal: capitalSummary.total,
      bookValue: valuations.reduce((sum, row) => sum + num(row.bookValue), 0),
      openDisposals: disposals.filter((row) => !["complete", "cancelled"].includes(row.status)).length,
    },
  };
}

export function getCostCategories() {
  return [...COST_CATEGORIES];
}

export function getDowntimeReasons() {
  return [...DOWNTIME_REASONS];
}

export function getReplacementPriorities() {
  return [...REPLACEMENT_PRIORITIES];
}

export function getReplacementCaseStatuses() {
  return [...REPLACEMENT_CASE_STATUSES];
}

export function getDepreciationMethods() {
  return [...DEPRECIATION_METHODS];
}

export function getDisposalMethods() {
  return [...DISPOSAL_METHODS];
}

export function getDisposalStatuses() {
  return [...DISPOSAL_STATUSES];
}

export function getDecommissionChecklist() {
  return [...DECOMMISSION_CHECKLIST];
}

export function getDefaultReplacementFactors() {
  return DEFAULT_REPLACEMENT_FACTORS.map((row) => ({ ...row }));
}
