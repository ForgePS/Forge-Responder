import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  createEmptyFleetSettings,
  DEFAULT_FLEET_NAV_KEYS,
  DEFAULT_FLEET_STATUSES,
} from "./types.js";
import {
  FLEET_SETTINGS_COLLECTION,
  FLEET_SETTINGS_DOC_ID,
} from "./paths.js";
import { writeFleetAuditLog } from "./fleetAudit.js";

/**
 * @param {object|null|undefined} remote
 * @param {string} departmentId
 */
export function normalizeFleetSettings(remote = {}, departmentId = "") {
  const defaults = createEmptyFleetSettings(departmentId);
  const data = remote && typeof remote === "object" ? remote : {};
  return {
    ...defaults,
    ...data,
    departmentId: departmentId || data.departmentId || defaults.departmentId,
    moduleV2Enabled: data.moduleV2Enabled !== false,
    navLabels: { ...defaults.navLabels, ...(data.navLabels || {}) },
    enabledNavKeys: Array.isArray(data.enabledNavKeys) && data.enabledNavKeys.length
      ? data.enabledNavKeys
      : [...DEFAULT_FLEET_NAV_KEYS],
    numbering: { ...defaults.numbering, ...(data.numbering || {}) },
    statuses: Array.isArray(data.statuses) && data.statuses.length
      ? data.statuses
      : [...DEFAULT_FLEET_STATUSES],
    terminology: { ...defaults.terminology, ...(data.terminology || {}) },
    legacyApparatusWritesLocked: Boolean(data.legacyApparatusWritesLocked),
    redirectApparatusToFleetAssets: Boolean(data.redirectApparatusToFleetAssets),
    lastMigrationReportId: data.lastMigrationReportId || "",
    lastMigrationAt: data.lastMigrationAt || "",
    lastMigrationMode: data.lastMigrationMode || "",
  };
}

/**
 * Feature flag for Fleet V2 surfaces.
 * @param {object} [settings]
 */
export function isFleetModuleV2Enabled(settings = {}) {
  return settings?.moduleV2Enabled !== false;
}

/**
 * @param {string} departmentId
 */
export async function loadFleetSettings(departmentId) {
  const defaults = createEmptyFleetSettings(departmentId);
  if (!departmentId) return defaults;

  const db = getFirestoreDb();
  if (!db) return defaults;

  try {
    const snap = await getDoc(
      doc(db, "departments", departmentId, FLEET_SETTINGS_COLLECTION, FLEET_SETTINGS_DOC_ID)
    );
    if (!snap.exists()) return defaults;
    return normalizeFleetSettings(snap.data(), departmentId);
  } catch (error) {
    console.warn("Unable to load fleet settings", error);
    return defaults;
  }
}

/**
 * @param {string} departmentId
 * @param {object} settings
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveFleetSettings(departmentId, settings = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required to save fleet settings");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available");

  const normalized = normalizeFleetSettings(settings, departmentId);
  const now = new Date().toISOString();
  const payload = {
    ...normalized,
    departmentId,
    updatedAt: now,
    createdAt: normalized.createdAt || now,
  };

  await setDoc(
    doc(db, "departments", departmentId, FLEET_SETTINGS_COLLECTION, FLEET_SETTINGS_DOC_ID),
    payload,
    { merge: true }
  );

  try {
    await writeFleetAuditLog(departmentId, {
      action: "update",
      recordId: FLEET_SETTINGS_DOC_ID,
      summary: "Updated fleet settings",
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
    });
  } catch {
    // non-blocking
  }

  return payload;
}
