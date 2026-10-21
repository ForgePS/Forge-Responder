import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { getFleetAsset, listFleetAssets } from "./fleetAssetService.js";
import { createFleetWorkOrder } from "./fleetWorkOrderService.js";
import { applyFleetStatusDecision } from "./fleetStatusControlService.js";
import {
  ACCIDENT_EVENT_TYPES,
  ACCIDENT_STATUSES,
  INSURANCE_CLAIM_STATUSES,
  SAFETY_REVIEW_OUTCOMES,
  STARTER_TOW_PROVIDERS,
  ROADSIDE_STATUSES,
} from "./riskDefaults.js";
import {
  FLEET_ACCIDENT_EVENTS_COLLECTION,
  FLEET_INSURANCE_CLAIMS_COLLECTION,
  FLEET_ROADSIDE_EVENTS_COLLECTION,
  FLEET_SAFETY_REVIEWS_COLLECTION,
  FLEET_TOW_PROVIDERS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/** @param {object} raw @param {string} departmentId */
export function normalizeAccidentEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    eventNumber: data.eventNumber || data.id || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    driverName: data.driverName || "",
    crew: data.crew || "",
    occurredAt: data.occurredAt || "",
    location: data.location || "",
    incidentNumber: data.incidentNumber || "",
    eventType: data.eventType || "collision",
    description: data.description || "",
    emergencyResponse: Boolean(data.emergencyResponse),
    otherVehicles: data.otherVehicles || "",
    otherParties: data.otherParties || "",
    injuries: data.injuries || "",
    lawEnforcement: Boolean(data.lawEnforcement),
    citation: data.citation || "",
    witnesses: data.witnesses || "",
    damageEstimate: Number(data.damageEstimate) || 0,
    towRequired: Boolean(data.towRequired),
    oosApplied: Boolean(data.oosApplied),
    supervisorReview: data.supervisorReview || "",
    preventability: data.preventability || "",
    legalNotes: data.legalNotes || "",
    medicalNotes: data.medicalNotes || "",
    correctiveAction: data.correctiveAction || "",
    workOrderId: data.workOrderId || "",
    claimId: data.claimId || "",
    safetyReviewId: data.safetyReviewId || "",
    roadsideEventId: data.roadsideEventId || "",
    status: data.status || "reported",
    disposition: data.disposition || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeInsuranceClaim(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    claimNumber: data.claimNumber || data.id || "",
    accidentEventId: data.accidentEventId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    carrier: data.carrier || "",
    policyNumber: data.policyNumber || "",
    adjuster: data.adjuster || "",
    filedAt: data.filedAt || "",
    deductible: Number(data.deductible) || 0,
    estimate: Number(data.estimate) || 0,
    payment: Number(data.payment) || 0,
    recovery: Number(data.recovery) || 0,
    subrogation: Boolean(data.subrogation),
    status: data.status || "draft",
    documentsNote: data.documentsNote || "",
    closedAt: data.closedAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeTowProvider(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled provider").trim(),
    phone: data.phone || "",
    afterHoursPhone: data.afterHoursPhone || "",
    services: data.services || "",
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeRoadsideEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    driverName: data.driverName || "",
    occurredAt: data.occurredAt || "",
    location: data.location || "",
    symptoms: data.symptoms || "",
    safetyStatus: data.safetyStatus || "safe",
    providerId: data.providerId || "",
    providerName: data.providerName || "",
    dispatchedAt: data.dispatchedAt || "",
    arrivedAt: data.arrivedAt || "",
    destination: data.destination || "",
    cost: Number(data.cost) || 0,
    roadsideRepair: Boolean(data.roadsideRepair),
    workOrderId: data.workOrderId || "",
    accidentEventId: data.accidentEventId || "",
    reserveAssetId: data.reserveAssetId || "",
    status: data.status || "dispatched",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeSafetyReview(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    accidentEventId: data.accidentEventId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    reviewedBy: data.reviewedBy || "",
    reviewedAt: data.reviewedAt || "",
    outcome: data.outcome || "pending",
    findings: data.findings || "",
    correctiveAction: data.correctiveAction || "",
    trainingRequired: Boolean(data.trainingRequired),
    restrictedAccess: data.restrictedAccess !== false,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * Strip sensitive fields unless caller has sensitive access.
 * @param {object} event
 * @param {boolean} canViewSensitive
 */
export function redactAccidentEvent(event = {}, canViewSensitive = false) {
  if (canViewSensitive) return event;
  return {
    ...event,
    legalNotes: event.legalNotes ? "[restricted]" : "",
    medicalNotes: event.medicalNotes ? "[restricted]" : "",
    preventability: event.preventability ? "[restricted]" : "",
    injuries: event.injuries ? "[restricted — injuries on file]" : "",
  };
}

// ——— Accidents ———

export async function listAccidentEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION))
    .map((row) => normalizeAccidentEvent(row, departmentId));
  if (filters.openOnly) list = list.filter((row) => row.status !== "closed");
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

export async function createAccidentEvent(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const asset = input.fleetAssetId ? await getFleetAsset(departmentId, input.fleetAssetId) : null;
  const stamp = nowIso();
  const id = input.id || `ACC-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeAccidentEvent({
    ...input,
    id,
    eventNumber: input.eventNumber || id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    driverName: input.driverName || audit.actorName || "",
    occurredAt: input.occurredAt || stamp,
    status: input.status || "reported",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, id, record);

  if (input.markOos && asset) {
    await applyFleetStatusDecision(departmentId, {
      fleetAssetId: asset.id,
      decision: "out_of_service",
      basis: `Accident ${record.eventNumber}`,
      authority: audit.actorName || "User",
    }, audit).catch(() => null);
    record.oosApplied = true;
    await updateRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, id, {
      ...record,
      updatedAt: nowIso(),
    });
  }

  if (input.createWorkOrder && asset) {
    const wo = await createFleetWorkOrder(departmentId, {
      fleetAssetId: asset.id,
      workOrderType: "corrective",
      priority: "high",
      complaint: `Accident repair: ${record.eventType} — ${record.description || record.eventNumber}`,
      source: "accident",
      category: "Accident",
      oosRequired: Boolean(input.markOos),
    }, audit).catch(() => null);
    if (wo) {
      record.workOrderId = wo.id;
      record.status = "repairing";
      await updateRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, id, {
        ...record,
        updatedAt: nowIso(),
      });
    }
  }

  await writeFleetAuditLog(departmentId, {
    action: "accident_create",
    recordId: id,
    summary: `Accident ${record.eventNumber} on ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

export async function updateAccidentEvent(departmentId, eventId, patch = {}, audit = {}) {
  const existing = normalizeAccidentEvent(
    await getRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, eventId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Accident event not found");
  const next = normalizeAccidentEvent({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, eventId, next);
  await writeFleetAuditLog(departmentId, {
    action: "accident_update",
    recordId: eventId,
    summary: `Updated accident ${next.eventNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

// ——— Insurance claims ———

export async function listInsuranceClaims(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_INSURANCE_CLAIMS_COLLECTION))
    .map((row) => normalizeInsuranceClaim(row, departmentId));
  if (filters.accidentEventId) list = list.filter((row) => row.accidentEventId === filters.accidentEventId);
  if (filters.openOnly) list = list.filter((row) => !["closed", "denied", "paid"].includes(row.status));
  return list.sort((a, b) => String(b.filedAt || b.createdAt).localeCompare(String(a.filedAt || a.createdAt)));
}

export async function createInsuranceClaim(departmentId, input = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  let accident = null;
  if (input.accidentEventId) {
    accident = normalizeAccidentEvent(
      await getRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, input.accidentEventId) || {},
      departmentId
    );
  }
  const stamp = nowIso();
  const id = input.id || `ICL-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeInsuranceClaim({
    ...input,
    id,
    claimNumber: input.claimNumber || id,
    departmentId,
    fleetAssetId: asset?.id || accident?.fleetAssetId || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || accident?.fleetNumber || input.fleetNumber || "",
    accidentEventId: accident?.id || input.accidentEventId || "",
    estimate: input.estimate ?? accident?.damageEstimate ?? 0,
    filedAt: input.filedAt || stamp,
    status: input.status || "filed",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_INSURANCE_CLAIMS_COLLECTION, id, record);

  if (accident?.id) {
    await updateAccidentEvent(departmentId, accident.id, {
      claimId: id,
      status: accident.status === "reported" ? "claim_open" : accident.status,
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "insurance_claim",
    recordId: id,
    summary: `Insurance claim ${record.claimNumber} for ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateInsuranceClaim(departmentId, claimId, patch = {}, audit = {}) {
  const existing = (await listInsuranceClaims(departmentId)).find((row) => row.id === claimId);
  if (!existing) throw new Error("Insurance claim not found");
  const next = normalizeInsuranceClaim({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  if (["paid", "closed", "denied"].includes(next.status) && !next.closedAt) {
    next.closedAt = nowIso().slice(0, 10);
  }
  await updateRecord(departmentId, FLEET_INSURANCE_CLAIMS_COLLECTION, claimId, next);
  return next;
}

// ——— Tow providers ———

export async function listTowProviders(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_TOW_PROVIDERS_COLLECTION))
    .map((row) => normalizeTowProvider(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function ensureTowProvidersSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listTowProviders(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_TOW_PROVIDERS) {
    const record = normalizeTowProvider({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_TOW_PROVIDERS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_TOW_PROVIDERS_COLLECTION,
    summary: `Seeded ${created.length} tow providers`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

export async function saveTowProvider(departmentId, record = {}, audit = {}) {
  const normalized = normalizeTowProvider(record, departmentId);
  if (!normalized.id) normalized.id = `tow-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listTowProviders(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_TOW_PROVIDERS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_TOW_PROVIDERS_COLLECTION, normalized.id, normalized);
  return normalized;
}

// ——— Roadside / tow ———

export async function listRoadsideEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_ROADSIDE_EVENTS_COLLECTION))
    .map((row) => normalizeRoadsideEvent(row, departmentId));
  if (filters.openOnly) list = list.filter((row) => !["completed", "cancelled"].includes(row.status));
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

export async function createRoadsideEvent(departmentId, input = {}, audit = {}) {
  const [asset, providers] = await Promise.all([
    getFleetAsset(departmentId, input.fleetAssetId),
    ensureTowProvidersSeeded(departmentId, audit),
  ]);
  if (!asset) throw new Error("Fleet asset not found");
  const provider = providers.find((row) => row.id === input.providerId) || providers[0];
  const stamp = nowIso();
  const id = input.id || `RDS-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeRoadsideEvent({
    ...input,
    id,
    departmentId,
    fleetNumber: asset.fleetNumber,
    driverName: input.driverName || audit.actorName || "",
    occurredAt: input.occurredAt || stamp,
    dispatchedAt: input.dispatchedAt || stamp,
    providerId: provider?.id || "",
    providerName: provider?.name || input.providerName || "",
    status: input.status || "dispatched",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_ROADSIDE_EVENTS_COLLECTION, id, record);

  if (input.createWorkOrder) {
    const wo = await createFleetWorkOrder(departmentId, {
      fleetAssetId: asset.id,
      workOrderType: "corrective",
      priority: "high",
      complaint: `Roadside / tow: ${record.symptoms || record.location || id}`,
      source: "roadside",
      category: "Roadside",
      vendorName: record.providerName,
    }, audit).catch(() => null);
    if (wo) {
      record.workOrderId = wo.id;
      await updateRecord(departmentId, FLEET_ROADSIDE_EVENTS_COLLECTION, id, {
        ...record,
        updatedAt: nowIso(),
      });
    }
  }

  if (input.accidentEventId) {
    await updateAccidentEvent(departmentId, input.accidentEventId, {
      roadsideEventId: id,
      towRequired: true,
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "roadside_create",
    recordId: id,
    summary: `Roadside for ${record.fleetNumber} via ${record.providerName || "provider"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateRoadsideEvent(departmentId, eventId, patch = {}, audit = {}) {
  const existing = normalizeRoadsideEvent(
    await getRecord(departmentId, FLEET_ROADSIDE_EVENTS_COLLECTION, eventId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Roadside event not found");
  const next = normalizeRoadsideEvent({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_ROADSIDE_EVENTS_COLLECTION, eventId, next);
  return next;
}

// ——— Safety reviews ———

export async function listSafetyReviews(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_SAFETY_REVIEWS_COLLECTION))
    .map((row) => normalizeSafetyReview(row, departmentId));
  if (filters.accidentEventId) list = list.filter((row) => row.accidentEventId === filters.accidentEventId);
  return list.sort((a, b) => String(b.reviewedAt || b.createdAt).localeCompare(String(a.reviewedAt || a.createdAt)));
}

export async function createSafetyReview(departmentId, input = {}, audit = {}) {
  const accident = input.accidentEventId
    ? normalizeAccidentEvent(
      await getRecord(departmentId, FLEET_ACCIDENT_EVENTS_COLLECTION, input.accidentEventId) || {},
      departmentId
    )
    : null;
  const stamp = nowIso();
  const id = input.id || `SRF-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeSafetyReview({
    ...input,
    id,
    departmentId,
    accidentEventId: accident?.id || input.accidentEventId || "",
    fleetAssetId: accident?.fleetAssetId || input.fleetAssetId || "",
    fleetNumber: accident?.fleetNumber || input.fleetNumber || "",
    reviewedBy: audit.actorName || input.reviewedBy || "User",
    reviewedAt: input.reviewedAt || stamp,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_SAFETY_REVIEWS_COLLECTION, id, record);

  if (accident?.id) {
    await updateAccidentEvent(departmentId, accident.id, {
      safetyReviewId: id,
      status: "safety_review",
      preventability: record.outcome === "pending" ? accident.preventability : record.outcome,
      correctiveAction: record.correctiveAction || accident.correctiveAction,
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "safety_review",
    recordId: id,
    summary: `Safety review ${record.outcome} for ${record.fleetNumber || accident?.eventNumber || "event"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * @param {string} departmentId
 * @param {boolean} [canViewSensitive]
 */
export async function buildRiskBoard(departmentId, canViewSensitive = false) {
  const [accidents, claims, roadside, reviews, providers] = await Promise.all([
    listAccidentEvents(departmentId),
    listInsuranceClaims(departmentId),
    listRoadsideEvents(departmentId),
    listSafetyReviews(departmentId),
    ensureTowProvidersSeeded(departmentId),
  ]);

  const openAccidents = accidents.filter((row) => row.status !== "closed");
  const recovered = claims.reduce((sum, row) => sum + (Number(row.payment) || 0) + (Number(row.recovery) || 0), 0);

  return {
    accidents: accidents.map((row) => redactAccidentEvent(row, canViewSensitive)),
    claims,
    roadside,
    reviews: canViewSensitive
      ? reviews
      : reviews.map((row) => ({
        ...row,
        findings: row.findings ? "[restricted]" : "",
        notes: row.notes ? "[restricted]" : "",
      })),
    providers,
    summary: {
      accidents: accidents.length,
      openAccidents: openAccidents.length,
      claims: claims.length,
      openClaims: claims.filter((row) => !["closed", "denied", "paid"].includes(row.status)).length,
      roadsideOpen: roadside.filter((row) => !["completed", "cancelled"].includes(row.status)).length,
      safetyPending: reviews.filter((row) => row.outcome === "pending").length,
      recovered: Number(recovered.toFixed(2)),
      providers: providers.length,
    },
  };
}

export function getAccidentEventTypes() {
  return [...ACCIDENT_EVENT_TYPES];
}

export function getAccidentStatuses() {
  return [...ACCIDENT_STATUSES];
}

export function getInsuranceClaimStatuses() {
  return [...INSURANCE_CLAIM_STATUSES];
}

export function getRoadsideStatuses() {
  return [...ROADSIDE_STATUSES];
}

export function getSafetyReviewOutcomes() {
  return [...SAFETY_REVIEW_OUTCOMES];
}
