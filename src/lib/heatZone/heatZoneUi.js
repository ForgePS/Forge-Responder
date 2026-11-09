/**
 * Small pure helpers for the Heat Zone Analytics page (formatting, labels,
 * error mapping). No React, no Leaflet.
 */

export const UNASSIGNED_DISTRICT = "unassigned";
export const UNASSIGNED_LABEL = "Outside configured districts";
export const FALLBACK_TIME_ZONE = "America/Chicago";
export const FALLBACK_CENTER = [32.36, -89.47];
export const MAX_RANGE_DAYS = 365 * 3 + 1;

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escape text before it goes into a Leaflet tooltip/popup (those use innerHTML). */
export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

export function districtLabel(zones = [], id) {
  if (id === UNASSIGNED_DISTRICT) return UNASSIGNED_LABEL;
  return zones.find((z) => z.id === id)?.name || id || "—";
}

/**
 * Multi-select options for a zone kind. Inactive zones are left out unless
 * already selected, so a stored filter never silently disappears.
 */
export function zoneOptions(zones = [], kind, selected = []) {
  const options = zones
    .filter((z) => z.kind === kind && (z.active !== false || selected.includes(z.id)))
    .map((z) => ({ value: z.id, label: z.active === false ? `${z.name} (inactive)` : z.name }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (kind === "district") options.push({ value: UNASSIGNED_DISTRICT, label: UNASSIGNED_LABEL });
  return options;
}

export function valueOptions(values = [], selected = []) {
  const all = [...new Set([...values, ...selected])].filter((v) => v !== null && v !== undefined && v !== "");
  return all.map((v) => ({ value: v, label: String(v) }));
}

/** One-hour time-of-day window for an hour bar. 23:00 runs to midnight (no end). */
export function hourWindow(hour) {
  const h = Number(hour);
  return { timeStart: `${String(h).padStart(2, "0")}:00`, timeEnd: h >= 23 ? "" : `${String(h + 1).padStart(2, "0")}:00` };
}

export function isHourWindow(filters, hour) {
  const w = hourWindow(hour);
  return filters.timeStart === w.timeStart && (filters.timeEnd || "") === w.timeEnd;
}

function dayNumber(date) {
  const [y, m, d] = String(date).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** Client-side range check so an impossible range never reaches the server. */
export function rangeProblem(filters) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(filters.from || "") || !/^\d{4}-\d{2}-\d{2}$/.test(filters.to || "")) {
    return "Choose a start and end date.";
  }
  const days = dayNumber(filters.to) - dayNumber(filters.from);
  if (days < 0) return "The start date must be on or before the end date.";
  if (days + 1 > MAX_RANGE_DAYS) return "Date ranges are limited to three years.";
  return "";
}

/** { message, code, denied } from a Firebase HttpsError (or any Error). */
export function describeError(error, fallback = "Something went wrong.") {
  const code = String(error?.code || "").replace(/^functions\//, "");
  const denied = code === "permission-denied" || code === "unauthenticated";
  return { code, denied, message: error?.message || fallback };
}

export function formatPct(value) {
  if (!Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function changeArrow(value) {
  if (!Number.isFinite(value) || value === 0) return "";
  return value > 0 ? "▲" : "▼";
}

export function formatCount(value) {
  return Number.isFinite(value) ? value.toLocaleString("en-US") : "—";
}

/** "14:05:09" in the department's zone. */
export function formatClock(ms, timeZone) {
  if (!Number.isFinite(ms)) return "";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleTimeString();
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Trend bucket label: "Oct 1" (day), "Wk of Oct 1" (week), "Oct 2026" (month). */
export function trendLabel(key, bucket, { long = false } = {}) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y || !m) return String(key);
  if (bucket === "month") return `${MONTHS[m - 1]} ${y}`;
  const day = `${MONTHS[m - 1]} ${d}${long ? `, ${y}` : ""}`;
  return bucket === "week" ? `${long ? "Week of" : "Wk of"} ${day}` : day;
}

export function formatDate(date) {
  const [y, m, d] = String(date || "").split("-").map(Number);
  if (!y || !m || !d) return date || "—";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** Map bounds rounded to ~1 m so equal views produce equal request keys. */
export function roundBounds(bounds) {
  const r = (v) => Math.round(v * 1e5) / 1e5;
  return { south: r(bounds.south), west: r(bounds.west), north: r(bounds.north), east: r(bounds.east) };
}

/** [[south, west], [north, east]] around points, or null. */
export function boundsOfPoints(points = []) {
  let s = Infinity; let w = Infinity; let n = -Infinity; let e = -Infinity;
  for (const p of points) {
    if (!Number.isFinite(p?.lat) || !Number.isFinite(p?.lng)) continue;
    s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng);
  }
  return Number.isFinite(s) ? [[s, w], [n, e]] : null;
}

/** Union of zone bboxes ([s, w, n, e]) as [[s, w], [n, e]], or null. */
export function boundsOfZones(zones = []) {
  const corners = zones.filter((z) => Array.isArray(z.bbox) && z.bbox.length === 4 && z.active !== false)
    .flatMap((z) => [{ lat: z.bbox[0], lng: z.bbox[1] }, { lat: z.bbox[2], lng: z.bbox[3] }]);
  return boundsOfPoints(corners);
}

export function rebuildSummary(rebuild) {
  if (!rebuild) return "";
  const parts = [`Recalculated ${formatCount(rebuild.projected || 0)} incidents`];
  const extra = [];
  if (rebuild.written) extra.push(`${formatCount(rebuild.written)} updated`);
  if (rebuild.removed) extra.push(`${formatCount(rebuild.removed)} removed`);
  if (rebuild.skipped) extra.push(`${formatCount(rebuild.skipped)} skipped`);
  if (rebuild.rejected) extra.push(`${formatCount(rebuild.rejected)} rejected`);
  return `${parts[0]}${extra.length ? ` (${extra.join(", ")})` : ""}.${geocodeSummary(rebuild.geocoding)}`;
}

/** " Addresses: …" sentence for a rebuild result, or "" when geocoding is off. */
export function geocodeSummary(geocoding) {
  if (!geocoding?.enabled || !geocoding.addresses) return "";
  if (!geocoding.googleConfigured) return " Addresses are not being located: no Google Geocoding key is configured.";
  const found = [];
  if (geocoding.lookedUp) found.push(`${formatCount(geocoding.found)} of ${formatCount(geocoding.lookedUp)} new addresses located`);
  if (geocoding.imprecise) found.push(`${formatCount(geocoding.imprecise)} too vague to map`);
  if (geocoding.notFound) found.push(`${formatCount(geocoding.notFound)} not found`);
  if (geocoding.waiting) found.push(`${formatCount(geocoding.waiting)} still waiting (run Recalculate again)`);
  return found.length ? ` Addresses: ${found.join(", ")}.` : "";
}

const TAB_KEY = "forge-heat-zone-tab";

export function loadStoredTab(fallback = "overview") {
  try {
    return window.sessionStorage.getItem(TAB_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function storeTab(tab) {
  try {
    window.sessionStorage.setItem(TAB_KEY, tab);
  } catch {
    // Storage blocked: the tab still works for this visit.
  }
}
