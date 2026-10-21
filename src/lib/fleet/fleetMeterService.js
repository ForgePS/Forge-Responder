import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { FLEET_METER_READINGS_COLLECTION } from "./paths.js";
import { getFleetAsset, saveFleetAsset } from "./fleetAssetService.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeMeterReading(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    checkId: data.checkId || "",
    meterType: data.meterType || "mileage",
    value: data.value ?? "",
    unit: data.unit || "",
    recordedAt: data.recordedAt || "",
    recordedBy: data.recordedBy || "",
    source: data.source || "check",
    createdAt: data.createdAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {string} [fleetAssetId]
 */
export async function listMeterReadings(departmentId, fleetAssetId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_METER_READINGS_COLLECTION);
  return rows
    .map((row) => normalizeMeterReading(row, departmentId))
    .filter((row) => !fleetAssetId || row.fleetAssetId === fleetAssetId)
    .sort((a, b) => String(b.recordedAt || b.createdAt).localeCompare(String(a.recordedAt || a.createdAt)));
}

/**
 * Record a meter reading and optionally sync onto the fleet asset.
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string, syncAsset?: boolean }} [audit]
 */
export async function recordMeterReading(departmentId, input = {}, audit = {}) {
  if (!departmentId || !input.fleetAssetId) {
    throw new Error("departmentId and fleetAssetId are required");
  }
  const stamp = nowIso();
  const id = input.id || `MTR-${Date.now().toString(36).toUpperCase()}`;
  const reading = normalizeMeterReading({
    ...input,
    id,
    departmentId,
    recordedAt: input.recordedAt || stamp,
    recordedBy: audit.actorName || input.recordedBy || "User",
    createdAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_METER_READINGS_COLLECTION, id, reading);

  if (audit.syncAsset !== false) {
    const asset = await getFleetAsset(departmentId, reading.fleetAssetId);
    if (asset) {
      const patch = { ...asset };
      if (reading.meterType === "mileage") patch.mileage = reading.value;
      if (reading.meterType === "engine_hours") patch.engineHours = reading.value;
      if (reading.meterType === "pump_hours") patch.pumpHours = reading.value;
      if (reading.meterType === "fuel" || reading.meterType === "fuel_level") {
        patch.fuel = reading.value;
      }
      await saveFleetAsset(departmentId, patch, audit);
    }
  }

  await writeFleetAuditLog(departmentId, {
    action: "meter",
    recordId: id,
    summary: `Recorded ${reading.meterType}=${reading.value} on ${reading.fleetAssetId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return reading;
}
