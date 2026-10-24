/** Hydrant map (Leaflet), loaded only when the map tab is opened. Same colours as the desktop map. */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getRecordLatLng } from "../../lib/hydrantDamage/geo.js";
import { checkedLabel, hydrantAddress, hydrantFlowColor, hydrantKey, hydrantLabel } from "../fieldHydrants.js";

const TILE_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const VIEW_KEY = "forge-field-map-view";

function readView() {
  try {
    return JSON.parse(window.localStorage.getItem(VIEW_KEY) || "null");
  } catch {
    return null;
  }
}

export default function HydrantMap({ hydrants = [], position = null, onSelect }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const meRef = useRef(null);

  useEffect(() => {
    const map = L.map(containerRef.current, { zoomControl: true, preferCanvas: true, attributionControl: false });
    L.tileLayer(TILE_URL, { maxZoom: 19, crossOrigin: "anonymous" }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const saved = readView();
    if (saved?.center) map.setView(saved.center, saved.zoom || 15);
    map.on("moveend", () => {
      try {
        window.localStorage.setItem(VIEW_KEY, JSON.stringify({ center: map.getCenter(), zoom: map.getZoom() }));
      } catch {
        // ignore
      }
    });
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const points = [];
    hydrants.forEach((hydrant) => {
      const coords = getRecordLatLng(hydrant);
      if (!coords) return;
      points.push([coords.lat, coords.lng]);
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 9,
        weight: 2,
        color: "#ffffff",
        fillColor: hydrantFlowColor(hydrant),
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`${hydrantLabel(hydrant)} · ${checkedLabel(hydrant)}`, { direction: "top" });
      marker.on("click", () => onSelect?.(hydrantKey(hydrant)));
      marker.addTo(layer);
    });
    if (!readView() && points.length) map.fitBounds(points, { padding: [24, 24], maxZoom: 16 });
    else if (!points.length && !readView()) map.setView([39.5, -96], 4);
    // Keep addresses searchable for screen readers.
    containerRef.current?.setAttribute("aria-label", `Map of ${points.length} hydrants. ${hydrants.slice(0, 3).map(hydrantAddress).join(", ")}`);
  }, [hydrants]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (meRef.current) {
      meRef.current.remove();
      meRef.current = null;
    }
    if (position) {
      meRef.current = L.circleMarker([position.lat, position.lng], { radius: 8, color: "#ffffff", weight: 3, fillColor: "#0ea5e9", fillOpacity: 1 }).addTo(map);
      map.setView([position.lat, position.lng], Math.max(map.getZoom(), 17));
    }
  }, [position]);

  return <div ref={containerRef} className="fa-map" role="application" />;
}
