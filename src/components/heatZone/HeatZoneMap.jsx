import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Maximize2, RotateCcw } from "lucide-react";
import { createHeatLayer } from "../../lib/heatZone/heatLayer.js";
import { loadHeatZoneMarkers } from "../../lib/heatZone/heatZoneService.js";
import { formatInZone } from "../../lib/heatZone/heatZoneFilters.js";
import { FALLBACK_CENTER, boundsOfPoints, boundsOfZones, describeError, escapeHtml, formatCount, roundBounds } from "../../lib/heatZone/heatZoneUi.js";
import MapLegend from "./MapLegend.jsx";

const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const MOVE_DEBOUNCE_MS = 400;

const heatPoints = (heat) => (heat?.cells || []).map((c) => ({ lat: c.lat, lng: c.lng, value: c.value }));

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function viewportOf(map) {
  const b = map.getBounds();
  return roundBounds({ south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() });
}

/** Fit heat cells, else boundaries, else the fallback centre. */
function fitToData(map, heat, boundaries, animate = false) {
  const box = boundsOfPoints(heat?.cells) || boundsOfZones(boundaries || []);
  if (box) map.fitBounds(L.latLngBounds(box).pad(0.08), { maxZoom: 16, animate });
  else map.setView(FALLBACK_CENTER, 12, { animate });
}

/**
 * Leaflet map with heat, incident markers and boundary layers. One instance
 * per mounted tab; the shared `viewRef` keeps the view between instances.
 */
export default function HeatZoneMap(props) {
  const {
    departmentId, heat, boundaries, capabilities = {}, requestKey, highPriorities = [],
    mode, onModeChange, prefs, onPrefsChange, viewRef, onResetFilters,
    focus, markersKey, mappedCalls, size = "full",
  } = props;
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const heatLayerRef = useRef(null);
  const boundaryRef = useRef({ district: null, zone: null });
  const markersRef = useRef(null);
  const markerRendererRef = useRef(null);
  const boundaryRendererRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const markerSeqRef = useRef(0);
  const lastMarkerQueryRef = useRef(null);
  const [viewTick, setViewTick] = useState(0);
  const [markerState, setMarkerState] = useState(null);

  const canMark = Boolean(capabilities.viewMarkers);
  const showMarkers = canMark && prefs.incidents;
  const hasDistricts = (boundaries || []).some((z) => z.kind === "district" && z.active !== false);
  const hasZones = (boundaries || []).some((z) => z.kind === "zone" && z.active !== false);

  // Create the map once per mount and always remove it on unmount.
  useEffect(() => {
    const el = elRef.current;
    if (!el) return undefined;
    const map = L.map(el, { preferCanvas: true, zoomControl: true, worldCopyJump: true });
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "Tiles &copy; Esri" }).addTo(map);
    map.createPane("hzBoundaries").style.zIndex = "350";
    map.createPane("hzMarkers").style.zIndex = "450";
    markerRendererRef.current = L.canvas({ pane: "hzMarkers", padding: 0.3 });
    boundaryRendererRef.current = L.svg({ pane: "hzBoundaries" });
    markersRef.current = L.layerGroup().addTo(map);
    const start = propsRef.current;
    heatLayerRef.current = createHeatLayer({ points: heatPoints(start.heat), max: start.heat?.maxValue, intensity: start.prefs.intensity });
    if (start.prefs.heat) heatLayerRef.current.addTo(map);

    let timer = null;
    const onMove = () => {
      const view = { center: map.getCenter(), zoom: map.getZoom(), bounds: viewportOf(map) };
      Object.assign(start.viewRef.current, view);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setViewTick((t) => t + 1);
        propsRef.current.onViewChange?.({ bounds: view.bounds, zoom: Math.round(view.zoom) });
      }, MOVE_DEBOUNCE_MS);
    };
    map.on("moveend", onMove);

    const saved = start.viewRef.current;
    if (saved?.center && Number.isFinite(saved.zoom)) map.setView(saved.center, saved.zoom, { animate: false });
    else fitToData(map, start.heat, start.boundaries);
    mapRef.current = map;

    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(el);
    const settle = window.setTimeout(() => map.invalidateSize(), 120);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(settle);
      resize.disconnect();
      map.off("moveend", onMove);
      map.remove();
      mapRef.current = null;
      heatLayerRef.current = null;
      markersRef.current = null;
      boundaryRef.current = { district: null, zone: null };
    };
  }, []);

  useEffect(() => {
    heatLayerRef.current?.setData(heatPoints(heat), heat?.maxValue);
  }, [heat]);

  useEffect(() => {
    heatLayerRef.current?.setIntensity(prefs.intensity);
  }, [prefs.intensity]);

  useEffect(() => {
    const map = mapRef.current;
    const layer = heatLayerRef.current;
    if (!map || !layer) return;
    if (prefs.heat && !map.hasLayer(layer)) layer.addTo(map);
    if (!prefs.heat && map.hasLayer(layer)) map.removeLayer(layer);
  }, [prefs.heat]);

  // Boundary outlines. Names come from imports, so tooltips are escaped.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of Object.values(boundaryRef.current)) layer?.remove();
    const renderer = boundaryRendererRef.current;
    const build = (kind) => L.geoJSON(
      (boundaries || []).filter((z) => z.kind === kind && z.active !== false && z.geometry)
        .map((z) => ({ type: "Feature", properties: { name: z.name, color: z.color }, geometry: z.geometry })),
      {
        pane: "hzBoundaries",
        renderer,
        style: (f) => ({
          color: f.properties.color, weight: kind === "district" ? 2.5 : 1.5, dashArray: kind === "zone" ? "6 4" : null,
          fillColor: f.properties.color, fillOpacity: kind === "district" ? 0.07 : 0.04,
        }),
        onEachFeature: (f, layer) => layer.bindTooltip(escapeHtml(f.properties.name), { sticky: true, className: "hz-tooltip" }),
      },
    );
    boundaryRef.current = {
      district: prefs.districts ? build("district").addTo(map) : null,
      zone: prefs.zones ? build("zone").addTo(map) : null,
    };
  }, [boundaries, prefs.districts, prefs.zones]);

  function drawMarkers(res, append) {
    const map = mapRef.current;
    const group = markersRef.current;
    if (!map || !group) return;
    if (!append) group.clearLayers();
    if (res.mode === "clusters") {
      for (const c of res.clusters || []) {
        const count = Number(c.count) || 0;
        const px = Math.round(26 + Math.min(26, Math.log2(count + 1) * 3.5));
        L.marker([c.lat, c.lng], {
          icon: L.divIcon({ className: "hz-cluster", html: `<span>${escapeHtml(formatCount(count))}</span>`, iconSize: [px, px] }),
          title: `${count} incidents — click to zoom in`,
          keyboard: true,
        }).on("click", () => map.setView([c.lat, c.lng], Math.min(19, map.getZoom() + 2))).addTo(group);
      }
      return;
    }
    const high = new Set(propsRef.current.highPriorities || []);
    const critical = cssVar("--rms-critical", "#ef4a00");
    const primary = cssVar("--rms-primary", "#25a194");
    const edge = cssVar("--rms-bg-surface", "#ffffff");
    const zone = propsRef.current.timeZone;
    for (const m of res.markers || []) {
      L.circleMarker([m.lat, m.lng], {
        renderer: markerRendererRef.current, pane: "hzMarkers", radius: high.has(m.priority) ? 7 : 5.5,
        color: edge, weight: 1.5, fillColor: high.has(m.priority) ? critical : primary, fillOpacity: 0.92,
      })
        .bindTooltip(`<strong>${escapeHtml(m.classification || "Incident")}</strong><br>${escapeHtml(m.priority || "")}${m.priority ? " · " : ""}${escapeHtml(formatInZone(m.occurredAt, zone))}`, { className: "hz-tooltip" })
        .on("click", () => propsRef.current.onSelectIncident?.(m.id))
        .addTo(group);
    }
  }

  async function fetchMarkers(page = 0) {
    const map = mapRef.current;
    if (!map) return;
    const seq = ++markerSeqRef.current;
    const query = page === 0
      ? { viewport: viewportOf(map), zoom: Math.round(map.getZoom()), filters: propsRef.current.requestFilters }
      : lastMarkerQueryRef.current;
    if (!query) return;
    lastMarkerQueryRef.current = query;
    setMarkerState((s) => ({ ...(s || {}), loading: true, error: "" }));
    try {
      const res = await loadHeatZoneMarkers(propsRef.current.departmentId, query.filters, { viewport: query.viewport, zoom: query.zoom, page });
      if (seq !== markerSeqRef.current) return;
      drawMarkers(res, page > 0);
      setMarkerState((s) => ({
        loading: false, error: "", mode: res.mode, total: res.total || 0, page: res.page || 0, hasMore: Boolean(res.hasMore),
        shown: res.mode === "markers" ? (page > 0 ? (s?.shown || 0) : 0) + (res.markers || []).length : 0,
      }));
    } catch (error) {
      if (seq !== markerSeqRef.current) return;
      setMarkerState({ loading: false, error: describeError(error, "Unable to load incident markers.").message });
    }
  }

  useEffect(() => {
    if (!mapRef.current) return;
    if (!showMarkers) {
      markerSeqRef.current += 1;
      markersRef.current?.clearLayers();
      setMarkerState(null);
      return;
    }
    // The first moveend after the initial view bumps viewTick; wait for it.
    if (viewTick === 0) return;
    fetchMarkers(0);
  }, [showMarkers, viewTick, requestKey, markersKey, departmentId]);

  // Pan to a requested location (repeat locations). Each focus is used once.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus || viewRef.current.focusKey === focus.key) return;
    viewRef.current.focusKey = focus.key;
    map.flyTo([focus.lat, focus.lng], focus.zoom || 17, { duration: 0.8 });
  }, [focus]);

  const setPref = (key, value) => onPrefsChange((p) => ({ ...p, [key]: value }));
  const toggles = [
    { key: "heat", label: "Heat", show: true },
    { key: "incidents", label: "Incidents", show: canMark },
    { key: "districts", label: "Districts", show: true, disabled: !hasDistricts, title: "No districts configured" },
    { key: "zones", label: "Response zones", show: true, disabled: !hasZones, title: "No response zones configured" },
  ];

  return (
    <div className={`hz-map-shell is-${size}`}>
      <div className="hz-map-toolbar" role="toolbar" aria-label="Map layers and display">
        <div className="hz-chip-set" role="group" aria-label="Layers">
          {toggles.filter((t) => t.show).map((t) => (
            <button key={t.key} type="button" className={`hz-chip${prefs[t.key] && !t.disabled ? " active" : ""}`} aria-pressed={Boolean(prefs[t.key]) && !t.disabled} disabled={t.disabled} title={t.disabled ? t.title : undefined} onClick={() => setPref(t.key, !prefs[t.key])}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="hz-chip-set" role="group" aria-label="Density mode">
          <button type="button" className={`hz-chip${mode === "raw" ? " active" : ""}`} aria-pressed={mode === "raw"} title="Each call counts once" onClick={() => onModeChange("raw")}>Raw</button>
          <button type="button" className={`hz-chip${mode === "weighted" ? " active" : ""}`} aria-pressed={mode === "weighted"} title="Weighted by priority (weights are set in Settings)" onClick={() => onModeChange("weighted")}>Weighted by priority</button>
        </div>
        <label className="hz-range" title="Heat intensity (display only)">
          <span>Intensity</span>
          <input type="range" min="0.25" max="3" step="0.25" value={prefs.intensity} onChange={(e) => setPref("intensity", Number(e.target.value))} aria-valuetext={`${prefs.intensity}×`} />
          <output>{prefs.intensity}×</output>
        </label>
        <span className="hz-filter-spacer" />
        <button type="button" className="secondary-button hz-button" onClick={() => mapRef.current && fitToData(mapRef.current, heat, boundaries, true)}><Maximize2 size={14} /> Fit to data</button>
        <button type="button" className="secondary-button hz-button" onClick={onResetFilters}><RotateCcw size={14} /> Reset filters</button>
      </div>
      {!canMark && <p className="hz-map-note">You can view call density only. Individual incident markers need the “View incident markers” permission.</p>}

      <div className="hz-map-frame">
        <div ref={elRef} className="hz-map-canvas" aria-label="Heat Zone map" />
        {!mappedCalls && (
          <div className="hz-map-empty" role="status"><strong>No mapped incidents in this range</strong><span>Try a wider date range or fewer filters.</span></div>
        )}
        {showMarkers && markerState && (
          <div className="hz-map-status" role="status">
            {markerState.loading && <span>Loading incidents…</span>}
            {!markerState.loading && markerState.error && <span className="is-error">{markerState.error}</span>}
            {!markerState.loading && !markerState.error && markerState.mode === "clusters" && (
              <span>{formatCount(markerState.total)} incidents grouped — zoom in or click a group for individual calls</span>
            )}
            {!markerState.loading && !markerState.error && markerState.mode === "markers" && (
              <>
                <span>Showing {formatCount(markerState.shown)} of {formatCount(markerState.total)} incidents in view</span>
                {markerState.hasMore && <button type="button" className="text-button" onClick={() => fetchMarkers((markerState.page || 0) + 1)}>Load more</button>}
              </>
            )}
          </div>
        )}
        <MapLegend mode={mode} heatOn={prefs.heat} boundaries={boundaries} showDistricts={prefs.districts && hasDistricts} showZones={prefs.zones && hasZones} showMarkers={showMarkers} highPriorities={highPriorities} />
      </div>
    </div>
  );
}
