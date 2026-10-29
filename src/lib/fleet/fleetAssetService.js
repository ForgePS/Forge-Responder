import { doc, getDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  createRecord,
  deleteRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { listDepartmentApparatus } from "../apparatusService.js";
import { normalizeApparatusRecord } from "../apparatusSchema.js";
import { departmentListSegments } from "../tenantPaths.js";
import { LIST_KEYS } from "../tenantListKeys.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { FLEET_ASSETS_COLLECTION } from "./paths.js";

/**
 * @param {string} status
 */
export function mapLegacyStatus(status = "") {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "in_service";
  if (value.includes("out") || value === "oos" || value.includes("down")) return "out_of_service";
  if (value.includes("reserve")) return "reserve";
  if (value.includes("restrict")) return "restricted";
  if (value.includes("decom") || value.includes("retired") || value.includes("sold")) {
    return "decommissioned";
  }
  return "in_service";
}

/**
 * Firestore forbids nested arrays. Legacy seeds use checks: [[label, status], ...].
 * Normalize to [{ label, status }, ...].
 * @param {unknown} raw
 * @returns {{ label: string, status: string }[]}
 */
export function normalizeFleetAssetChecks(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (Array.isArray(item)) {
        return {
          label: String(item[0] ?? "").trim(),
          status: String(item[1] ?? "").trim(),
        };
      }
      if (item && typeof item === "object") {
        return {
          label: String(item.label || item.name || item.check || "").trim(),
          status: String(item.status || item.result || "").trim(),
        };
      }
      if (typeof item === "string" && item.trim()) {
        return { label: item.trim(), status: "" };
      }
      return null;
    })
    .filter((row) => row && (row.label || row.status));
}

/**
 * Drop nested arrays / unsupported values before Firestore writes.
 * @param {unknown} value
 * @returns {unknown}
 */
function sanitizeForFirestore(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (Array.isArray(item)) {
          // Flatten one level of accidental nesting into a plain object/string.
          if (item.length >= 2 && typeof item[0] !== "object") {
            return { label: String(item[0] ?? ""), status: String(item[1] ?? "") };
          }
          return null;
        }
        return sanitizeForFirestore(item);
      })
      .filter((item) => item !== undefined && item !== null);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      const next = sanitizeForFirestore(child);
      if (next !== undefined) out[key] = next;
    }
    return out;
  }
  return value;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetAssetRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const status = data.status || mapLegacyStatus(data.statusLabel || data.legacyStatus || "");
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    legacyApparatusId: data.legacyApparatusId || "",
    fleetNumber: String(data.fleetNumber || data.unitDesignation || data.unit || data.name || "").trim(),
    unitDesignation: String(data.unitDesignation || data.unit || data.fleetNumber || "").trim(),
    radioDesignation: data.radioDesignation || "",
    assetTag: data.assetTag || "",
    name: String(data.name || data.unitDesignation || data.fleetNumber || "Untitled asset").trim(),
    fleetClassId: data.fleetClassId || "",
    type: data.type || "Apparatus",
    category: data.category || "emergency_response",
    station: data.station || "",
    year: data.year || "",
    make: data.make || "",
    model: data.model || "",
    vin: data.vin || "",
    licensePlate: data.licensePlate || "",
    mileage: data.mileage ?? "",
    engineHours: data.engineHours ?? "",
    pumpHours: data.pumpHours ?? "",
    fuel: data.fuel || "",
    pmDue: data.pmDue || "",
    status,
    statusLabel: data.statusLabel || "",
    operator: data.operator || "",
    condition: data.condition || "",
    notes: data.notes || "",
    checks: normalizeFleetAssetChecks(data.checks),
    lastCheckAt: data.lastCheckAt || "",
    lastCheckId: data.lastCheckId || "",
    lastCheckResult: data.lastCheckResult || "",
    readinessState: data.readinessState || "",
    activeRestriction: data.activeRestriction || "",
    lastStatusEventId: data.lastStatusEventId || "",
    migratedFromList: Boolean(data.migratedFromList),
    migrationBatchId: data.migrationBatchId || "",
    migrationUnmapped: data.migrationUnmapped && typeof data.migrationUnmapped === "object"
      ? data.migrationUnmapped
      : null,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * Convert classic apparatus list item → fleetAssets record.
 * @param {object} item
 * @param {string} departmentId
 */
export function legacyApparatusToFleetAsset(item = {}, departmentId = "") {
  const apparatus = normalizeApparatusRecord(item);
  const knownKeys = new Set([
    "id", "unit", "name", "label", "type", "station", "year", "mileage",
    "engineHours", "pumpHours", "fuel", "pmDue", "status", "operator", "checks",
  ]);
  const unmapped = {};
  for (const [key, value] of Object.entries(apparatus)) {
    if (!knownKeys.has(key) && value !== undefined && value !== null && value !== "") {
      unmapped[key] = value;
    }
  }

  return normalizeFleetAssetRecord({
    id: apparatus.id,
    departmentId,
    legacyApparatusId: apparatus.id,
    fleetNumber: apparatus.unit || apparatus.id,
    unitDesignation: apparatus.unit || "",
    name: apparatus.unit || apparatus.id,
    type: apparatus.type || "Apparatus",
    station: apparatus.station || "",
    year: apparatus.year || "",
    mileage: apparatus.mileage || "",
    engineHours: apparatus.engineHours || "",
    pumpHours: apparatus.pumpHours || "",
    fuel: apparatus.fuel || "",
    pmDue: apparatus.pmDue || "",
    status: mapLegacyStatus(apparatus.status),
    statusLabel: apparatus.status || "In Service",
    operator: apparatus.operator || "",
    checks: normalizeFleetAssetChecks(apparatus.checks),
    migratedFromList: true,
    migrationUnmapped: Object.keys(unmapped).length ? unmapped : null,
  }, departmentId);
}

/**
 * @param {string} departmentId
 */
export async function listFleetAssets(departmentId) {
  if (!departmentId) return [];
  try {
    const rows = await listRecords(departmentId, FLEET_ASSETS_COLLECTION);
    return rows
      .map((row) => normalizeFleetAssetRecord(row, departmentId))
      .sort((a, b) => String(a.fleetNumber || a.name).localeCompare(String(b.fleetNumber || b.name), undefined, { numeric: true }));
  } catch (error) {
    console.warn("Unable to list fleet assets", error);
    return [];
  }
}

/**
 * @param {string} departmentId
 * @param {string} assetId
 */
export async function getFleetAsset(departmentId, assetId) {
  if (!departmentId || !assetId) return null;
  const row = await getRecord(departmentId, FLEET_ASSETS_COLLECTION, assetId);
  return row ? normalizeFleetAssetRecord(row, departmentId) : null;
}

/**
 * @param {string} departmentId
 * @returns {Promise<object[]>}
 */
export async function loadLegacyApparatusListItems(departmentId) {
  if (!departmentId) return [];
  try {
    return await listDepartmentApparatus(departmentId);
  } catch (error) {
    console.warn("Unable to load legacy apparatus list", error);
    return [];
  }
}

/**
 * One-way migrate classic apparatus list → fleetAssets when collection is empty.
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function migrateFleetAssetsFromApparatusIfEmpty(
  departmentId,
  legacyFallback = [],
  audit = {}
) {
  if (!departmentId) return [];

  const existing = await listFleetAssets(departmentId);
  if (existing.length) return existing;

  let legacyItems = await loadLegacyApparatusListItems(departmentId);
  if (!legacyItems.length && Array.isArray(legacyFallback) && legacyFallback.length) {
    legacyItems = legacyFallback;
  }
  if (!legacyItems.length) return [];

  const migrated = [];
  const stamp = new Date().toISOString();
  for (const item of legacyItems) {
    const record = legacyApparatusToFleetAsset(item, departmentId);
    if (!record.id) continue;
    record.createdAt = stamp;
    record.updatedAt = stamp;
    await createRecord(departmentId, FLEET_ASSETS_COLLECTION, record.id, sanitizeForFirestore(record));
    migrated.push(normalizeFleetAssetRecord(record, departmentId));
  }

  if (migrated.length) {
    await writeFleetAuditLog(departmentId, {
      action: "migrate",
      recordId: FLEET_ASSETS_COLLECTION,
      summary: `Migrated ${migrated.length} fleet asset(s) from classic apparatus list`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
      after: { count: migrated.length, ids: migrated.map((row) => row.id) },
    }).catch(() => null);
  }

  return migrated;
}

/**
 * @param {string} departmentId
 * @param {object[]} [legacyFallback]
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureFleetAssets(departmentId, legacyFallback = [], audit = {}) {
  const existing = await listFleetAssets(departmentId);
  if (existing.length) return existing;
  return migrateFleetAssetsFromApparatusIfEmpty(departmentId, legacyFallback, audit);
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetAsset(departmentId, record = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const normalized = normalizeFleetAssetRecord(record, departmentId);
  if (!normalized.id) {
    normalized.id = `FLT-${Date.now().toString(36).toUpperCase()}`;
  }
  if (!normalized.fleetNumber) normalized.fleetNumber = normalized.id;
  if (!normalized.unitDesignation) normalized.unitDesignation = normalized.fleetNumber;
  if (!normalized.name) normalized.name = normalized.fleetNumber;

  const stamp = new Date().toISOString();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;

  const payload = sanitizeForFirestore(normalized);
  const existing = await getFleetAsset(departmentId, normalized.id);
  if (existing) {
    await updateRecord(departmentId, FLEET_ASSETS_COLLECTION, normalized.id, payload);
  } else {
    await createRecord(departmentId, FLEET_ASSETS_COLLECTION, normalized.id, payload);
  }

  await writeFleetAuditLog(departmentId, {
    action: existing ? "update" : "create",
    recordId: normalized.id,
    summary: `${existing ? "Updated" : "Created"} fleet asset ${normalized.fleetNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return normalized;
}

/**
 * @param {string} departmentId
 * @param {string} assetId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function deleteFleetAsset(departmentId, assetId, audit = {}) {
  if (!departmentId || !assetId) return false;
  await deleteRecord(departmentId, FLEET_ASSETS_COLLECTION, assetId);
  await writeFleetAuditLog(departmentId, {
    action: "delete",
    recordId: assetId,
    summary: `Deleted fleet asset ${assetId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return true;
}

/**
 * @param {object[]} records
 * @param {string} query
 */
export function filterFleetAssets(records = [], query = "") {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle) return records;
  return records.filter((row) => (
    [
      row.fleetNumber,
      row.unitDesignation,
      row.name,
      row.type,
      row.station,
      row.status,
      row.operator,
      row.vin,
    ].join(" ").toLowerCase().includes(needle)
  ));
}

/**
 * Dashboard metrics from fleet asset records.
 * @param {object[]} records
 */
export function buildFleetDashboardMetrics(records = []) {
  const list = Array.isArray(records) ? records : [];
  const today = new Date().toISOString().slice(0, 10);
  return {
    total: list.length,
    inService: list.filter((row) => row.status === "in_service").length,
    outOfService: list.filter((row) => row.status === "out_of_service").length,
    reserve: list.filter((row) => row.status === "reserve").length,
    restricted: list.filter((row) => row.status === "restricted").length,
    pmDue: list.filter((row) => {
      const due = String(row.pmDue || "").slice(0, 10);
      return due && due <= today;
    }).length,
  };
}

/**
 * Optional: verify list doc still exists (non-destructive).
 * @param {string} departmentId
 */
export async function classicApparatusListExists(departmentId) {
  if (!departmentId) return false;
  const db = getFirestoreDb();
  if (!db) return false;
  try {
    const snap = await getDoc(doc(db, ...departmentListSegments(departmentId, LIST_KEYS.apparatus)));
    return snap.exists();
  } catch {
    return false;
  }
}

/** Units that no longer take part in checks (soft-removed; history kept). */
export function isRetiredFleetAsset(asset = {}) {
  return /decommissioned|retired|disposed|sold/i.test(String(asset.status || ""));
}

/**
 * Add any unit from the classic Apparatus list that isn't in fleetAssets yet, so
 * a unit added on the Apparatus page also shows up for apparatus checks.
 * Matching is by legacy id, then by unit name. Never removes anything.
 * @returns {Promise<object[]>} the fleet assets that were added
 */
export async function syncFleetAssetsFromApparatus(departmentId, legacyItems = null, audit = {}) {
  if (!departmentId) return [];
  const legacy = Array.isArray(legacyItems) ? legacyItems : await loadLegacyApparatusListItems(departmentId);
  if (!legacy.length) return [];
  const existing = await listFleetAssets(departmentId);
  const byLegacyId = new Set(existing.map((row) => row.legacyApparatusId || row.id).filter(Boolean));
  const byName = new Set(existing.map((row) => String(row.unitDesignation || row.fleetNumber || "").trim().toLowerCase()).filter(Boolean));
  const added = [];
  const stamp = new Date().toISOString();
  for (const item of legacy) {
    const record = legacyApparatusToFleetAsset(item, departmentId);
    if (!record.id) continue;
    const name = String(record.unitDesignation || record.fleetNumber || "").trim().toLowerCase();
    if (byLegacyId.has(record.id) || (name && byName.has(name))) continue;
    record.createdAt = stamp;
    record.updatedAt = stamp;
    await createRecord(departmentId, FLEET_ASSETS_COLLECTION, record.id, sanitizeForFirestore(record));
    added.push(normalizeFleetAssetRecord(record, departmentId));
    byLegacyId.add(record.id);
    if (name) byName.add(name);
  }
  if (added.length) {
    await writeFleetAuditLog(departmentId, {
      action: "import",
      recordId: FLEET_ASSETS_COLLECTION,
      summary: `Added ${added.length} unit(s) from the Apparatus list: ${added.map((row) => row.unitDesignation || row.fleetNumber).join(", ")}`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
    }).catch(() => null);
  }
  return added;
}
