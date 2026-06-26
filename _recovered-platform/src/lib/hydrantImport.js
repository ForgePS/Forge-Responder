import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { hydrantFirebaseDocId } from "./hydrantTenantService.js";

export const HYDRANT_IMPORT_TEMPLATE_HEADERS = [
  "hydrant_id",
  "official_hydrant_id",
  "location_id",
  "district",
  "address",
  "location",
  "latitude",
  "longitude",
  "status",
  "hydrant_type",
  "flow_gpm",
  "flow_result",
  "provider",
  "city",
  "water_assoc",
  "notes",
];

const FIELD_ALIASES = {
  hydrant_id: ["hydrant_id", "hydrant id", "hydrant", "hyd_id", "hyd id", "id"],
  official_hydrant_id: ["official_hydrant_id", "official hydrant id", "official_id"],
  location_id: ["location_id", "location id", "locationid", "objectid", "arcgis_objectid", "arcgis objectid"],
  district: ["district", "hydrant district", "zone"],
  address: ["address", "street address", "street"],
  location: ["location", "site", "site name"],
  latitude: ["latitude", "lat", "y"],
  longitude: ["longitude", "lon", "lng", "long", "x"],
  status: ["status", "hydrant status", "service status"],
  hydrant_type: ["hydrant_type", "hydrant type", "type", "hyd_type"],
  flow_gpm: ["flow_gpm", "flow gpm", "gpm", "flow"],
  flow_result: ["flow_result", "flow result", "nfpa class", "class"],
  provider: ["provider", "water provider", "water_assoc", "water association"],
  city: ["city", "municipality"],
  water_assoc: ["water_assoc", "water association", "water provider"],
  subdivision: ["subdivision", "sub division"],
  additional: ["additional", "comments"],
  description: ["description", "desc"],
  fire_response_area: ["fire_response_area", "fire response area", "response area"],
  notes: ["notes", "note", "remarks"],
  last_checked: ["last_checked", "last checked", "last tested", "test date"],
  checked_by: ["checked_by", "checked by", "tested_by", "tested by"],
  checked_shift: ["checked_shift", "checked shift", "shift"],
  source: ["source", "data source"],
};

function clean(value) {
  if (value == null) return "";
  return String(value).trim();
}

function normalizeHeader(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function resolveFieldKey(header) {
  const normalized = normalizeHeader(header);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => normalizeHeader(alias) === normalized)) {
      return field;
    }
  }
  return normalized.replace(/\s+/g, "_");
}

export function parseCsvRows(text = "") {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => clean(value))) rows.push(row);
  return rows;
}

export function parseHydrantCsv(text = "") {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    return { hydrants: [], errors: ["CSV file is empty."] };
  }

  const headers = rows[0].map((header) => resolveFieldKey(header));
  const hydrants = [];
  const errors = [];

  rows.slice(1).forEach((values, index) => {
    const raw = {};
    headers.forEach((header, headerIndex) => {
      if (!header) return;
      raw[header] = clean(values[headerIndex]);
    });
    const normalized = normalizeImportedHydrant(raw, index + 2);
    if (normalized.error) {
      errors.push(`Row ${index + 2}: ${normalized.error}`);
      return;
    }
    hydrants.push(normalized.record);
  });

  return { hydrants, errors, format: "csv" };
}

export function parseHydrantJson(text = "") {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { hydrants: [], errors: ["JSON file is not valid."] };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.hydrants)
      ? parsed.hydrants
      : Array.isArray(parsed?.features)
        ? parsed.features.map((feature) => ({
            ...(feature.attributes || {}),
            latitude: feature.geometry?.y,
            longitude: feature.geometry?.x,
          }))
        : [];

  if (!list.length) {
    return { hydrants: [], errors: ["JSON file did not contain a hydrants array."] };
  }

  const hydrants = [];
  const errors = [];

  list.forEach((item, index) => {
    const normalized = normalizeImportedHydrant(item, index + 1);
    if (normalized.error) {
      errors.push(`Record ${index + 1}: ${normalized.error}`);
      return;
    }
    hydrants.push(normalized.record);
  });

  return { hydrants, errors, format: "json" };
}

export function normalizeImportedHydrant(raw = {}, rowNumber = 0) {
  const mapped = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    const field = resolveFieldKey(key);
    if (field) mapped[field] = clean(value);
  });

  const hydrantId = mapped.hydrant_id || mapped.official_hydrant_id;
  const locationId = mapped.location_id || hydrantId || `import-${rowNumber || Date.now()}`;
  if (!hydrantId && !mapped.location_id) {
    return { error: "Missing hydrant_id or location_id." };
  }

  const latitude = mapped.latitude || mapped.lat || "";
  const longitude = mapped.longitude || mapped.lon || mapped.lng || "";
  const address = mapped.address || mapped.location || "";
  const now = new Date().toISOString();

  const record = {
    location_id: locationId,
    hydrant_id: hydrantId || locationId,
    official_hydrant_id: mapped.official_hydrant_id || hydrantId || locationId,
    district: mapped.district || "",
    address,
    location: mapped.location || address,
    description: mapped.description || mapped.additional || "",
    latitude: latitude ? String(latitude) : "",
    longitude: longitude ? String(longitude) : "",
    lat: latitude ? String(latitude) : "",
    lon: longitude ? String(longitude) : "",
    provider: mapped.provider || mapped.water_assoc || "",
    status: mapped.status || "In Service",
    discharge_size: mapped.discharge_size || "",
    flow_gpm: mapped.flow_gpm || "",
    flow_result: mapped.flow_result || mapped.flow_gpm || "",
    hydrant_type: mapped.hydrant_type || "",
    subdivision: mapped.subdivision || "",
    additional: mapped.additional || "",
    city: mapped.city || "",
    fire_response_area: mapped.fire_response_area || mapped.city || "",
    water_assoc: mapped.water_assoc || mapped.provider || "",
    notes: mapped.notes || "",
    last_checked: mapped.last_checked || "",
    checked_by: mapped.checked_by || "",
    checked_shift: mapped.checked_shift || "",
    source: mapped.source || "Department hydrant import",
    updated_at: now,
    imported_at: now,
  };

  const warnings = [];
  if (!latitude || !longitude) {
    warnings.push("missing coordinates");
  }

  return { record, warnings };
}

export function summarizeHydrantImport(hydrants = []) {
  const withCoordinates = hydrants.filter((hydrant) => hydrant.latitude && hydrant.longitude).length;
  const districts = [...new Set(hydrants.map((hydrant) => hydrant.district).filter(Boolean))];
  return {
    total: hydrants.length,
    withCoordinates,
    withoutCoordinates: hydrants.length - withCoordinates,
    districts: districts.length,
  };
}

export function buildHydrantImportTemplateCsv() {
  const sample = {
    hydrant_id: "FD-1001",
    official_hydrant_id: "FD-1001",
    location_id: "1001",
    district: "1",
    address: "100 Main Street",
    location: "100 Main Street",
    latitude: "35.123456",
    longitude: "-89.987654",
    status: "In Service",
    hydrant_type: "AVK",
    flow_gpm: "B",
    flow_result: "B",
    provider: "City Water Department",
    city: "Sample City",
    water_assoc: "City Water Department",
    notes: "Sample hydrant record",
  };

  const headerLine = HYDRANT_IMPORT_TEMPLATE_HEADERS.join(",");
  const valueLine = HYDRANT_IMPORT_TEMPLATE_HEADERS
    .map((header) => `"${String(sample[header] ?? "").replaceAll('"', '""')}"`)
    .join(",");
  return `${headerLine}\n${valueLine}\n`;
}

export async function parseHydrantImportFile(file) {
  if (!file) {
    return { hydrants: [], errors: ["No file selected."] };
  }

  const text = await file.text();
  const name = String(file.name || "").toLowerCase();

  if (name.endsWith(".json") || file.type.includes("json")) {
    return parseHydrantJson(text);
  }

  if (name.endsWith(".csv") || file.type.includes("csv") || file.type.includes("text")) {
    return parseHydrantCsv(text);
  }

  try {
    const jsonResult = parseHydrantJson(text);
    if (jsonResult.hydrants.length) return jsonResult;
  } catch {
    // fall through to CSV
  }

  return parseHydrantCsv(text);
}

const BATCH_SIZE = 400;

export async function clearTenantHydrantRecords(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return 0;

  const snap = await getDocs(collection(db, "departments", departmentId, "hydrants"));
  if (!snap.empty) {
    let batch = writeBatch(db);
    let ops = 0;
    for (const item of snap.docs) {
      batch.delete(item.ref);
      ops += 1;
      if (ops >= BATCH_SIZE) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops) await batch.commit();
  }

  return snap.size;
}

export async function importHydrantsToTenant(departmentId, hydrants = [], options = {}) {
  const { mode = "merge", onProgress } = options;
  const db = getFirestoreDb();
  if (!db || !departmentId) {
    throw new Error("Firebase is not available for hydrant import.");
  }
  if (!hydrants.length) {
    throw new Error("No hydrant records to import.");
  }

  if (mode === "replace") {
    await clearTenantHydrantRecords(departmentId);
  }

  let imported = 0;
  for (let index = 0; index < hydrants.length; index += BATCH_SIZE) {
    const chunk = hydrants.slice(index, index + BATCH_SIZE);
    const batch = writeBatch(db);
    chunk.forEach((hydrant) => {
      const id = hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id);
      batch.set(doc(db, "departments", departmentId, "hydrants", id), {
        ...hydrant,
        departmentId,
        updated_at: hydrant.updated_at || new Date().toISOString(),
      }, { merge: true });
    });
    await batch.commit();
    imported += chunk.length;
    onProgress?.({ imported, total: hydrants.length });
  }

  return { imported, total: hydrants.length, mode };
}
