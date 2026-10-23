import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { sanitizeForFirestore } from "./firestoreSanitize.js";
import { reconcileHydrantStatus } from "./hydrantStatusSync.js";

export function hydrantLocalKeys(departmentId = "") {
  const prefix = departmentId || "unknown";
  return {
    overrides: `${prefix}_hydrant_overrides_v1`,
    activity: `${prefix}_daily_activity_v1`,
    preFirePlans: `${prefix}_pre_fire_plans_v1`,
    hydrantInspections: `${prefix}_hydrant_inspections_v1`,
    hydrantFlowTests: `${prefix}_hydrant_flow_tests_v1`,
    crewSession: `${prefix}-hydrant-crew-session`,
  };
}

/** Optional static hydrant file shipped for a department (public/departments/{id}/hydrants.json). */
export function hydrantStaticDataUrl(departmentId = "") {
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
  const payload = sanitizeForFirestore({
    ...hydrant,
    departmentId,
    updated_at: hydrant.updated_at || new Date().toISOString(),
  });
  await setDoc(doc(db, "departments", departmentId, "hydrants", id), payload, { merge: true });
  return payload;
}

export async function persistHydrantUpdate(departmentId, baseHydrant, patch) {
  const hydrant = mergeHydrantUpdate(baseHydrant, patch);
  const saved = await saveTenantHydrantRecord(departmentId, hydrant);
  if (!saved) {
    throw new Error("Unable to save hydrant record");
  }
  return saved;
}

export async function persistHydrantCollectionUpdate(departmentId, collectionName, id, data) {
  const saved = await saveTenantHydrantCollectionRecord(departmentId, collectionName, id, data);
  if (!saved) {
    throw new Error(`Unable to save ${collectionName} record`);
  }
  return saved;
}

async function postDevHydrantApi(path, body) {
  if (!import.meta.env.DEV) return;
  try {
    await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Local Express API is optional during development.
  }
}

export async function persistHydrantUpdateWithDevMirror(departmentId, baseHydrant, patch) {
  const saved = await persistHydrantUpdate(departmentId, baseHydrant, patch);
  await postDevHydrantApi("/api/hydrants", patch);
  return saved;
}

export async function persistHydrantCollectionUpdateWithDevMirror(departmentId, collectionName, id, data) {
  const saved = await persistHydrantCollectionUpdate(departmentId, collectionName, id, data);
  const apiPath = collectionName === "hydrantFlowTests"
    ? "/api/tests"
    : collectionName === "hydrantInspections"
      ? "/api/inspections"
      : null;
  if (apiPath) {
    await postDevHydrantApi(apiPath, data);
  }
  return saved;
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
  const payload = sanitizeForFirestore({
    ...data,
    departmentId,
    updated_at: data.updated_at || new Date().toISOString(),
  });
  await setDoc(doc(db, "departments", departmentId, collectionName, id), payload, { merge: true });
  return payload;
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

export function mergeHydrantRecord(base = {}, patch = {}) {
  const merged = { ...base };
  Object.entries(patch || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (typeof value === "string" && value.trim() === "") return;
    merged[key] = value;
  });
  return merged;
}

export function finalizeHydrantRecord(base = {}, patch = {}) {
  return reconcileHydrantStatus(mergeHydrantRecord(base, patch));
}

export function mergeHydrantUpdate(baseHydrant, patch) {
  return finalizeHydrantRecord(baseHydrant, {
    ...patch,
    location_id: patch.location_id || baseHydrant?.location_id,
    hydrant_id: patch.hydrant_id || baseHydrant?.hydrant_id,
    updated_at: patch.updated_at || new Date().toISOString(),
  });
}

export function mergeHydrantLists(...lists) {
  const records = new Map();
  lists.flat().filter(Boolean).forEach((hydrant) => {
    const key = hydrantFirebaseDocId(
      hydrant.location_id || hydrant.id,
      hydrant.hydrant_id || hydrant.official_hydrant_id
    );
    records.set(key, mergeHydrantRecord(records.get(key) || {}, hydrant));
  });
  return [...records.values()];
}

function normalizeHydrantLookupValue(value = "") {
  return String(value || "").trim().toUpperCase();
}

function compactHydrantLookupValue(value = "") {
  return normalizeHydrantLookupValue(value).replace(/\s+/g, "");
}

/** Index hydrants by ID, location_id, arcgis object id, and numeric HL suffix for CSV matching. */
export function buildHydrantImportLookup(hydrants = []) {
  const byDocId = new Map();
  const aliases = new Map();

  function registerHydrant(hydrant) {
    if (!hydrant?.hydrant_id && !hydrant?.location_id) return;
    const docId = hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id);
    const entry = { hydrant, docId };
    byDocId.set(docId, entry);

    [
      hydrant.location_id,
      hydrant.hydrant_id,
      hydrant.official_hydrant_id,
      hydrant.arcgis_objectid,
    ].filter(Boolean).forEach((token) => {
      aliases.set(normalizeHydrantLookupValue(token), entry);
      aliases.set(compactHydrantLookupValue(token), entry);
    });

    const numeric = String(hydrant.hydrant_id || "").match(/(\d{3,})/);
    if (numeric?.[1]) aliases.set(numeric[1], entry);
  }

  hydrants.forEach(registerHydrant);

  return {
    registerHydrant,
    resolve(input = {}) {
      const directDocId = hydrantFirebaseDocId(input.location_id, input.hydrant_id);
      if (byDocId.has(directDocId)) return byDocId.get(directDocId);

      const candidates = [input.hydrant_id, input.location_id, input.official_hydrant_id].filter(Boolean);
      for (const candidate of candidates) {
        const hit = aliases.get(normalizeHydrantLookupValue(candidate))
          || aliases.get(compactHydrantLookupValue(candidate));
        if (hit) return hit;
      }

      return {
        hydrant: {
          location_id: input.location_id || input.hydrant_id,
          hydrant_id: input.hydrant_id || input.location_id,
        },
        docId: directDocId,
      };
    },
  };
}

export function applyImportedHydrantUpdatesLocally(departmentId, hydrants = []) {
  hydrants.filter(Boolean).forEach((hydrant) => saveLocalHydrantOverride(departmentId, hydrant));
}

export function syncImportedActivityLocally(departmentId, records = []) {
  records.filter(Boolean).forEach((record) => {
    const activityRecord = {
      ...record,
      type: record.type || (record.recordType === "flow" ? "Flow Test" : "Inspection"),
    };
    appendLocalHydrantCollectionRecord(departmentId, "dailyActivity", activityRecord);
    if (record.recordType === "flow") {
      appendLocalHydrantCollectionRecord(departmentId, "hydrantFlowTests", activityRecord);
      return;
    }
    appendLocalHydrantCollectionRecord(departmentId, "hydrantInspections", {
      ...activityRecord,
      inspected_at: activityRecord.inspected_at || activityRecord.tested_at,
    });
  });
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
    return match ? finalizeHydrantRecord(hydrant, saved) : hydrant;
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

export function appendLocalHydrantCollectionRecord(departmentId, keyName, record) {
  if (!record?.id) return null;
  const current = readHydrantLocalJson(departmentId, keyName, []);
  writeHydrantLocalJson(departmentId, keyName, [record, ...current.filter((item) => item.id !== record.id)]);
  return record;
}

export async function deleteTenantHydrantCollectionRecord(departmentId, collectionName, id) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !collectionName || !id) return false;
  await deleteDoc(doc(db, "departments", departmentId, collectionName, id));
  return true;
}
