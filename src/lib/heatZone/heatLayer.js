/**
 * Canvas heat layer for Leaflet (no plugin dependency). Draws the server's
 * density grid as blurred points, then colours the alpha channel with the
 * Heat Zone ramp: blue -> green -> yellow -> orange -> red.
 */
import L from "leaflet";

export const HEAT_STOPS = [
  { at: 0.0, color: [37, 99, 235], label: "Very low" },   // blue
  { at: 0.3, color: [22, 163, 74], label: "Low" },        // green
  { at: 0.55, color: [250, 204, 21], label: "Moderate" }, // yellow
  { at: 0.78, color: [249, 115, 22], label: "High" },     // orange
  { at: 1.0, color: [220, 38, 38], label: "Very high" },  // red
];

function buildPalette() {
  const palette = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i += 1) {
    const t = i / 255;
    let hi = HEAT_STOPS.findIndex((s) => s.at >= t);
    if (hi <= 0) hi = 1;
    const a = HEAT_STOPS[hi - 1];
    const b = HEAT_STOPS[hi];
    const f = Math.min(1, Math.max(0, (t - a.at) / (b.at - a.at || 1)));
    for (let c = 0; c < 3; c += 1) palette[i * 4 + c] = Math.round(a.color[c] + (b.color[c] - a.color[c]) * f);
    palette[i * 4 + 3] = 255;
  }
  return palette;
}

const PALETTE = typeof document === "undefined" ? null : buildPalette();

function stamp(radius, blur) {
  const canvas = document.createElement("canvas");
  const r = radius + blur;
  canvas.width = canvas.height = r * 2;
  const ctx = canvas.getContext("2d");
  ctx.shadowOffsetX = ctx.shadowOffsetY = r * 2;
  ctx.shadowBlur = blur;
  ctx.shadowColor = "black";
  ctx.beginPath();
  ctx.arc(-r, -r, radius, 0, Math.PI * 2, true);
  ctx.closePath();
  ctx.fill();
  return canvas;
}

/**
 * @param {{points?: {lat:number,lng:number,value:number}[], max?: number, intensity?: number, radius?: number, blur?: number, opacity?: number}} options
 */
export function createHeatLayer(options = {}) {
  const HeatLayer = L.Layer.extend({
    initialize(opts) {
      this._points = opts.points || [];
      this._max = opts.max || 1;
      this._intensity = opts.intensity ?? 1;
      this._radius = opts.radius ?? 18;
      this._blur = opts.blur ?? 16;
      this._opacity = opts.opacity ?? 0.75;
    },
    onAdd(map) {
      this._map = map;
      this._canvas = L.DomUtil.create("canvas", "heat-zone-canvas leaflet-zoom-hide");
      this._canvas.style.pointerEvents = "none";
      this._canvas.style.opacity = String(this._opacity);
      map.getPanes().overlayPane.appendChild(this._canvas);
      map.on("moveend zoomend resize", this._reset, this);
      this._reset();
    },
    onRemove(map) {
      map.off("moveend zoomend resize", this._reset, this);
      this._canvas?.remove();
      this._canvas = null;
    },
    setData(points, max) {
      this._points = points || [];
      this._max = max || 1;
      this._draw();
      return this;
    },
    setIntensity(value) {
      this._intensity = value;
      this._draw();
      return this;
    },
    _reset() {
      if (!this._map || !this._canvas) return;
      const size = this._map.getSize();
      const topLeft = this._map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(this._canvas, topLeft);
      this._canvas.width = size.x;
      this._canvas.height = size.y;
      this._draw();
    },
    _draw() {
      if (!this._map || !this._canvas || !PALETTE) return;
      const ctx = this._canvas.getContext("2d");
      const { width, height } = this._canvas;
      ctx.clearRect(0, 0, width, height);
      if (!this._points.length || !width || !height) return;
      const brush = stamp(this._radius, this._blur);
      const r = this._radius + this._blur;
      const max = this._max / Math.max(0.05, this._intensity);
      for (const p of this._points) {
        const pt = this._map.latLngToContainerPoint([p.lat, p.lng]);
        if (pt.x < -r || pt.y < -r || pt.x > width + r || pt.y > height + r) continue;
        ctx.globalAlpha = Math.min(1, Math.max(0.06, p.value / max));
        ctx.drawImage(brush, pt.x - r, pt.y - r);
      }
      ctx.globalAlpha = 1;
      const image = ctx.getImageData(0, 0, width, height);
      const px = image.data;
      for (let i = 0; i < px.length; i += 4) {
        const alpha = px[i + 3];
        if (!alpha) continue;
        const j = alpha * 4;
        px[i] = PALETTE[j];
        px[i + 1] = PALETTE[j + 1];
        px[i + 2] = PALETTE[j + 2];
        px[i + 3] = Math.min(255, alpha * 1.6 + 40);
      }
      ctx.putImageData(image, 0, 0);
    },
  });
  return new HeatLayer(options);
}
