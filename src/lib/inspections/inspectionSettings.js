import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  createEmptyInspectionSettings,
  DEFAULT_INSPECTION_NAV_KEYS,
} from "./types.js";
import {
  INSPECTION_SETTINGS_COLLECTION,
  INSPECTION_SETTINGS_DOC_ID,
} from "./paths.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";

/**
 * @param {Partial<import("./types.js").InspectionSettings>|null|undefined} remote
 * @param {string} departmentId
 * @returns {import("./types.js").InspectionSettings}
 */
export function normalizeInspectionSettings(remote = {}, departmentId = "") {
  const defaults = createEmptyInspectionSettings(departmentId);
  const data = remote && typeof remote === "object" ? remote : {};
  return {
    ...defaults,
    ...data,
    departmentId: departmentId || data.departmentId || defaults.departmentId,
    navLabels: { ...defaults.navLabels, ...(data.navLabels || {}) },
    enabledNavKeys: Array.isArray(data.enabledNavKeys) && data.enabledNavKeys.length
      ? data.enabledNavKeys
      : [...DEFAULT_INSPECTION_NAV_KEYS],
    numbering: { ...defaults.numbering, ...(data.numbering || {}) },
    inspectionStatuses: Array.isArray(data.inspectionStatuses) && data.inspectionStatuses.length
      ? data.inspectionStatuses
      : defaults.inspectionStatuses,
    violationStatuses: Array.isArray(data.violationStatuses) && data.violationStatuses.length
      ? data.violationStatuses
      : defaults.violationStatuses,
    severityLevels: Array.isArray(data.severityLevels) && data.severityLevels.length
      ? data.severityLevels
      : defaults.severityLevels,
    priorityLevels: Array.isArray(data.priorityLevels) && data.priorityLevels.length
      ? data.priorityLevels
      : defaults.priorityLevels,
    terminology: { ...defaults.terminology, ...(data.terminology || {}) },
  };
}

/**
 * @param {string} departmentId
 * @returns {Promise<import("./types.js").InspectionSettings>}
 */
export async function loadInspectionSettings(departmentId) {
  const defaults = createEmptyInspectionSettings(departmentId);
  if (!departmentId) return defaults;

  const db = getFirestoreDb();
  if (!db) return defaults;

  try {
    const snap = await getDoc(
      doc(db, "departments", departmentId, INSPECTION_SETTINGS_COLLECTION, INSPECTION_SETTINGS_DOC_ID)
    );
    if (!snap.exists()) return defaults;
    return normalizeInspectionSettings(snap.data(), departmentId);
  } catch (error) {
    console.warn("Unable to load inspection settings", error);
    return defaults;
  }
}

/**
 * @param {string} departmentId
 * @param {Partial<import("./types.js").InspectionSettings>} settings
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 * @returns {Promise<import("./types.js").InspectionSettings>}
 */
export async function saveInspectionSettings(departmentId, settings = {}, audit = {}) {
  if (!departmentId) {
    throw new Error("departmentId is required to save inspection settings");
  }

  const db = getFirestoreDb();
  if (!db) {
    throw new Error("Firestore is not available");
  }

  const normalized = normalizeInspectionSettings(settings, departmentId);
  const now = new Date().toISOString();
  const payload = {
    ...normalized,
    departmentId,
    updatedAt: now,
    createdAt: normalized.createdAt || now,
  };

  await setDoc(
    doc(db, "departments", departmentId, INSPECTION_SETTINGS_COLLECTION, INSPECTION_SETTINGS_DOC_ID),
    payload,
    { merge: true }
  );

  try {
    await writeInspectionAuditLog(departmentId, {
      action: "update",
      recordId: INSPECTION_SETTINGS_DOC_ID,
      summary: "Updated inspection module settings",
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
      after: { enabledNavKeys: payload.enabledNavKeys, numbering: payload.numbering },
    });
  } catch (error) {
    console.warn("Inspection settings audit write failed", error);
  }

  return payload;
}

/**
 * Resolve display label for a nav key from settings.
 * @param {import("./types.js").InspectionSettings} settings
 * @param {string} navKey
 * @param {string} fallback
 */
export function resolveInspectionNavLabel(settings, navKey, fallback = "") {
  const labels = settings?.navLabels || {};
  return labels[navKey] || fallback || navKey;
}

/**
 * @param {import("./types.js").InspectionSettings} settings
 * @param {string} navKey
 */
export function isInspectionNavEnabled(settings, navKey) {
  const keys = settings?.enabledNavKeys || DEFAULT_INSPECTION_NAV_KEYS;
  return keys.includes(navKey);
}
