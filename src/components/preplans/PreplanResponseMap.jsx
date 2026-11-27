import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { SITE_FEATURE_KINDS, basemapById } from "../../lib/preplans/siteMapModel.js";
import { findSymbol } from "../../lib/preplans/symbolCatalog.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const FLOOR_COLOR = "#22d3ee";

/**
 * Read-only map for the response view: the published site map's features,
 * the chosen floor where its alignment is confirmed, alerts placed on that
 * floor, and linked or nearby hydrants. `model` comes from buildResponseMap.
 */
export default function PreplanResponseMap({ model, catalog = [], floorName = "" }) {
  const elRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const tileRef = useRef(null);
  const fittedRef = useRef(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const provider = basemapById(model.basemap);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return undefined;
    const map = L.map(elRef.current, { zoomControl: true, maxZoom: 21, doubleClickZoom: true });
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);
    const timers = [setTimeout(() => map.invalidateSize(), 60), setTimeout(() => map.invalidateSize(), 300)];
    return () => { timers.forEach(clearTimeout); map.remove(); mapRef.current = null; tileRef.current = null; fittedRef.current = false; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    tileRef.current?.remove();
    setTilesFailed(false);
    let errors = 0;
    tileRef.current = L.tileLayer(provider.url, { maxZoom: 21, maxNativeZoom: provider.maxZoom, attribution: provider.attribution })
      .on("tileerror", () => { errors += 1; if (errors >= 3) setTilesFailed(true); })
      .on("tileload", () => { errors = 0; setTilesFailed(false); })
      .addTo(map);
    tileRef.current.bringToBack();
  }, [provider]);

  // Fit once: everything drawn → saved view → site location.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || fittedRef.current) return;
    fittedRef.current = true;
    if (model.fitPoints.length > 1) map.fitBounds(L.latLngBounds(model.fitPoints).pad(0.25), { maxZoom: 19 });
    else if (model.view) map.setView([model.view.center.lat, model.view.center.lng], model.view.zoom);
    else if (model.fitPoints.length) map.setView(model.fitPoints[0], 18);
    else if (model.hydrants.length) map.fitBounds(L.latLngBounds(model.hydrants.map((row) => row.at)).pad(0.3), { maxZoom: 18 });
  }, [model]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    // Site features first, then the floor on top so its walls and rooms stay visible.
    for (const feature of model.features) {
      const style = { color: feature.color, weight: 4, fillOpacity: 0.15, dashArray: feature.kind === "no_access" ? "10 7" : null };
      let shape;
      if (feature.geometry === "polygon") shape = L.polygon(feature.latLngs, style);
      else if (feature.geometry === "line") shape = L.polyline(feature.latLngs, style);
      else shape = L.circleMarker(feature.latLngs[0], { radius: 11, weight: 2, color: "#111", fillColor: feature.color, fillOpacity: 0.95 });
      const text = feature.notes ? `${feature.label}: ${feature.notes}` : feature.label;
      const permanent = ["staging", "hazard", "note"].includes(feature.kind);
      shape.bindTooltip(escapeHtml(text), { permanent, direction: "top", className: "prv-map-label" }).addTo(layer);
    }

    for (const shape of model.floorShapes) {
      if (shape.kind === "point") {
        const symbol = shape.symbolId ? findSymbol(shape.symbolId, catalog) : null;
        L.circleMarker(shape.latLngs[0], { radius: 6, color: "#000", weight: 1, fillColor: symbol?.color || FLOOR_COLOR, fillOpacity: 1 })
          .bindTooltip(escapeHtml(shape.label || symbol?.label || "Symbol"))
          .addTo(layer);
      } else if (shape.kind === "polygon") {
        L.polygon(shape.latLngs, { color: FLOOR_COLOR, weight: 1.5, fillOpacity: 0.08, interactive: false }).addTo(layer);
      } else {
        L.polyline(shape.latLngs, { color: FLOOR_COLOR, weight: shape.type === "exterior_wall" ? 3 : 1.5, interactive: false }).addTo(layer);
      }
    }

    for (const hydrant of model.hydrants) {
      const detail = [
        `Hydrant ${hydrant.label}`,
        hydrant.linked ? "(on preplan)" : `${hydrant.meters} m away`,
        hydrant.flowGpm != null ? `${hydrant.flowGpm} gpm` : "",
        hydrant.outOfService ? "OUT OF SERVICE" : "",
      ].filter(Boolean).join(" · ");
      L.circleMarker(hydrant.at, {
        radius: hydrant.linked ? 9 : 6, weight: 2, color: "#fff",
        fillColor: hydrant.outOfService ? "#6b7280" : "#dc2626", fillOpacity: 0.95,
      }).bindTooltip(escapeHtml(detail)).addTo(layer);
    }

    for (const pin of model.alertPins) {
      const verified = pin.alert.verificationStatus === "verified";
      const icon = L.divIcon({ className: `prv-map-alert${verified ? "" : " is-reported"}`, html: "<span>!</span>", iconSize: [28, 28], iconAnchor: [14, 14] });
      L.marker(pin.at, { icon, keyboard: false })
        .bindTooltip(escapeHtml(`${verified ? "Alert" : "Reported, not verified"}: ${pin.alert.description}`), { direction: "top" })
        .addTo(layer);
    }

    if (model.site && !model.features.some((row) => row.kind === "footprint")) {
      L.circleMarker(model.site, { radius: 7, weight: 3, color: "#facc15", fillOpacity: 0 })
        .bindTooltip("Occupancy location (no footprint drawn)").addTo(layer);
    }
  }, [model, catalog]);

  const kindsShown = [...new Set(model.features.map((row) => row.kind))];
  return (
    <div className="prv-map-wrap">
      <div ref={elRef} className="prv-map" role="region" aria-label="Site map" />
      <div className="prv-legend" aria-label="Map legend">
        {kindsShown.map((kind) => (
          <span key={kind}><i className="prv-swatch" style={{ background: SITE_FEATURE_KINDS[kind].color }} /> {SITE_FEATURE_KINDS[kind].label}</span>
        ))}
        {model.hydrants.length ? <span><i className="prv-swatch is-round" style={{ background: "#dc2626" }} /> Hydrant (grey: out of service)</span> : null}
        {model.floorShapes.length ? <span><i className="prv-swatch" style={{ background: FLOOR_COLOR }} /> {floorName || "Floor plan"}</span> : null}
        {model.alertPins.length ? <span><i className="prv-swatch is-round" style={{ background: "#f97316" }} /> Alert on this floor</span> : null}
      </div>
      {provider.note ? <p className="prv-note">{provider.note}</p> : null}
      {tilesFailed ? <p className="prv-note prv-warn">Map imagery isn&apos;t loading (no connection?). The drawn site features are still shown.</p> : null}
    </div>
  );
}
