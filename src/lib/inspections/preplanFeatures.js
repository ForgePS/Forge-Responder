import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  PREPLAN_FEATURE_KEYS,
  PREPLAN_FEATURE_LABELS,
} from "./preplanDefaults.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * Features with no real implementation yet. They default to off so a new
 * department never sees a placeholder; a department can still switch them on.
 *  - mapIntegration: Nearby Preplans has no location, map or distance.
 *  - qrCodes: nothing scans or redeems a preplan QR token.
 *  - reports: Preplan Reports only repeats the All Preplans table.
 */
export const PREPLAN_FEATURES_OFF_BY_DEFAULT = ["mapIntegration", "qrCodes", "reports"];

export function defaultPreplanFeatures() {
  return Object.fromEntries(Object.keys(PREPLAN_FEATURE_KEYS).map((key) => [
    key,
    !PREPLAN_FEATURES_OFF_BY_DEFAULT.includes(key),
  ]));
}

export function normalizePreplanFeatures(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const defaults = defaultPreplanFeatures();
  const next = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      next[key] = data[key] !== false;
    }
  }
  return next;
}

export function filterFeaturesByCreatorAllowlist(tenantFeatures = {}, allowlist = null) {
  const normalized = normalizePreplanFeatures(tenantFeatures);
  if (!allowlist || typeof allowlist !== "object") return normalized;
  const next = { ...normalized };
  for (const key of Object.keys(next)) {
    if (allowlist[key] === false) next[key] = false;
  }
  return next;
}

export function isPreplanFeatureEnabled(features, key) {
  const normalized = normalizePreplanFeatures(features);
  if (!Object.prototype.hasOwnProperty.call(normalized, key)) return true;
  return normalized[key] !== false;
}

/**
 * Features live on departments/{id}/inspectionSettings/main.preplanFeatures
 * (alongside other prevention settings).
 */
export async function getDepartmentPreplanFeatures(departmentId) {
  if (!departmentId) return defaultPreplanFeatures();
  const db = getFirestoreDb();
  if (!db) return defaultPreplanFeatures();
  const snap = await getDoc(doc(db, "departments", departmentId, "inspectionSettings", "main"));
  if (!snap.exists()) return defaultPreplanFeatures();
  return normalizePreplanFeatures(snap.data()?.preplanFeatures);
}

export async function saveDepartmentPreplanFeatures(departmentId, features = {}, actor = {}) {
  if (!departmentId) throw new Error("Department required.");
  const db = getFirestoreDb();
  if (!db) throw new Error("Firestore is not available.");
  const stamp = nowIso();
  const payload = {
    preplanFeatures: normalizePreplanFeatures(features),
    preplanFeaturesUpdatedAt: stamp,
    preplanFeaturesUpdatedBy: actor.actorUid || "",
  };
  await setDoc(doc(db, "departments", departmentId, "inspectionSettings", "main"), payload, { merge: true });
  return payload.preplanFeatures;
}
