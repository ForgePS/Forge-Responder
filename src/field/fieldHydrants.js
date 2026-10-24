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

/* ---------------- same status rules as the desktop hydrant pages ---------------- */

export const HYDRANT_PRIVATE_COLOR = "#5b21b6";

export function isPrivateHydrant(hydrant = {}) {
  return /P$/i.test(String(hydrant.hydrant_id || hydrant.official_hydrant_id || "").trim())
    || /private/i.test(String(hydrant.status || ""));
}

export function isOutOfServiceHydrant(hydrant = {}) {
  const status = String(hydrant.status || "").toLowerCase();
  const flow = String(hydrant.flow_result || "").trim().toUpperCase();
  return status.includes("out") || flow === "OOS";
}

export function isCheckedThisYear(hydrant = {}, year = String(new Date().getFullYear())) {
  if (isPrivateHydrant(hydrant) || isOutOfServiceHydrant(hydrant)) return true;
  return String(hydrant.checked_year || "") === year || String(hydrant.last_checked || "").startsWith(year);
}

export function isDueThisYear(hydrant = {}) {
  return !isPrivateHydrant(hydrant) && !isOutOfServiceHydrant(hydrant) && !isCheckedThisYear(hydrant);
}

export function checkedLabel(hydrant = {}) {
  const year = String(new Date().getFullYear());
  if (isPrivateHydrant(hydrant)) return "Private — do not test";
  if (isOutOfServiceHydrant(hydrant)) return "Out of service";
  return isCheckedThisYear(hydrant) ? `Checked ${year}` : `Due ${year}`;
}

const FLOW_COLORS = { B: "#2563eb", G: "#16a34a", O: "#f97316", R: "#dc2626" };
const CLASS_COLORS = { "Class AA": "#2563eb", "Class A": "#16a34a", "Class B": "#f97316", "Class C": "#dc2626" };

export function hydrantFlowColor(hydrant = {}) {
  if (isPrivateHydrant(hydrant)) return HYDRANT_PRIVATE_COLOR;
  if (isOutOfServiceHydrant(hydrant)) return "#050505";
  return CLASS_COLORS[hydrant.nfpa_class] || FLOW_COLORS[String(hydrant.flow_result || "").toUpperCase()] || "#64748b";
}

export function hydrantDistrict(hydrant = {}) {
  return String(hydrant.district || "").trim() || "Unassigned";
}

/** Districts with hydrant counts, numeric order, "Unassigned" last. */
export function districtCounts(hydrants = []) {
  const counts = new Map();
  hydrants.forEach((hydrant) => {
    const district = hydrantDistrict(hydrant);
    counts.set(district, (counts.get(district) || 0) + 1);
  });
  return [...counts.entries()]
    .sort(([a], [b]) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b, undefined, { numeric: true }))
    .map(([district, count]) => ({ district, count }));
}

export function hydrantSummary(hydrants = []) {
  return {
    total: hydrants.length,
    checked: hydrants.filter((hydrant) => !isPrivateHydrant(hydrant) && !isOutOfServiceHydrant(hydrant) && isCheckedThisYear(hydrant)).length,
    due: hydrants.filter(isDueThisYear).length,
    outOfService: hydrants.filter(isOutOfServiceHydrant).length,
    private: hydrants.filter(isPrivateHydrant).length,
  };
}
