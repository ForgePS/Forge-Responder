/**
 * What the response view's map shows (pure, no Leaflet or Firestore).
 *
 * Built only from the PUBLISHED revision's site map. Floor plans appear on the
 * map only when a person has confirmed their alignment; an unconfirmed fit is
 * left off rather than shown in a place that may be wrong. Nothing is guessed:
 * with no site map, no location and no hydrants, there is simply no map.
 */
import { SITE_FEATURE_KINDS, distanceMeters, normalizeSiteMap, projectFloorPlan } from "./siteMapModel.js";

/** Unlinked hydrants within this distance of the site are shown too. */
export const NEARBY_HYDRANT_METERS = 300;

function hydrantLatLng(h = {}) {
  const lat = Number(h.lat ?? h.latitude);
  const lng = Number(h.lng ?? h.lon ?? h.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? [lat, lng] : null;
}

function preplanLatLng(preplan = {}) {
  const lat = Number(preplan.latitude);
  const lng = Number(preplan.longitude);
  // The occupancy form stores a blank location as 0,0: that is "no location".
  return preplan.latitude != null && preplan.longitude != null && Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? [lat, lng] : null;
}

function centroid(latLngs) {
  if (!latLngs.length) return null;
  const sum = latLngs.reduce((acc, [lat, lng]) => [acc[0] + lat, acc[1] + lng], [0, 0]);
  return [sum[0] / latLngs.length, sum[1] / latLngs.length];
}

/**
 * @param {object} input
 * @param {object|null} input.siteMap      stored site map of the published revision
 * @param {object} input.preplan
 * @param {Map|object} input.plansByFloor   floorId → floor plan (published revision)
 * @param {string} input.floorId            floor to overlay (only if its alignment is confirmed)
 * @param {Array} input.hydrants            department hydrants (raw rows)
 * @param {Array} input.alerts              current alerts (verified and reported)
 */
export function buildResponseMap({ siteMap, preplan = {}, plansByFloor, floorId = "", hydrants = [], alerts = [] } = {}) {
  const map = siteMap ? normalizeSiteMap(siteMap) : null;
  const planFor = (id) => (plansByFloor instanceof Map ? plansByFloor.get(id) : plansByFloor?.[id]);

  const features = (map?.features || []).map((feature) => {
    const def = SITE_FEATURE_KINDS[feature.kind];
    return {
      id: feature.id,
      kind: feature.kind,
      geometry: def.geometry,
      color: def.color,
      label: feature.label || def.label,
      kindLabel: def.label,
      notes: feature.notes,
      latLngs: feature.points.map((p) => [p.lat, p.lng]),
    };
  });

  const alignedFloorIds = Object.entries(map?.alignments || {})
    .filter(([id, alignment]) => alignment.status === "verified" && planFor(id))
    .map(([id]) => id);
  const unconfirmedFloorIds = Object.entries(map?.alignments || {})
    .filter(([, alignment]) => alignment.status !== "verified")
    .map(([id]) => id);

  const overlayAlignment = alignedFloorIds.includes(floorId) ? map.alignments[floorId] : null;
  const floorShapes = overlayAlignment ? projectFloorPlan(planFor(floorId), overlayAlignment) : [];

  // Alerts placed on an object of the shown floor get a pin where that object is.
  const shapeById = new Map(floorShapes.map((shape) => [shape.id, shape]));
  const alertPins = alerts
    .filter((alert) => alert.floorId === floorId && alert.objectId && shapeById.has(alert.objectId))
    .map((alert) => ({ id: alert.id, alert, at: centroid(shapeById.get(alert.objectId).latLngs) }))
    .filter((pin) => pin.at);

  const site = preplanLatLng(preplan);
  const siteCenter = site
    || centroid(features.flatMap((row) => row.latLngs))
    || (map?.view ? [map.view.center.lat, map.view.center.lng] : null);

  const linkedIds = new Set((preplan.hydrantIds || []).map(String));
  const hydrantMarkers = [];
  for (const row of hydrants) {
    const at = hydrantLatLng(row);
    if (!at) continue;
    const linked = linkedIds.has(String(row.id)) || linkedIds.has(String(row.hydrant_id));
    const meters = siteCenter ? distanceMeters(siteCenter, at) : null;
    if (!linked && (meters == null || meters > NEARBY_HYDRANT_METERS)) continue;
    const status = String(row.status || "").trim();
    hydrantMarkers.push({
      id: String(row.id || row.hydrant_id),
      label: String(row.official_hydrant_id || row.hydrant_id || row.id || "Hydrant"),
      at,
      linked,
      outOfService: Boolean(status) && !/in service|active/i.test(status),
      flowGpm: row.flow_gpm != null && row.flow_gpm !== "" ? Number(row.flow_gpm) : null,
      meters: meters == null ? null : Math.round(meters),
    });
  }
  hydrantMarkers.sort((a, b) => Number(b.linked) - Number(a.linked) || (a.meters ?? 1e9) - (b.meters ?? 1e9));

  const fitPoints = [
    ...features.flatMap((row) => row.latLngs),
    ...floorShapes.flatMap((row) => row.latLngs),
    ...hydrantMarkers.filter((row) => row.linked).map((row) => row.at),
    ...(site ? [site] : []),
  ];

  return {
    basemap: map?.basemap || "imagery",
    view: map?.view || null,
    site,
    features,
    floorShapes,
    alertPins,
    hydrants: hydrantMarkers,
    alignedFloorIds,
    unconfirmedFloorIds,
    fitPoints,
    hasContent: Boolean(features.length || floorShapes.length || hydrantMarkers.length || site),
  };
}
