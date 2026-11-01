import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { FLEET_CLASSES_COLLECTION } from "./paths.js";
import { STARTER_FLEET_CLASSES } from "./types.js";

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetClass(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled class").trim(),
    category: data.category || "emergency_response",
    description: data.description || "",
    defaultMeterTypes: Array.isArray(data.defaultMeterTypes)
      ? data.defaultMeterTypes.map(String)
      : [],
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listFleetClasses(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_CLASSES_COLLECTION);
  return rows
    .map((row) => normalizeFleetClass(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetClassesSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listFleetClasses(departmentId);
  if (existing.length) return existing;

  const stamp = new Date().toISOString();
  const created = [];
  for (const starter of STARTER_FLEET_CLASSES) {
    const record = normalizeFleetClass({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, FLEET_CLASSES_COLLECTION, record.id, record);
    created.push(record);
  }

  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_CLASSES_COLLECTION,
    summary: `Seeded ${created.length} fleet classes`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return created;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string, isNew?: boolean }} [audit]
 */
export async function saveFleetClass(departmentId, record = {}, audit = {}) {
  const normalized = normalizeFleetClass(record, departmentId);
  if (!normalized.id) normalized.id = `class-${Date.now().toString(36)}`;
  const stamp = new Date().toISOString();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;

  const exists = (await listFleetClasses(departmentId)).some((row) => row.id === normalized.id);
  if (exists) {
    await updateRecord(departmentId, FLEET_CLASSES_COLLECTION, normalized.id, normalized);
  } else {
    await createRecord(departmentId, FLEET_CLASSES_COLLECTION, normalized.id, normalized);
  }

  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} fleet class ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return normalized;
}

/** Delete a vehicle type. Callers should check no units use it first. */
export async function deleteFleetClass(departmentId, classRecord = {}, audit = {}) {
  if (!departmentId || !classRecord.id) return;
  await deleteRecord(departmentId, FLEET_CLASSES_COLLECTION, classRecord.id);
  await writeFleetAuditLog(departmentId, {
    action: "delete",
    recordId: classRecord.id,
    summary: `Deleted vehicle type ${classRecord.name || classRecord.id}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
}

export const FLEET_CLASS_CATEGORIES = [
  { id: "emergency_response", label: "Emergency response" },
  { id: "ems", label: "EMS" },
  { id: "support", label: "Support" },
  { id: "specialty", label: "Specialty" },
];

export function fleetClassCategoryLabel(id = "") {
  return FLEET_CLASS_CATEGORIES.find((row) => row.id === id)?.label || "";
}
