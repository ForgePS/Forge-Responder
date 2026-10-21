import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getFleetAsset, saveFleetAsset } from "./fleetAssetService.js";
import { updateDefect } from "./fleetDefectService.js";
import {
  FLEET_RESERVE_REQUESTS_COLLECTION,
  FLEET_STATUS_EVENTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeStatusEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    decisionType: data.decisionType || "status_change",
    fromStatus: data.fromStatus || "",
    toStatus: data.toStatus || "",
    fromReadiness: data.fromReadiness || "",
    toReadiness: data.toReadiness || "",
    restriction: data.restriction || "",
    basis: data.basis || "",
    authority: data.authority || "",
    defectIds: Array.isArray(data.defectIds) ? data.defectIds : [],
    workOrderId: data.workOrderId || "",
    issuedBy: data.issuedBy || "",
    issuedByUid: data.issuedByUid || "",
    approvedBy: data.approvedBy || "",
    effectiveAt: data.effectiveAt || "",
    releasedAt: data.releasedAt || "",
    releaseNotes: data.releaseNotes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeReserveRequest(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    outOfServiceAssetId: data.outOfServiceAssetId || "",
    outOfServiceUnit: data.outOfServiceUnit || "",
    requestedReserveAssetId: data.requestedReserveAssetId || "",
    requestedReserveUnit: data.requestedReserveUnit || "",
    defectId: data.defectId || "",
    statusEventId: data.statusEventId || "",
    reason: data.reason || "",
    status: data.status || "requested",
    requestedBy: data.requestedBy || "",
    requestedAt: data.requestedAt || "",
    fulfilledAt: data.fulfilledAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {string} [fleetAssetId]
 */
export async function listStatusEvents(departmentId, fleetAssetId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_STATUS_EVENTS_COLLECTION);
  return rows
    .map((row) => normalizeStatusEvent(row, departmentId))
    .filter((row) => !fleetAssetId || row.fleetAssetId === fleetAssetId)
    .sort((a, b) => String(b.effectiveAt || b.createdAt).localeCompare(String(a.effectiveAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {{ openOnly?: boolean }} [filters]
 */
export async function listReserveRequests(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_RESERVE_REQUESTS_COLLECTION);
  let list = rows.map((row) => normalizeReserveRequest(row, departmentId));
  if (filters.openOnly) {
    list = list.filter((row) => !["fulfilled", "cancelled", "denied"].includes(row.status));
  }
  return list.sort((a, b) => String(b.requestedAt || b.createdAt).localeCompare(String(a.requestedAt || a.createdAt)));
}

/**
 * Place unit out of service or restricted with an auditable decision record.
 * @param {string} departmentId
 * @param {{
 *   fleetAssetId: string,
 *   decision: 'out_of_service' | 'restrict' | 'return_to_service',
 *   restriction?: string,
 *   basis?: string,
 *   authority?: string,
 *   defectIds?: string[],
 * }} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function applyFleetStatusDecision(departmentId, input = {}, audit = {}) {
  if (!departmentId || !input.fleetAssetId || !input.decision) {
    throw new Error("departmentId, fleetAssetId, and decision are required");
  }

  const asset = await getFleetAsset(departmentId, input.fleetAssetId);
  if (!asset) throw new Error("Fleet asset not found");

  const stamp = nowIso();
  const decision = input.decision;
  let toStatus = asset.status;
  let toReadiness = asset.readinessState || "";
  let restriction = input.restriction || "";

  if (decision === "out_of_service") {
    toStatus = "out_of_service";
    toReadiness = "out_of_service";
  } else if (decision === "restrict") {
    toStatus = "restricted";
    toReadiness = "available_restricted";
    restriction = restriction || "Restricted service pending repair";
  } else if (decision === "return_to_service") {
    toStatus = "in_service";
    toReadiness = "available";
    restriction = "";
  } else {
    throw new Error("Invalid decision");
  }

  // Close prior active status events for this asset.
  const prior = await listStatusEvents(departmentId, asset.id);
  for (const event of prior.filter((row) => row.active)) {
    await updateRecord(departmentId, FLEET_STATUS_EVENTS_COLLECTION, event.id, {
      ...event,
      active: false,
      releasedAt: stamp,
      releaseNotes: decision === "return_to_service"
        ? (input.basis || "Returned to service")
        : "Superseded by new status decision",
      updatedAt: stamp,
    });
  }

  const eventId = `SE-${Date.now().toString(36).toUpperCase()}`;
  const event = normalizeStatusEvent({
    id: eventId,
    departmentId,
    fleetAssetId: asset.id,
    fleetNumber: asset.fleetNumber,
    decisionType: decision,
    fromStatus: asset.status,
    toStatus,
    fromReadiness: asset.readinessState || "",
    toReadiness,
    restriction,
    basis: input.basis || "",
    authority: input.authority || audit.actorName || "Fleet",
    defectIds: input.defectIds || [],
    issuedBy: audit.actorName || "User",
    issuedByUid: audit.actorUid || "",
    approvedBy: audit.actorName || "User",
    effectiveAt: stamp,
    active: decision !== "return_to_service",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_STATUS_EVENTS_COLLECTION, eventId, event);

  await saveFleetAsset(departmentId, {
    ...asset,
    status: toStatus,
    statusLabel: toStatus === "out_of_service"
      ? "Out of Service"
      : toStatus === "restricted"
        ? "Restricted Service"
        : "In Service",
    readinessState: toReadiness,
    activeRestriction: restriction,
    lastStatusEventId: eventId,
  }, audit);

  // Link defects to this status event when provided.
  for (const defectId of input.defectIds || []) {
    await updateDefect(departmentId, defectId, {
      statusEventId: eventId,
      restriction: restriction || undefined,
      oosRecommendation: decision === "out_of_service"
        ? "out_of_service"
        : decision === "restrict"
          ? "restrict"
          : "none",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "status_decision",
    recordId: eventId,
    summary: `${decision} on ${asset.fleetNumber || asset.id}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
    after: { toStatus, toReadiness, restriction },
  }).catch(() => null);

  return { event, assetId: asset.id, toStatus, toReadiness };
}

/**
 * Request a reserve unit when primary is OOS/restricted.
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createReserveRequest(departmentId, input = {}, audit = {}) {
  if (!departmentId || !input.outOfServiceAssetId) {
    throw new Error("outOfServiceAssetId is required");
  }
  const stamp = nowIso();
  const id = `RR-${Date.now().toString(36).toUpperCase()}`;
  const oosAsset = await getFleetAsset(departmentId, input.outOfServiceAssetId);
  let reserveUnit = input.requestedReserveUnit || "";
  if (input.requestedReserveAssetId) {
    const reserve = await getFleetAsset(departmentId, input.requestedReserveAssetId);
    reserveUnit = reserve?.fleetNumber || reserveUnit;
  }

  const record = normalizeReserveRequest({
    id,
    departmentId,
    outOfServiceAssetId: input.outOfServiceAssetId,
    outOfServiceUnit: oosAsset?.fleetNumber || input.outOfServiceUnit || "",
    requestedReserveAssetId: input.requestedReserveAssetId || "",
    requestedReserveUnit: reserveUnit,
    defectId: input.defectId || "",
    statusEventId: input.statusEventId || "",
    reason: input.reason || "Primary unit unavailable",
    status: "requested",
    requestedBy: audit.actorName || "User",
    requestedAt: stamp,
    notes: input.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_RESERVE_REQUESTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "reserve_request",
    recordId: id,
    summary: `Reserve requested for ${record.outOfServiceUnit}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

/**
 * @param {string} departmentId
 * @param {string} requestId
 * @param {{ status: string, notes?: string }} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function updateReserveRequest(departmentId, requestId, input = {}, audit = {}) {
  const rows = await listReserveRequests(departmentId);
  const existing = rows.find((row) => row.id === requestId);
  if (!existing) throw new Error("Reserve request not found");
  const stamp = nowIso();
  const next = normalizeReserveRequest({
    ...existing,
    status: input.status || existing.status,
    notes: input.notes ?? existing.notes,
    fulfilledAt: input.status === "fulfilled" ? stamp : existing.fulfilledAt,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_RESERVE_REQUESTS_COLLECTION, requestId, next);
  await writeFleetAuditLog(departmentId, {
    action: "reserve_update",
    recordId: requestId,
    summary: `Reserve request ${requestId} → ${next.status}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}
