import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { STARTER_SHOPS, STARTER_VENDORS } from "./workOrderDefaults.js";
import { FLEET_SHOPS_COLLECTION, FLEET_VENDORS_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetShop(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled shop").trim(),
    shopType: data.shopType || "internal",
    location: data.location || "",
    bayCount: Number(data.bayCount) || 0,
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
export function normalizeFleetVendor(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled vendor").trim(),
    category: data.category || "General",
    phone: data.phone || "",
    email: data.email || "",
    notes: data.notes || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listFleetShops(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_SHOPS_COLLECTION);
  return rows
    .map((row) => normalizeFleetShop(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 */
export async function listFleetVendors(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_VENDORS_COLLECTION);
  return rows
    .map((row) => normalizeFleetVendor(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetShopsSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetShops(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_SHOPS) {
    const record = normalizeFleetShop({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_SHOPS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_SHOPS_COLLECTION,
    summary: `Seeded ${created.length} fleet shops`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetVendorsSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetVendors(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_VENDORS) {
    const record = normalizeFleetVendor({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_VENDORS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_VENDORS_COLLECTION,
    summary: `Seeded ${created.length} fleet vendors`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetShop(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFleetShop(record, departmentId);
  if (!normalized.id) normalized.id = `shop-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listFleetShops(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_SHOPS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_SHOPS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} shop ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetVendor(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFleetVendor(record, departmentId);
  if (!normalized.id) normalized.id = `vendor-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listFleetVendors(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_VENDORS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_VENDORS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} vendor ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}
