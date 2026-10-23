import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { loadTenantListFromFirestore } from "../tenantListLoader.js";
import { LIST_KEYS } from "../tenantListKeys.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getFleetAsset, listFleetAssets } from "./fleetAssetService.js";
import { updateDefect } from "./fleetDefectService.js";
import { resolveFleetAsset } from "./resolveFleetAsset.js";
import {
  DEFAULT_WORK_ORDER_PRIORITIES,
  DEFAULT_WORK_ORDER_STATUSES,
  DEFAULT_WORK_ORDER_TYPES,
  WORK_ORDER_TRANSITIONS,
} from "./workOrderDefaults.js";
import { FLEET_WORK_ORDERS_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newWorkOrderId() {
  return `WO-${Date.now().toString(36).toUpperCase()}`;
}

function normalizeTask(task = {}, index = 0) {
  return {
    id: task.id || `task-${index + 1}`,
    description: task.description || "",
    assignedTo: task.assignedTo || "",
    estimatedHours: Number(task.estimatedHours) || 0,
    actualHours: Number(task.actualHours) || 0,
    status: task.status || "open",
    completedAt: task.completedAt || "",
  };
}

function normalizeLabor(entry = {}, index = 0) {
  return {
    id: entry.id || `lab-${index + 1}`,
    technician: entry.technician || "",
    hours: Number(entry.hours) || 0,
    rate: Number(entry.rate) || 0,
    notes: entry.notes || "",
    at: entry.at || nowIso(),
  };
}

function normalizePart(entry = {}, index = 0) {
  return {
    id: entry.id || `part-${index + 1}`,
    name: entry.name || "",
    quantity: Number(entry.quantity) || 1,
    unitCost: Number(entry.unitCost) || 0,
    vendorId: entry.vendorId || "",
    notes: entry.notes || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetWorkOrder(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const tasks = Array.isArray(data.tasks) ? data.tasks.map(normalizeTask) : [];
  const labor = Array.isArray(data.labor) ? data.labor.map(normalizeLabor) : [];
  const parts = Array.isArray(data.parts) ? data.parts.map(normalizePart) : [];
  const laborCost = labor.reduce((sum, row) => sum + (Number(row.hours) || 0) * (Number(row.rate) || 0), 0);
  const partsCost = parts.reduce((sum, row) => sum + (Number(row.quantity) || 0) * (Number(row.unitCost) || 0), 0);
  const outsideCost = Number(data.outsideCost) || 0;
  const actualCost = Number.isFinite(Number(data.actualCost))
    ? Number(data.actualCost)
    : laborCost + partsCost + outsideCost;

  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    workOrderNumber: data.workOrderNumber || data.id || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || data.unit || "",
    unitDesignation: data.unitDesignation || data.unit || "",
    workOrderType: data.workOrderType || "corrective",
    priority: data.priority || "medium",
    status: data.status || "requested",
    source: data.source || "manual",
    defectId: data.defectId || "",
    legacyWorkOrderId: data.legacyWorkOrderId || "",
    requestedBy: data.requestedBy || "",
    approvedBy: data.approvedBy || "",
    shopId: data.shopId || "",
    shopName: data.shopName || "",
    technician: data.technician || "",
    vendorId: data.vendorId || "",
    vendorName: data.vendorName || data.vendor || "",
    openedAt: data.openedAt || data.opened || "",
    scheduledAt: data.scheduledAt || "",
    startedAt: data.startedAt || "",
    targetCompletionAt: data.targetCompletionAt || "",
    completedAt: data.completedAt || "",
    closedAt: data.closedAt || "",
    complaint: data.complaint || data.issue || "",
    diagnosis: data.diagnosis || "",
    cause: data.cause || "",
    correction: data.correction || "",
    category: data.category || "",
    safetyImpact: data.safetyImpact || "",
    oosRequired: Boolean(data.oosRequired),
    downtimeHours: Number(data.downtimeHours) || 0,
    downtimeStartedAt: data.downtimeStartedAt || "",
    downtimeEndedAt: data.downtimeEndedAt || "",
    tasks,
    labor,
    parts,
    outsideCost,
    estimatedCost: Number(data.estimatedCost) || Number(data.cost) || 0,
    actualCost,
    qcPassed: data.qcPassed === true ? true : data.qcPassed === false ? false : null,
    qcNotes: data.qcNotes || "",
    qcBy: data.qcBy || "",
    qcAt: data.qcAt || "",
    roadTestPassed: data.roadTestPassed === true ? true : data.roadTestPassed === false ? false : null,
    roadTestNotes: data.roadTestNotes || "",
    returnToServiceApprovedBy: data.returnToServiceApprovedBy || "",
    migratedFromList: Boolean(data.migratedFromList),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

function mapLegacyPriority(value = "") {
  const v = String(value || "").toLowerCase();
  if (v.includes("critical") || v.includes("urgent")) return "critical";
  if (v.includes("high")) return "high";
  if (v.includes("low")) return "low";
  return "medium";
}

function mapLegacyStatus(value = "") {
  const v = String(value || "").toLowerCase();
  if (v.includes("complete") || v.includes("closed")) return "completed";
  if (v.includes("progress") || v.includes("open")) return "in_progress";
  if (v.includes("hold") || v.includes("parts")) return "awaiting_parts";
  if (v.includes("vendor")) return "awaiting_vendor";
  if (v.includes("schedul")) return "scheduled";
  return "requested";
}

/**
 * @param {object} item
 * @param {string} departmentId
 * @param {object[]} assets
 */
export function legacyWorkOrderToFleet(item = {}, departmentId = "", assets = []) {
  const id = String(item.id || newWorkOrderId()).trim() || newWorkOrderId();
  const unit = String(item.unit || item.apparatus || "").trim();
  const asset = assets.find((row) => (
    row.fleetNumber === unit
    || row.unitDesignation === unit
    || row.id === unit
  ));
  return normalizeFleetWorkOrder({
    id,
    workOrderNumber: id,
    departmentId,
    legacyWorkOrderId: id,
    fleetAssetId: asset?.id || "",
    fleetNumber: asset?.fleetNumber || unit,
    unitDesignation: asset?.unitDesignation || unit,
    workOrderType: "manual",
    priority: mapLegacyPriority(item.priority),
    status: mapLegacyStatus(item.status),
    source: "legacy_list",
    complaint: item.issue || item.complaint || "",
    category: item.category || "",
    vendorName: item.vendor || "",
    estimatedCost: item.cost === "Pending" ? 0 : Number(String(item.cost || "").replace(/[^0-9.]/g, "")) || 0,
    openedAt: item.opened || nowIso(),
    migratedFromList: true,
  }, departmentId);
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, openOnly?: boolean, status?: string }} [filters]
 */
export async function listFleetWorkOrders(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_WORK_ORDERS_COLLECTION);
  let list = rows.map((row) => normalizeFleetWorkOrder(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  if (filters.openOnly) {
    list = list.filter((row) => !["closed", "cancelled"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.openedAt).localeCompare(String(a.updatedAt || a.openedAt)));
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 */
export async function getFleetWorkOrder(departmentId, workOrderId) {
  const row = await getRecord(departmentId, FLEET_WORK_ORDERS_COLLECTION, workOrderId);
  return row ? normalizeFleetWorkOrder(row, departmentId) : null;
}

/**
 * One-way migrate classic work-orders list when fleetWorkOrders is empty.
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function migrateWorkOrdersFromListIfEmpty(departmentId, legacyFallback = [], audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetWorkOrders(departmentId);
  if (existing.length) return existing;

  let items = [];
  try {
    const pack = await loadTenantListFromFirestore(departmentId, LIST_KEYS.workOrders);
    items = Array.isArray(pack?.items) ? pack.items : [];
  } catch {
    items = [];
  }
  if (!items.length && Array.isArray(legacyFallback)) items = legacyFallback;
  if (!items.length) return [];

  const assets = await listFleetAssets(departmentId);
  const stamp = nowIso();
  const migrated = [];
  for (const item of items) {
    const record = legacyWorkOrderToFleet(item, departmentId, assets);
    record.createdAt = stamp;
    record.updatedAt = stamp;
    if (!record.id) continue;
    await createRecord(departmentId, FLEET_WORK_ORDERS_COLLECTION, record.id, record);
    migrated.push(record);
  }

  if (migrated.length) {
    await writeFleetAuditLog(departmentId, {
      action: "migrate",
      recordId: FLEET_WORK_ORDERS_COLLECTION,
      summary: `Migrated ${migrated.length} work order(s) from classic list`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
    }).catch(() => null);
  }
  return migrated;
}

/**
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetWorkOrders(departmentId, legacyFallback = [], audit = {}) {
  const existing = await listFleetWorkOrders(departmentId);
  if (existing.length) return existing;
  return migrateWorkOrdersFromListIfEmpty(departmentId, legacyFallback, audit);
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createFleetWorkOrder(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  let asset = null;
  if (input.fleetAssetId) {
    asset = await getFleetAsset(departmentId, input.fleetAssetId);
  } else if (input.unit || input.fleetNumber) {
    asset = await resolveFleetAsset(departmentId, input.unit || input.fleetNumber);
  }

  const stamp = nowIso();
  const id = input.id || newWorkOrderId();
  const record = normalizeFleetWorkOrder({
    ...input,
    id,
    workOrderNumber: input.workOrderNumber || id,
    departmentId,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || input.unit || "",
    unitDesignation: asset?.unitDesignation || input.unitDesignation || "",
    requestedBy: audit.actorName || input.requestedBy || "User",
    openedAt: input.openedAt || stamp,
    status: input.status || "requested",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_WORK_ORDERS_COLLECTION, id, record);

  if (record.defectId) {
    await updateDefect(departmentId, record.defectId, {
      workOrderId: id,
      status: "work_order_created",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "wo_create",
    recordId: id,
    summary: `Created work order ${id} for ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {object} patch
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function updateFleetWorkOrder(departmentId, workOrderId, patch = {}, audit = {}) {
  const existing = await getFleetWorkOrder(departmentId, workOrderId);
  if (!existing) throw new Error("Work order not found");
  const next = normalizeFleetWorkOrder({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_WORK_ORDERS_COLLECTION, workOrderId, next);
  await writeFleetAuditLog(departmentId, {
    action: "wo_update",
    recordId: workOrderId,
    summary: `Updated work order ${existing.workOrderNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {string} toStatus
 * @param {{ actorUid?: string, actorName?: string, notes?: string }} [audit]
 */
export async function transitionFleetWorkOrder(departmentId, workOrderId, toStatus, audit = {}) {
  const existing = await getFleetWorkOrder(departmentId, workOrderId);
  if (!existing) throw new Error("Work order not found");
  const allowed = WORK_ORDER_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(toStatus) && existing.status !== toStatus) {
    throw new Error(`Cannot transition from ${existing.status} to ${toStatus}`);
  }

  const stamp = nowIso();
  const patch = { status: toStatus };
  if (toStatus === "in_progress" && !existing.startedAt) {
    patch.startedAt = stamp;
    if (!existing.downtimeStartedAt && existing.oosRequired) patch.downtimeStartedAt = stamp;
  }
  if (toStatus === "completed") {
    patch.completedAt = stamp;
    if (existing.downtimeStartedAt && !existing.downtimeEndedAt) {
      patch.downtimeEndedAt = stamp;
      const start = new Date(existing.downtimeStartedAt).getTime();
      const end = new Date(stamp).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        patch.downtimeHours = Number(((end - start) / 3600000).toFixed(2));
      }
    }
  }
  if (toStatus === "closed") patch.closedAt = stamp;

  return updateFleetWorkOrder(departmentId, workOrderId, patch, audit);
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {object} task
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function addWorkOrderTask(departmentId, workOrderId, task = {}, audit = {}) {
  const existing = await getFleetWorkOrder(departmentId, workOrderId);
  if (!existing) throw new Error("Work order not found");
  const nextTask = normalizeTask({
    ...task,
    id: task.id || `task-${Date.now().toString(36)}`,
  }, existing.tasks.length);
  return updateFleetWorkOrder(departmentId, workOrderId, {
    tasks: [...existing.tasks, nextTask],
  }, audit);
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {object} entry
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function addWorkOrderLabor(departmentId, workOrderId, entry = {}, audit = {}) {
  const existing = await getFleetWorkOrder(departmentId, workOrderId);
  if (!existing) throw new Error("Work order not found");
  const next = normalizeLabor({
    ...entry,
    id: entry.id || `lab-${Date.now().toString(36)}`,
    technician: entry.technician || audit.actorName || "",
    at: nowIso(),
  }, existing.labor.length);
  return updateFleetWorkOrder(departmentId, workOrderId, {
    labor: [...existing.labor, next],
  }, audit);
}

/**
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {object} entry
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function addWorkOrderPart(departmentId, workOrderId, entry = {}, audit = {}) {
  const existing = await getFleetWorkOrder(departmentId, workOrderId);
  if (!existing) throw new Error("Work order not found");
  const next = normalizePart({
    ...entry,
    id: entry.id || `part-${Date.now().toString(36)}`,
  }, existing.parts.length);
  return updateFleetWorkOrder(departmentId, workOrderId, {
    parts: [...existing.parts, next],
  }, audit);
}

/**
 * Quality control sign-off.
 * @param {string} departmentId
 * @param {string} workOrderId
 * @param {{ passed: boolean, notes?: string }} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function completeWorkOrderQc(departmentId, workOrderId, input = {}, audit = {}) {
  const patch = {
    qcPassed: Boolean(input.passed),
    qcNotes: input.notes || "",
    qcBy: audit.actorName || "User",
    qcAt: nowIso(),
  };
  if (input.passed) patch.status = "completed";
  else patch.status = "in_progress";
  return updateFleetWorkOrder(departmentId, workOrderId, patch, audit);
}

/**
 * Build kanban columns from open work orders.
 * @param {object[]} workOrders
 */
export function buildWorkOrderBoard(workOrders = []) {
  const columns = DEFAULT_WORK_ORDER_STATUSES
    .filter((row) => row.boardColumn)
    .map((status) => ({
      ...status,
      items: workOrders.filter((wo) => wo.status === status.id),
    }));
  const summary = {
    total: workOrders.length,
    open: workOrders.filter((wo) => !["closed", "cancelled", "completed"].includes(wo.status)).length,
    awaitingParts: workOrders.filter((wo) => wo.status === "awaiting_parts").length,
    readyForQc: workOrders.filter((wo) => wo.status === "ready_for_qc").length,
    critical: workOrders.filter((wo) => wo.priority === "critical").length,
  };
  return { columns, summary };
}

export function getWorkOrderStatusOptions() {
  return [...DEFAULT_WORK_ORDER_STATUSES];
}

export function getWorkOrderPriorityOptions() {
  return [...DEFAULT_WORK_ORDER_PRIORITIES];
}

export function getWorkOrderTypeOptions() {
  return [...DEFAULT_WORK_ORDER_TYPES];
}

export function getAllowedWorkOrderTransitions(fromStatus) {
  return WORK_ORDER_TRANSITIONS[fromStatus] || [];
}
