import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getFleetAsset, listFleetAssets, saveFleetAsset } from "./fleetAssetService.js";
import { recordMeterReading } from "./fleetMeterService.js";
import {
  DECON_TYPES,
  STARTER_LOAD_PLAN_ITEMS,
} from "./operationsDefaults.js";
import {
  FLEET_ASSIGNMENTS_COLLECTION,
  FLEET_CHECKOUTS_COLLECTION,
  FLEET_DECON_EVENTS_COLLECTION,
  FLEET_LOAD_PLANS_COLLECTION,
  FLEET_POOL_RESERVATIONS_COLLECTION,
  FLEET_RESERVE_SWAPS_COLLECTION,
  FLEET_TRANSFERS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function overlaps(startA, endA, startB, endB) {
  const a0 = new Date(startA).getTime();
  const a1 = new Date(endA || startA).getTime();
  const b0 = new Date(startB).getTime();
  const b1 = new Date(endB || startB).getTime();
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false;
  return a0 <= b1 && b0 <= a1;
}

/** @param {object} raw @param {string} departmentId */
export function normalizeAssignment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    station: data.station || "",
    shift: data.shift || "",
    unitDesignation: data.unitDesignation || "",
    division: data.division || "",
    costCenter: data.costCenter || "",
    crew: data.crew || "",
    temporaryDetail: Boolean(data.temporaryDetail),
    effectiveFrom: data.effectiveFrom || "",
    effectiveTo: data.effectiveTo || "",
    status: data.status || "active",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeTransfer(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    fromStation: data.fromStation || "",
    toStation: data.toStation || "",
    fromShift: data.fromShift || "",
    toShift: data.toShift || "",
    reason: data.reason || "",
    status: data.status || "requested",
    requestedBy: data.requestedBy || "",
    approvedBy: data.approvedBy || "",
    meterValue: data.meterValue ?? "",
    fuelLevel: data.fuelLevel ?? "",
    equipmentReconciled: Boolean(data.equipmentReconciled),
    requestedAt: data.requestedAt || "",
    completedAt: data.completedAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeReserveSwap(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    frontlineAssetId: data.frontlineAssetId || "",
    frontlineUnit: data.frontlineUnit || "",
    reserveAssetId: data.reserveAssetId || "",
    reserveUnit: data.reserveUnit || "",
    reason: data.reason || "",
    startedAt: data.startedAt || "",
    expectedEndAt: data.expectedEndAt || "",
    actualEndAt: data.actualEndAt || "",
    equipmentMoved: Boolean(data.equipmentMoved),
    radiosMoved: Boolean(data.radiosMoved),
    workOrderId: data.workOrderId || "",
    defectId: data.defectId || "",
    status: data.status || "active",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeCheckout(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    driverName: data.driverName || "",
    purpose: data.purpose || "",
    destination: data.destination || "",
    startedAt: data.startedAt || "",
    expectedReturnAt: data.expectedReturnAt || "",
    returnedAt: data.returnedAt || "",
    startMeter: data.startMeter ?? "",
    endMeter: data.endMeter ?? "",
    fuelStart: data.fuelStart ?? "",
    fuelEnd: data.fuelEnd ?? "",
    conditionStart: data.conditionStart || "good",
    conditionEnd: data.conditionEnd || "",
    keyIssued: data.keyIssued !== false,
    fuelCardIssued: Boolean(data.fuelCardIssued),
    equipmentIssued: data.equipmentIssued || "",
    damageNotes: data.damageNotes || "",
    status: data.status || "open",
    approvedBy: data.approvedBy || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizePoolReservation(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    reservedBy: data.reservedBy || "",
    purpose: data.purpose || "",
    startsAt: data.startsAt || "",
    endsAt: data.endsAt || "",
    status: data.status || "requested",
    approvedBy: data.approvedBy || "",
    conflict: Boolean(data.conflict),
    conflictReason: data.conflictReason || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeLoadPlan(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(data.items)
    ? data.items.map((item, index) => ({
      id: item.id || `item-${index + 1}`,
      name: item.name || "",
      compartment: item.compartment || "",
      quantity: Number(item.quantity) || 0,
      minimumQuantity: Number(item.minimumQuantity) || 0,
      required: item.required !== false,
      actualQuantity: item.actualQuantity ?? "",
      status: item.status || "expected",
    }))
    : [];
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    fleetClassId: data.fleetClassId || "",
    name: data.name || "Load plan",
    version: Number(data.version) || 1,
    items,
    lastCheckedAt: data.lastCheckedAt || "",
    missingCount: Number(data.missingCount) || 0,
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeDeconEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    deconType: data.deconType || "routine",
    reason: data.reason || "",
    incidentNumber: data.incidentNumber || "",
    occurredAt: data.occurredAt || "",
    personnel: data.personnel || "",
    products: data.products || "",
    areas: data.areas || "",
    ppe: data.ppe || "",
    wasteDisposal: data.wasteDisposal || "",
    verifiedBy: data.verifiedBy || "",
    oosMinutes: Number(data.oosMinutes) || 0,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

// ——— Assignments ———

export async function listAssignments(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_ASSIGNMENTS_COLLECTION))
    .map((row) => normalizeAssignment(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.activeOnly) list = list.filter((row) => row.status === "active");
  return list.sort((a, b) => String(b.effectiveFrom).localeCompare(String(a.effectiveFrom)));
}

export async function saveAssignment(departmentId, record = {}, audit = {}) {
  const asset = record.fleetAssetId ? await getFleetAsset(departmentId, record.fleetAssetId) : null;
  const normalized = normalizeAssignment({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
    unitDesignation: record.unitDesignation || asset?.unitDesignation || "",
  }, departmentId);
  if (!normalized.id) normalized.id = `ASN-${Date.now().toString(36).toUpperCase()}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (!normalized.effectiveFrom) normalized.effectiveFrom = stamp;
  const exists = (await listAssignments(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_ASSIGNMENTS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_ASSIGNMENTS_COLLECTION, normalized.id, normalized);

  if (normalized.status === "active" && asset && normalized.station) {
    await saveFleetAsset(departmentId, { ...asset, station: normalized.station }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: exists ? "assignment_update" : "assignment_create",
    recordId: normalized.id,
    summary: `Assignment ${normalized.fleetNumber || ""} → ${normalized.station || "unassigned"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

// ——— Transfers ———

export async function listTransfers(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_TRANSFERS_COLLECTION))
    .map((row) => normalizeTransfer(row, departmentId));
  if (filters.openOnly) list = list.filter((row) => !["completed", "cancelled"].includes(row.status));
  return list.sort((a, b) => String(b.requestedAt || b.createdAt).localeCompare(String(a.requestedAt || a.createdAt)));
}

export async function createTransfer(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");
  const stamp = nowIso();
  const id = input.id || `XFER-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeTransfer({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    fromStation: input.fromStation || asset.station || "",
    requestedBy: audit.actorName || input.requestedBy || "User",
    requestedAt: stamp,
    status: input.status || "requested",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_TRANSFERS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "transfer_create",
    recordId: id,
    summary: `Transfer requested ${record.fleetNumber}: ${record.fromStation} → ${record.toStation}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function completeTransfer(departmentId, transferId, audit = {}) {
  const existing = normalizeTransfer(
    await getRecord(departmentId, FLEET_TRANSFERS_COLLECTION, transferId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Transfer not found");
  const stamp = nowIso();
  const next = normalizeTransfer({
    ...existing,
    status: "completed",
    completedAt: stamp,
    approvedBy: audit.actorName || existing.approvedBy,
    equipmentReconciled: true,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_TRANSFERS_COLLECTION, transferId, next);

  const asset = await getFleetAsset(departmentId, existing.fleetAssetId);
  if (asset) {
    await saveFleetAsset(departmentId, {
      ...asset,
      station: existing.toStation || asset.station,
    }, audit).catch(() => null);
    if (existing.meterValue !== "" && existing.meterValue != null) {
      await recordMeterReading(departmentId, {
        fleetAssetId: asset.id,
        meterType: "mileage",
        value: existing.meterValue,
        source: "transfer",
      }, audit).catch(() => null);
    }
  }

  await saveAssignment(departmentId, {
    fleetAssetId: existing.fleetAssetId,
    station: existing.toStation,
    shift: existing.toShift,
    effectiveFrom: stamp,
    status: "active",
    notes: `From transfer ${transferId}`,
  }, audit).catch(() => null);

  await writeFleetAuditLog(departmentId, {
    action: "transfer_complete",
    recordId: transferId,
    summary: `Transfer completed ${existing.fleetNumber} → ${existing.toStation}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

// ——— Reserve swaps ———

export async function listReserveSwaps(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_RESERVE_SWAPS_COLLECTION))
    .map((row) => normalizeReserveSwap(row, departmentId));
  if (filters.activeOnly) list = list.filter((row) => row.status === "active");
  return list.sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

export async function createReserveSwap(departmentId, input = {}, audit = {}) {
  const [frontline, reserve] = await Promise.all([
    getFleetAsset(departmentId, input.frontlineAssetId),
    getFleetAsset(departmentId, input.reserveAssetId),
  ]);
  if (!frontline || !reserve) throw new Error("Frontline and reserve assets are required");
  const stamp = nowIso();
  const id = input.id || `SWAP-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeReserveSwap({
    ...input,
    id,
    departmentId,
    frontlineUnit: frontline.fleetNumber,
    reserveUnit: reserve.fleetNumber,
    startedAt: input.startedAt || stamp,
    status: "active",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_RESERVE_SWAPS_COLLECTION, id, record);

  // Swap operational roles: frontline → reserve status, reserve → in_service at frontline station.
  await saveFleetAsset(departmentId, {
    ...frontline,
    status: "out_of_service",
    statusLabel: "Swapped to reserve",
  }, audit).catch(() => null);
  await saveFleetAsset(departmentId, {
    ...reserve,
    status: "in_service",
    station: frontline.station || reserve.station,
    statusLabel: "Covering frontline",
  }, audit).catch(() => null);

  await writeFleetAuditLog(departmentId, {
    action: "reserve_swap",
    recordId: id,
    summary: `Swap ${record.frontlineUnit} ↔ ${record.reserveUnit}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function endReserveSwap(departmentId, swapId, audit = {}) {
  const existing = normalizeReserveSwap(
    await getRecord(departmentId, FLEET_RESERVE_SWAPS_COLLECTION, swapId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Reserve swap not found");
  const stamp = nowIso();
  const next = normalizeReserveSwap({
    ...existing,
    status: "ended",
    actualEndAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_RESERVE_SWAPS_COLLECTION, swapId, next);

  const [frontline, reserve] = await Promise.all([
    getFleetAsset(departmentId, existing.frontlineAssetId),
    getFleetAsset(departmentId, existing.reserveAssetId),
  ]);
  if (frontline) {
    await saveFleetAsset(departmentId, {
      ...frontline,
      status: "in_service",
      statusLabel: "",
    }, audit).catch(() => null);
  }
  if (reserve) {
    await saveFleetAsset(departmentId, {
      ...reserve,
      status: "reserve",
      statusLabel: "",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "reserve_swap_end",
    recordId: swapId,
    summary: `Ended swap ${existing.frontlineUnit} ↔ ${existing.reserveUnit}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

// ——— Checkouts ———

export async function listCheckouts(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_CHECKOUTS_COLLECTION))
    .map((row) => normalizeCheckout(row, departmentId));
  const now = Date.now();
  list = list.map((row) => {
    if (row.status === "open" && row.expectedReturnAt) {
      const due = new Date(row.expectedReturnAt).getTime();
      if (Number.isFinite(due) && due < now) return { ...row, status: "overdue" };
    }
    return row;
  });
  if (filters.openOnly) list = list.filter((row) => ["open", "overdue"].includes(row.status));
  return list.sort((a, b) => String(b.startedAt || b.createdAt).localeCompare(String(a.startedAt || a.createdAt)));
}

export async function createCheckout(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");
  if (["out_of_service", "decommissioned"].includes(asset.status)) {
    throw new Error(`Cannot check out unit with status ${asset.status}`);
  }
  const open = (await listCheckouts(departmentId, { openOnly: true }))
    .filter((row) => row.fleetAssetId === asset.id);
  if (open.length) throw new Error("Unit already has an open checkout");

  const stamp = nowIso();
  const id = input.id || `CHK-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeCheckout({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    driverName: input.driverName || audit.actorName || "User",
    startedAt: input.startedAt || stamp,
    startMeter: input.startMeter ?? asset.mileage ?? "",
    fuelStart: input.fuelStart ?? asset.fuel ?? "",
    approvedBy: audit.actorName || "",
    status: "open",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_CHECKOUTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "checkout",
    recordId: id,
    summary: `Checked out ${record.fleetNumber} to ${record.driverName}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function returnCheckout(departmentId, checkoutId, input = {}, audit = {}) {
  const existing = normalizeCheckout(
    await getRecord(departmentId, FLEET_CHECKOUTS_COLLECTION, checkoutId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Checkout not found");
  const stamp = nowIso();
  const next = normalizeCheckout({
    ...existing,
    ...input,
    status: "returned",
    returnedAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_CHECKOUTS_COLLECTION, checkoutId, next);

  if (next.endMeter !== "" && next.endMeter != null && existing.fleetAssetId) {
    await recordMeterReading(departmentId, {
      fleetAssetId: existing.fleetAssetId,
      meterType: "mileage",
      value: next.endMeter,
      source: "checkout",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "checkout_return",
    recordId: checkoutId,
    summary: `Returned ${existing.fleetNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

// ——— Pool reservations ———

export async function listPoolReservations(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_POOL_RESERVATIONS_COLLECTION))
    .map((row) => normalizePoolReservation(row, departmentId));
  if (filters.openOnly) {
    list = list.filter((row) => !["completed", "cancelled", "no_show"].includes(row.status));
  }
  return list.sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export async function createPoolReservation(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");
  if (asset.status === "out_of_service") {
    throw new Error("Cannot reserve an out-of-service unit");
  }

  const existing = await listPoolReservations(departmentId, { openOnly: true });
  const conflict = existing.find((row) => (
    row.fleetAssetId === asset.id
    && overlaps(input.startsAt, input.endsAt, row.startsAt, row.endsAt)
  ));

  const stamp = nowIso();
  const id = input.id || `RSV-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizePoolReservation({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    reservedBy: input.reservedBy || audit.actorName || "User",
    status: conflict ? "requested" : (input.status || "approved"),
    conflict: Boolean(conflict),
    conflictReason: conflict ? `Conflicts with ${conflict.id} (${conflict.reservedBy})` : "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_POOL_RESERVATIONS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "pool_reservation",
    recordId: id,
    summary: `Reservation ${record.fleetNumber}${record.conflict ? " · CONFLICT" : ""}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updatePoolReservation(departmentId, reservationId, patch = {}, audit = {}) {
  const existing = normalizePoolReservation(
    await getRecord(departmentId, FLEET_POOL_RESERVATIONS_COLLECTION, reservationId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Reservation not found");
  const next = normalizePoolReservation({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_POOL_RESERVATIONS_COLLECTION, reservationId, next);
  return next;
}

// ——— Load plans ———

export async function listLoadPlans(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_LOAD_PLANS_COLLECTION))
    .map((row) => normalizeLoadPlan(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
}

export async function saveLoadPlan(departmentId, record = {}, audit = {}) {
  const asset = record.fleetAssetId ? await getFleetAsset(departmentId, record.fleetAssetId) : null;
  const normalized = normalizeLoadPlan({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
    fleetClassId: record.fleetClassId || asset?.fleetClassId || "",
  }, departmentId);
  if (!normalized.id) normalized.id = `LOAD-${Date.now().toString(36).toUpperCase()}`;
  if (!normalized.items?.length) {
    normalized.items = STARTER_LOAD_PLAN_ITEMS.map((item) => ({ ...item }));
  }
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listLoadPlans(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_LOAD_PLANS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_LOAD_PLANS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "load_plan_update" : "load_plan_create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} load plan for ${normalized.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Record an equipment check against a load plan (expected vs actual).
 * @param {string} departmentId
 * @param {string} loadPlanId
 * @param {{ itemId: string, actualQuantity: number }[]} checks
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function checkLoadPlan(departmentId, loadPlanId, checks = [], audit = {}) {
  const existing = normalizeLoadPlan(
    await getRecord(departmentId, FLEET_LOAD_PLANS_COLLECTION, loadPlanId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Load plan not found");
  const checkById = Object.fromEntries(checks.map((row) => [row.itemId, row]));
  let missingCount = 0;
  const items = existing.items.map((item) => {
    const check = checkById[item.id];
    const actual = check ? Number(check.actualQuantity) : Number(item.actualQuantity);
    const qty = Number.isFinite(actual) ? actual : "";
    let status = "ok";
    if (qty === "") status = "unchecked";
    else if (qty < (Number(item.minimumQuantity) || Number(item.quantity) || 0)) {
      status = "missing";
      missingCount += 1;
    }
    return { ...item, actualQuantity: qty, status };
  });
  return saveLoadPlan(departmentId, {
    ...existing,
    items,
    missingCount,
    lastCheckedAt: nowIso(),
  }, audit);
}

// ——— Decontamination ———

export async function listDeconEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_DECON_EVENTS_COLLECTION))
    .map((row) => normalizeDeconEvent(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

export async function recordDeconEvent(departmentId, input = {}, audit = {}) {
  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset && !input.fleetAssetId) throw new Error("fleetAssetId is required");
  const stamp = nowIso();
  const id = input.id || `DECON-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeDeconEvent({
    ...input,
    id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    personnel: input.personnel || audit.actorName || "User",
    occurredAt: input.occurredAt || stamp,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_DECON_EVENTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "decon",
    recordId: id,
    summary: `${record.deconType} on ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * Operations board summary.
 * @param {string} departmentId
 */
export async function buildOperationsBoard(departmentId) {
  const [assignments, transfers, swaps, checkouts, reservations, loadPlans, decons, assets] = await Promise.all([
    listAssignments(departmentId, { activeOnly: true }),
    listTransfers(departmentId, { openOnly: true }),
    listReserveSwaps(departmentId, { activeOnly: true }),
    listCheckouts(departmentId, { openOnly: true }),
    listPoolReservations(departmentId, { openOnly: true }),
    listLoadPlans(departmentId),
    listDeconEvents(departmentId),
    listFleetAssets(departmentId),
  ]);

  return {
    assignments,
    transfers,
    swaps,
    checkouts,
    reservations,
    loadPlans,
    decons: decons.slice(0, 40),
    summary: {
      activeAssignments: assignments.length,
      openTransfers: transfers.length,
      activeSwaps: swaps.length,
      openCheckouts: checkouts.length,
      overdueCheckouts: checkouts.filter((row) => row.status === "overdue").length,
      openReservations: reservations.length,
      reservationConflicts: reservations.filter((row) => row.conflict).length,
      loadPlans: loadPlans.length,
      loadPlanGaps: loadPlans.filter((row) => row.missingCount > 0).length,
      deconEvents: decons.length,
      assets: assets.length,
    },
  };
}

export function getDeconTypes() {
  return [...DECON_TYPES];
}

export function getStarterLoadPlanItems() {
  return STARTER_LOAD_PLAN_ITEMS.map((item) => ({ ...item }));
}
