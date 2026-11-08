/**
 * Heat Zone Analytics client. Every request goes through a Cloud Function that
 * checks the caller's department membership, permissions and district scope;
 * the department id sent here only selects the department.
 */
import { httpsCallable } from "firebase/functions";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseFunctions, getFirestoreDb } from "../firebaseClient.js";

async function call(name, payload) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name, { timeout: 120000 })(payload);
  return result.data || {};
}

export const loadHeatZoneDashboard = (departmentId, filters, { zoom, mode } = {}) =>
  call("heatZoneDashboard", { departmentId, filters, zoom, mode });

export const loadHeatZoneMarkers = (departmentId, filters, { viewport, zoom, page = 0, pageSize = 200 } = {}) =>
  call("heatZoneMarkers", { departmentId, filters, viewport, zoom, page, pageSize });

export const loadHeatZoneIncident = (departmentId, id) => call("heatZoneIncident", { departmentId, id });

export const loadHeatZoneBoundaries = (departmentId) => call("heatZoneBoundaries", { departmentId });

export const loadHeatZoneReport = (departmentId, reportType, filters, format) =>
  call("heatZoneReport", { departmentId, reportType, filters, format });

export const loadHeatZoneSettings = (departmentId) => call("heatZoneGetSettings", { departmentId });

export const saveHeatZoneBoundary = (departmentId, zone) => call("heatZoneSaveZones", { departmentId, zone });

export const importHeatZoneBoundaries = (departmentId, geoJson, kind, nameProperty = "") =>
  call("heatZoneSaveZones", { departmentId, geoJson, kind, nameProperty });

export const deleteHeatZoneBoundary = (departmentId, zoneId) => call("heatZoneDeleteZone", { departmentId, zoneId });

export const saveHeatZoneSettings = (departmentId, settings) => call("heatZoneSaveSettings", { departmentId, settings });

export const setHeatZoneDistrictAccess = (departmentId, uid, districtIds) =>
  call("heatZoneSetDistrictAccess", { departmentId, uid, districtIds });

export const rebuildHeatZone = (departmentId) => call("heatZoneRebuild", { departmentId });

export const saveHeatZoneGeocoding = (departmentId, enabled) => call("heatZoneSaveGeocoding", { departmentId, enabled });

/**
 * Listen to the department's analytics change counter. Firestore rules only
 * allow this for members with Heat Zone access in that department.
 * @returns {() => void} unsubscribe
 */
export function watchHeatZoneVersion(departmentId, onChange, onError) {
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    onError?.(new Error("Live updates are not available."));
    return () => {};
  }
  return onSnapshot(
    doc(db, "departments", departmentId, "heatZoneMeta", "state"),
    (snap) => onChange(snap.exists() ? snap.data() : { version: 0 }),
    (error) => onError?.(error),
  );
}
