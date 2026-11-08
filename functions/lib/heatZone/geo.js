/**
 * Heat Zone geometry helpers (GeoJSON, [lng, lat] order). Server copy of the
 * ray-casting helpers in src/lib/hydrantDamage/geo.js plus bbox / validation.
 */

const MAX_GEOMETRY_CHARS = 900_000; // keeps a zone doc under Firestore's 1 MiB limit
const MAX_VERTICES = 60_000;

function toCoord(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

/** Valid WGS84 point or null. (0,0) is treated as "not geocoded". */
function validLatLng(lat, lng) {
  const la = toCoord(lat);
  const ln = toCoord(lng);
  if (la === null || ln === null) return null;
  if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
  if (la === 0 && ln === 0) return null;
  return { lat: la, lng: ln };
}

function pointInRing(lng, lat, ring) {
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

function pointInPolygonCoords(lng, lat, polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return false;
  const [outer, ...holes] = polygon;
  if (!pointInRing(lng, lat, outer)) return false;
  return !holes.some((hole) => pointInRing(lng, lat, hole));
}

function pointInGeometry(lng, lat, geometry) {
  if (!geometry || typeof geometry !== "object") return false;
  if (geometry.type === "Polygon") return pointInPolygonCoords(lng, lat, geometry.coordinates);
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).some((p) => pointInPolygonCoords(lng, lat, p));
  return false;
}

function eachPosition(geometry, fn) {
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  for (const poly of polys || []) for (const ring of poly || []) for (const pos of ring || []) fn(pos);
}

/** [south, west, north, east] */
function geometryBbox(geometry) {
  let s = 90; let w = 180; let n = -90; let e = -180;
  eachPosition(geometry, ([lng, lat]) => {
    if (lat < s) s = lat; if (lat > n) n = lat;
    if (lng < w) w = lng; if (lng > e) e = lng;
  });
  return [s, w, n, e];
}

function inBbox(lat, lng, bbox) {
  return Array.isArray(bbox) && lat >= bbox[0] && lat <= bbox[2] && lng >= bbox[1] && lng <= bbox[3];
}

/**
 * Validate a geometry (Polygon / MultiPolygon only).
 * @returns {{ok:true, geometry:object, bbox:number[]}|{ok:false, error:string}}
 */
function validateGeometry(geometry) {
  if (!geometry || typeof geometry !== "object") return { ok: false, error: "Boundary geometry is missing." };
  if (!["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return { ok: false, error: `Boundaries must be Polygon or MultiPolygon (got ${geometry.type || "unknown"}).` };
  }
  const polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polys) || !polys.length) return { ok: false, error: "Boundary has no coordinates." };
  let vertices = 0;
  for (const poly of polys) {
    if (!Array.isArray(poly) || !poly.length) return { ok: false, error: "Boundary polygon is empty." };
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) return { ok: false, error: "Each boundary ring needs at least 4 positions." };
      for (const pos of ring) {
        vertices += 1;
        if (!Array.isArray(pos) || !validLatLng(pos[1], pos[0])) {
          return { ok: false, error: "Boundary contains an invalid coordinate. GeoJSON uses [longitude, latitude]." };
        }
      }
    }
  }
  if (vertices > MAX_VERTICES) return { ok: false, error: `Boundary is too detailed (${vertices} points, max ${MAX_VERTICES}).` };
  const json = JSON.stringify(geometry);
  if (json.length > MAX_GEOMETRY_CHARS) return { ok: false, error: "Boundary file is too large. Simplify it and try again." };
  return { ok: true, geometry, bbox: geometryBbox(geometry) };
}

/** Accept Geometry, Feature, or FeatureCollection; returns [{ name, geometry, properties }]. */
function featuresFromGeoJson(input) {
  let value = input;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  if (!value || typeof value !== "object") return [];
  if (value.type === "FeatureCollection") {
    return (value.features || []).filter((f) => f && f.geometry).map((f) => ({ geometry: f.geometry, properties: f.properties || {} }));
  }
  if (value.type === "Feature" && value.geometry) return [{ geometry: value.geometry, properties: value.properties || {} }];
  if (value.type === "Polygon" || value.type === "MultiPolygon") return [{ geometry: value, properties: {} }];
  return [];
}

module.exports = {
  MAX_GEOMETRY_CHARS,
  featuresFromGeoJson,
  geometryBbox,
  inBbox,
  pointInGeometry,
  toCoord,
  validLatLng,
  validateGeometry,
};
