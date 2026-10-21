import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import {
  BATTERY_POSITIONS,
  FLUID_TYPES,
  TIRE_CONDITIONS,
  TIRE_POSITIONS,
} from "./componentDefaults.js";
import {
  FLEET_BATTERIES_COLLECTION,
  FLEET_FLUID_EVENTS_COLLECTION,
  FLEET_TIRES_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetTire(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    manufacturer: data.manufacturer || "",
    model: data.model || "",
    size: data.size || "",
    loadRating: data.loadRating || "",
    speedRating: data.speedRating || "",
    dotCode: data.dotCode || "",
    serial: data.serial || "",
    position: data.position || "INVENTORY",
    condition: data.condition || "good",
    treadDepth: data.treadDepth ?? "",
    pressurePsi: data.pressurePsi ?? "",
    installDate: data.installDate || "",
    installMeter: data.installMeter ?? "",
    removalDate: data.removalDate || "",
    purchaseDate: data.purchaseDate || "",
    cost: Number(data.cost) || 0,
    warrantyExpiresAt: data.warrantyExpiresAt || "",
    retreadStatus: data.retreadStatus || "",
    notes: data.notes || "",
    status: data.status || (data.position === "INVENTORY" ? "inventory" : "installed"),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFleetBattery(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    batteryType: data.batteryType || "starting",
    chemistry: data.chemistry || "AGM",
    manufacturer: data.manufacturer || "",
    model: data.model || "",
    serial: data.serial || "",
    capacityAh: data.capacityAh ?? "",
    position: data.position || "primary",
    installDate: data.installDate || "",
    warrantyExpiresAt: data.warrantyExpiresAt || "",
    voltage: data.voltage ?? "",
    stateOfHealth: data.stateOfHealth ?? "",
    lastTestAt: data.lastTestAt || "",
    lastTestResult: data.lastTestResult || "",
    cost: Number(data.cost) || 0,
    notes: data.notes || "",
    status: data.status || "installed",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeFluidEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    fluidType: data.fluidType || "engine_oil",
    action: data.action || "service",
    quantity: Number(data.quantity) || 0,
    unit: data.unit || "qt",
    productSpec: data.productSpec || "",
    meterValue: data.meterValue ?? "",
    occurredAt: data.occurredAt || "",
    cost: Number(data.cost) || 0,
    analysisResult: data.analysisResult || "",
    leak: Boolean(data.leak),
    workOrderId: data.workOrderId || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string }} [filters]
 */
export async function listFleetTires(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_TIRES_COLLECTION);
  let list = rows.map((row) => normalizeFleetTire(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)) || String(a.position).localeCompare(String(b.position)));
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetTire(departmentId, record = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === record.fleetAssetId);
  const normalized = normalizeFleetTire({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
  }, departmentId);
  if (!normalized.id) normalized.id = `TIRE-${Date.now().toString(36).toUpperCase()}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (normalized.position !== "INVENTORY" && !normalized.installDate) normalized.installDate = stamp.slice(0, 10);
  const exists = (await listFleetTires(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_TIRES_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_TIRES_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "tire_update" : "tire_create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Saved"} tire ${normalized.position} on ${normalized.fleetNumber || "inventory"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string }} [filters]
 */
export async function listFleetBatteries(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_BATTERIES_COLLECTION);
  let list = rows.map((row) => normalizeFleetBattery(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  return list.sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetBattery(departmentId, record = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === record.fleetAssetId);
  const normalized = normalizeFleetBattery({
    ...record,
    fleetNumber: asset?.fleetNumber || record.fleetNumber || "",
  }, departmentId);
  if (!normalized.id) normalized.id = `BAT-${Date.now().toString(36).toUpperCase()}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (!normalized.installDate) normalized.installDate = stamp.slice(0, 10);
  const exists = (await listFleetBatteries(departmentId)).some((row) => row.id === normalized.id);
  if (exists) await updateRecord(departmentId, FLEET_BATTERIES_COLLECTION, normalized.id, normalized);
  else await createRecord(departmentId, FLEET_BATTERIES_COLLECTION, normalized.id, normalized);
  await writeFleetAuditLog(departmentId, {
    action: exists ? "battery_update" : "battery_create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Saved"} battery on ${normalized.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {{ fleetAssetId?: string, fluidType?: string }} [filters]
 */
export async function listFluidEvents(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_FLUID_EVENTS_COLLECTION);
  let list = rows.map((row) => normalizeFluidEvent(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.fluidType) list = list.filter((row) => row.fluidType === filters.fluidType);
  return list.sort((a, b) => String(b.occurredAt || b.createdAt).localeCompare(String(a.occurredAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function recordFluidEvent(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  const stamp = nowIso();
  const id = input.id || `FLD-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeFluidEvent({
    ...input,
    id,
    departmentId,
    fleetAssetId: asset?.id || input.fleetAssetId || "",
    fleetNumber: asset?.fleetNumber || input.fleetNumber || "",
    occurredAt: input.occurredAt || stamp,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_FLUID_EVENTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "fluid_event",
    recordId: id,
    summary: `${record.fluidType} ${record.action} on ${record.fleetNumber || "unit"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * Alerts for worn tires / expired battery warranty / leaks.
 * @param {string} departmentId
 */
export async function buildComponentAlerts(departmentId) {
  const [tires, batteries, fluids] = await Promise.all([
    listFleetTires(departmentId),
    listFleetBatteries(departmentId),
    listFluidEvents(departmentId),
  ]);
  const now = Date.now();
  const alerts = [];

  for (const tire of tires) {
    const tread = Number(tire.treadDepth);
    if (Number.isFinite(tread) && tread > 0 && tread < 4) {
      alerts.push({ id: `tire-tread-${tire.id}`, type: "tire_tread", severity: "high", label: `${tire.fleetNumber || "Tire"} ${tire.position} tread ${tread}/32`, recordId: tire.id });
    }
    if (tire.condition === "condemned" || tire.condition === "worn") {
      alerts.push({ id: `tire-cond-${tire.id}`, type: "tire_condition", severity: tire.condition === "condemned" ? "critical" : "medium", label: `${tire.fleetNumber || "Tire"} ${tire.position} ${tire.condition}`, recordId: tire.id });
    }
    if (tire.warrantyExpiresAt && new Date(tire.warrantyExpiresAt).getTime() < now) {
      alerts.push({ id: `tire-warr-${tire.id}`, type: "tire_warranty", severity: "low", label: `${tire.fleetNumber || "Tire"} warranty expired`, recordId: tire.id });
    }
  }

  for (const battery of batteries) {
    const soh = Number(battery.stateOfHealth);
    if (Number.isFinite(soh) && soh > 0 && soh < 60) {
      alerts.push({ id: `bat-soh-${battery.id}`, type: "battery_soh", severity: "high", label: `${battery.fleetNumber || "Battery"} SOH ${soh}%`, recordId: battery.id });
    }
    if (battery.warrantyExpiresAt && new Date(battery.warrantyExpiresAt).getTime() < now) {
      alerts.push({ id: `bat-warr-${battery.id}`, type: "battery_warranty", severity: "medium", label: `${battery.fleetNumber || "Battery"} warranty expired`, recordId: battery.id });
    }
  }

  for (const fluid of fluids.filter((row) => row.leak).slice(0, 20)) {
    alerts.push({ id: `fluid-leak-${fluid.id}`, type: "fluid_leak", severity: "high", label: `${fluid.fleetNumber || "Unit"} ${fluid.fluidType} leak`, recordId: fluid.id });
  }

  return {
    tires,
    batteries,
    fluids,
    alerts,
    summary: {
      tires: tires.length,
      batteries: batteries.length,
      fluidEvents: fluids.length,
      alerts: alerts.length,
      installedTires: tires.filter((row) => row.status === "installed").length,
    },
  };
}

export function getTirePositions() {
  return [...TIRE_POSITIONS];
}

export function getTireConditions() {
  return [...TIRE_CONDITIONS];
}

export function getBatteryPositions() {
  return [...BATTERY_POSITIONS];
}

export function getFluidTypes() {
  return [...FLUID_TYPES];
}
