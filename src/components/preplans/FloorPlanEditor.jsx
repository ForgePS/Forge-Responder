import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyStart,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Group,
  Hand,
  Lock,
  LockOpen,
  Maximize2,
  MousePointer2,
  Redo2,
  RotateCw,
  Ruler,
  Search,
  Trash2,
  Undo2,
  Ungroup,
  XCircle,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  OBJECT_TYPES,
  addObject,
  alignObjects,
  boundsOf,
  calibrateScale,
  centroidOf,
  createHistory,
  deleteObjects,
  describeMeasurement,
  duplicateObjects,
  expandSelectionToGroups,
  groupObjects,
  moveObjects,
  newObjectId,
  pushHistory,
  redo,
  retypeObjects,
  rotateObjects,
  scaleObjects,
  setLayer,
  snapToObjects,
  summarizeFloorPlan,
  typesLike,
  undo,
  ungroupObjects,
  updateObjects,
  verifyObjects,
} from "../../lib/preplans/floorPlanModel.js";
import { SYMBOL_CATEGORIES, findSymbol, searchSymbols } from "../../lib/preplans/symbolCatalog.js";
import SymbolGlyph, { SymbolShape } from "./SymbolGlyph.jsx";
import "../../theme/preplan-editor.css";

/** Drawing tools shown in the palette, in order. */
const DRAW_TOOLS = [
  { id: "exterior_wall", key: "W", hint: "Click points, double-click to finish" },
  { id: "interior_wall", key: "I", hint: "Click points, double-click to finish" },
  { id: "room", key: "R", hint: "Click corners, double-click or click the first point to close" },
  { id: "corridor", hint: "Click corners, double-click to close" },
  { id: "stairwell", hint: "Click corners, double-click to close" },
  { id: "elevator", hint: "Click corners, double-click to close" },
  { id: "door", key: "D", hint: "Drag across the opening" },
  { id: "window", hint: "Drag across the opening" },
  { id: "column", hint: "Drag a box" },
  { id: "roof_feature", hint: "Click corners, double-click to close" },
  { id: "line", key: "L", hint: "Click points, double-click to finish" },
  { id: "area", hint: "Click corners, double-click to close" },
  { id: "dimension", hint: "Drag between two points" },
  { id: "text", key: "T", hint: "Click where the label goes" },
];

const KEY_TOOLS = Object.fromEntries(DRAW_TOOLS.filter((row) => row.key).map((row) => [row.key.toLowerCase(), row.id]));
const RECENT_KEY = "forge-preplan-recent-symbols";
const FAVORITES_KEY = "forge-preplan-favorite-symbols";
const AUTOSAVE_MS = 1500;

function readStoredList(key) {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value.map(String).slice(0, 24) : [];
  } catch {
    return [];
  }
}

function writeStoredList(key, list) {
  try { window.localStorage.setItem(key, JSON.stringify(list.slice(0, 24))); } catch { /* storage unavailable */ }
}

function geometryKind(tool) {
  return OBJECT_TYPES[tool]?.geometry || "";
}

function pointsToPath(points, close) {
  if (!points.length) return "";
  return `M ${points.map(([x, y]) => `${x} ${y}`).join(" L ")}${close ? " Z" : ""}`;
}

function objectClass(object, selected) {
  return [
    "fpe-object",
    `fpe-${object.type}`,
    selected ? "is-selected" : "",
    object.verificationStatus === "pending" ? "is-pending" : "",
    object.verificationStatus === "rejected" ? "is-rejected" : "",
    object.verificationStatus === "verified" ? "is-verified" : "",
  ].filter(Boolean).join(" ");
}

/** One object on the canvas. Thin shapes get a wide invisible hit area for touch. */
function CanvasObject({ object, selected, plan, catalog, onPointerDown, k = 1 }) {
  // k = floor units per screen pixel: symbols and labels keep a constant on-screen size.
  const labelStyle = { fontSize: 13 * k, strokeWidth: 3 * k };
  const points = object.geometry.points;
  const handler = (event) => onPointerDown(event, object);
  const className = objectClass(object, selected);
  const label = object.name;
  if (object.type === "symbol") {
    const symbol = findSymbol(object.symbolId, catalog);
    const [x, y] = points[0];
    return (
      <g className={className} transform={`translate(${x} ${y}) rotate(${object.rotation}) scale(${object.scale * k})`} onPointerDown={handler} data-id={object.id}>
        <circle r={22} className="fpe-hit" />
        <SymbolShape symbol={symbol} size={28} selected={selected} muted={object.verificationStatus === "rejected"} />
        {label ? <text y={26} textAnchor="middle" className="fpe-label" style={{ fontSize: 13, strokeWidth: 3 }}>{label}</text> : null}
      </g>
    );
  }
  if (object.type === "text") {
    const [x, y] = points[0];
    return (
      <g className={className} transform={`translate(${x} ${y}) rotate(${object.rotation}) scale(${object.scale * k})`} onPointerDown={handler} data-id={object.id}>
        <rect x={-4} y={-16} width={Math.max(30, (label || "Text").length * 8.5) + 8} height={22} className="fpe-hit" />
        <text className="fpe-text">{label || "Text"}</text>
      </g>
    );
  }
  if (object.geometry.kind === "rect") {
    const [[x1, y1], [x2, y2]] = points;
    const x = Math.min(x1, x2); const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1); const h = Math.abs(y2 - y1);
    return (
      <g className={className} onPointerDown={handler} data-id={object.id} transform={`rotate(${object.rotation} ${x + w / 2} ${y + h / 2})`}>
        <rect x={x} y={y} width={w} height={h} className="fpe-shape" />
      </g>
    );
  }
  if (object.geometry.kind === "polygon") {
    const [cx, cy] = centroidOf(points);
    return (
      <g className={className} onPointerDown={handler} data-id={object.id}>
        <path d={pointsToPath(points, true)} className="fpe-shape" />
        {label ? <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" className="fpe-label fpe-room-label" style={{ fontSize: 15 * k, strokeWidth: 3 * k }}>{label}</text> : null}
      </g>
    );
  }
  // line / polyline
  const d = pointsToPath(points, false);
  const [a, b] = points;
  return (
    <g className={className} onPointerDown={handler} data-id={object.id}>
      <path d={d} className="fpe-hit-line" />
      <path d={d} className="fpe-shape" />
      {object.type === "door" && b ? (
        <path
          className="fpe-door-swing"
          d={`M ${a[0]} ${a[1]} m 0 0 A ${Math.hypot(b[0] - a[0], b[1] - a[1])} ${Math.hypot(b[0] - a[0], b[1] - a[1])} 0 0 1 ${a[0] - (b[1] - a[1])} ${a[1] + (b[0] - a[0])}`}
        />
      ) : null}
      {object.type === "dimension" && b ? (
        <text x={(a[0] + b[0]) / 2} y={(a[1] + b[1]) / 2 - 6 * k} textAnchor="middle" className="fpe-label" style={labelStyle}>
          {describeMeasurement(plan, object)}
        </text>
      ) : null}
    </g>
  );
}

function PropertyInput({ label, value, onChange, disabled, multiline = false }) {
  return (
    <label className="fpe-field">
      <span>{label}</span>
      {multiline ? (
        <textarea rows={3} value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value ?? ""} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      )}
    </label>
  );
}

function prettyKey(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

/**
 * Interactive floor plan editor.
 *
 * @param {{
 *   plan: object,                 normalized floor plan
 *   catalog: object[],            symbol catalog (starter + custom)
 *   readOnly?: boolean,
 *   actorUid?: string,
 *   backgroundUrl?: string,       authorized URL of the source drawing
 *   onSave?: (plan:object) => Promise<object>,  persists, resolves with the stored plan (new version)
 *   onAttachMedia?: (objectId:string) => void,
 *   mediaByObject?: Record<string, object[]>,
 *   extraPanel?: import("react").ReactNode,
 *   onSelectionChange?: (objects:object[]) => void,
 * }} props
 */
export default function FloorPlanEditor({
  plan: initialPlan,
  catalog,
  readOnly = false,
  actorUid = "",
  backgroundUrl = "",
  onSave,
  onAttachMedia,
  mediaByObject = {},
  extraPanel = null,
  onSelectionChange,
}) {
  const [history, setHistory] = useState(() => createHistory(initialPlan));
  const plan = history.present;
  const [tool, setTool] = useState("select");
  const [selection, setSelection] = useState([]);
  const [draft, setDraft] = useState([]);
  const [hover, setHover] = useState(null);
  const [view, setView] = useState(() => ({ x: 0, y: 0, w: initialPlan.canvas.width, h: initialPlan.canvas.height }));
  const [snap, setSnap] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [recent, setRecent] = useState(() => readStoredList(RECENT_KEY));
  const [favorites, setFavorites] = useState(() => readStoredList(FAVORITES_KEY));
  const [saveState, setSaveState] = useState("saved");
  const [saveError, setSaveError] = useState("");
  const [calibration, setCalibration] = useState(null);
  const [preview, setPreview] = useState(null);
  const svgRef = useRef(null);
  const dragRef = useRef(null);
  const clipboardRef = useRef([]);
  const savedPlanRef = useRef(initialPlan);
  const containerRef = useRef(null);
  const [svgSize, setSvgSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSvgSize({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  // A different floor / revision was opened: start fresh.
  useEffect(() => {
    setHistory(createHistory(initialPlan));
    savedPlanRef.current = initialPlan;
    setSelection([]);
    setDraft([]);
    setSaveState("saved");
    setSaveError("");
    setView({ x: 0, y: 0, w: initialPlan.canvas.width, h: initialPlan.canvas.height });
  }, [initialPlan.id, initialPlan.revisionId, initialPlan.floorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = preview || plan;
  // Floor units per screen pixel (viewBox uses "meet", so the larger ratio wins).
  const k = Math.max(view.w / svgSize.width, view.h / svgSize.height) || 1;
  const layerById = useMemo(() => new Map(shown.layers.map((row) => [row.id, row])), [shown.layers]);
  const visibleObjects = useMemo(
    () => shown.objects.filter((row) => layerById.get(row.layer)?.visible !== false),
    [shown.objects, layerById],
  );
  const selectedObjects = useMemo(() => plan.objects.filter((row) => selection.includes(row.id)), [plan.objects, selection]);
  const summary = useMemo(() => summarizeFloorPlan(plan), [plan]);
  const single = selectedObjects.length === 1 ? selectedObjects[0] : null;

  useEffect(() => { onSelectionChange?.(selectedObjects); }, [selectedObjects]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = useCallback((next) => {
    if (readOnly || next === plan) return;
    setHistory((current) => pushHistory(current, next));
    setSaveState("dirty");
  }, [plan, readOnly]);

  // ---- autosave
  useEffect(() => {
    if (readOnly || !onSave || saveState !== "dirty") return undefined;
    const timer = window.setTimeout(async () => {
      setSaveState("saving");
      try {
        const stored = await onSave(plan);
        savedPlanRef.current = stored;
        // Keep the user's in-memory edits; only carry the new version forward.
        setHistory((current) => ({ ...current, present: { ...current.present, version: stored.version } }));
        setSaveState((state) => (state === "saving" ? "saved" : state));
        setSaveError("");
      } catch (error) {
        setSaveState(error?.code === "floor-plan-conflict" ? "conflict" : "error");
        setSaveError(error?.message || "Couldn't save the floor plan.");
      }
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [plan, saveState, onSave, readOnly]);

  // Switching tabs or floors unmounts the editor: save anything still waiting for the autosave timer.
  const pendingRef = useRef(null);
  pendingRef.current = { plan, saveState, onSave, readOnly };
  useEffect(() => () => {
    const pending = pendingRef.current;
    if (pending && !pending.readOnly && pending.onSave && pending.saveState === "dirty") {
      pending.onSave(pending.plan).catch(() => {});
    }
  }, []);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (readOnly) return undefined;
    const dirty = saveState === "dirty" || saveState === "saving" || saveState === "error" || saveState === "conflict";
    if (!dirty) return undefined;
    const handler = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveState, readOnly]);

  // ---- coordinates
  function toFloor(event) {
    const svg = svgRef.current;
    if (!svg) return [0, 0];
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return [0, 0];
    const { x, y } = point.matrixTransform(ctm.inverse());
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
  }

  function snapped(point, exceptIds = []) {
    if (!snap) return point;
    const others = plan.objects.filter((row) => !exceptIds.includes(row.id));
    return snapToObjects(point, others, 10 * k, plan.canvas.gridSize / 2);
  }

  // ---- tools
  function chooseTool(next) {
    setTool(next);
    setDraft([]);
    setCalibration(null);
    if (next !== "select") setSelection([]);
  }

  function rememberSymbol(id) {
    const next = [id, ...recent.filter((row) => row !== id)].slice(0, 8);
    setRecent(next);
    writeStoredList(RECENT_KEY, next);
  }

  function toggleFavorite(id) {
    const next = favorites.includes(id) ? favorites.filter((row) => row !== id) : [id, ...favorites];
    setFavorites(next);
    writeStoredList(FAVORITES_KEY, next);
  }

  function placeSymbol(symbolId, point) {
    try {
      const id = newObjectId();
      commit(addObject(plan, { id, type: "symbol", symbolId, geometry: { points: [snapped(point)] } }, actorUid));
      rememberSymbol(symbolId);
      setSelection([id]);
    } catch (error) {
      setSaveError(error.message);
    }
  }

  function finishDraft(points = draft) {
    const kind = geometryKind(tool);
    if (!kind) return;
    try {
      const id = newObjectId();
      commit(addObject(plan, {
        id,
        type: tool,
        name: tool === "room" ? "Room" : "",
        geometry: { points },
      }, actorUid));
      setSelection([id]);
    } catch (error) {
      setSaveError(error.message);
    }
    setDraft([]);
  }

  // ---- pointer handling
  function onObjectPointerDown(event, object) {
    if (tool !== "select" || event.button > 0) return;
    event.stopPropagation();
    const ids = expandSelectionToGroups(plan, [object.id]);
    let nextSelection;
    if (event.shiftKey) {
      nextSelection = selection.includes(object.id)
        ? selection.filter((id) => !ids.includes(id))
        : [...new Set([...selection, ...ids])];
    } else {
      nextSelection = selection.includes(object.id) ? selection : ids;
    }
    setSelection(nextSelection);
    if (readOnly) return;
    svgRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode: "move", start: toFloor(event), ids: nextSelection, moved: false };
  }

  function onVertexPointerDown(event, objectId, index) {
    if (readOnly) return;
    event.stopPropagation();
    svgRef.current?.setPointerCapture?.(event.pointerId);
    dragRef.current = { mode: "vertex", objectId, index, moved: false };
  }

  function onCanvasPointerDown(event) {
    if (event.button > 0) return;
    const point = toFloor(event);
    containerRef.current?.focus({ preventScroll: true });
    if (tool === "pan" || (tool === "select" && !event.shiftKey)) {
      if (tool === "select") setSelection([]);
      svgRef.current?.setPointerCapture?.(event.pointerId);
      dragRef.current = { mode: "pan", startClient: [event.clientX, event.clientY], view };
      return;
    }
    if (tool === "select" && event.shiftKey) {
      svgRef.current?.setPointerCapture?.(event.pointerId);
      dragRef.current = { mode: "marquee", start: point, current: point };
      return;
    }
    if (readOnly) return;
    if (tool === "calibrate") {
      const p = snapped(point);
      if (!calibration) setCalibration({ a: p });
      else if (!calibration.b) setCalibration({ ...calibration, b: p, length: "", units: plan.scale.units || "ft" });
      return;
    }
    if (tool.startsWith("symbol:")) {
      placeSymbol(tool.slice(7), point);
      return;
    }
    const kind = geometryKind(tool);
    const p = snapped(point);
    if (kind === "point") {
      finishDraft([p]);
      return;
    }
    if (kind === "line" || kind === "rect") {
      svgRef.current?.setPointerCapture?.(event.pointerId);
      dragRef.current = { mode: "draw2", start: p };
      setDraft([p, p]);
      return;
    }
    // polyline / polygon: click to add points; clicking the first point closes a polygon.
    if (kind === "polygon" && draft.length >= 3) {
      const [fx, fy] = draft[0];
      if (Math.hypot(p[0] - fx, p[1] - fy) <= 12 * k) {
        finishDraft(draft);
        return;
      }
    }
    setDraft([...draft, p]);
  }

  function onCanvasPointerMove(event) {
    const point = toFloor(event);
    setHover(point);
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.mode === "pan") {
      const svg = svgRef.current;
      const rect = svg.getBoundingClientRect();
      const scale = drag.view.w / Math.max(1, rect.width);
      setView({
        ...drag.view,
        x: drag.view.x - (event.clientX - drag.startClient[0]) * scale,
        y: drag.view.y - (event.clientY - drag.startClient[1]) * scale,
      });
      return;
    }
    if (drag.mode === "marquee") {
      drag.current = point;
      setPreview(null);
      setHover(point);
      return;
    }
    if (drag.mode === "draw2") {
      setDraft([drag.start, snapped(point)]);
      return;
    }
    if (drag.mode === "move") {
      const target = snapped(point, drag.ids);
      const dx = target[0] - drag.start[0];
      const dy = target[1] - drag.start[1];
      if (!dx && !dy) return;
      drag.moved = true;
      setPreview(moveObjects(plan, drag.ids, dx, dy));
      return;
    }
    if (drag.mode === "vertex") {
      const target = snapped(point, [drag.objectId]);
      drag.moved = true;
      setPreview(updateObjects(plan, [drag.objectId], (object) => ({
        geometry: {
          kind: object.geometry.kind,
          points: object.geometry.points.map((vertex, i) => (i === drag.index ? target : vertex)),
        },
      })));
    }
  }

  function onCanvasPointerUp(event) {
    const drag = dragRef.current;
    dragRef.current = null;
    try { svgRef.current?.releasePointerCapture?.(event.pointerId); } catch { /* not captured */ }
    if (!drag) return;
    if (drag.mode === "draw2") {
      const end = snapped(toFloor(event));
      if (Math.hypot(end[0] - drag.start[0], end[1] - drag.start[1]) >= 2) finishDraft([drag.start, end]);
      else setDraft([]);
      return;
    }
    if (drag.mode === "marquee") {
      const box = boundsOf([drag.start, drag.current]);
      const inside = plan.objects.filter((object) => {
        if (layerById.get(object.layer)?.visible === false) return false;
        const b = boundsOf(object.geometry.points);
        return b.minX >= box.minX && b.maxX <= box.maxX && b.minY >= box.minY && b.maxY <= box.maxY;
      }).map((row) => row.id);
      setSelection(expandSelectionToGroups(plan, inside));
      return;
    }
    if ((drag.mode === "move" || drag.mode === "vertex") && drag.moved && preview) {
      commit(preview);
    }
    setPreview(null);
  }

  function onCanvasDoubleClick() {
    const kind = geometryKind(tool);
    if ((kind === "polyline" && draft.length >= 2) || (kind === "polygon" && draft.length >= 3)) {
      // The double-click's two clicks each added a point; drop the duplicate.
      const points = draft.filter((point, i) => i === 0 || point[0] !== draft[i - 1][0] || point[1] !== draft[i - 1][1]);
      finishDraft(points);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    zoomAt(toFloor(event), factor);
  }

  function zoomAt([fx, fy], factor) {
    setView((current) => {
      const w = Math.min(Math.max(current.w * factor, 40), plan.canvas.width * 8);
      const h = w * (current.h / current.w);
      return { x: fx - (fx - current.x) * (w / current.w), y: fy - (fy - current.y) * (h / current.h), w, h };
    });
  }

  function zoomBy(factor) {
    zoomAt([view.x + view.w / 2, view.y + view.h / 2], factor);
  }

  function fitView() {
    const box = boundsOf(plan.objects.flatMap((row) => row.geometry.points));
    if (!box || (box.width < 1 && box.height < 1)) {
      setView({ x: 0, y: 0, w: plan.canvas.width, h: plan.canvas.height });
      return;
    }
    const pad = Math.max(box.width, box.height) * 0.1 + 40;
    const aspect = plan.canvas.height / plan.canvas.width;
    let w = box.width + pad * 2;
    let h = box.height + pad * 2;
    if (h / w > aspect) w = h / aspect; else h = w * aspect;
    setView({ x: box.minX + box.width / 2 - w / 2, y: box.minY + box.height / 2 - h / 2, w, h });
  }

  // HTML5 drag-and-drop from the palette.
  function onDrop(event) {
    event.preventDefault();
    const symbolId = event.dataTransfer.getData("application/x-forge-symbol");
    if (symbolId && !readOnly) placeSymbol(symbolId, toFloor(event));
  }

  // ---- actions on the selection
  const act = {
    delete: () => { commit(deleteObjects(plan, selection)); setSelection([]); },
    duplicate: () => {
      const result = duplicateObjects(plan, selection, plan.canvas.gridSize, actorUid);
      commit(result.plan); setSelection(result.ids);
    },
    rotate: (deg) => commit(rotateObjects(plan, selection, deg)),
    scale: (factor) => commit(scaleObjects(plan, selection, factor)),
    group: () => commit(groupObjects(plan, selection).plan),
    ungroup: () => commit(ungroupObjects(plan, selection)),
    lock: (locked) => commit(updateObjects(plan, selection, { locked })),
    align: (edge) => commit(alignObjects(plan, selection, edge)),
    verify: () => commit(verifyObjects(plan, selection, actorUid)),
    accept: () => commit(updateObjects(plan, selection, { verificationStatus: "unverified" }, actorUid)),
    reject: () => commit(updateObjects(plan, selection, { verificationStatus: "rejected" }, actorUid)),
    retype: (type) => commit(retypeObjects(plan, selection, type, actorUid)),
    nudge: (dx, dy) => commit(moveObjects(plan, selection, dx, dy)),
    copy: () => { clipboardRef.current = selectedObjects; },
    paste: () => {
      if (!clipboardRef.current.length) return;
      let next = plan;
      const ids = [];
      for (const object of clipboardRef.current) {
        const id = newObjectId();
        ids.push(id);
        next = addObject(next, {
          ...object,
          id,
          groupId: "",
          locked: false,
          verificationStatus: "unverified",
          source: { kind: "manual" },
          geometry: { kind: object.geometry.kind, points: object.geometry.points.map(([x, y]) => [x + plan.canvas.gridSize, y + plan.canvas.gridSize]) },
        }, actorUid);
      }
      commit(next); setSelection(ids);
    },
    undo: () => { setHistory((current) => undo(current)); setSaveState("dirty"); setSelection([]); },
    redo: () => { setHistory((current) => redo(current)); setSaveState("dirty"); },
  };

  function onKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && key === "z" && !readOnly) { event.preventDefault(); if (event.shiftKey) act.redo(); else act.undo(); return; }
    if (mod && key === "y" && !readOnly) { event.preventDefault(); act.redo(); return; }
    if (mod && key === "c") { act.copy(); return; }
    if (mod && key === "v" && !readOnly) { event.preventDefault(); act.paste(); return; }
    if (mod && key === "d" && !readOnly && selection.length) { event.preventDefault(); act.duplicate(); return; }
    if (mod && key === "a") { event.preventDefault(); setSelection(visibleObjects.map((row) => row.id)); return; }
    if (key === "escape") { setDraft([]); setCalibration(null); setSelection([]); chooseTool("select"); return; }
    if (key === "enter" && draft.length) { onCanvasDoubleClick(); return; }
    if ((key === "delete" || key === "backspace") && selection.length && !readOnly) { event.preventDefault(); act.delete(); return; }
    if (key.startsWith("arrow") && selection.length && !readOnly) {
      event.preventDefault();
      const step = event.shiftKey ? plan.canvas.gridSize : 1;
      act.nudge(key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
      return;
    }
    if (mod) return;
    if (key === "v") { chooseTool("select"); return; }
    if (key === "h") { chooseTool("pan"); return; }
    if (key === "+" || key === "=") { zoomBy(1 / 1.25); return; }
    if (key === "-") { zoomBy(1.25); return; }
    if (key === "0") { fitView(); return; }
    if (!readOnly && KEY_TOOLS[key]) chooseTool(KEY_TOOLS[key]);
  }

  function applyCalibration() {
    try {
      const scale = calibrateScale(calibration.a, calibration.b, calibration.length, calibration.units);
      commit({ ...plan, scale });
      setCalibration(null);
      chooseTool("select");
    } catch (error) {
      setSaveError(error.message);
    }
  }

  // Types every selected object could become (same shape); empty when they differ in shape.
  const retypeChoices = useMemo(() => {
    if (!selectedObjects.length) return [];
    const first = typesLike(selectedObjects[0].type);
    return selectedObjects.every((row) => typesLike(row.type).join() === first.join()) ? first : [];
  }, [selectedObjects]);
  const sharedType = selectedObjects.length && selectedObjects.every((row) => row.type === selectedObjects[0].type) ? selectedObjects[0].type : "";
  const typePicker = !readOnly && retypeChoices.length > 1 ? (
    <label className="fpe-field">
      <span>Type</span>
      <select value={sharedType} onChange={(e) => e.target.value && act.retype(e.target.value)}>
        {!sharedType ? <option value="">Mixed</option> : null}
        {retypeChoices.map((key) => <option key={key} value={key}>{OBJECT_TYPES[key].label}</option>)}
      </select>
    </label>
  ) : null;

  function patchSingle(patch) {
    if (!single) return;
    commit(updateObjects(plan, [single.id], patch, actorUid));
  }

  function patchProperty(key, value) {
    if (!single) return;
    commit(updateObjects(plan, [single.id], (object) => ({ properties: { ...object.properties, [key]: value } }), actorUid));
  }

  // ---- palette
  const symbols = useMemo(() => {
    let rows = searchSymbols(search, catalog);
    if (category === "__favorites") rows = rows.filter((row) => favorites.includes(row.id));
    else if (category === "__recent") rows = recent.map((id) => rows.find((row) => row.id === id)).filter(Boolean);
    else if (category) rows = rows.filter((row) => row.category === category);
    return rows;
  }, [search, category, catalog, favorites, recent]);

  const activeHint = tool.startsWith("symbol:")
    ? `Click or tap to place ${findSymbol(tool.slice(7), catalog).label}. Esc to stop.`
    : tool === "calibrate"
      ? (!calibration ? "Click the start of a known distance." : !calibration.b ? "Click the end of the known distance." : "Enter the real distance.")
      : DRAW_TOOLS.find((row) => row.id === tool)?.hint || (tool === "pan" ? "Drag to move around." : "Click to select, Shift+drag to box-select, drag to move.");

  const saveLabel = readOnly ? "Read only" : {
    saved: "All changes saved",
    dirty: "Unsaved changes…",
    saving: "Saving…",
    error: "Not saved",
    conflict: "Not saved: newer version on server",
  }[saveState];

  const marquee = dragRef.current?.mode === "marquee" ? boundsOf([dragRef.current.start, dragRef.current.current]) : null;
  const gridSize = plan.canvas.gridSize;
  const pxUnits = plan.scale.status === "calibrated" ? plan.scale.units : "px";

  return (
    <div
      className={`fpe-root${readOnly ? " is-readonly" : ""}`}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label="Floor plan editor"
    >
      <div className="fpe-toolbar" role="toolbar" aria-label="Editing tools">
        <button type="button" className={`fpe-tool${tool === "select" ? " is-active" : ""}`} onClick={() => chooseTool("select")} title="Select (V)" aria-pressed={tool === "select"}><MousePointer2 size={16} /> Select</button>
        <button type="button" className={`fpe-tool${tool === "pan" ? " is-active" : ""}`} onClick={() => chooseTool("pan")} title="Pan (H)" aria-pressed={tool === "pan"}><Hand size={16} /> Pan</button>
        <span className="fpe-sep" />
        <button type="button" className="fpe-tool" onClick={() => zoomBy(1 / 1.25)} title="Zoom in (+)" aria-label="Zoom in"><ZoomIn size={16} /></button>
        <button type="button" className="fpe-tool" onClick={() => zoomBy(1.25)} title="Zoom out (-)" aria-label="Zoom out"><ZoomOut size={16} /></button>
        <button type="button" className="fpe-tool" onClick={fitView} title="Fit to drawing (0)" aria-label="Fit to drawing"><Maximize2 size={16} /></button>
        {!readOnly ? (
          <>
            <span className="fpe-sep" />
            <button type="button" className="fpe-tool" onClick={act.undo} disabled={!history.past.length} title="Undo (Ctrl+Z)" aria-label="Undo"><Undo2 size={16} /></button>
            <button type="button" className="fpe-tool" onClick={act.redo} disabled={!history.future.length} title="Redo (Ctrl+Y)" aria-label="Redo"><Redo2 size={16} /></button>
            <span className="fpe-sep" />
            <button type="button" className="fpe-tool" onClick={act.duplicate} disabled={!selection.length} title="Duplicate (Ctrl+D)" aria-label="Duplicate"><Copy size={16} /></button>
            <button type="button" className="fpe-tool" onClick={() => act.rotate(15)} disabled={!selection.length} title="Rotate 15°" aria-label="Rotate 15 degrees"><RotateCw size={16} /></button>
            <button type="button" className="fpe-tool" onClick={() => act.scale(1.1)} disabled={!selection.length} title="Enlarge 10%">+10%</button>
            <button type="button" className="fpe-tool" onClick={() => act.scale(1 / 1.1)} disabled={!selection.length} title="Shrink 10%">−10%</button>
            <button type="button" className="fpe-tool" onClick={act.group} disabled={selection.length < 2} title="Group" aria-label="Group"><Group size={16} /></button>
            <button type="button" className="fpe-tool" onClick={act.ungroup} disabled={!selectedObjects.some((row) => row.groupId)} title="Ungroup" aria-label="Ungroup"><Ungroup size={16} /></button>
            <button type="button" className="fpe-tool" onClick={() => act.align("left")} disabled={selection.length < 2} title="Align left edges" aria-label="Align left"><AlignHorizontalJustifyStart size={16} /></button>
            <button type="button" className="fpe-tool" onClick={() => act.align("top")} disabled={selection.length < 2} title="Align top edges" aria-label="Align top"><AlignVerticalJustifyStart size={16} /></button>
            <button type="button" className="fpe-tool" onClick={() => act.lock(!selectedObjects.every((row) => row.locked))} disabled={!selection.length} title="Lock / unlock" aria-label="Lock or unlock">
              {selectedObjects.length && selectedObjects.every((row) => row.locked) ? <LockOpen size={16} /> : <Lock size={16} />}
            </button>
            <button type="button" className="fpe-tool danger" onClick={act.delete} disabled={!selection.length} title="Delete (Del)" aria-label="Delete"><Trash2 size={16} /></button>
            <span className="fpe-sep" />
            <label className="fpe-toggle"><input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} /> Snap</label>
            <button type="button" className={`fpe-tool${tool === "calibrate" ? " is-active" : ""}`} onClick={() => chooseTool("calibrate")} title="Set the drawing scale from a known distance"><Ruler size={16} /> Scale</button>
          </>
        ) : null}
        <span className={`fpe-save fpe-save-${readOnly ? "readonly" : saveState}`} role="status" aria-live="polite">{saveLabel}</span>
      </div>

      <div className="fpe-body">
        {!readOnly ? (
          <aside className="fpe-palette" aria-label="Tools and symbols">
            <div className="fpe-palette-section">
              <h4>Draw</h4>
              <div className="fpe-draw-grid">
                {DRAW_TOOLS.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    className={`fpe-draw-tool${tool === row.id ? " is-active" : ""}`}
                    onClick={() => chooseTool(row.id)}
                    aria-pressed={tool === row.id}
                    title={row.key ? `${OBJECT_TYPES[row.id].label} (${row.key})` : OBJECT_TYPES[row.id].label}
                  >
                    {OBJECT_TYPES[row.id].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="fpe-palette-section">
              <h4>Symbols</h4>
              <label className="fpe-search">
                <Search size={14} aria-hidden="true" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search symbols" aria-label="Search symbols" />
              </label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Symbol category">
                <option value="">All categories</option>
                <option value="__favorites">★ Favorites</option>
                <option value="__recent">Recently used</option>
                {SYMBOL_CATEGORIES.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
              </select>
              <ul className="fpe-symbol-list">
                {symbols.map((symbol) => (
                  <li key={symbol.id}>
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData("application/x-forge-symbol", symbol.id);
                        event.dataTransfer.effectAllowed = "copy";
                      }}
                      className={`fpe-symbol${tool === `symbol:${symbol.id}` ? " is-active" : ""}`}
                      onClick={() => chooseTool(`symbol:${symbol.id}`)}
                      title={`${symbol.label}${symbol.critical ? " (must be verified before publishing)" : ""}`}
                    >
                      <SymbolGlyph symbol={symbol} size={22} />
                      <span>{symbol.label}</span>
                    </button>
                    <button
                      type="button"
                      className={`fpe-fav${favorites.includes(symbol.id) ? " is-on" : ""}`}
                      onClick={() => toggleFavorite(symbol.id)}
                      aria-label={favorites.includes(symbol.id) ? `Remove ${symbol.label} from favorites` : `Add ${symbol.label} to favorites`}
                    >★</button>
                  </li>
                ))}
                {!symbols.length ? <li className="fpe-empty">No symbols match.</li> : null}
              </ul>
            </div>
          </aside>
        ) : null}

        <div className="fpe-canvas-wrap" onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <svg
            ref={svgRef}
            className={`fpe-canvas fpe-tool-${tool.split(":")[0]}`}
            viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={onCanvasDoubleClick}
            onWheel={onWheel}
            role="application"
            aria-label={`Floor plan with ${summary.total} objects`}
          >
            <defs>
              <pattern id={`fpe-grid-${plan.floorId || "x"}`} width={gridSize} height={gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${gridSize} 0 L 0 0 0 ${gridSize}`} className="fpe-grid-line" />
              </pattern>
            </defs>
            <rect x={-plan.canvas.width * 4} y={-plan.canvas.height * 4} width={plan.canvas.width * 9} height={plan.canvas.height * 9} fill={`url(#fpe-grid-${plan.floorId || "x"})`} className="fpe-grid" />
            {backgroundUrl && plan.background && layerById.get("background")?.visible !== false ? (
              <image
                href={backgroundUrl}
                x={0}
                y={0}
                width={plan.background.width || plan.canvas.width}
                height={plan.background.height || plan.canvas.height}
                opacity={plan.background.opacity}
                preserveAspectRatio="none"
                style={{ pointerEvents: "none" }}
              />
            ) : null}
            {visibleObjects.map((object) => (
              <CanvasObject
                key={object.id}
                object={object}
                plan={shown}
                catalog={catalog}
                selected={selection.includes(object.id)}
                onPointerDown={onObjectPointerDown}
                k={k}
              />
            ))}
            {!readOnly && single && !single.locked && single.geometry.kind !== "point" && tool === "select"
              ? (shown.objects.find((row) => row.id === single.id) || single).geometry.points.map(([x, y], index) => (
                <rect
                  key={index}
                  x={x - 6 * k}
                  y={y - 6 * k}
                  width={12 * k}
                  height={12 * k}
                  className="fpe-vertex"
                  onPointerDown={(event) => onVertexPointerDown(event, single.id, index)}
                />
              ))
              : null}
            {draft.length ? (
              <path
                d={pointsToPath(
                  geometryKind(tool) === "rect" && draft.length === 2
                    ? [draft[0], [draft[1][0], draft[0][1]], draft[1], [draft[0][0], draft[1][1]]]
                    : (hover && geometryKind(tool) !== "line" && geometryKind(tool) !== "rect" ? [...draft, snapped(hover)] : draft),
                  geometryKind(tool) === "polygon" || geometryKind(tool) === "rect",
                )}
                className="fpe-draft"
              />
            ) : null}
            {calibration?.a ? (
              <path d={pointsToPath([calibration.a, calibration.b || (hover ? snapped(hover) : calibration.a)], false)} className="fpe-calibration" />
            ) : null}
            {marquee ? <rect x={marquee.minX} y={marquee.minY} width={marquee.width} height={marquee.height} className="fpe-marquee" /> : null}
          </svg>

          {calibration?.b ? (
            <div className="fpe-calibrate-card" role="dialog" aria-label="Set drawing scale">
              <strong>Set the scale</strong>
              <p>
                You picked a line {Math.round(Math.hypot(calibration.b[0] - calibration.a[0], calibration.b[1] - calibration.a[1]))} px long.
                How long is it in real life?
              </p>
              <div className="fpe-calibrate-row">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  autoFocus
                  value={calibration.length}
                  onChange={(e) => setCalibration({ ...calibration, length: e.target.value })}
                  aria-label="Real distance"
                />
                <select value={calibration.units} onChange={(e) => setCalibration({ ...calibration, units: e.target.value })} aria-label="Units">
                  <option value="ft">feet</option>
                  <option value="m">meters</option>
                </select>
                <button type="button" className="primary-button" onClick={applyCalibration}>Set scale</button>
                <button type="button" className="secondary-button" onClick={() => setCalibration(null)}>Cancel</button>
              </div>
            </div>
          ) : null}
        </div>

        <aside className="fpe-inspector" aria-label="Object properties">
          {single ? (
            <>
              <h4>{single.type === "symbol" ? findSymbol(single.symbolId, catalog).label : OBJECT_TYPES[single.type].label}</h4>
              {single.verificationStatus === "pending" ? (
                <div className="fpe-callout fpe-callout-pending">
                  Proposed by {single.source.kind === "smartplan_ai" ? "SmartPlan AI" : "a conversion"}; not confirmed.
                  Compare it with the source drawing, then accept or reject it.
                  {!readOnly ? (
                    <div className="fpe-callout-actions">
                      <button type="button" className="primary-button" onClick={act.accept}><CheckCircle2 size={14} /> Accept</button>
                      <button type="button" className="secondary-button danger-button" onClick={act.reject}><XCircle size={14} /> Reject</button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {single.locked ? null : typePicker}
              <PropertyInput label={single.type === "text" ? "Text" : "Name"} value={single.name} disabled={readOnly || single.locked} onChange={(name) => patchSingle({ name })} />
              <PropertyInput label="Description" multiline value={single.description} disabled={readOnly || single.locked} onChange={(description) => patchSingle({ description })} />
              {single.type === "symbol" ? findSymbol(single.symbolId, catalog).properties.filter((key) => key !== "notes").map((key) => (
                <PropertyInput key={key} label={prettyKey(key)} value={single.properties[key]} disabled={readOnly || single.locked} onChange={(value) => patchProperty(key, value)} />
              )) : null}
              {single.type === "room" || single.type === "corridor" ? (
                <PropertyInput label="Use / occupancy" value={single.properties.use} disabled={readOnly || single.locked} onChange={(value) => patchProperty("use", value)} />
              ) : null}
              <label className="fpe-field">
                <span>Layer</span>
                <select value={single.layer} disabled={readOnly || single.locked} onChange={(e) => patchSingle({ layer: e.target.value })}>
                  {plan.layers.filter((row) => row.id !== "background").map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </label>
              {single.geometry.kind === "point" || single.geometry.kind === "rect" ? (
                <label className="fpe-field">
                  <span>Rotation (°)</span>
                  <input type="number" value={single.rotation} disabled={readOnly || single.locked} onChange={(e) => patchSingle({ rotation: Number(e.target.value) || 0 })} />
                </label>
              ) : null}
              <dl className="fpe-facts">
                {describeMeasurement(plan, single) ? (<><dt>Size</dt><dd>{describeMeasurement(plan, single)}</dd></>) : null}
                <dt>Status</dt>
                <dd>
                  {single.verificationStatus === "verified"
                    ? `Verified ${single.verifiedAt ? new Date(single.verifiedAt).toLocaleDateString() : ""}`
                    : single.verificationStatus === "pending" ? "Proposed, not reviewed"
                      : single.verificationStatus === "rejected" ? "Rejected (dropped when published)" : "Not verified"}
                </dd>
                <dt>Source</dt>
                <dd>
                  {{
                    manual: "Drawn by hand",
                    smartplan_ai: "SmartPlan AI proposal",
                    smartplan_lines: "Line detection",
                    vector_import: "Imported from vector file",
                    field_survey: "Field survey",
                    inspection: "Inspection",
                  }[single.source.kind]}
                  {single.source.reference ? ` · ${single.source.reference}` : ""}
                </dd>
                {single.source.kind !== "manual" ? (<><dt>Confidence</dt><dd>{single.source.confidence === "unknown" ? "Not measured" : single.source.confidence}</dd></>) : null}
                <dt>ID</dt><dd className="fpe-mono">{single.id}</dd>
              </dl>
              {!readOnly && single.verificationStatus !== "verified" && single.verificationStatus !== "pending" ? (
                <button type="button" className="secondary-button" onClick={act.verify}>
                  <CheckCircle2 size={14} /> Mark verified
                </button>
              ) : null}
              {onAttachMedia ? (
                <div className="fpe-media">
                  <h5>Photos & documents</h5>
                  {(mediaByObject[single.id] || []).map((file) => (
                    <a key={file.id} href={file.downloadUrl} target="_blank" rel="noreferrer">{file.fileName}</a>
                  ))}
                  {!readOnly ? <button type="button" className="secondary-button" onClick={() => onAttachMedia(single.id)}>Attach photo or file</button> : null}
                </div>
              ) : null}
            </>
          ) : selectedObjects.length > 1 ? (
            <>
              <h4>{selectedObjects.length} objects selected</h4>
              {typePicker}
              {!readOnly ? (
                <div className="fpe-stack">
                  <button type="button" className="secondary-button" onClick={act.verify}><CheckCircle2 size={14} /> Mark all verified</button>
                  {selectedObjects.some((row) => row.verificationStatus === "pending") ? (
                    <>
                      <button type="button" className="primary-button" onClick={act.accept}>Accept proposals</button>
                      <button type="button" className="secondary-button danger-button" onClick={act.reject}>Reject proposals</button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <h4>Floor summary</h4>
              <dl className="fpe-facts">
                <dt>Objects</dt><dd>{summary.total}</dd>
                <dt>Rooms</dt><dd>{summary.rooms}</dd>
                <dt>Walls</dt><dd>{summary.walls}</dd>
                <dt>Symbols</dt><dd>{summary.symbols}</dd>
                <dt>Verified</dt><dd>{summary.verified}</dd>
                {summary.pending ? (<><dt>Proposals to review</dt><dd className="fpe-warn">{summary.pending}</dd></>) : null}
                <dt>Scale</dt>
                <dd>{plan.scale.status === "calibrated" ? `${Math.round(plan.scale.pxPerUnit * 100) / 100} px per ${plan.scale.units}` : "Not set (sizes shown in pixels)"}</dd>
              </dl>
            </>
          )}

          <div className="fpe-layers">
            <h5>Layers</h5>
            {plan.layers.map((layer) => (
              <div key={layer.id} className="fpe-layer">
                <button
                  type="button"
                  className="fpe-icon-toggle"
                  onClick={() => setHistory((current) => ({ ...current, present: setLayer(current.present, layer.id, { visible: !layer.visible }) }))}
                  aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.label}`}
                  aria-pressed={layer.visible}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                {!readOnly ? (
                  <button
                    type="button"
                    className="fpe-icon-toggle"
                    onClick={() => commit(setLayer(plan, layer.id, { locked: !layer.locked }))}
                    aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.label}`}
                    aria-pressed={layer.locked}
                    disabled={layer.id === "background"}
                  >
                    {layer.locked ? <Lock size={14} /> : <LockOpen size={14} />}
                  </button>
                ) : null}
                <span>{layer.label}</span>
              </div>
            ))}
            {plan.background && !readOnly ? (
              <label className="fpe-field">
                <span>Source drawing opacity</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={plan.background.opacity}
                  onChange={(e) => setHistory((current) => ({
                    ...current,
                    present: { ...current.present, background: { ...current.present.background, opacity: Number(e.target.value) } },
                  }))}
                  onPointerUp={() => setSaveState("dirty")}
                />
              </label>
            ) : null}
          </div>
          {extraPanel}
        </aside>
      </div>

      <div className="fpe-status">
        <span>{activeHint}</span>
        <span>{hover ? `x ${Math.round(hover[0])}, y ${Math.round(hover[1])} ${pxUnits === "px" ? "px" : `(${Math.round((hover[0] / plan.scale.pxPerUnit) * 10) / 10}, ${Math.round((hover[1] / plan.scale.pxPerUnit) * 10) / 10} ${pxUnits})`}` : ""}</span>
        <span>Zoom {Math.round((plan.canvas.width / view.w) * 100)}%</span>
      </div>
      {saveError ? (
        <div className={`fpe-error${saveState === "conflict" ? " is-conflict" : ""}`} role="alert">
          {saveError}
          <button type="button" className="secondary-button" onClick={() => setSaveError("")}>Dismiss</button>
        </div>
      ) : null}
    </div>
  );
}
