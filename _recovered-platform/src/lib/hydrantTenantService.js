import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { HORN_LAKE_DEPARTMENT_ID } from "./tenantPaths.js";

export function hydrantLocalKeys(departmentId = "") {
  const prefix = departmentId || "unknown";
  return {
    overrides: `${prefix}_hydrant_overrides_v1`,
    activity: `${prefix}_daily_activity_v1`,
    preFirePlans: `${prefix}_pre_fire_plans_v1`,
    crewSession: `${prefix}-hydrant-crew-session`,
  };
}

export function hydrantStaticDataUrl(departmentId = "") {
  if (departmentId === HORN_LAKE_DEPARTMENT_ID) {
    return `${import.meta.env.BASE_URL}hydrants.json`;
  }
  return `${import.meta.env.BASE_URL}departments/${departmentId}/hydrants.json`;
}

export function hydrantFirebaseDocId(...parts) {
  return parts
    .filter((part) => part !== undefined && part !== null && String(part).trim())
    .join("-")
    .replace(/[\\/#?[\]]/g, "-")
    .trim()
    .slice(0, 140) || `${Date.now()}`;
}

export async function loadStaticHydrants(departmentId) {
  if (!departmentId) return [];
  try {
    const res = await fetch(hydrantStaticDataUrl(departmentId));
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.hydrants) ? data.hydrants : [];
  } catch {
    return [];
  }
}

export async function loadTenantHydrantRecords(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return [];
  try {
    const snap = await getDocs(collection(db, "departments", departmentId, "hydrants"));
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    console.warn(`Unable to load tenant hydrants for ${departmentId}`, error);
    return [];
  }
}

export async function saveTenantHydrantRecord(departmentId, hydrant) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !hydrant) return null;
  const id = hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id);
  const payload = {
    ...hydrant,
    departmentId,
    updated_at: hydrant.updated_at || new Date().toISOString(),
  };
  await setDoc(doc(db, "departments", departmentId, "hydrants", id), payload, { merge: true });
  return payload;
}

export async function loadTenantHydrantCollection(departmentId, collectionName, fallback = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return fallback;
  try {
    const snap = await getDocs(collection(db, "departments", departmentId, collectionName));
    return snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  } catch (error) {
    console.warn(`Unable to load departments/${departmentId}/${collectionName}`, error);
    return fallback;
  }
}

export async function saveTenantHydrantCollectionRecord(departmentId, collectionName, id, data) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !collectionName || !id) return null;
  await setDoc(doc(db, "departments", departmentId, collectionName, id), {
    ...data,
    departmentId,
    updated_at: data.updated_at || new Date().toISOString(),
  }, { merge: true });
  return data;
}

export function resolveHydrantMapBounds(profile = {}, hydrants = []) {
  if (Array.isArray(profile.hydrantMapBounds) && profile.hydrantMapBounds.length === 2) {
    return profile.hydrantMapBounds;
  }

  const coords = (Array.isArray(hydrants) ? hydrants : [])
    .map((hydrant) => [Number(hydrant.lat || hydrant.latitude), Number(hydrant.lon || hydrant.longitude)])
    .filter(([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon));

  if (coords.length) {
    const lats = coords.map(([lat]) => lat);
    const lons = coords.map(([, lon]) => lon);
    const pad = 0.01;
    return [
      [Math.min(...lats) - pad, Math.min(...lons) - pad],
      [Math.max(...lats) + pad, Math.max(...lons) + pad],
    ];
  }

  if (profile?.id === HORN_LAKE_DEPARTMENT_ID) {
    return [[34.928, -90.125], [34.995, -89.965]];
  }

  return [[39.5, -98.5], [40.5, -97.5]];
}

export function resolveDistrictOptions(profile = {}, hydrants = []) {
  const fromHydrants = [...new Set(
    (Array.isArray(hydrants) ? hydrants : [])
      .map((hydrant) => String(hydrant.district || "").trim())
      .filter(Boolean)
  )];

  const fromStations = Array.isArray(profile.stations)
    ? profile.stations.map((_, index) => String(index + 1))
    : [];

  const districts = [...new Set([...fromStations, ...fromHydrants])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return ["All Districts", ...districts, "Unassigned"];
}

export function resolveShiftOptions(profile = {}) {
  const shifts = Array.isArray(profile.shifts)
    ? profile.shifts.filter(Boolean)
    : ["A Shift", "B Shift", "C Shift"];
  return ["", ...shifts];
}

export function resolveCrewUserOptions(personnel = [], fallback = []) {
  const fromPersonnel = (Array.isArray(personnel) ? personnel : [])
    .map((person) => String(person?.name || "").trim())
    .filter(Boolean);
  const merged = [...new Set([...fromPersonnel, ...fallback])].sort((a, b) => a.localeCompare(b));
  return ["", ...merged];
}

export function resolveDepartmentDisplayName(profile = {}) {
  return profile.displayTitle || profile.name || "Fire Department";
}

export function resolveDepartmentLogoUrl(profile = {}) {
  return profile.logoUrl || "/forge-logo.png";
}

export function mergeHydrantLists(...lists) {
  const records = new Map();
  lists.flat().filter(Boolean).forEach((hydrant) => {
    const key = hydrantFirebaseDocId(
      hydrant.location_id || hydrant.id,
      hydrant.hydrant_id || hydrant.official_hydrant_id
    );
    records.set(key, hydrant);
  });
  return [...records.values()];
}

export async function loadDepartmentHydrants(departmentId) {
  const [staticHydrants, tenantHydrants] = await Promise.all([
    loadStaticHydrants(departmentId),
    loadTenantHydrantRecords(departmentId),
  ]);

  return tenantHydrants.reduce((list, hydrant) => updateHydrantList(list, hydrant), staticHydrants);
}

export function updateHydrantList(list, saved) {
  const key = hydrantFirebaseDocId(saved.location_id, saved.hydrant_id);
  let found = false;
  const updated = list.map((hydrant) => {
    const match = hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id) === key
      || hydrant.location_id === saved.location_id
      || hydrant.hydrant_id === saved.hydrant_id
      || hydrant.official_hydrant_id === saved.official_hydrant_id;
    if (match) found = true;
    return match ? saved : hydrant;
  });
  return found ? updated : [saved, ...updated];
}

export function readHydrantLocalJson(departmentId, keyName, fallback) {
  const keys = hydrantLocalKeys(departmentId);
  const key = keys[keyName];
  try {
    return JSON.parse(window.localStorage.getItem(key) || "") || fallback;
  } catch {
    return fallback;
  }
}

export function writeHydrantLocalJson(departmentId, keyName, value) {
  const keys = hydrantLocalKeys(departmentId);
  window.localStorage.setItem(keys[keyName], JSON.stringify(value));
}

export function applyLocalHydrantOverrides(departmentId, hydrants) {
  const overrides = readHydrantLocalJson(departmentId, "overrides", []);
  return overrides.reduce((list, hydrant) => updateHydrantList(list, hydrant), hydrants);
}

export function saveLocalHydrantOverride(departmentId, hydrant) {
  const current = readHydrantLocalJson(departmentId, "overrides", []);
  writeHydrantLocalJson(departmentId, "overrides", updateHydrantList(current, hydrant));
}
