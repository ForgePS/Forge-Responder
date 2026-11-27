/**
 * Structured floor plan model for interactive preplans (pure functions, no Firestore).
 *
 * One floor plan = one floor of one building in one preplan revision. The
 * authoritative representation is the `objects` array, never a picture: every
 * wall, room, door and symbol is an object with a persistent id.
 *
 * Coordinates are floor-local. Until the scale is calibrated they are source
 * pixels (`units: "px"`); after calibration `scale.pxPerUnit` converts pixels
 * to feet or meters. Geographic placement lives in georeference.js.
 */
import { findSymbol } from "./symbolCatalog.js";

export const FLOOR_PLAN_SCHEMA_VERSION = 1;

/** Limits keep one floor inside a single Firestore document (1 MiB). */
export const MAX_OBJECTS_PER_FLOOR = 2500;
export const MAX_POINTS_PER_OBJECT = 400;
export const MAX_COORDINATE = 1_000_000;

export const OBJECT_TYPES = Object.freeze({
  exterior_wall: { label: "Exterior wall", geometry: "polyline", layer: "structure" },
  interior_wall: { label: "Interior wall", geometry: "polyline", layer: "structure" },
  room: { label: "Room", geometry: "polygon", layer: "rooms" },
  corridor: { label: "Corridor", geometry: "polygon", layer: "rooms" },
  stairwell: { label: "Stairwell", geometry: "polygon", layer: "rooms" },
  elevator: { label: "Elevator", geometry: "polygon", layer: "rooms" },
  door: { label: "Door", geometry: "line", layer: "openings" },
  window: { label: "Window", geometry: "line", layer: "openings" },
  column: { label: "Column", geometry: "rect", layer: "structure" },
  roof_feature: { label: "Roof feature", geometry: "polygon", layer: "structure" },
  line: { label: "Line", geometry: "polyline", layer: "annotations" },
  area: { label: "Area", geometry: "polygon", layer: "annotations" },
  text: { label: "Text", geometry: "point", layer: "annotations" },
  dimension: { label: "Dimension", geometry: "line", layer: "annotations" },
  symbol: { label: "Symbol", geometry: "point", layer: "symbols" },
});

export const DEFAULT_LAYERS = Object.freeze([
  { id: "background", label: "Source drawing", visible: true, locked: true },
  { id: "structure", label: "Walls & structure", visible: true, locked: false },
  { id: "rooms", label: "Rooms & spaces", visible: true, locked: false },
  { id: "openings", label: "Doors & windows", visible: true, locked: false },
  { id: "symbols", label: "Fire service symbols", visible: true, locked: false },
  { id: "annotations", label: "Notes & dimensions", visible: true, locked: false },
]);

/** pending = proposed (e.g. by SmartPlan) and not yet accepted. */
export const VERIFICATION_STATUSES = Object.freeze(["unverified", "pending", "verified", "rejected"]);
export const SOURCE_KINDS = Object.freeze(["manual", "smartplan_ai", "smartplan_lines", "vector_import", "field_survey", "inspection"]);

export const FLOOR_KINDS = Object.freeze([
  { id: "basement", label: "Basement" },
  { id: "ground", label: "Ground floor" },
  { id: "upper", label: "Upper floor" },
  { id: "mezzanine", label: "Mezzanine" },
  { id: "roof", label: "Roof" },
  { id: "site", label: "Site plan" },
]);

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function finitePoint(point) {
  // Stored form is {x, y} (Firestore can't hold arrays inside arrays); in memory it's [x, y].
  const pair = Array.isArray(point) ? point : (point && typeof point === "object" ? [point.x, point.y] : null);
  if (!pair || pair.length < 2) return null;
  const x = Number(pair[0]);
  const y = Number(pair[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (Math.abs(x) > MAX_COORDINATE || Math.abs(y) > MAX_COORDINATE) return null;
  return [round(x), round(y)];
}

/** Random id; the "o-" prefix keeps ids valid as Firestore map keys and DOM ids. */
export function newObjectId() {
  const random = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  return `o-${random}`;
}

/**
 * Geometry check. Returns an error message, or "" when valid.
 * @param {string} kind point | line | polyline | polygon | rect
 * @param {number[][]} points
 */
export function geometryError(kind, rawPoints) {
  if (!Array.isArray(rawPoints)) return "Geometry has no points.";
  const points = rawPoints.map((point) => finitePoint(point) || point);
  if (points.length > MAX_POINTS_PER_OBJECT) return `Geometry has more than ${MAX_POINTS_PER_OBJECT} points.`;
  if (points.some((point) => !finitePoint(point))) return "Geometry has an invalid coordinate.";
  if (kind === "point") return points.length === 1 ? "" : "A point needs exactly one coordinate.";
  if (kind === "line") {
    if (points.length !== 2) return "A line needs exactly two points.";
    return samePoint(points[0], points[1]) ? "A line needs two different points." : "";
  }
  if (kind === "polyline") return points.length >= 2 ? "" : "A wall or line needs at least two points.";
  if (kind === "rect") {
    if (points.length !== 2) return "A rectangle needs two corners.";
    const [a, b] = points;
    return Number(a[0]) === Number(b[0]) || Number(a[1]) === Number(b[1]) ? "A rectangle needs width and height." : "";
  }
  if (kind === "polygon") {
    if (points.length < 3) return "An area needs at least three points.";
    return Math.abs(polygonArea(points)) < 0.01 ? "An area can't have zero size." : "";
  }
  return `Unknown geometry type "${kind}".`;
}

function samePoint(a, b) {
  return Number(a[0]) === Number(b[0]) && Number(a[1]) === Number(b[1]);
}

/** Shoelace area (signed). */
export function polygonArea(points = []) {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += Number(x1) * Number(y2) - Number(x2) * Number(y1);
  }
  return sum / 2;
}

export function polylineLength(points = []) {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return total;
}

export function boundsOf(points = []) {
  if (!points.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

export function centroidOf(points = []) {
  const box = boundsOf(points);
  if (!box) return [0, 0];
  return [round((box.minX + box.maxX) / 2), round((box.minY + box.maxY) / 2)];
}

function cleanProperties(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, value] of Object.entries(raw).slice(0, 40)) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,40}$/.test(key)) continue;
    if (value == null) continue;
    if (typeof value === "string") out[key] = value.slice(0, 2000);
    else if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
  }
  return out;
}

function cleanIdList(raw, max = 50) {
  return Array.isArray(raw) ? [...new Set(raw.map(String).filter(Boolean))].slice(0, max) : [];
}

/**
 * Normalize one object. Returns null for anything that can't be made valid
 * (unknown type, bad geometry) so bad input never reaches storage.
 */
export function normalizeFloorObject(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const typeDef = OBJECT_TYPES[data.type];
  if (!typeDef) return null;
  const kind = typeDef.geometry;
  const points = (Array.isArray(data.geometry?.points) ? data.geometry.points : []).map(finitePoint);
  if (points.some((point) => !point)) return null;
  if (geometryError(kind, points)) return null;
  const verificationStatus = VERIFICATION_STATUSES.includes(data.verificationStatus) ? data.verificationStatus : "unverified";
  const sourceKind = SOURCE_KINDS.includes(data.source?.kind) ? data.source.kind : "manual";
  const rotation = Number.isFinite(Number(data.rotation)) ? ((Number(data.rotation) % 360) + 360) % 360 : 0;
  const scale = Number.isFinite(Number(data.scale)) && Number(data.scale) > 0 ? Math.min(Number(data.scale), 20) : 1;
  return {
    id: String(data.id || newObjectId()).slice(0, 80),
    type: data.type,
    symbolId: data.type === "symbol" ? String(data.symbolId || "unknown").slice(0, 48) : "",
    name: String(data.name || "").slice(0, 120),
    description: String(data.description || "").slice(0, 2000),
    layer: String(data.layer || typeDef.layer).slice(0, 40),
    geometry: { kind, points },
    rotation: round(rotation),
    scale: round(scale),
    locked: Boolean(data.locked),
    groupId: data.groupId ? String(data.groupId).slice(0, 80) : "",
    properties: cleanProperties(data.properties),
    mediaFileIds: cleanIdList(data.mediaFileIds),
    linkedInspectionIds: cleanIdList(data.linkedInspectionIds),
    linkedSystemIds: cleanIdList(data.linkedSystemIds),
    linkedHydrantIds: cleanIdList(data.linkedHydrantIds),
    verificationStatus,
    verifiedBy: verificationStatus === "verified" ? String(data.verifiedBy || "") : "",
    verifiedAt: verificationStatus === "verified" ? String(data.verifiedAt || "") : "",
    source: {
      kind: sourceKind,
      uploadId: String(data.source?.uploadId || ""),
      jobId: String(data.source?.jobId || ""),
      reference: String(data.source?.reference || "").slice(0, 200),
      confidence: data.source?.confidence === "unknown" || data.source?.confidence == null
        ? "unknown"
        : String(data.source.confidence).slice(0, 20),
    },
    createdAt: String(data.createdAt || ""),
    createdBy: String(data.createdBy || ""),
    updatedAt: String(data.updatedAt || ""),
  };
}

function cleanLayers(raw) {
  const base = DEFAULT_LAYERS.map((row) => ({ ...row }));
  if (!Array.isArray(raw)) return base;
  const byId = new Map(base.map((row) => [row.id, row]));
  for (const row of raw) {
    const id = String(row?.id || "").slice(0, 40);
    if (!id) continue;
    const existing = byId.get(id);
    const next = {
      id,
      label: String(row.label || existing?.label || id).slice(0, 60),
      visible: row.visible !== false,
      locked: Boolean(row.locked ?? existing?.locked),
    };
    if (existing) Object.assign(existing, next);
    else { base.push(next); byId.set(id, next); }
  }
  return base;
}

/**
 * Normalize a floor plan document.
 * @param {object} raw
 */
export function normalizeFloorPlan(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const objects = [];
  const seen = new Set();
  for (const row of Array.isArray(data.objects) ? data.objects : []) {
    const object = normalizeFloorObject(row);
    if (!object || seen.has(object.id)) continue;
    seen.add(object.id);
    objects.push(object);
    if (objects.length >= MAX_OBJECTS_PER_FLOOR) break;
  }
  const pxPerUnit = Number(data.scale?.pxPerUnit);
  const calibrated = data.scale?.status === "calibrated" && Number.isFinite(pxPerUnit) && pxPerUnit > 0;
  return {
    id: String(data.id || ""),
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    preplanId: String(data.preplanId || ""),
    revisionId: String(data.revisionId || ""),
    buildingId: String(data.buildingId || ""),
    floorId: String(data.floorId || ""),
    coordinateSpace: "floor_local",
    scale: calibrated
      ? { status: "calibrated", units: data.scale.units === "m" ? "m" : "ft", pxPerUnit }
      : { status: "unverified", units: null, pxPerUnit: null },
    canvas: {
      width: Math.max(100, Math.min(Number(data.canvas?.width) || 1600, 20000)),
      height: Math.max(100, Math.min(Number(data.canvas?.height) || 1000, 20000)),
      gridSize: Math.max(2, Math.min(Number(data.canvas?.gridSize) || 20, 500)),
    },
    background: data.background?.fileId
      ? {
          fileId: String(data.background.fileId),
          storagePath: String(data.background.storagePath || ""),
          width: Number(data.background.width) || 0,
          height: Number(data.background.height) || 0,
          opacity: Math.max(0, Math.min(Number(data.background.opacity ?? 0.5), 1)),
        }
      : null,
    layers: cleanLayers(data.layers),
    objects,
    version: Number(data.version) || 0,
    updatedAt: String(data.updatedAt || ""),
    updatedBy: String(data.updatedBy || ""),
  };
}

/**
 * Firestore form of a normalized plan: points become {x, y} maps because
 * Firestore rejects nested arrays. normalizeFloorPlan reads both forms back.
 */
export function floorPlanToStorage(plan) {
  return {
    ...plan,
    objects: plan.objects.map((object) => ({
      ...object,
      geometry: { kind: object.geometry.kind, points: object.geometry.points.map(([x, y]) => ({ x, y })) },
    })),
  };
}

/** Deterministic doc id: one floor plan per (revision, floor). */
export function floorPlanDocId(revisionId, floorId) {
  return `${revisionId}__${floorId}`;
}

/** Real-world length of a pixel distance, or null when the scale isn't calibrated. */
export function toRealUnits(plan, pixels) {
  if (plan?.scale?.status !== "calibrated") return null;
  return pixels / plan.scale.pxPerUnit;
}

/**
 * Calibrate from two points the user says are `realLength` apart.
 * @returns {{status:"calibrated", units:string, pxPerUnit:number}}
 */
export function calibrateScale(pointA, pointB, realLength, units = "ft") {
  const pixels = Math.hypot(pointB[0] - pointA[0], pointB[1] - pointA[1]);
  const length = Number(realLength);
  if (!(pixels > 0)) throw new Error("Pick two different points to set the scale.");
  if (!(length > 0)) throw new Error("Enter the real distance between the two points.");
  return { status: "calibrated", units: units === "m" ? "m" : "ft", pxPerUnit: pixels / length };
}

/** Human-readable measurement for an object (area or length), in real units when calibrated. */
export function describeMeasurement(plan, object) {
  const points = object?.geometry?.points || [];
  const kind = object?.geometry?.kind;
  const units = plan?.scale?.status === "calibrated" ? plan.scale.units : "px";
  if (kind === "polygon") {
    const px = Math.abs(polygonArea(points));
    const real = plan?.scale?.status === "calibrated" ? px / (plan.scale.pxPerUnit ** 2) : px;
    return `${Math.round(real).toLocaleString()} sq ${units}`;
  }
  if (kind === "rect" && points.length === 2) {
    const w = Math.abs(points[1][0] - points[0][0]);
    const h = Math.abs(points[1][1] - points[0][1]);
    const factor = plan?.scale?.status === "calibrated" ? plan.scale.pxPerUnit : 1;
    return `${round(w / factor)} × ${round(h / factor)} ${units}`;
  }
  if (kind === "line" || kind === "polyline") {
    const px = polylineLength(points);
    const real = plan?.scale?.status === "calibrated" ? px / plan.scale.pxPerUnit : px;
    return `${round(real)} ${units}`;
  }
  return "";
}

// ---------------------------------------------------------------- editing ops

export function snapValue(value, grid) {
  return grid > 0 ? Math.round(value / grid) * grid : value;
}

export function snapPoint(point, grid) {
  return [snapValue(point[0], grid), snapValue(point[1], grid)];
}

/** Snap to the nearest existing vertex within `tolerance`, else to the grid. */
export function snapToObjects(point, objects = [], tolerance = 8, grid = 0) {
  let best = null;
  let bestDistance = tolerance;
  for (const object of objects) {
    for (const vertex of object.geometry?.points || []) {
      const distance = Math.hypot(vertex[0] - point[0], vertex[1] - point[1]);
      if (distance <= bestDistance) { best = vertex; bestDistance = distance; }
    }
  }
  if (best) return [best[0], best[1]];
  return grid ? snapPoint(point, grid) : point;
}

function stamp(object, actor) {
  return { ...object, updatedAt: new Date().toISOString(), ...(actor ? { updatedBy: actor } : {}) };
}

function isEditable(plan, object) {
  if (!object || object.locked) return false;
  const layer = plan.layers.find((row) => row.id === object.layer);
  return !layer?.locked;
}

/** Add an object; returns the new plan (or throws a readable error). */
export function addObject(plan, raw, actor = "") {
  if (plan.objects.length >= MAX_OBJECTS_PER_FLOOR) {
    throw new Error(`A floor can hold up to ${MAX_OBJECTS_PER_FLOOR} objects. Split it into another floor plan.`);
  }
  const now = new Date().toISOString();
  const object = normalizeFloorObject({ createdAt: now, createdBy: actor, ...raw, updatedAt: now });
  if (!object) {
    const typeDef = OBJECT_TYPES[raw?.type];
    throw new Error(typeDef ? geometryError(typeDef.geometry, raw?.geometry?.points) || "That shape isn't valid." : "Unknown object type.");
  }
  if (plan.objects.some((row) => row.id === object.id)) object.id = newObjectId();
  return { ...plan, objects: [...plan.objects, object] };
}

/** Types an object of this type can be changed to: the same shape, never text or symbols. */
export function typesLike(type) {
  const geometry = OBJECT_TYPES[type]?.geometry;
  if (!geometry || geometry === "point") return [];
  return Object.keys(OBJECT_TYPES).filter((key) => OBJECT_TYPES[key].geometry === geometry);
}

/**
 * Change the type of objects that have the same shape (a detected line to a
 * wall, an area to a room). Objects still on the old type's own layer move to
 * the new type's. Locked or differently shaped objects are left alone.
 */
export function retypeObjects(plan, ids, type, actor = "") {
  const typeDef = OBJECT_TYPES[type];
  if (!typeDef) return plan;
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  let changed = false;
  const objects = plan.objects.map((object) => {
    if (!idSet.has(object.id) || object.type === type || !isEditable(plan, object)) return object;
    if (!typesLike(object.type).includes(type)) return object;
    const layer = object.layer === OBJECT_TYPES[object.type].layer ? typeDef.layer : object.layer;
    const next = normalizeFloorObject(stamp({ ...object, type, layer }, actor));
    if (!next) return object;
    changed = true;
    return next;
  });
  return changed ? { ...plan, objects } : plan;
}

/** Patch objects by id. Locked objects and locked layers are skipped. */
export function updateObjects(plan, ids, patchOrFn, actor = "") {
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  let changed = false;
  const objects = plan.objects.map((object) => {
    if (!idSet.has(object.id)) return object;
    const patch = typeof patchOrFn === "function" ? patchOrFn(object) : patchOrFn;
    // Unlocking is the one edit allowed on a locked object.
    if (!isEditable(plan, object) && !(object.locked && patch && Object.keys(patch).length === 1 && patch.locked === false)) {
      return object;
    }
    const next = normalizeFloorObject(stamp({ ...object, ...patch, id: object.id, type: object.type }, actor));
    if (!next) return object;
    changed = true;
    return next;
  });
  return changed ? { ...plan, objects } : plan;
}

export function moveObjects(plan, ids, dx, dy) {
  return updateObjects(plan, ids, (object) => ({
    geometry: { kind: object.geometry.kind, points: object.geometry.points.map(([x, y]) => [x + dx, y + dy]) },
  }));
}

/** Rotate geometry about its own center (point symbols rotate via `rotation`). */
export function rotateObjects(plan, ids, degrees) {
  return updateObjects(plan, ids, (object) => {
    if (object.geometry.kind === "point" || object.geometry.kind === "rect") {
      return { rotation: object.rotation + degrees };
    }
    const [cx, cy] = centroidOf(object.geometry.points);
    const rad = (degrees * Math.PI) / 180;
    const cos = Math.cos(rad); const sin = Math.sin(rad);
    return {
      geometry: {
        kind: object.geometry.kind,
        points: object.geometry.points.map(([x, y]) => [
          cx + (x - cx) * cos - (y - cy) * sin,
          cy + (x - cx) * sin + (y - cy) * cos,
        ]),
      },
    };
  });
}

export function scaleObjects(plan, ids, factor) {
  if (!(factor > 0)) return plan;
  return updateObjects(plan, ids, (object) => {
    if (object.geometry.kind === "point") return { scale: object.scale * factor };
    const [cx, cy] = centroidOf(object.geometry.points);
    return {
      geometry: {
        kind: object.geometry.kind,
        points: object.geometry.points.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]),
      },
    };
  });
}

export function deleteObjects(plan, ids) {
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  const objects = plan.objects.filter((object) => !idSet.has(object.id) || !isEditable(plan, object));
  return objects.length === plan.objects.length ? plan : { ...plan, objects };
}

/** Copies with new ids, offset so they don't sit on top of the originals. */
export function duplicateObjects(plan, ids, offset = 20, actor = "") {
  const idSet = new Set(Array.isArray(ids) ? ids : [ids]);
  const groupMap = new Map();
  let next = plan;
  const newIds = [];
  for (const object of plan.objects.filter((row) => idSet.has(row.id))) {
    const groupId = object.groupId ? (groupMap.get(object.groupId) || groupMap.set(object.groupId, newObjectId()).get(object.groupId)) : "";
    const id = newObjectId();
    next = addObject(next, {
      ...object,
      id,
      groupId,
      locked: false,
      verificationStatus: "unverified",
      source: { kind: "manual" },
      geometry: { kind: object.geometry.kind, points: object.geometry.points.map(([x, y]) => [x + offset, y + offset]) },
    }, actor);
    newIds.push(id);
  }
  return { plan: next, ids: newIds };
}

export function groupObjects(plan, ids) {
  const groupId = newObjectId();
  return { plan: updateObjects(plan, ids, { groupId }), groupId };
}

export function ungroupObjects(plan, ids) {
  return updateObjects(plan, ids, { groupId: "" });
}

/** Expand a selection to whole groups. */
export function expandSelectionToGroups(plan, ids = []) {
  const groups = new Set(plan.objects.filter((row) => ids.includes(row.id) && row.groupId).map((row) => row.groupId));
  if (!groups.size) return ids;
  return [...new Set([...ids, ...plan.objects.filter((row) => groups.has(row.groupId)).map((row) => row.id)])];
}

/** Align selected objects' bounding boxes to the selection's left/right/top/bottom/center. */
export function alignObjects(plan, ids, edge) {
  const selected = plan.objects.filter((row) => ids.includes(row.id));
  if (selected.length < 2) return plan;
  const all = boundsOf(selected.flatMap((row) => row.geometry.points));
  let next = plan;
  for (const object of selected) {
    const box = boundsOf(object.geometry.points);
    let dx = 0; let dy = 0;
    if (edge === "left") dx = all.minX - box.minX;
    if (edge === "right") dx = all.maxX - box.maxX;
    if (edge === "top") dy = all.minY - box.minY;
    if (edge === "bottom") dy = all.maxY - box.maxY;
    if (edge === "centerX") dx = (all.minX + all.maxX) / 2 - (box.minX + box.maxX) / 2;
    if (edge === "centerY") dy = (all.minY + all.maxY) / 2 - (box.minY + box.maxY) / 2;
    if (dx || dy) next = moveObjects(next, [object.id], dx, dy);
  }
  return next;
}

export function setLayer(plan, layerId, patch) {
  return { ...plan, layers: plan.layers.map((row) => (row.id === layerId ? { ...row, ...patch } : row)) };
}

/** Mark objects verified (the actor confirmed them in the field or against the source). */
export function verifyObjects(plan, ids, actor, at = new Date().toISOString()) {
  return updateObjects(plan, ids, { verificationStatus: "verified", verifiedBy: actor, verifiedAt: at }, actor);
}

// ---------------------------------------------------------------- history

/** Undo/redo stack of plan snapshots (plans are immutable values, so snapshots are cheap). */
export function createHistory(plan, limit = 100) {
  return { past: [], present: plan, future: [], limit };
}

export function pushHistory(history, plan) {
  if (plan === history.present) return history;
  const past = [...history.past, history.present].slice(-history.limit);
  return { ...history, past, present: plan, future: [] };
}

export function undo(history) {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return { ...history, past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history) {
  if (!history.future.length) return history;
  const [next, ...rest] = history.future;
  return { ...history, past: [...history.past, history.present], present: next, future: rest };
}

// ---------------------------------------------------------------- publication

/**
 * What blocks publishing this floor plan. Pending (proposed, not accepted)
 * objects always block; critical symbols must be verified.
 * @param {object} plan
 * @param {object[]} [catalog] symbol catalog (custom symbols may be critical)
 * @returns {{ok:boolean, problems:string[]}}
 */
export function validateForPublication(plan, catalog) {
  const problems = [];
  const pending = plan.objects.filter((row) => row.verificationStatus === "pending");
  if (pending.length) {
    problems.push(`${pending.length} proposed object${pending.length === 1 ? "" : "s"} from a conversion still need accepting or rejecting.`);
  }
  const criticalUnverified = plan.objects.filter((row) => (
    row.type === "symbol"
    && findSymbol(row.symbolId, catalog).critical
    && row.verificationStatus !== "verified"
  ));
  if (criticalUnverified.length) {
    const names = [...new Set(criticalUnverified.map((row) => findSymbol(row.symbolId, catalog).label))].slice(0, 5);
    problems.push(`Critical features not verified: ${names.join(", ")}${criticalUnverified.length > names.length ? "…" : ""}.`);
  }
  return { ok: problems.length === 0, problems };
}

/** Rejected proposals are dropped when a plan is carried into a new revision or published. */
export function withoutRejected(plan) {
  return { ...plan, objects: plan.objects.filter((row) => row.verificationStatus !== "rejected") };
}

/** Counts used by dashboards and the response view. */
export function summarizeFloorPlan(plan) {
  const counts = { total: plan.objects.length, rooms: 0, walls: 0, symbols: 0, verified: 0, pending: 0 };
  for (const row of plan.objects) {
    if (row.type === "room" || row.type === "corridor") counts.rooms += 1;
    if (row.type === "exterior_wall" || row.type === "interior_wall") counts.walls += 1;
    if (row.type === "symbol") counts.symbols += 1;
    if (row.verificationStatus === "verified") counts.verified += 1;
    if (row.verificationStatus === "pending") counts.pending += 1;
  }
  return counts;
}
