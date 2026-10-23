/** Hydrant helpers for the field app (search, distance, lookup). */
import { hydrantFirebaseDocId } from "../lib/hydrantTenantService.js";
import { getRecordLatLng } from "../lib/hydrantDamage/geo.js";

export function hydrantKey(hydrant = {}) {
  return hydrantFirebaseDocId(hydrant.location_id, hydrant.hydrant_id);
}

export function hydrantLabel(hydrant = {}) {
  return hydrant.hydrant_id || hydrant.official_hydrant_id || hydrant.location_id || "Hydrant";
}

export function hydrantAddress(hydrant = {}) {
  return hydrant.address || hydrant.full_address || hydrant.location || "";
}

export function findHydrant(hydrants = [], key = "") {
  return hydrants.find((hydrant) => hydrantKey(hydrant) === key) || null;
}

/** Just the fields a field record needs to remember about a hydrant. */
export function hydrantSnapshot(hydrant = {}) {
  const keep = [
    "location_id", "hydrant_id", "official_hydrant_id", "address", "full_address", "location", "district",
    "latitude", "longitude", "lat", "lon", "provider", "water_assoc", "status", "flow_result", "nfpa_class",
    "nfpa_color", "flow_gpm", "last_checked", "id",
  ];
  return Object.fromEntries(keep.filter((key) => hydrant[key] !== undefined && hydrant[key] !== "").map((key) => [key, hydrant[key]]));
}

export function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "";
  const feet = meters * 3.28084;
  if (feet < 1000) return `${Math.round(feet / 10) * 10} ft`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

export function searchHydrants(hydrants = [], query = "", position = null, limit = 50) {
  const q = String(query).trim().toLowerCase();
  const qDigits = q.replace(/\D/g, "");
  let rows = hydrants;
  if (q) {
    rows = hydrants.filter((hydrant) => {
      const text = `${hydrant.hydrant_id || ""} ${hydrant.official_hydrant_id || ""} ${hydrant.location_id || ""} ${hydrantAddress(hydrant)}`.toLowerCase();
      if (text.includes(q)) return true;
      if (qDigits.length >= 2) {
        return [hydrant.hydrant_id, hydrant.official_hydrant_id].some((value) => String(value || "").replace(/\D/g, "").includes(qDigits));
      }
      return false;
    });
  }
  if (position) {
    return rows
      .map((hydrant) => ({ hydrant, distance: distanceMeters(position, getRecordLatLng(hydrant)) }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, limit);
  }
  return rows
    .slice()
    .sort((a, b) => String(hydrantLabel(a)).localeCompare(String(hydrantLabel(b)), undefined, { numeric: true }))
    .slice(0, limit)
    .map((hydrant) => ({ hydrant, distance: Infinity }));
}

export function hydrantStatusTone(hydrant = {}) {
  const status = String(hydrant.status || "").toLowerCase();
  if (/out of service|oos|inoperable|removed/.test(status)) return "bad";
  if (/limited|restricted|repair|damaged/.test(status)) return "warn";
  return "ok";
}
