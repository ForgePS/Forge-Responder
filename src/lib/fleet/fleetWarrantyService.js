import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import { WARRANTY_CLAIM_STATUSES } from "./componentDefaults.js";
import {
  FLEET_WARRANTIES_COLLECTION,
  FLEET_WARRANTY_CLAIMS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function daysBetween(fromIso, toIso) {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetWarranty(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    provider: data.provider || "",
    warrantyType: data.warrantyType || "bumper_to_bumper",
    coveredSystem: data.coveredSystem || "Whole vehicle",
    startDate: data.startDate || "",
    expirationDate: data.expirationDate || "",
    expirationMeter: data.expirationMeter ?? "",
    deductible: Number(data.deductible) || 0,
    termsSummary: data.termsSummary || "",
    contact: data.contact || "",
    transferable: Boolean(data.transferable),
    notes: data.notes || "",
    status: data.status || "active",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeWarrantyClaim(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    claimNumber: data.claimNumber || data.id || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    warrantyId: data.warrantyId || "",
    provider: data.provider || "",
    workOrderId: data.workOrderId || "",
    defectId: data.defectId || "",
    submittedAt: data.submittedAt || "",
    claimedAmount: Number(data.claimedAmount) || 0,
    approvedAmount: Number(data.approvedAmount) || 0,
    rejectedAmount: Number(data.rejectedAmount) || 0,
    paymentReceived: Number(data.paymentReceived) || 0,
    status: data.status || "draft",
    authorization: data.authorization || "",
    vendorName: data.vendorName || "",
    recoveryDate: data.recoveryDate || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string }} [filters]
 */
export async function listFleetWarranties(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_WARRANTIES_COLLECTION);
  let list = rows.map((row) => normalizeFleetWarranty(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(a.expirationDate).localeCompare(String(b.expirationDate)));
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetWarranty(departmentId, record = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === record.fleetAssetId);
  const normalized = normalizeFleetWarranty({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
  }, departmentId);
  if (!normalized.id) normalized.id = `WAR-${Date.now().toString(36).toUpperCase()}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (normalized.expirationDate) {
    const days = daysBetween(stamp, normalized.expirationDate);
    if (days != null && days < 0) normalized.status = "expired";
  }
  const exists = (await listFleetWarranties(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_WARRANTIES_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_WARRANTIES_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "warranty_update" : "warranty_create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} warranty ${normalized.provider || normalized.id} on ${normalized.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, status?: string }} [filters]
 */
export async function listWarrantyClaims(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_WARRANTY_CLAIMS_COLLECTION);
  let list = rows.map((row) => normalizeWarrantyClaim(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  return list.sort((a, b) => String(b.submittedAt || b.createdAt).localeCompare(String(a.submittedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createWarrantyClaim(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const [assets, warranties] = await Promise.all([
    listFleetAssets(departmentId),
    listFleetWarranties(departmentId),
  ]);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  const warranty = warranties.find((row) => row.id === input.warrantyId);
  const stamp = nowIso();
  const id = input.id || `WCL-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeWarrantyClaim({
    ...input,
    id,
    claimNumber: input.claimNumber || id,
    departmentId,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    warrantyId: warranty?.id || input.warrantyId || "",
    provider: input.provider || warranty?.provider || "",
    submittedAt: input.submittedAt || stamp,
    status: input.status || "submitted",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_WARRANTY_CLAIMS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "warranty_claim",
    recordId: id,
    summary: `Warranty claim ${id} for ${record.fleetNumber || "unit"} · $${record.claimedAmount}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * @param {string} departmentId
 * @param {string} claimId
 * @param {object} patch
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function updateWarrantyClaim(departmentId, claimId, patch = {}, audit = {}) {
  const existing = (await listWarrantyClaims(departmentId)).find((row) => row.id === claimId);
  if (!existing) throw new Error("Warranty claim not found");
  const next = normalizeWarrantyClaim({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  if (next.status === "paid" && !next.recoveryDate) next.recoveryDate = nowIso().slice(0, 10);
  await updateRecord(departmentId, FLEET_WARRANTY_CLAIMS_COLLECTION, claimId, next);
  await writeFleetAuditLog(departmentId, {
    action: "warranty_claim_update",
    recordId: claimId,
    summary: `Updated warranty claim ${next.claimNumber} → ${next.status}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

/**
 * @param {string} departmentId
 */
export async function buildWarrantyBoard(departmentId) {
  const [warranties, claims] = await Promise.all([
    listFleetWarranties(departmentId),
    listWarrantyClaims(departmentId),
  ]);
  const now = nowIso();
  const expiring = warranties.filter((row) => {
    if (!row.expirationDate || row.status === "expired") return false;
    const days = daysBetween(now, row.expirationDate);
    return days != null && days >= 0 && days <= 90;
  });
  const expired = warranties.filter((row) => {
    if (row.status === "expired") return true;
    if (!row.expirationDate) return false;
    const days = daysBetween(now, row.expirationDate);
    return days != null && days < 0;
  });
  const recovered = claims
    .filter((row) => ["paid", "approved", "partial"].includes(row.status))
    .reduce((sum, row) => sum + (Number(row.paymentReceived) || Number(row.approvedAmount) || 0), 0);
  const openClaims = claims.filter((row) => !["paid", "rejected"].includes(row.status));

  return {
    warranties,
    claims,
    expiring,
    expired,
    summary: {
      warranties: warranties.length,
      active: warranties.filter((row) => row.status === "active").length,
      expiring: expiring.length,
      expired: expired.length,
      claims: claims.length,
      openClaims: openClaims.length,
      recovered: Number(recovered.toFixed(2)),
    },
  };
}

export function getWarrantyClaimStatuses() {
  return [...WARRANTY_CLAIM_STATUSES];
}
