/**
 * Hydrant map (Leaflet), loaded only when the map is opened. Same satellite
 * map and colours as the desktop map, plus a live "you are here" tracker.
 */
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

function boundsOf(hydrants) {
  const points = [];
  hydrants.forEach((hydrant) => {
    const coords = getRecordLatLng(hydrant);
    if (coords) points.push([coords.lat, coords.lng]);
  });
  return points;
}

const meIcon = L.divIcon({
  className: "fa-me",
  html: '<span class="fa-me-cone"></span><span class="fa-me-dot"></span>',
  iconSize: [44, 44],
  iconAnchor: [22, 22],
});

/**
 * hydrants: what to draw. position: live location or null. follow: keep the
 * map centred on the position (turned off when the person drags the map).
 * fitKey: change it to fit all hydrants ("City").
 */
export default function HydrantMap({ hydrants = [], position = null, follow = false, onFollowChange, selectedKey = "", onSelect, fitKey = 0 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const markersRef = useRef(new Map());
  const meRef = useRef(null);
  const ringRef = useRef(null);
  const followRef = useRef(follow);
  const onFollowChangeRef = useRef(onFollowChange);
  const onSelectRef = useRef(onSelect);
  followRef.current = follow;
  onFollowChangeRef.current = onFollowChange;
  onSelectRef.current = onSelect;

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
    // Dragging the map means "let me look around": stop following.
    map.on("dragstart", () => {
      if (followRef.current) onFollowChangeRef.current?.(false);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = new Map();
      meRef.current = null;
      ringRef.current = null;
    };
  }, []);

  // Hydrant dots.
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    markersRef.current = new Map();
    hydrants.forEach((hydrant) => {
      const coords = getRecordLatLng(hydrant);
      if (!coords) return;
      const key = hydrantKey(hydrant);
      const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 9,
        weight: 2,
        color: "#ffffff",
        fillColor: hydrantFlowColor(hydrant),
        fillOpacity: 0.95,
      });
      marker.bindTooltip(`${hydrantLabel(hydrant)} · ${checkedLabel(hydrant)}`, { direction: "top" });
      marker.on("click", () => onSelectRef.current?.(key));
      marker.addTo(layer);
      markersRef.current.set(key, marker);
    });
    const points = boundsOf(hydrants);
    if (!readView() && points.length) map.fitBounds(points, { padding: [24, 24], maxZoom: 16 });
    else if (!points.length && !readView()) map.setView([39.5, -96], 4);
    containerRef.current?.setAttribute("aria-label", `Map of ${points.length} hydrants. ${hydrants.slice(0, 3).map(hydrantAddress).join(", ")}`);
  }, [hydrants]);

  // Selected hydrant: bigger dot with a thick white ring, brought into view.
  useEffect(() => {
    const map = mapRef.current;
    markersRef.current.forEach((marker, key) => {
      const selected = key === selectedKey;
      marker.setStyle({ radius: selected ? 13 : 9, weight: selected ? 4 : 2 });
      if (selected) {
        marker.bringToFront();
        if (map && !map.getBounds().pad(-0.15).contains(marker.getLatLng())) map.panTo(marker.getLatLng());
      }
    });
  }, [selectedKey, hydrants]);

  // "City": fit every hydrant.
  useEffect(() => {
    if (!fitKey || !mapRef.current) return;
    const points = boundsOf(hydrants);
    if (points.length) mapRef.current.fitBounds(points, { padding: [24, 24], maxZoom: 16 });
    // Only when the button is pressed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Live location: dot, accuracy ring and direction of travel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!position) {
      meRef.current?.remove();
      ringRef.current?.remove();
      meRef.current = null;
      ringRef.current = null;
      return;
    }
    const latLng = [position.lat, position.lng];
    if (!meRef.current) {
      ringRef.current = L.circle(latLng, { radius: position.accuracy || 0, color: "#0ea5e9", weight: 1, fillColor: "#0ea5e9", fillOpacity: 0.12, interactive: false }).addTo(map);
      meRef.current = L.marker(latLng, { icon: meIcon, interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(map);
    } else {
      meRef.current.setLatLng(latLng);
      ringRef.current.setLatLng(latLng);
      ringRef.current.setRadius(position.accuracy || 0);
    }
    const element = meRef.current.getElement();
    if (element) {
      element.classList.toggle("has-heading", position.heading !== null);
      element.style.setProperty("--fa-heading", `${position.heading || 0}deg`);
    }
  }, [position]);

  // Follow: keep the person in the middle.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !follow || !position) return;
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 17), { animate: true });
  }, [follow, position]);

  return <div ref={containerRef} className="fa-map" role="application" />;
}
