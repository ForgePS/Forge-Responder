import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import { recordMeterReading } from "./fleetMeterService.js";
import { STARTER_TELEMATICS_ADAPTERS } from "./fuelDefaults.js";
import {
  FLEET_TELEMATICS_ADAPTERS_COLLECTION,
  FLEET_TELEMATICS_EVENTS_COLLECTION,
  FLEET_TELEMATICS_MAPPINGS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeTelematicsAdapter(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled adapter").trim(),
    provider: data.provider || "manual",
    status: data.status || "configured",
    syncMeters: data.syncMeters !== false,
    syncFuelLevel: data.syncFuelLevel !== false,
    pollMinutes: Number(data.pollMinutes) || 0,
    apiBaseUrl: data.apiBaseUrl || "",
    notes: data.notes || "",
    lastSyncAt: data.lastSyncAt || "",
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeTelematicsMapping(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    adapterId: data.adapterId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    externalVehicleId: String(data.externalVehicleId || "").trim(),
    active: data.active !== false,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeTelematicsEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    adapterId: data.adapterId || "",
    provider: data.provider || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    externalVehicleId: data.externalVehicleId || "",
    eventType: data.eventType || "telemetry",
    occurredAt: data.occurredAt || "",
    odometer: data.odometer ?? "",
    engineHours: data.engineHours ?? "",
    fuelLevel: data.fuelLevel ?? "",
    speed: data.speed ?? "",
    latitude: data.latitude ?? "",
    longitude: data.longitude ?? "",
    ignition: data.ignition ?? "",
    rawSummary: data.rawSummary || "",
    meterSynced: Boolean(data.meterSynced),
    createdAt: data.createdAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listTelematicsAdapters(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TELEMATICS_ADAPTERS_COLLECTION);
  return rows
    .map((row) => normalizeTelematicsAdapter(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureTelematicsAdaptersSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listTelematicsAdapters(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_TELEMATICS_ADAPTERS) {
    const record = normalizeTelematicsAdapter({ ...starter, departmentId, createdAt: stamp, updatedAt: stamp }, departmentId);
    await createRecord(departmentId, FLEET_TELEMATICS_ADAPTERS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: FLEET_TELEMATICS_ADAPTERS_COLLECTION,
    summary: `Seeded ${created.length} telematics adapters`,
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
export async function saveTelematicsAdapter(departmentId, record = {}, audit = {}) {
  const normalized = normalizeTelematicsAdapter(record, departmentId);
  if (!normalized.id) normalized.id = `adapter-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listTelematicsAdapters(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_TELEMATICS_ADAPTERS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_TELEMATICS_ADAPTERS_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} telematics adapter ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 */
export async function listTelematicsMappings(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TELEMATICS_MAPPINGS_COLLECTION);
  return rows
    .map((row) => normalizeTelematicsMapping(row, departmentId))
    .sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveTelematicsMapping(departmentId, record = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === record.fleetAssetId);
  const normalized = normalizeTelematicsMapping({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
  }, departmentId);
  if (!normalized.id) {
    normalized.id = `map-${normalized.adapterId || "x"}-${normalized.fleetAssetId || Date.now().toString(36)}`.slice(0, 80);
  }
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listTelematicsMappings(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_TELEMATICS_MAPPINGS_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_TELEMATICS_MAPPINGS_COLLECTION, normalized.id, normalized);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, adapterId?: string }} [filters]
 */
export async function listTelematicsEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TELEMATICS_EVENTS_COLLECTION);
  let list = rows.map((row) => normalizeTelematicsEvent(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.adapterId) list = list.filter((row) => row.adapterId === filters.adapterId);
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

/**
 * Ingest a telematics event and optionally sync meters onto the asset.
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string, syncMeters?: boolean }} [audit]
 */
export async function ingestTelematicsEvent(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const [adapters, mappings, assets] = await Promise.all([
    ensureTelematicsAdaptersSeeded(departmentId, audit),
    listTelematicsMappings(departmentId),
    listFleetAssets(departmentId),
  ]);

  const adapter = adapters.find((row) => row.id === input.adapterId) || adapters[0];
  let asset = assets.find((row) => row.id === input.fleetAssetId);
  let mapping = null;

  if (!asset && input.externalVehicleId) {
    mapping = mappings.find((row) => (
      row.externalVehicleId === String(input.externalVehicleId).trim()
      && (!adapter || row.adapterId === adapter.id || !row.adapterId)
    ));
    if (mapping) asset = assets.find((row) => row.id === mapping.fleetAssetId);
  }

  const stamp = nowIso();
  const id = input.id || `TEL-${Date.now().toString(36).toUpperCase()}`;
  const event = normalizeTelematicsEvent({
    ...input,
    id,
    departmentId,
    adapterId: adapter?.id || input.adapterId || "",
    provider: adapter?.provider || input.provider || "manual",
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    occurredAt: input.occurredAt || stamp,
    createdAt: stamp,
  }, departmentId);

  const shouldSync = audit.syncMeters !== false && adapter?.syncMeters !== false && event.fleetAssetId;
  if (shouldSync) {
    if (event.odometer !== "" && event.odometer != null) {
      await recordMeterReading(departmentId, {
        fleetAssetId: event.fleetAssetId,
        meterType: "mileage",
        value: event.odometer,
        source: "telematics",
        recordedAt: event.occurredAt,
      }, audit).catch(() => null);
      event.meterSynced = true;
    }
    if (event.engineHours !== "" && event.engineHours != null) {
      await recordMeterReading(departmentId, {
        fleetAssetId: event.fleetAssetId,
        meterType: "engine_hours",
        value: event.engineHours,
        source: "telematics",
        recordedAt: event.occurredAt,
      }, audit).catch(() => null);
      event.meterSynced = true;
    }
    if (adapter?.syncFuelLevel !== false && event.fuelLevel !== "" && event.fuelLevel != null) {
      await recordMeterReading(departmentId, {
        fleetAssetId: event.fleetAssetId,
        meterType: "fuel_level",
        value: event.fuelLevel,
        source: "telematics",
        recordedAt: event.occurredAt,
      }, audit).catch(() => null);
      event.meterSynced = true;
    }
  }

  await createRecord(departmentId, FLEET_TELEMATICS_EVENTS_COLLECTION, id, event);

  if (adapter?.id) {
    await updateRecord(departmentId, FLEET_TELEMATICS_ADAPTERS_COLLECTION, adapter.id, {
      ...adapter,
      lastSyncAt: stamp,
      status: adapter.status === "configured" ? "active" : adapter.status,
      updatedAt: stamp,
    }).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "telematics_ingest",
    recordId: id,
    summary: `Telematics event for ${event.fleetNumber || event.externalVehicleId || "unknown"}${event.meterSynced ? " · meters synced" : ""}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return event;
}

/**
 * Build a simple telematics status board.
 * @param {string} departmentId
 */
export async function buildTelematicsBoard(departmentId) {
  const [adapters, mappings, events, assets] = await Promise.all([
    ensureTelematicsAdaptersSeeded(departmentId),
    listTelematicsMappings(departmentId),
    listTelematicsEvents(departmentId),
    listFleetAssets(departmentId),
  ]);
  const latestByAsset = new Map();
  for (const event of events) {
    const key = event.fleetAssetId || event.externalVehicleId;
    if (!key) continue;
    if (!latestByAsset.has(key)) latestByAsset.set(key, event);
  }
  return {
    adapters,
    mappings,
    events: events.slice(0, 50),
    latestByAsset: [...latestByAsset.values()],
    summary: {
      adapters: adapters.length,
      activeAdapters: adapters.filter((row) => row.status === "active").length,
      mappings: mappings.length,
      events: events.length,
      synced: events.filter((row) => row.meterSynced).length,
      assets: assets.length,
      unmappedAssets: assets.filter((asset) => !mappings.some((row) => row.fleetAssetId === asset.id)).length,
    },
  };
}
