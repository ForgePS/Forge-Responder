import { restoreFromFirestore } from "./firestoreSanitize.js";

export const LEGACY_APPARATUS_UNIT_NAMES = {
  "Brush 2": "FD-2",
};

export function canonicalApparatusUnitName(unit = "") {
  const trimmed = String(unit || "").trim();
  return LEGACY_APPARATUS_UNIT_NAMES[trimmed] || trimmed;
}

export function normalizeApparatusRecord(record = {}, index = 0) {
  const restored = restoreFromFirestore(record);
  const rawUnit = String(restored.unit || restored.name || restored.label || "").trim();
  let id = String(restored.id || "").trim();
  if (!id) {
    id = rawUnit
      ? `APP-${rawUnit.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`
      : `APP-${index + 1}`;
  }

  const unit = canonicalApparatusUnitName(rawUnit || id) || id;

  return {
    ...restored,
    id,
    unit,
    type: restored.type || "Apparatus",
    station: restored.station || "",
    year: restored.year || "",
    mileage: restored.mileage || "",
    engineHours: restored.engineHours || "",
    pumpHours: restored.pumpHours || "",
    fuel: restored.fuel || "",
    pmDue: restored.pmDue || "",
    status: restored.status || "In Service",
    operator: restored.operator || "Unassigned",
    checks: Array.isArray(restored.checks) ? restored.checks : [],
  };
}

export function normalizeApparatusList(items = []) {
  const seenIds = new Set();
  return items.map((item, index) => {
    const normalized = normalizeApparatusRecord(item, index);
    let id = normalized.id;
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);
    return id === normalized.id ? normalized : { ...normalized, id };
  });
}
