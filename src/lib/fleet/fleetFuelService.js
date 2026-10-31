import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { missingRecommendedRules } from "./configOpsLogic.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getFleetAsset, listFleetAssets } from "./fleetAssetService.js";
import { recordMeterReading } from "./fleetMeterService.js";
import {
  STARTER_FUEL_EXCEPTION_RULES,
  FUEL_PRODUCT_TYPES,
  FUEL_TRANSACTION_SOURCES,
} from "./fuelDefaults.js";
import {
  FLEET_FUEL_EXCEPTION_RULES_COLLECTION,
  FLEET_FUEL_SITES_COLLECTION,
  FLEET_FUEL_TRANSACTIONS_COLLECTION,
  FLEET_CHARGING_SESSIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function parseNumber(value) {
  if (value === "" || value == null) return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFuelSite(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled fuel site").trim(),
    siteType: data.siteType || "station_tank",
    product: data.product || "diesel",
    capacity: Number(data.capacity) || 0,
    currentInventory: Number(data.currentInventory) || 0,
    location: data.location || "",
    vendorName: data.vendorName || "",
    connectorType: data.connectorType || "",
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFuelExceptionRule(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled rule").trim(),
    ruleType: data.ruleType || "custom",
    enabled: data.enabled !== false,
    threshold: Number(data.threshold) || 0,
    severity: data.severity || "medium",
    description: data.description || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFuelTransaction(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const quantity = Number(data.quantity) || 0;
  const unitCost = Number(data.unitCost) || 0;
  const totalCost = Number.isFinite(Number(data.totalCost))
    ? Number(data.totalCost)
    : quantity * unitCost;
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    driverName: data.driverName || "",
    occurredAt: data.occurredAt || "",
    siteId: data.siteId || "",
    siteName: data.siteName || data.location || "",
    location: data.location || "",
    product: data.product || "diesel",
    quantity,
    unit: data.unit || "gal",
    unitCost,
    totalCost,
    meterValue: data.meterValue ?? "",
    meterType: data.meterType || "mileage",
    fuelCard: data.fuelCard || "",
    merchant: data.merchant || "",
    receiptRef: data.receiptRef || "",
    source: data.source || "manual",
    tankLevelAfter: data.tankLevelAfter ?? "",
    exceptions: Array.isArray(data.exceptions) ? data.exceptions : [],
    exceptionSeverity: data.exceptionSeverity || "",
    meterSynced: Boolean(data.meterSynced),
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeChargingSession(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const energyKwh = Number(data.energyKwh) || 0;
  const unitCost = Number(data.unitCost) || 0;
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    siteId: data.siteId || "",
    siteName: data.siteName || "",
    chargerId: data.chargerId || "",
    connectorType: data.connectorType || "",
    startedAt: data.startedAt || "",
    endedAt: data.endedAt || "",
    energyKwh,
    unitCost,
    totalCost: Number.isFinite(Number(data.totalCost)) ? Number(data.totalCost) : energyKwh * unitCost,
    startSoc: data.startSoc ?? "",
    endSoc: data.endSoc ?? "",
    idleFee: Number(data.idleFee) || 0,
    status: data.status || "completed",
    location: data.location || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listFuelSites(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_FUEL_SITES_COLLECTION);
  return rows
    .map((row) => normalizeFuelSite(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
// eslint-disable-next-line no-unused-vars
export async function ensureFuelSitesSeeded(departmentId, audit = {}) {
  // Read-only: fuel sites are entered by the department. Nothing is written
  // just because a screen was opened.
  return listFuelSites(departmentId);
}

/**
 * Permanently remove a fuel site. Past fuel records keep the site name they
 * were saved with.
 * @param {string} departmentId
 * @param {string} siteId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function deleteFuelSite(departmentId, siteId, audit = {}) {
  if (!departmentId || !siteId) throw new Error("A fuel site is required.");
  await deleteRecord(departmentId, FLEET_FUEL_SITES_COLLECTION, siteId);
  await writeFleetAuditLog(departmentId, {
    action: "delete",
    recordId: siteId,
    summary: `Removed fuel site ${siteId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFuelSite(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFuelSite(record, departmentId);
  if (!normalized.id) normalized.id = `site-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listFuelSites(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_FUEL_SITES_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_FUEL_SITES_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} fuel site ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 */
export async function listFuelExceptionRules(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_FUEL_EXCEPTION_RULES_COLLECTION);
  return rows
    .map((row) => normalizeFuelExceptionRule(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
// eslint-disable-next-line no-unused-vars
export async function ensureFuelExceptionRulesSeeded(departmentId, audit = {}) {
  // Read-only: recommended rules are added only when an admin asks for them
  // (addRecommendedFuelExceptionRules), never by opening a screen.
  return listFuelExceptionRules(departmentId);
}

/**
 * Add the recommended exception rules the department does not have yet.
 * Rules the admin already has (same kind) are left alone.
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 * @returns {Promise<object[]>} the full rule list afterwards
 */
export async function addRecommendedFuelExceptionRules(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listFuelExceptionRules(departmentId);
  const missing = missingRecommendedRules(existing, STARTER_FUEL_EXCEPTION_RULES);
  if (!missing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of missing) {
    const record = normalizeFuelExceptionRule({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_FUEL_EXCEPTION_RULES_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_FUEL_EXCEPTION_RULES_COLLECTION,
    summary: `Added ${created.length} recommended fuel exception rules`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return [...existing, ...created].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * Permanently remove a fuel exception rule.
 * @param {string} departmentId
 * @param {string} ruleId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function deleteFuelExceptionRule(departmentId, ruleId, audit = {}) {
  if (!departmentId || !ruleId) throw new Error("A rule is required.");
  await deleteRecord(departmentId, FLEET_FUEL_EXCEPTION_RULES_COLLECTION, ruleId);
  await writeFleetAuditLog(departmentId, {
    action: "delete",
    recordId: ruleId,
    summary: `Removed fuel exception rule ${ruleId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFuelExceptionRule(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFuelExceptionRule(record, departmentId);
  if (!normalized.id) normalized.id = `rule-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listFuelExceptionRules(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_FUEL_EXCEPTION_RULES_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_FUEL_EXCEPTION_RULES_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} fuel exception rule ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, openExceptionsOnly?: boolean }} [filters]
 */
export async function listFuelTransactions(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_FUEL_TRANSACTIONS_COLLECTION);
  let list = rows.map((row) => normalizeFuelTransaction(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.openExceptionsOnly) list = list.filter((row) => (row.exceptions || []).length > 0);
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

/**
 * Evaluate exception rules for a candidate transaction.
 * @param {object} tx
 * @param {object[]} rules
 * @param {{ site?: object, previousTx?: object, asset?: object }} [ctx]
 */
export function evaluateFuelExceptions(tx = {}, rules = [], ctx = {}) {
  const enabled = rules.filter((row) => row.enabled !== false);
  const hits = [];
  const quantity = Number(tx.quantity) || 0;
  const meter = parseNumber(tx.meterValue);
  const prevMeter = parseNumber(ctx.previousTx?.meterValue ?? ctx.asset?.mileage);

  for (const rule of enabled) {
    if (rule.ruleType === "meter_rollback" && meter != null && prevMeter != null && meter < prevMeter) {
      hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: `Meter rollback ${prevMeter} → ${meter}` });
    }
    if (rule.ruleType === "excess_quantity" && quantity > (Number(rule.threshold) || 100)) {
      hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: `Quantity ${quantity} exceeds threshold ${rule.threshold}` });
    }
    if (rule.ruleType === "above_capacity" && ctx.site?.capacity) {
      const remaining = Number(ctx.site.currentInventory) || 0;
      if (quantity > remaining) {
        hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: `Quantity ${quantity} exceeds site inventory ${remaining}` });
      }
    }
    if (rule.ruleType === "fuel_type_mismatch" && ctx.site?.product && tx.product && ctx.site.product !== tx.product) {
      hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: `Product ${tx.product} ≠ site ${ctx.site.product}` });
    }
    if (rule.ruleType === "duplicate" && ctx.previousTx) {
      const windowMin = Number(rule.threshold) || 15;
      const a = new Date(tx.occurredAt || nowIso()).getTime();
      const b = new Date(ctx.previousTx.occurredAt || "").getTime();
      if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= windowMin * 60000) {
        const sameQty = Math.abs((Number(ctx.previousTx.quantity) || 0) - quantity) < 0.01;
        if (sameQty && ctx.previousTx.fleetAssetId === tx.fleetAssetId) {
          hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: `Possible duplicate within ${windowMin} minutes` });
        }
      }
    }
    if (
      rule.ruleType === "missing_receipt"
      && ["fuel_card", "vendor_invoice"].includes(tx.source)
      && !String(tx.receiptRef || "").trim()
    ) {
      hits.push({ ruleId: rule.id, ruleType: rule.ruleType, severity: rule.severity, message: "Missing receipt reference" });
    }
  }

  const rank = { low: 1, medium: 2, high: 3, critical: 4 };
  const exceptionSeverity = hits.reduce((max, hit) => (
    (rank[hit.severity] || 0) > (rank[max] || 0) ? hit.severity : max
  ), "");
  return { exceptions: hits, exceptionSeverity };
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string, syncMeter?: boolean }} [audit]
 */
export async function createFuelTransaction(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const [sites, rules, assets, recent] = await Promise.all([
    ensureFuelSitesSeeded(departmentId, audit),
    ensureFuelExceptionRulesSeeded(departmentId, audit),
    listFleetAssets(departmentId),
    listFuelTransactions(departmentId),
  ]);

  const asset = assets.find((row) => row.id === input.fleetAssetId)
    || (input.fleetAssetId ? await getFleetAsset(departmentId, input.fleetAssetId) : null);
  const site = sites.find((row) => row.id === input.siteId);
  const productMeta = FUEL_PRODUCT_TYPES.find((row) => row.id === (input.product || site?.product || "diesel"));
  const stamp = nowIso();
  const id = input.id || `FUEL-${Date.now().toString(36).toUpperCase()}`;

  const draft = normalizeFuelTransaction({
    ...input,
    id,
    departmentId,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    siteId: site?.id || input.siteId || "",
    siteName: site?.name || input.siteName || "",
    location: input.location || site?.location || "",
    product: input.product || site?.product || "diesel",
    unit: input.unit || productMeta?.unit || "gal",
    occurredAt: input.occurredAt || stamp,
    source: input.source || "manual",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  const previousTx = recent.find((row) => row.fleetAssetId === draft.fleetAssetId);
  const evaluated = evaluateFuelExceptions(draft, rules, { site, previousTx, asset });
  draft.exceptions = evaluated.exceptions;
  draft.exceptionSeverity = evaluated.exceptionSeverity;

  await createRecord(departmentId, FLEET_FUEL_TRANSACTIONS_COLLECTION, id, draft);

  if (site && site.siteType !== "ev_charger" && draft.quantity > 0) {
    const nextInventory = Math.max(0, (Number(site.currentInventory) || 0) - draft.quantity);
    await updateRecord(departmentId, FLEET_FUEL_SITES_COLLECTION, site.id, {
      ...site,
      currentInventory: nextInventory,
      updatedAt: stamp,
    });
  }

  if (audit.syncMeter !== false && draft.fleetAssetId && draft.meterValue !== "" && draft.meterValue != null) {
    await recordMeterReading(departmentId, {
      fleetAssetId: draft.fleetAssetId,
      meterType: draft.meterType || "mileage",
      value: draft.meterValue,
      source: "fuel",
      recordedAt: draft.occurredAt,
    }, audit).catch(() => null);
    draft.meterSynced = true;
    await updateRecord(departmentId, FLEET_FUEL_TRANSACTIONS_COLLECTION, id, draft);
  }

  await writeFleetAuditLog(departmentId, {
    action: "fuel_tx",
    recordId: id,
    summary: `Fuel ${draft.quantity} ${draft.unit} on ${draft.fleetNumber || "unit"}${draft.exceptions.length ? ` · ${draft.exceptions.length} exception(s)` : ""}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return draft;
}

/**
 * @param {string} departmentId
 */
export async function listChargingSessions(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_CHARGING_SESSIONS_COLLECTION);
  return rows
    .map((row) => normalizeChargingSession(row, departmentId))
    .sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createChargingSession(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const [sites, assets] = await Promise.all([
    ensureFuelSitesSeeded(departmentId, audit),
    listFleetAssets(departmentId),
  ]);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  const site = sites.find((row) => row.id === input.siteId)
    || sites.find((row) => row.siteType === "ev_charger");
  const stamp = nowIso();
  const id = input.id || `CHG-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeChargingSession({
    ...input,
    id,
    departmentId,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    siteId: site?.id || input.siteId || "",
    siteName: site?.name || input.siteName || "",
    connectorType: input.connectorType || site?.connectorType || "",
    location: input.location || site?.location || "",
    startedAt: input.startedAt || stamp,
    endedAt: input.endedAt || stamp,
    status: input.status || "completed",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_CHARGING_SESSIONS_COLLECTION, id, record);

  // Mirror as an electric fuel transaction for unified cost/exception views.
  await createFuelTransaction(departmentId, {
    fleetAssetId: record.fleetAssetId,
    siteId: record.siteId,
    product: "electric",
    quantity: record.energyKwh,
    unit: "kWh",
    unitCost: record.unitCost,
    totalCost: record.totalCost + (record.idleFee || 0),
    source: "ev_charger",
    occurredAt: record.endedAt || record.startedAt,
    notes: `Charging session ${id}`,
    receiptRef: id,
  }, { ...audit, syncMeter: false }).catch(() => null);

  await writeFleetAuditLog(departmentId, {
    action: "charge_session",
    recordId: id,
    summary: `Charging ${record.energyKwh} kWh on ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * Dashboard summary for fuel & energy.
 * @param {string} departmentId
 */
export async function buildFuelEnergySummary(departmentId) {
  const [transactions, sessions, sites, rules] = await Promise.all([
    listFuelTransactions(departmentId),
    listChargingSessions(departmentId),
    // Sites turned off in Configuration Studio are not offered for new entries.
    listFuelSites(departmentId).then((rows) => rows.filter((row) => row.active !== false)),
    listFuelExceptionRules(departmentId),
  ]);
  const withExceptions = transactions.filter((row) => (row.exceptions || []).length > 0);
  const fuelCost = transactions
    .filter((row) => row.product !== "electric")
    .reduce((sum, row) => sum + (Number(row.totalCost) || 0), 0);
  const energyKwh = sessions.reduce((sum, row) => sum + (Number(row.energyKwh) || 0), 0);
  const energyCost = sessions.reduce((sum, row) => sum + (Number(row.totalCost) || 0) + (Number(row.idleFee) || 0), 0);
  return {
    transactionCount: transactions.length,
    exceptionCount: withExceptions.length,
    fuelCost: Number(fuelCost.toFixed(2)),
    energyKwh: Number(energyKwh.toFixed(2)),
    energyCost: Number(energyCost.toFixed(2)),
    siteCount: sites.length,
    ruleCount: rules.filter((row) => row.enabled !== false).length,
    transactions,
    sessions,
    sites,
    exceptions: withExceptions,
  };
}

export function getFuelProductTypes() {
  return [...FUEL_PRODUCT_TYPES];
}

export function getFuelTransactionSources() {
  return [...FUEL_TRANSACTION_SOURCES];
}
