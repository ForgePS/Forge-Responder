function createStationId(name = "", index = 0) {
  const slug = String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `station-${slug}` : `station-${index + 1}`;
}

export function createEmptyStation(name = "", index = 0) {
  return {
    id: createStationId(name, index),
    name: String(name || "").trim(),
    address: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
    notes: "",
  };
}

export function normalizeStationRecord(station = {}, index = 0) {
  const name = String(station.name || "").trim();
  return {
    id: station.id || createStationId(name, index),
    name,
    address: String(station.address || "").trim(),
    city: String(station.city || "").trim(),
    state: String(station.state || "").trim(),
    zip: String(station.zip || "").trim(),
    phone: String(station.phone || "").trim(),
    notes: String(station.notes || "").trim(),
  };
}

export function normalizeStationDetails(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((station, index) => normalizeStationRecord(station, index))
    .filter((station) => station.name);
}

export function parseStationNames(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildStationDetailsFromProfile(profile = {}) {
  const existing = normalizeStationDetails(profile.stationDetails);
  const byName = new Map(existing.map((station) => [station.name.toLowerCase(), station]));
  const stationNames = parseStationNames(profile.stations);

  if (!stationNames.length && existing.length) {
    return existing;
  }

  return stationNames.map((name, index) => {
    const match = byName.get(name.toLowerCase());
    if (match) {
      return { ...match, name };
    }
    return createEmptyStation(name, index);
  });
}

export function stationNamesFromDetails(stationDetails = []) {
  return normalizeStationDetails(stationDetails).map((station) => station.name);
}

export function defaultStationDetails(stationNames = []) {
  const names = stationNames.length ? stationNames : ["Station 1", "Station 2", "Station 3"];
  return names.map((name, index) => createEmptyStation(name, index));
}
