import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Check, Crosshair, Droplets, Layers, LocateFixed, MousePointer2, Ruler, Save, Trash2, Undo2, X } from "lucide-react";
import { loadDepartmentHydrants } from "../../lib/hydrantTenantService.js";
import { listFloorPlansForRevision } from "../../lib/preplans/floorPlanService.js";
import { describeAlignmentQuality, fitTransform, MIN_POINTS } from "../../lib/preplans/georeference.js";
import {
  BASEMAP_PROVIDERS,
  SITE_FEATURE_KINDS,
  addSiteFeature,
  basemapById,
  clearFloorAlignment,
  controlPointsOf,
  describeSiteFeature,
  formatArea,
  formatLength,
  normalizeSiteMap,
  pathLengthMeters,
  polygonAreaSqMeters,
  projectFloorPlan,
  removeSiteFeature,
  setFloorAlignment,
  updateSiteFeature,
  verifyFloorAlignment,
} from "../../lib/preplans/siteMapModel.js";
import { getSiteMap, saveSiteMap } from "../../lib/preplans/siteMapService.js";
import { findSymbol } from "../../lib/preplans/symbolCatalog.js";
import PlanPreview from "./PlanPreview.jsx";

const AUTOSAVE_MS = 1500;
const FALLBACK = { center: [39.5, -98.35], zoom: 4 };
const DRAW_TOOLS = Object.keys(SITE_FEATURE_KINDS);

function hydrantLatLng(h) {
  const lat = Number(h.lat ?? h.latitude);
  const lng = Number(h.lng ?? h.lon ?? h.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? [lat, lng] : null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function numberedIcon(n, cls) {
  return L.divIcon({ className: `spm-cp ${cls}`, html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

/**
 * Satellite site map for one preplan revision: footprints, boundaries,
 * apparatus access, staging, hazards, notes, hydrants, measurements and
 * floor plan alignment. Saved to preplanSiteMaps/{revisionId}.
 */
export default function SiteMapPanel({
  departmentId, preplan, revision, buildings = [], floors = [], files = [], catalog = [],
  canEditGeometry = false, actor = {}, onOpenFloor, onError,
}) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const tileRef = useRef(null);
  const layersRef = useRef({});
  const toolRef = useRef("select");
  const draftRef = useRef([]);
  const alignRef = useRef(null);
  const [siteMap, setSiteMap] = useState(null);
  const [tool, setToolState] = useState("select");
  const [draft, setDraft] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [hydrants, setHydrants] = useState([]);
  const [showHydrants, setShowHydrants] = useState(true);
  const [plans, setPlans] = useState([]);
  const [shownFloors, setShownFloors] = useState({});
  const [saveState, setSaveState] = useState("saved");
  const [conflict, setConflict] = useState(false);
  const [align, setAlign] = useState(null); // { floorId, points: [{floor?, geo?}], kind }
  const dirtyRef = useRef(false);
  const featureClickRef = useRef(false);
  const savedVersionRef = useRef(0);

  alignRef.current = align;
  const readOnly = !canEditGeometry;
  const provider = basemapById(siteMap?.basemap);
  const planByFloor = useMemo(() => new Map(plans.map((row) => [row.floorId, row])), [plans]);
  const linkedHydrantIds = useMemo(() => new Set((preplan?.hydrantIds || []).map(String)), [preplan?.hydrantIds]);

  const setTool = useCallback((next) => {
    toolRef.current = next;
    setToolState(next);
    draftRef.current = [];
    setDraft([]);
  }, []);

  // Load the site map, the revision's floor plans and hydrants.
  useEffect(() => {
    let cancelled = false;
    if (!departmentId || !revision?.id) return undefined;
    Promise.all([
      getSiteMap(departmentId, revision.id),
      listFloorPlansForRevision(departmentId, revision.id),
      loadDepartmentHydrants(departmentId).catch(() => []),
    ]).then(([stored, floorPlans, hydrantRows]) => {
      if (cancelled) return;
      const base = normalizeSiteMap(stored || { preplanId: preplan.id, revisionId: revision.id });
      savedVersionRef.current = base.version;
      dirtyRef.current = false;
      setSiteMap({ ...base, preplanId: preplan.id, revisionId: revision.id });
      setPlans(floorPlans);
      setShownFloors(Object.fromEntries(Object.keys(base.alignments).map((id) => [id, true])));
      setHydrants((Array.isArray(hydrantRows) ? hydrantRows : []).filter((row) => hydrantLatLng(row)));
    }).catch((error) => onError?.(error?.message || "Couldn't load the site map."));
    return () => { cancelled = true; };
  }, [departmentId, revision?.id, preplan?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Create the Leaflet map once the site map is loaded.
  const ready = Boolean(siteMap);
  useEffect(() => {
    if (!ready || !elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, { zoomControl: true, doubleClickZoom: false, maxZoom: 21 });
    mapRef.current = map;
    layersRef.current = {
      hydrants: L.layerGroup().addTo(map),
      floors: L.layerGroup().addTo(map),
      features: L.layerGroup().addTo(map),
      draft: L.layerGroup().addTo(map),
      align: L.layerGroup().addTo(map),
    };
    map.on("click", (event) => handleMapClickRef.current(event));
    map.on("dblclick", () => finishDraftRef.current());
    const refresh = () => map.invalidateSize();
    const timers = [setTimeout(refresh, 60), setTimeout(refresh, 300)];
    return () => { timers.forEach(clearTimeout); map.remove(); mapRef.current = null; tileRef.current = null; };
  }, [ready]);

  // Initial view: saved view → preplan location → drawn features → linked hydrants → all hydrants → country.
  const viewSetRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !siteMap || viewSetRef.current) return;
    viewSetRef.current = true;
    if (siteMap.view) { map.setView([siteMap.view.center.lat, siteMap.view.center.lng], siteMap.view.zoom); return; }
    if (Number.isFinite(preplan?.latitude) && Number.isFinite(preplan?.longitude)) { map.setView([preplan.latitude, preplan.longitude], 18); return; }
    const pts = siteMap.features.flatMap((row) => row.points.map((p) => [p.lat, p.lng]));
    const linked = hydrants.filter((row) => linkedHydrantIds.has(String(row.id)) || linkedHydrantIds.has(String(row.hydrant_id))).map(hydrantLatLng);
    // Last resort before the whole country: the department's own hydrants (its service area).
    const all = pts.length ? pts : linked.length ? linked : hydrants.map(hydrantLatLng);
    if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.3), { maxZoom: 19 });
    else map.setView(FALLBACK.center, FALLBACK.zoom);
  }, [siteMap, hydrants, preplan?.latitude, preplan?.longitude, linkedHydrantIds]);

  // Basemap.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (tileRef.current) tileRef.current.remove();
    tileRef.current = L.tileLayer(provider.url, { maxZoom: 21, maxNativeZoom: provider.maxZoom, attribution: provider.attribution }).addTo(map);
    tileRef.current.bringToBack();
  }, [provider, ready]);

  // Hydrants.
  useEffect(() => {
    const layer = layersRef.current.hydrants;
    if (!layer) return;
    layer.clearLayers();
    if (!showHydrants) return;
    for (const h of hydrants) {
      const at = hydrantLatLng(h);
      const linked = linkedHydrantIds.has(String(h.id)) || linkedHydrantIds.has(String(h.hydrant_id));
      const out = /out|inactive|down/i.test(String(h.status || ""));
      L.circleMarker(at, {
        radius: linked ? 8 : 5, weight: 2, color: "#fff",
        fillColor: out ? "#6b7280" : "#dc2626", fillOpacity: 0.95, interactive: true, bubblingMouseEvents: true,
      }).bindTooltip(
        `Hydrant ${escapeHtml(h.hydrant_id || h.id)}${linked ? " (linked)" : ""}${h.flow_gpm ? ` · ${escapeHtml(h.flow_gpm)} gpm` : ""}${out ? " · OUT OF SERVICE" : ""}`,
      ).addTo(layer);
    }
  }, [hydrants, showHydrants, linkedHydrantIds, ready]);

  // Aligned floor plans.
  useEffect(() => {
    const layer = layersRef.current.floors;
    if (!layer || !siteMap) return;
    layer.clearLayers();
    for (const [floorId, alignment] of Object.entries(siteMap.alignments)) {
      if (!shownFloors[floorId]) continue;
      const color = alignment.status === "verified" ? "#22d3ee" : "#fb923c";
      for (const shape of projectFloorPlan(planByFloor.get(floorId), alignment)) {
        if (shape.kind === "point") {
          const symbol = shape.symbolId ? findSymbol(shape.symbolId, catalog) : null;
          L.circleMarker(shape.latLngs[0], { radius: 5, color: "#000", weight: 1, fillColor: symbol?.color || color, fillOpacity: 1, interactive: false }).addTo(layer);
        } else if (shape.kind === "polygon") {
          L.polygon(shape.latLngs, { color, weight: 1.5, fillOpacity: 0.06, interactive: false }).addTo(layer);
        } else {
          L.polyline(shape.latLngs, { color, weight: shape.type === "exterior_wall" ? 3 : 1.5, interactive: false }).addTo(layer);
        }
      }
    }
  }, [siteMap, shownFloors, planByFloor, catalog, ready]);

  // Drawn features.
  useEffect(() => {
    const layer = layersRef.current.features;
    if (!layer || !siteMap) return;
    layer.clearLayers();
    for (const feature of siteMap.features) {
      const def = SITE_FEATURE_KINDS[feature.kind];
      const latLngs = feature.points.map((p) => [p.lat, p.lng]);
      const selected = feature.id === selectedId;
      const style = { color: selected ? "#facc15" : def.color, weight: selected ? 4 : 3, fillOpacity: 0.15, dashArray: feature.kind === "no_access" ? "8 6" : null };
      let shape;
      if (def.geometry === "polygon") shape = L.polygon(latLngs, style);
      else if (def.geometry === "line") shape = L.polyline(latLngs, style);
      else shape = L.circleMarker(latLngs[0], { ...style, radius: 9, fillColor: def.color, fillOpacity: 0.9, color: selected ? "#facc15" : "#111" });
      const label = feature.label || def.label;
      shape.bindTooltip(escapeHtml(label), { permanent: feature.kind === "note" || feature.kind === "staging", direction: "top" });
      shape.on("click", () => {
        if (toolRef.current !== "select" || alignRef.current) return;
        featureClickRef.current = true; // the map's own click handler fires next; it must not deselect
        setSelectedId(feature.id);
      });
      shape.addTo(layer);
    }
  }, [siteMap, selectedId, ready]);

  // Draft (drawing or measuring) and alignment control points.
  useEffect(() => {
    const layer = layersRef.current.draft;
    if (!layer) return;
    layer.clearLayers();
    if (!draft.length) return;
    const latLngs = draft.map((p) => [p.lat, p.lng]);
    const color = tool === "measure" ? "#facc15" : SITE_FEATURE_KINDS[tool]?.color || "#facc15";
    L.polyline(latLngs, { color, weight: 3, dashArray: "6 4", interactive: false }).addTo(layer);
    for (const at of latLngs) L.circleMarker(at, { radius: 4, color: "#000", weight: 1, fillColor: color, fillOpacity: 1, interactive: false }).addTo(layer);
  }, [draft, tool]);

  useEffect(() => {
    const layer = layersRef.current.align;
    if (!layer) return;
    layer.clearLayers();
    (align?.points || []).forEach((row, index) => {
      if (row.geo) L.marker(row.geo, { icon: numberedIcon(index + 1, "is-map"), interactive: false }).addTo(layer);
    });
  }, [align]);

  // Edits.
  const change = useCallback((updater) => {
    setSiteMap((current) => {
      if (!current) return current;
      const next = updater(current);
      if (next !== current) { dirtyRef.current = true; setSaveState("dirty"); }
      return next;
    });
  }, []);

  const finishDraft = useCallback(() => {
    const kind = toolRef.current;
    // A double-click to finish also delivers two clicks; drop repeated points.
    const points = draftRef.current.filter((p, i, all) => i === 0
      || Math.abs(p.lat - all[i - 1].lat) > 1e-7 || Math.abs(p.lng - all[i - 1].lng) > 1e-7);
    if (!SITE_FEATURE_KINDS[kind] || readOnly) return;
    const geometry = SITE_FEATURE_KINDS[kind].geometry;
    if ((geometry === "polygon" && points.length < 3) || (geometry === "line" && points.length < 2)) return;
    try {
      let createdId = "";
      change((current) => {
        const next = addSiteFeature(current, { kind, points }, actor.actorUid || "");
        createdId = next.features[next.features.length - 1].id;
        return next;
      });
      setTimeout(() => setSelectedId(createdId), 0);
    } catch (error) {
      onError?.(error.message);
    }
    draftRef.current = [];
    setDraft([]);
    toolRef.current = "select";
    setToolState("select");
  }, [change, readOnly, actor.actorUid, onError]);

  const handleMapClick = useCallback((event) => {
    const at = { lat: event.latlng.lat, lng: event.latlng.lng };
    const current = alignRef.current;
    if (current) {
      const points = [...current.points];
      const last = points[points.length - 1];
      if (last && last.floor && !last.geo) points[points.length - 1] = { ...last, geo: [at.lat, at.lng] };
      else { onError?.("Click the point on the floor plan first, then the same spot on the map."); return; }
      setAlign({ ...current, points });
      return;
    }
    const active = toolRef.current;
    if (active === "select") {
      if (featureClickRef.current) featureClickRef.current = false;
      else setSelectedId("");
      return;
    }
    if (active !== "measure" && readOnly) return;
    draftRef.current = [...draftRef.current, at];
    setDraft(draftRef.current);
    if (SITE_FEATURE_KINDS[active]?.geometry === "point") finishDraft();
  }, [finishDraft, readOnly, onError]);

  const handleMapClickRef = useRef(handleMapClick);
  handleMapClickRef.current = handleMapClick;
  const finishDraftRef = useRef(finishDraft);
  finishDraftRef.current = finishDraft;

  // Keyboard: Enter finishes, Esc cancels, Backspace removes the last point.
  useEffect(() => {
    function onKey(event) {
      if (event.target?.matches?.("input, textarea, select, button")) return;
      if (!draftRef.current.length) return;
      if (event.key === "Enter") finishDraftRef.current();
      else if (event.key === "Escape") { draftRef.current = []; setDraft([]); }
      else if (event.key === "Backspace" && draftRef.current.length) {
        event.preventDefault();
        draftRef.current = draftRef.current.slice(0, -1);
        setDraft(draftRef.current);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave.
  const doSave = useCallback(async () => {
    if (readOnly || !dirtyRef.current || conflict) return;
    const current = siteMapRef.current;
    if (!current) return;
    setSaveState("saving");
    dirtyRef.current = false;
    try {
      const stored = await saveSiteMap(departmentId, current, { expectedVersion: savedVersionRef.current, actorUid: actor.actorUid || "" });
      savedVersionRef.current = stored.version;
      setSaveState(dirtyRef.current ? "dirty" : "saved");
    } catch (error) {
      dirtyRef.current = true;
      if (error?.code === "floor-plan-conflict") { setConflict(true); setSaveState("conflict"); }
      else { setSaveState("error"); onError?.(error?.message || "Couldn't save the site map."); }
    }
  }, [departmentId, actor.actorUid, readOnly, conflict, onError]);

  const siteMapRef = useRef(siteMap);
  siteMapRef.current = siteMap;
  useEffect(() => {
    if (saveState !== "dirty") return undefined;
    const timer = setTimeout(doSave, AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [saveState, siteMap, doSave]);

  // Leaving the tab unmounts the panel: save anything still waiting for the timer.
  const doSaveRef = useRef(doSave);
  doSaveRef.current = doSave;
  useEffect(() => () => { if (dirtyRef.current) doSaveRef.current(); }, []);

  useEffect(() => {
    function beforeUnload(event) {
      if (dirtyRef.current) { event.preventDefault(); event.returnValue = ""; }
    }
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);

  async function reloadAfterConflict() {
    const stored = await getSiteMap(departmentId, revision.id);
    const base = normalizeSiteMap(stored || { preplanId: preplan.id, revisionId: revision.id });
    savedVersionRef.current = base.version;
    dirtyRef.current = false;
    setSiteMap({ ...base, preplanId: preplan.id, revisionId: revision.id });
    setConflict(false);
    setSaveState("saved");
  }

  function saveView() {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    change((current) => ({ ...current, view: { center: { lat: c.lat, lng: c.lng }, zoom: map.getZoom() } }));
  }

  // Alignment.
  function startAlign(floorId) {
    const existing = siteMap.alignments[floorId];
    setTool("select");
    setSelectedId("");
    setAlign({
      floorId,
      kind: existing?.kind || "similarity",
      points: existing ? controlPointsOf(existing) : [],
    });
  }

  const alignFit = useMemo(() => {
    if (!align) return { fit: null, error: "" };
    const complete = align.points.filter((row) => row.floor && row.geo);
    if (complete.length < MIN_POINTS[align.kind]) return { fit: null, error: "" };
    try { return { fit: fitTransform(complete, align.kind), error: "" }; } catch (error) { return { fit: null, error: error.message }; }
  }, [align]);

  // Live preview of the alignment being edited.
  useEffect(() => {
    const layer = layersRef.current.align;
    if (!layer || !align || !alignFit.fit) return;
    const preview = projectFloorPlan(planByFloor.get(align.floorId), { transform: alignFit.fit.transform });
    for (const shape of preview) {
      if (shape.kind === "point") continue;
      const Shape = shape.kind === "polygon" ? L.polygon : L.polyline;
      Shape(shape.latLngs, { color: "#facc15", weight: 2, fillOpacity: 0.05, dashArray: "4 3", interactive: false }).addTo(layer);
    }
  }, [align, alignFit, planByFloor]);

  function saveAlignment() {
    if (!alignFit.fit) return;
    const complete = align.points.filter((row) => row.floor && row.geo);
    change((current) => setFloorAlignment(current, align.floorId, alignFit.fit, complete, actor.actorUid || ""));
    setShownFloors((current) => ({ ...current, [align.floorId]: true }));
    setAlign(null);
  }

  if (!siteMap) return <div className="spm-root"><p className="ipw-empty">Loading site map…</p></div>;

  const selected = siteMap.features.find((row) => row.id === selectedId) || null;
  const measureText = tool === "measure" && draft.length > 1
    ? `${formatLength(pathLengthMeters(draft))}${draft.length > 2 ? ` · enclosed ${formatArea(polygonAreaSqMeters(draft))}` : ""}`
    : "";
  const drawingGeometry = SITE_FEATURE_KINDS[tool]?.geometry;
  const floorName = (id) => {
    const floor = floors.find((row) => row.id === id);
    const building = buildings.find((row) => row.id === floor?.buildingId);
    return floor ? `${building?.name ? `${building.name} · ` : ""}${floor.name}` : "Removed floor";
  };
  const alignPlan = align ? planByFloor.get(align.floorId) : null;
  const alignQuality = describeAlignmentQuality(alignFit.fit);

  return (
    <div className="spm-root">
      <div className="spm-toolbar" role="toolbar" aria-label="Site map tools">
        <div className="spm-group" role="radiogroup" aria-label="Basemap">
          {BASEMAP_PROVIDERS.map((row) => (
            <button key={row.id} type="button" role="radio" aria-checked={provider.id === row.id}
              className={`fpe-tool${provider.id === row.id ? " is-active" : ""}`}
              onClick={() => (readOnly ? setSiteMap((c) => ({ ...c, basemap: row.id })) : change((c) => ({ ...c, basemap: row.id })))}>
              {row.label}
            </button>
          ))}
        </div>
        <div className="spm-group">
          <button type="button" className={`fpe-tool${tool === "select" ? " is-active" : ""}`} onClick={() => setTool("select")} disabled={Boolean(align)}>
            <MousePointer2 size={14} /> Select
          </button>
          <button type="button" className={`fpe-tool${tool === "measure" ? " is-active" : ""}`} onClick={() => setTool("measure")} disabled={Boolean(align)}>
            <Ruler size={14} /> Measure
          </button>
          <button type="button" className={`fpe-tool${showHydrants ? " is-active" : ""}`} aria-pressed={showHydrants} onClick={() => setShowHydrants((v) => !v)}>
            <Droplets size={14} /> Hydrants
          </button>
          {!readOnly ? (
            <button type="button" className="fpe-tool" onClick={saveView} title="Open the site map at the current view">
              <LocateFixed size={14} /> Save view
            </button>
          ) : null}
        </div>
        <span className={`fpe-save fpe-save-${readOnly ? "readonly" : saveState}`} role="status" aria-live="polite">
          {readOnly ? "Read only" : { saved: "All changes saved", dirty: "Unsaved changes", saving: "Saving…", error: "Not saved", conflict: "Not saved: changed elsewhere" }[saveState]}
        </span>
      </div>
      {provider.note ? <p className="spm-note">{provider.note}</p> : null}
      {conflict ? (
        <div className="fpe-error" role="alert">
          Someone else saved this site map. Your latest changes weren't saved.
          <button type="button" className="secondary-button" onClick={reloadAfterConflict}>Load their version</button>
        </div>
      ) : null}

      <div className="spm-body">
        <aside className="spm-side spm-tools" aria-label="Draw on the site map">
          {!readOnly ? (
            <>
              <h4>Draw</h4>
              {DRAW_TOOLS.map((kind) => (
                <button key={kind} type="button" disabled={Boolean(align)}
                  className={`spm-draw${tool === kind ? " is-active" : ""}`} onClick={() => setTool(kind)}>
                  <span className="spm-swatch" style={{ background: SITE_FEATURE_KINDS[kind].color }} aria-hidden="true" />
                  {SITE_FEATURE_KINDS[kind].label}
                </button>
              ))}
            </>
          ) : null}
          <h4>Floor plans on the map</h4>
          {floors.length ? floors.map((floor) => {
            const alignment = siteMap.alignments[floor.id];
            const hasPlan = (planByFloor.get(floor.id)?.objects || []).length > 0;
            return (
              <div key={floor.id} className="spm-floor">
                <label>
                  <input type="checkbox" disabled={!alignment} checked={Boolean(alignment && shownFloors[floor.id])}
                    onChange={(event) => setShownFloors((c) => ({ ...c, [floor.id]: event.target.checked }))} />
                  {floorName(floor.id)}
                </label>
                <small>
                  {alignment ? (alignment.status === "verified" ? "Aligned · confirmed" : "Aligned · not confirmed") : hasPlan ? "Not aligned" : "No drawing yet"}
                </small>
                <div className="spm-row">
                  {!readOnly && hasPlan ? (
                    <button type="button" className="secondary-button" onClick={() => startAlign(floor.id)} disabled={Boolean(align)}>
                      <Crosshair size={13} /> {alignment ? "Re-align" : "Align"}
                    </button>
                  ) : null}
                  {!readOnly && alignment && alignment.status !== "verified" ? (
                    <button type="button" className="secondary-button" onClick={() => change((c) => verifyFloorAlignment(c, floor.id, actor.actorUid || ""))}>
                      <Check size={13} /> Confirm
                    </button>
                  ) : null}
                  {!readOnly && alignment ? (
                    <button type="button" className="secondary-button" onClick={() => change((c) => clearFloorAlignment(c, floor.id))} aria-label={`Remove alignment for ${floorName(floor.id)}`}>
                      <X size={13} />
                    </button>
                  ) : null}
                </div>
              </div>
            );
          }) : <p className="fpe-muted">Add floors on the Floor plans tab.</p>}
        </aside>

        <div className="spm-map-wrap">
          <div ref={elRef} className="spm-map" role="application" aria-label="Site map" tabIndex={0} />
          {drawingGeometry || tool === "measure" ? (
            <div className="spm-hint" role="status">
              {tool === "measure"
                ? (measureText || "Click points to measure. Esc clears.")
                : drawingGeometry === "point"
                  ? `Click the map to place: ${SITE_FEATURE_KINDS[tool].label}.`
                  : `Click to add points. Double-click or Enter to finish, Backspace to undo a point, Esc to cancel. (${draft.length} point${draft.length === 1 ? "" : "s"})`}
              {drawingGeometry && drawingGeometry !== "point" && draft.length ? (
                <button type="button" className="secondary-button" onClick={finishDraft}><Check size={13} /> Finish</button>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="spm-side spm-inspector" aria-label={align ? "Align a floor plan" : "Site features"}>
          {align ? (
            <div className="spm-align">
              <h4>Align {floorName(align.floorId)}</h4>
              <p className="fpe-muted">
                Click a corner or feature on the floor plan below, then the same spot on the map. Use at least
                {` ${MIN_POINTS[align.kind]} `}points spread across the building; one extra point measures the error.
              </p>
              {alignPlan ? (
                <PlanPreview objects={alignPlan.objects} width={alignPlan.canvas.width} height={alignPlan.canvas.height}
                  background={alignPlan.background}
                  backgroundUrl={alignPlan.background?.fileId ? files.find((row) => row.id === alignPlan.background.fileId)?.downloadUrl || "" : ""}
                  points={align.points} label="Floor plan: click to place a control point"
                  onPick={(pt) => {
                  const last = align.points[align.points.length - 1];
                  if (last && !last.geo) { onError?.("Now click that spot on the map."); return; }
                  setAlign({ ...align, points: [...align.points, { floor: pt }] });
                }} />
              ) : <p className="fpe-muted">This floor has no drawing in this revision.</p>}
              <label className="spm-field">
                Method
                <select value={align.kind} onChange={(event) => setAlign({ ...align, kind: event.target.value })}>
                  <option value="similarity">Move, rotate, scale (2+ points)</option>
                  <option value="affine">Also correct skew (3+ points)</option>
                </select>
              </label>
              <ol className="spm-cps">
                {align.points.map((row, index) => (
                  <li key={index}>
                    Point {index + 1}: {row.geo ? "placed" : "click the map"}
                    {alignFit.fit?.residualsMeters && row.geo && alignFit.fit.errorMeaningful
                      ? ` · off by ${Math.round((alignFit.fit.residualsMeters[align.points.filter((p) => p.geo).indexOf(row)] || 0) * 3.281)} ft`
                      : ""}
                  </li>
                ))}
              </ol>
              {alignFit.error ? <p className="fpe-warn">{alignFit.error}</p> : null}
              {alignFit.fit ? <p className={`spm-quality is-${alignQuality.level}`}>{alignQuality.text}</p> : null}
              <p className="fpe-muted">An alignment is approximate and is saved as not confirmed. It can't be published until someone confirms it on the map.</p>
              <div className="spm-row">
                <button type="button" className="secondary-button" disabled={!align.points.length}
                  onClick={() => setAlign({ ...align, points: align.points.slice(0, -1) })}>
                  <Undo2 size={13} /> Undo point
                </button>
                <button type="button" className="secondary-button" onClick={() => setAlign(null)}>Cancel</button>
                <button type="button" className="primary-button" disabled={!alignFit.fit} onClick={saveAlignment}>
                  <Save size={13} /> Save alignment
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="spm-feature">
              <h4>{SITE_FEATURE_KINDS[selected.kind].label}</h4>
              <p className="fpe-muted">{describeSiteFeature(selected)}</p>
              <label className="spm-field">
                Label
                <input value={selected.label} disabled={readOnly} maxLength={120}
                  onChange={(event) => change((c) => updateSiteFeature(c, selected.id, { label: event.target.value }))} />
              </label>
              <label className="spm-field">
                Notes
                <textarea value={selected.notes} disabled={readOnly} rows={3} maxLength={1000}
                  onChange={(event) => change((c) => updateSiteFeature(c, selected.id, { notes: event.target.value }))} />
              </label>
              {selected.kind === "footprint" ? (
                <label className="spm-field">
                  Building
                  <select value={selected.buildingId} disabled={readOnly}
                    onChange={(event) => change((c) => updateSiteFeature(c, selected.id, { buildingId: event.target.value }))}>
                    <option value="">Not linked</option>
                    {buildings.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                  </select>
                </label>
              ) : null}
              <div className="spm-row">
                {selected.buildingId && floors.some((row) => row.buildingId === selected.buildingId) ? (
                  <button type="button" className="secondary-button"
                    onClick={() => onOpenFloor?.(floors.find((row) => row.buildingId === selected.buildingId && row.kind === "ground")?.id
                      || floors.find((row) => row.buildingId === selected.buildingId).id)}>
                    <Layers size={13} /> Open floors
                  </button>
                ) : null}
                {!readOnly ? (
                  <button type="button" className="secondary-button danger" onClick={() => { change((c) => removeSiteFeature(c, selected.id)); setSelectedId(""); }}>
                    <Trash2 size={13} /> Delete
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div>
              <h4>Site features ({siteMap.features.length})</h4>
              {siteMap.features.length ? (
                <ul className="spm-list">
                  {siteMap.features.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => {
                        setSelectedId(row.id);
                        const map = mapRef.current;
                        if (map) map.fitBounds(L.latLngBounds(row.points.map((p) => [p.lat, p.lng])).pad(0.5), { maxZoom: 19 });
                      }}>
                        <span className="spm-swatch" style={{ background: SITE_FEATURE_KINDS[row.kind].color }} aria-hidden="true" />
                        <span>{row.label || SITE_FEATURE_KINDS[row.kind].label}</span>
                        <small>{describeSiteFeature(row)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="fpe-muted">Nothing drawn yet. Pick a tool on the left and click the map.</p>}
              {!Number.isFinite(preplan?.latitude) && !siteMap.view && !siteMap.features.length ? (
                <p className="fpe-warn">This preplan has no map location. Pan to the property, then use Save view.</p>
              ) : null}
              {hydrants.length === 0 ? <p className="fpe-muted">No hydrants with map locations on file.</p> : null}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
