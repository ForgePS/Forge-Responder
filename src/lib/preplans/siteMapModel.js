/**
 * Site map model (pure, no Leaflet or Firestore).
 *
 * One site map per preplan revision (`preplanSiteMaps/{revisionId}`): drawn
 * features in lat/lng, the saved view, and each floor's alignment to the map.
 * Points are stored as {lat, lng} objects because Firestore rejects nested arrays.
 */
import { buildAlignmentRecord, floorToGeo, toLocalMeters } from "./georeference.js";

export const SITE_MAP_SCHEMA_VERSION = 1;
export const MAX_SITE_FEATURES = 500;
export const MAX_FEATURE_POINTS = 500;

/**
 * Basemap providers. All are Esri's keyless public tile services (Esri World
 * Imagery is already used elsewhere in Forge), so nothing here needs a key or
 * a paid account. Adding a provider means adding a row here.
 */
export const BASEMAP_PROVIDERS = Object.freeze([
  {
    id: "imagery",
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    maxZoom: 19,
    note: "Imagery is not live and its capture date is unknown. Confirm on scene.",
  },
  {
    id: "street",
    label: "Street",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Map &copy; Esri",
    maxZoom: 19,
    note: "",
  },
  {
    id: "topo",
    label: "Topographic",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attribution: "Map &copy; Esri",
    maxZoom: 19,
    note: "",
  },
]);

export function basemapById(id) {
  return BASEMAP_PROVIDERS.find((row) => row.id === id) || BASEMAP_PROVIDERS[0];
}

/** What can be drawn on the site map and how it is drawn. */
export const SITE_FEATURE_KINDS = Object.freeze({
  footprint: { label: "Building footprint", geometry: "polygon", color: "#f59e0b" },
  boundary: { label: "Property boundary", geometry: "polygon", color: "#a855f7" },
  access: { label: "Apparatus access", geometry: "line", color: "#22c55e" },
  no_access: { label: "No apparatus access", geometry: "line", color: "#ef4444" },
  staging: { label: "Staging area", geometry: "point", color: "#3b82f6" },
  hazard: { label: "Hazard", geometry: "point", color: "#dc2626" },
  note: { label: "Note", geometry: "point", color: "#f8fafc" },
});

const MIN_POINTS = { polygon: 3, line: 2, point: 1 };

function cleanText(value, max = 200) {
  return String(value ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
}

function finiteLatLng(point) {
  const lat = Number(Array.isArray(point) ? point[0] : point?.lat);
  const lng = Number(Array.isArray(point) ? point[1] : point?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7 };
}

export function newSiteFeatureId() {
  return `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** @returns {object|null} a clean feature, or null when it can't be drawn. */
export function normalizeSiteFeature(raw = {}) {
  const kind = SITE_FEATURE_KINDS[raw?.kind] ? raw.kind : null;
  if (!kind) return null;
  const geometry = SITE_FEATURE_KINDS[kind].geometry;
  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map(finiteLatLng).filter(Boolean).slice(0, MAX_FEATURE_POINTS);
  if (points.length < MIN_POINTS[geometry]) return null;
  return {
    id: cleanText(raw.id, 80) || newSiteFeatureId(),
    kind,
    points: geometry === "point" ? points.slice(0, 1) : points,
    label: cleanText(raw.label, 120),
    notes: cleanText(raw.notes, 1000),
    buildingId: kind === "footprint" ? cleanText(raw.buildingId, 80) : "",
    verificationStatus: ["unverified", "verified"].includes(raw.verificationStatus) ? raw.verificationStatus : "unverified",
    source: ["manual", "imported"].includes(raw.source) ? raw.source : "manual",
    createdBy: cleanText(raw.createdBy, 128),
    createdAt: cleanText(raw.createdAt, 40),
  };
}

function cleanAlignments(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [floorId, record] of Object.entries(raw)) {
    const t = record?.transform;
    const nums = t && ["a", "b", "c", "d", "e", "f"].every((key) => Number.isFinite(Number(t[key])));
    const origin = finiteLatLng(t?.origin);
    if (!nums || !origin) continue;
    out[cleanText(floorId, 80)] = {
      ...record,
      status: record.status === "verified" ? "verified" : "unverified",
      transform: { ...t, origin: [origin.lat, origin.lng] },
    };
  }
  return out;
}

export function normalizeSiteMap(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const center = finiteLatLng(data.view?.center);
  const features = [];
  const seen = new Set();
  for (const row of Array.isArray(data.features) ? data.features : []) {
    const feature = normalizeSiteFeature(row);
    if (!feature || seen.has(feature.id)) continue;
    seen.add(feature.id);
    features.push(feature);
    if (features.length >= MAX_SITE_FEATURES) break;
  }
  return {
    id: cleanText(data.id || data.revisionId, 120),
    schemaVersion: SITE_MAP_SCHEMA_VERSION,
    preplanId: cleanText(data.preplanId, 120),
    revisionId: cleanText(data.revisionId, 120),
    basemap: basemapById(data.basemap).id,
    view: center ? { center, zoom: Math.max(1, Math.min(Number(data.view?.zoom) || 18, 21)) } : null,
    features,
    alignments: cleanAlignments(data.alignments),
    version: Number(data.version) || 0,
    updatedAt: cleanText(data.updatedAt, 40),
    updatedBy: cleanText(data.updatedBy, 128),
  };
}

/** Feature edits, all returning a new site map. */
export function addSiteFeature(map, raw, actor = "") {
  const feature = normalizeSiteFeature({ ...raw, createdBy: actor, createdAt: new Date().toISOString() });
  if (!feature) throw new Error("That shape needs more points.");
  if (map.features.length >= MAX_SITE_FEATURES) throw new Error(`A site map holds at most ${MAX_SITE_FEATURES} features.`);
  return { ...map, features: [...map.features, feature] };
}

export function updateSiteFeature(map, id, patch) {
  return {
    ...map,
    features: map.features.map((row) => (row.id === id ? normalizeSiteFeature({ ...row, ...patch, id }) || row : row)),
  };
}

export function removeSiteFeature(map, id) {
  return { ...map, features: map.features.filter((row) => row.id !== id) };
}

export function setFloorAlignment(map, floorId, fit, controlPoints, actor = "") {
  return { ...map, alignments: { ...map.alignments, [floorId]: buildAlignmentRecord(fit, controlPoints, actor) } };
}

export function clearFloorAlignment(map, floorId) {
  const alignments = { ...map.alignments };
  delete alignments[floorId];
  return { ...map, alignments };
}

export function verifyFloorAlignment(map, floorId, actor = "") {
  const record = map.alignments[floorId];
  if (!record) return map;
  return {
    ...map,
    alignments: { ...map.alignments, [floorId]: { ...record, status: "verified", verifiedBy: actor, verifiedAt: new Date().toISOString() } },
  };
}

/** Firestore shape (no nested arrays: control points become objects). */
export function siteMapToStorage(map) {
  const alignments = {};
  for (const [floorId, record] of Object.entries(map.alignments || {})) {
    alignments[floorId] = {
      ...record,
      controlPoints: (record.controlPoints || []).map((row) => ({
        floor: { x: Number(row.floor?.[0] ?? row.floor?.x), y: Number(row.floor?.[1] ?? row.floor?.y) },
        geo: { lat: Number(row.geo?.[0] ?? row.geo?.lat), lng: Number(row.geo?.[1] ?? row.geo?.lng) },
      })),
    };
  }
  return { ...map, alignments };
}

/** Control points back to the [x,y] / [lat,lng] form georeference.js uses. */
export function controlPointsOf(record) {
  return (record?.controlPoints || []).map((row) => ({
    floor: Array.isArray(row.floor) ? row.floor.map(Number) : [Number(row.floor?.x), Number(row.floor?.y)],
    geo: Array.isArray(row.geo) ? row.geo.map(Number) : [Number(row.geo?.lat), Number(row.geo?.lng)],
  }));
}

/** Great-circle distance in meters. */
export function distanceMeters(a, b) {
  const p = finiteLatLng(a);
  const q = finiteLatLng(b);
  if (!p || !q) return 0;
  const rad = Math.PI / 180;
  const dLat = (q.lat - p.lat) * rad;
  const dLng = (q.lng - p.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(p.lat * rad) * Math.cos(q.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_008.8 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function pathLengthMeters(points = []) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distanceMeters(points[i - 1], points[i]);
  return total;
}

/** Polygon area in square meters (local projection; fine at site scale). */
export function polygonAreaSqMeters(points = []) {
  const clean = points.map(finiteLatLng).filter(Boolean);
  if (clean.length < 3) return 0;
  const origin = [clean[0].lat, clean[0].lng];
  const local = clean.map((p) => toLocalMeters([p.lat, p.lng], origin));
  let sum = 0;
  for (let i = 0; i < local.length; i += 1) {
    const [x1, y1] = local[i];
    const [x2, y2] = local[(i + 1) % local.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** "312 ft", "1.2 mi", "4,850 sq ft". US units first; meters in parentheses. */
export function formatLength(meters) {
  const feet = meters * 3.28084;
  if (feet >= 5280) return `${(feet / 5280).toFixed(2)} mi (${(meters / 1000).toFixed(2)} km)`;
  return `${Math.round(feet).toLocaleString()} ft (${Math.round(meters).toLocaleString()} m)`;
}

export function formatArea(sqMeters) {
  const sqFeet = sqMeters * 10.7639;
  return `${Math.round(sqFeet).toLocaleString()} sq ft (${Math.round(sqMeters).toLocaleString()} m²)`;
}

/** Describe a feature's size for the feature list. */
export function describeSiteFeature(feature) {
  const geometry = SITE_FEATURE_KINDS[feature.kind]?.geometry;
  if (geometry === "polygon") return formatArea(polygonAreaSqMeters(feature.points));
  if (geometry === "line") return formatLength(pathLengthMeters(feature.points));
  return "";
}

/**
 * A floor plan's outline objects projected onto the map through its alignment.
 * Returns polylines of [lat,lng] for Leaflet (not stored).
 */
export function projectFloorPlan(plan, alignment) {
  if (!plan || !alignment?.transform) return [];
  const out = [];
  for (const object of plan.objects || []) {
    if (object.verificationStatus === "rejected") continue;
    const kind = object.geometry?.kind;
    let pts = (object.geometry?.points || []).map((p) => (Array.isArray(p) ? p : [p.x, p.y]));
    if (kind === "rect" && pts.length >= 2) {
      const [[x1, y1], [x2, y2]] = pts;
      pts = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }
    const latLngs = pts.map((p) => floorToGeo(alignment.transform, p));
    if (kind === "point") {
      if (latLngs.length) out.push({ id: object.id, type: object.type, symbolId: object.symbolId || "", label: object.name || "", latLngs, kind: "point" });
      continue;
    }
    if (latLngs.length < 2) continue;
    out.push({
      id: object.id,
      type: object.type,
      latLngs,
      kind: kind === "polygon" || kind === "rect" ? "polygon" : "line",
    });
  }
  return out;
}

/** Problems that block publishing (alignments must be confirmed by a person). */
export function siteMapPublicationProblems(map) {
  const problems = [];
  const unverified = Object.keys(map?.alignments || {}).filter((id) => map.alignments[id].status !== "verified");
  if (unverified.length) problems.push(`${unverified.length} floor alignment${unverified.length === 1 ? " is" : "s are"} not confirmed.`);
  return problems;
}
