/**
 * Geo helpers for water-district polygon matching (GeoJSON, lng/lat).
 */

/**
 * @param {unknown} value
 * @returns {number|null}
 */
export function toCoordNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {{ latitude?: unknown, longitude?: unknown, lat?: unknown, lng?: unknown, lon?: unknown }} record
 * @returns {{ lat: number, lng: number }|null}
 */
export function getRecordLatLng(record = {}) {
  const lat = toCoordNumber(record.latitude ?? record.lat);
  const lng = toCoordNumber(record.longitude ?? record.lng ?? record.lon);
  if (lat === null || lng === null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/**
 * Ray-casting point-in-ring. Ring is [[lng, lat], ...]
 * @param {number} lng
 * @param {number} lat
 * @param {number[][]} ring
 */
export function pointInRing(lng, lat, ring) {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    if (![xi, yi, xj, yj].every(Number.isFinite)) continue;
    const intersect = ((yi > lat) !== (yj > lat))
      && (lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * @param {number} lng
 * @param {number} lat
 * @param {number[][][]} polygonCoords GeoJSON Polygon coordinates
 */
export function pointInPolygonCoords(lng, lat, polygonCoords) {
  if (!Array.isArray(polygonCoords) || !polygonCoords.length) return false;
  const [outer, ...holes] = polygonCoords;
  if (!pointInRing(lng, lat, outer)) return false;
  for (const hole of holes) {
    if (pointInRing(lng, lat, hole)) return false;
  }
  return true;
}

/**
 * @param {number} lng
 * @param {number} lat
 * @param {object} geometry GeoJSON geometry
 */
export function pointInGeometry(lng, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return false;
  const type = String(geometry.type || "");
  if (type === "Polygon") {
    return pointInPolygonCoords(lng, lat, geometry.coordinates);
  }
  if (type === "MultiPolygon") {
    return (geometry.coordinates || []).some((poly) => pointInPolygonCoords(lng, lat, poly));
  }
  if (type === "GeometryCollection") {
    return (geometry.geometries || []).some((g) => pointInGeometry(lng, lat, g));
  }
  return false;
}

/**
 * Accept Feature, FeatureCollection, Geometry, or `{ geometry }` wrappers.
 * @param {unknown} input
 * @returns {object|null} GeoJSON geometry
 */
export function extractGeometry(input) {
  if (!input) return null;
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  if (value.type === "Feature" && value.geometry) return value.geometry;
  if (value.type === "FeatureCollection" && Array.isArray(value.features) && value.features[0]?.geometry) {
    return value.features[0].geometry;
  }
  if (value.geometry && typeof value.geometry === "object") return value.geometry;
  if (["Polygon", "MultiPolygon", "GeometryCollection"].includes(value.type)) return value;
  return null;
}

/**
 * @param {unknown} input
 * @returns {{ ok: true, geometry: object }|{ ok: false, error: string }}
 */
export function parseDistrictGeometry(input) {
  const geometry = extractGeometry(input);
  if (!geometry) {
    return { ok: false, error: "Provide a GeoJSON Polygon, MultiPolygon, Feature, or FeatureCollection." };
  }
  if (!["Polygon", "MultiPolygon"].includes(geometry.type) && geometry.type !== "GeometryCollection") {
    return { ok: false, error: `Unsupported geometry type: ${geometry.type}` };
  }
  // Smoke-test with a known outside point to ensure structure is traversable.
  try {
    pointInGeometry(0, 0, geometry);
  } catch (error) {
    return { ok: false, error: error?.message || "Invalid geometry coordinates." };
  }
  return { ok: true, geometry };
}
