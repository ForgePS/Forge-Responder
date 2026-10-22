import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { readTenantList } from "../tenantListStore.js";
import { LIST_KEYS } from "../tenantListKeys.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { OCCUPANCIES_COLLECTION } from "./paths.js";

/**
 * @param {object} raw
 * @param {string} departmentId
 * @returns {import("./types.js").OccupancyRecord}
 */
export function normalizeOccupancyRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const contacts = Array.isArray(data.contacts)
    ? data.contacts.filter(Boolean).map((contact, index) => normalizeContact(contact, index))
    : [];
  const timeline = Array.isArray(data.timeline)
    ? data.timeline.filter(Boolean).map((event, index) => normalizeTimelineEvent(event, index))
    : [];

  const occupancyType = data.occupancyType || data.type || "Business";
  const hazard = data.hazard || data.riskLevel || "Low";
  const primary = contacts.find((item) => item.isPrimary) || contacts[0] || null;

  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    propertyId: data.propertyId || data.id || "",
    buildingId: data.buildingId || "",
    unitId: data.unitId || "",
    name: String(data.name || "Untitled Occupancy").trim() || "Untitled Occupancy",
    address: String(data.address || "").trim(),
    city: String(data.city || "").trim(),
    state: String(data.state || "").trim(),
    zip: String(data.zip || "").trim(),
    latitude: Number.isFinite(Number(data.latitude)) ? Number(data.latitude) : null,
    longitude: Number.isFinite(Number(data.longitude)) ? Number(data.longitude) : null,
    occupancyType,
    // Legacy aliases kept for NERIS / classic consumers
    type: occupancyType,
    riskLevel: data.riskLevel || hazard,
    hazard,
    occupancyLoad: data.occupancyLoad ?? "",
    status: data.status || "Active",
    lastInspectionAt: data.lastInspectionAt || data.lastInspection || "",
    nextInspectionDueAt: data.nextInspectionDueAt || data.inspectionDue || "",
    lastInspection: data.lastInspection || data.lastInspectionAt || "",
    inspectionDue: data.inspectionDue || data.nextInspectionDueAt || "",
    inspector: data.inspector || "",
    primaryContactName: data.primaryContactName || primary?.name || "",
    primaryContactPhone: data.primaryContactPhone || primary?.phone || "",
    primaryContactEmail: data.primaryContactEmail || primary?.email || "",
    constructionType: data.constructionType || "",
    sprinkler: data.sprinkler || "",
    alarm: data.alarm || "",
    knoxBox: data.knoxBox || "",
    notes: data.notes || "",
    contacts,
    timeline,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

function normalizeContact(contact = {}, index = 0) {
  return {
    id: contact.id || `contact-${index + 1}`,
    name: String(contact.name || "").trim(),
    role: String(contact.role || "").trim(),
    phone: String(contact.phone || "").trim(),
    email: String(contact.email || "").trim(),
    isPrimary: Boolean(contact.isPrimary),
  };
}

function normalizeTimelineEvent(event = {}, index = 0) {
  return {
    id: event.id || `evt-${index + 1}`,
    at: event.at || event.date || new Date().toISOString(),
    type: event.type || "note",
    summary: String(event.summary || event.label || "").trim(),
    actorName: event.actorName || "",
  };
}

/**
 * Convert a classic list-seed occupancy into the Phase 2 shape.
 * @param {object} item
 * @param {string} departmentId
 */
export function legacyListItemToOccupancy(item = {}, departmentId = "") {
  const normalized = normalizeOccupancyRecord(item, departmentId);
  const timeline = [...(normalized.timeline || [])];
  if (!timeline.length) {
    timeline.push({
      id: "evt-migrated",
      at: new Date().toISOString(),
      type: "migration",
      summary: "Migrated from classic occupancy list",
      actorName: "System",
    });
  }
  return {
    ...normalized,
    timeline,
    migratedFromList: true,
  };
}

/**
 * @param {string} departmentId
 * @returns {Promise<import("./types.js").OccupancyRecord[]>}
 */
export async function listOccupancyRecords(departmentId) {
  if (!departmentId) return [];
  try {
    const rows = await listRecords(departmentId, OCCUPANCIES_COLLECTION);
    return rows
      .map((row) => normalizeOccupancyRecord(row, departmentId))
      .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } catch (error) {
    console.warn("Unable to list occupancy records", error);
    return [];
  }
}

/**
 * @param {string} departmentId
 * @returns {Promise<object[]>}
 */
export async function loadLegacyOccupancyListItems(departmentId) {
  if (!departmentId) return [];
  const db = getFirestoreDb();
  if (!db) return [];
  try {
    const { items } = await readTenantList(db, departmentId, LIST_KEYS.occupancies);
    return items.filter(Boolean);
  } catch (error) {
    console.warn("Unable to load legacy occupancy list", error);
    return [];
  }
}

/**
 * One-way migrate classic list → occupancies collection when collection is empty.
 * Does not delete or overwrite the legacy list document.
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function migrateOccupanciesFromListIfEmpty(
  departmentId,
  legacyFallback = [],
  audit = {}
) {
  if (!departmentId) return [];

  const existing = await listOccupancyRecords(departmentId);
  if (existing.length) return existing;

  let legacyItems = await loadLegacyOccupancyListItems(departmentId);
  if (!legacyItems.length && Array.isArray(legacyFallback) && legacyFallback.length) {
    legacyItems = legacyFallback;
  }
  if (!legacyItems.length) return [];

  const migrated = [];
  for (const item of legacyItems) {
    const record = legacyListItemToOccupancy(item, departmentId);
    if (!record.id) continue;
    await createRecord(departmentId, OCCUPANCIES_COLLECTION, record.id, record);
    migrated.push(normalizeOccupancyRecord(record, departmentId));
  }

  if (migrated.length) {
    try {
      await writeInspectionAuditLog(departmentId, {
        action: "migrate",
        recordId: OCCUPANCIES_COLLECTION,
        summary: `Migrated ${migrated.length} occupancy record(s) from classic list`,
        actorUid: audit.actorUid || "system",
        actorName: audit.actorName || "System",
        after: { count: migrated.length, ids: migrated.map((row) => row.id) },
      });
    } catch (error) {
      console.warn("Occupancy migration audit failed", error);
    }
  }

  return migrated.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * Load occupancies collection, migrating from list seeds when empty.
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureOccupancyRecords(departmentId, legacyFallback = [], audit = {}) {
  const existing = await listOccupancyRecords(departmentId);
  if (existing.length) return existing;
  return migrateOccupanciesFromListIfEmpty(departmentId, legacyFallback, audit);
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string, isNew?: boolean }} [audit]
 */
export async function saveOccupancyRecord(departmentId, record = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const normalized = normalizeOccupancyRecord(record, departmentId);
  if (!normalized.id) {
    normalized.id = `OCC-${Date.now().toString(36).toUpperCase()}`;
  }

  const primary = (normalized.contacts || []).find((item) => item.isPrimary)
    || (normalized.contacts || [])[0]
    || null;
  if (primary) {
    normalized.primaryContactName = primary.name;
    normalized.primaryContactPhone = primary.phone;
    normalized.primaryContactEmail = primary.email;
  }

  const now = new Date().toISOString();
  const timeline = Array.isArray(normalized.timeline) ? [...normalized.timeline] : [];
  timeline.unshift({
    id: `evt-${Date.now()}`,
    at: now,
    type: audit.isNew ? "created" : "updated",
    summary: audit.isNew ? "Occupancy created" : "Occupancy updated",
    actorName: audit.actorName || "User",
  });
  normalized.timeline = timeline.slice(0, 50);
  normalized.updatedAt = now;
  if (!normalized.createdAt) normalized.createdAt = now;

  if (audit.isNew) {
    await createRecord(departmentId, OCCUPANCIES_COLLECTION, normalized.id, normalized);
  } else {
    await updateRecord(departmentId, OCCUPANCIES_COLLECTION, normalized.id, normalized);
  }

  try {
    await writeInspectionAuditLog(departmentId, {
      action: audit.isNew ? "create" : "update",
      recordId: normalized.id,
      summary: `${audit.isNew ? "Created" : "Updated"} occupancy ${normalized.name}`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
      after: { id: normalized.id, name: normalized.name, status: normalized.status },
    });
  } catch (error) {
    console.warn("Occupancy audit write failed", error);
  }

  return normalizeOccupancyRecord(normalized, departmentId);
}

/**
 * @param {string} departmentId
 * @param {string} occupancyId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function deleteOccupancyRecord(departmentId, occupancyId, audit = {}) {
  if (!departmentId || !occupancyId) return false;
  await deleteRecord(departmentId, OCCUPANCIES_COLLECTION, occupancyId);
  try {
    await writeInspectionAuditLog(departmentId, {
      action: "delete",
      recordId: occupancyId,
      summary: `Deleted occupancy ${occupancyId}`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
    });
  } catch (error) {
    console.warn("Occupancy delete audit failed", error);
  }
  return true;
}

/**
 * @param {import("./types.js").OccupancyRecord[]} records
 * @param {string} query
 */
export function filterOccupancyRecords(records = [], query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return records;
  return records.filter((row) => {
    const haystack = [
      row.name,
      row.address,
      row.city,
      row.occupancyType,
      row.type,
      row.hazard,
      row.riskLevel,
      row.status,
      row.inspector,
      row.primaryContactName,
      row.primaryContactEmail,
      row.primaryContactPhone,
    ].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}
