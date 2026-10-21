import { buildAlertDashboardPath } from "./gatewayRouting.js";
import { resolveRmsAppUrl } from "./rmsAppUrl.js";

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB_PATTERN = /\b(?:DOB|D\.O\.B\.?|Date of Birth)[:\s]*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi;
const NAME_LABEL_PATTERN = /\b(?:Patient|Caller|Name|Resident|Occupant)[:\s]+[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3}\b/g;

export const DEFAULT_ALERT_DASHBOARD_CONFIG = {
  id: "config",
  takeoverDurationMinutes: 45,
  autoTakeover: true,
  autoSyncIntervalSec: 90,
  streetViewHeading: null,
};

export function normalizeAddressKey(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(apt|unit|ste|suite|#)\s*[\w-]+/gi, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sanitizeAlertText(text = "") {
  return String(text || "")
    .replace(SSN_PATTERN, "[redacted]")
    .replace(DOB_PATTERN, "[redacted]")
    .replace(NAME_LABEL_PATTERN, "[redacted]")
    .replace(/\b\d{9}\b/g, "[redacted]")
    .trim();
}

export function sanitizeActive911Alert(alert = {}) {
  const responses = Array.isArray(alert.responses)
    ? alert.responses.map((item) => {
      if (typeof item === "string") return sanitizeAlertText(item);
      if (item && typeof item === "object") {
        const next = { ...item };
        ["name", "patient", "caller", "notes", "comment", "description"].forEach((field) => {
          if (next[field]) next[field] = sanitizeAlertText(next[field]);
        });
        return next;
      }
      return item;
    })
    : [];

  return {
    ...alert,
    description: sanitizeAlertText(alert.description),
    address: sanitizeAlertText(alert.address),
    city: sanitizeAlertText(alert.city),
    crossStreet: sanitizeAlertText(alert.crossStreet),
    units: sanitizeAlertText(alert.units),
    responses,
  };
}

export function buildAlertAddress(alert = {}) {
  return [alert.address, alert.city, alert.state].filter(Boolean).join(", ");
}

export function parseAlertTimestamp(alert = {}) {
  const raw = alert.sentAt || alert.syncedAt || "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isAlertWithinTakeover(alert = {}, config = {}) {
  const minutes = Number(config.takeoverDurationMinutes) || DEFAULT_ALERT_DASHBOARD_CONFIG.takeoverDurationMinutes;
  const sent = parseAlertTimestamp(alert);
  if (!sent) return false;
  const ageMs = Date.now() - sent.getTime();
  return ageMs >= 0 && ageMs <= minutes * 60 * 1000;
}

export function sortAlertsNewestFirst(alerts = []) {
  return [...alerts].sort((a, b) => {
    const aTime = parseAlertTimestamp(a)?.getTime() || 0;
    const bTime = parseAlertTimestamp(b)?.getTime() || 0;
    return bTime - aTime;
  });
}

export function selectActiveAlert(alerts = [], config = {}) {
  const sorted = sortAlertsNewestFirst(alerts.map(sanitizeActive911Alert));
  if (!config.autoTakeover) return sorted[0] || null;
  return sorted.find((alert) => isAlertWithinTakeover(alert, config)) || null;
}

export function getRecentAlerts(alerts = [], count = 5) {
  return sortAlertsNewestFirst(alerts.map(sanitizeActive911Alert)).slice(0, count);
}

export function matchBusinessDirectory(alert = {}, directory = []) {
  const alertKey = normalizeAddressKey(buildAlertAddress(alert));
  if (!alertKey) return null;

  return directory.find((entry) => {
    const entryKey = normalizeAddressKey(entry.normalizedAddress || entry.address || "");
    if (!entryKey) return false;
    return alertKey.includes(entryKey) || entryKey.includes(alertKey);
  }) || null;
}

export function buildStationAddress(station = {}) {
  return [station.address, station.city, station.state, station.zip].filter(Boolean).join(", ");
}

export function resolveDisplayStation(profile = {}, display = {}) {
  const stationName = String(display.station || "").trim();
  if (!stationName) return null;
  const details = Array.isArray(profile.stationDetails) ? profile.stationDetails : [];
  return details.find((item) => String(item.name || "").toLowerCase() === stationName.toLowerCase()) || { name: stationName };
}

export function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterNearbyHydrants(hydrants = [], latitude, longitude, radiusMiles = 0.75) {
  if (latitude == null || longitude == null) return [];
  return hydrants.filter((hydrant) => {
    const lat = Number(hydrant.latitude ?? hydrant.lat);
    const lng = Number(hydrant.longitude ?? hydrant.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    return haversineMiles(latitude, longitude, lat, lng) <= radiusMiles;
  });
}

export function formatDispatchedTime(alert = {}) {
  const date = parseAlertTimestamp(alert);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDispatchedClock(alert = {}) {
  const date = parseAlertTimestamp(alert);
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function getTakeoverRemainingMs(alert = {}, config = {}) {
  const minutes = Number(config.takeoverDurationMinutes) || DEFAULT_ALERT_DASHBOARD_CONFIG.takeoverDurationMinutes;
  const sent = parseAlertTimestamp(alert);
  if (!sent) return 0;
  const expiresAt = sent.getTime() + minutes * 60 * 1000;
  return Math.max(0, expiresAt - Date.now());
}

export function formatClearCountdown(alert = {}, config = {}) {
  const ms = getTakeoverRemainingMs(alert, config);
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

export function formatAlertCode(alert = {}) {
  return String(alert.cadCode || alert.priority || alert.description || "—").trim().slice(0, 24);
}

export function buildIncidentNotes(alert = {}, businessMatch = null) {
  const parts = [
    sanitizeAlertText(alert.description || ""),
    sanitizeAlertText(alert.crossStreet ? `Cross: ${alert.crossStreet}` : ""),
    businessMatch?.businessName ? `Business: ${businessMatch.businessName}` : "",
    businessMatch?.criticalInfo ? sanitizeAlertText(businessMatch.criticalInfo) : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No additional incident information.";
}

export function formatLastUpdated(date = new Date()) {
  return date.toLocaleString(undefined, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatWindDirection(degrees) {
  if (!Number.isFinite(Number(degrees))) return "—";
  const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(((Number(degrees) % 360) / 45)) % 8;
  return dirs[index];
}
export function defaultAlertDashboardConfig(overrides = {}) {
  return { ...DEFAULT_ALERT_DASHBOARD_CONFIG, ...overrides };
}

export function buildAlertDashboardUrl(gatewaySlug = "", displayId = "") {
  const base = (typeof window !== "undefined" ? window.location.origin : resolveRmsAppUrl()).replace(/\/$/, "");
  const path = buildAlertDashboardPath(String(gatewaySlug || "").trim());
  const params = new URLSearchParams();
  if (displayId) params.set("display", displayId);
  const query = params.toString();
  return `${base}${path}${query ? `?${query}` : ""}`;
}

/** Synthetic dispatch for alert dashboard QA (clearly marked TEST, no PII). */
export function buildTestAlert(overrides = {}) {
  const sentAt = new Date().toISOString();
  return {
    id: `forge-test-${Date.now()}`,
    cadCode: "603",
    description: "TEST — Structure Fire",
    address: "100 Station Rd",
    city: "Test City",
    state: "MS",
    units: "UNIT1 613C 614C",
    priority: "1",
    sentAt,
    syncedAt: sentAt,
    latitude: 34.9551,
    longitude: -90.0423,
    crossStreet: "Church Rd",
    source: "forge-test",
    responses: [],
    ...overrides,
  };
}

export function prependTestAlert(alerts = []) {
  const testAlert = buildTestAlert();
  const withoutOldTests = alerts.filter(
    (alert) => !String(alert?.id || "").startsWith("forge-test-")
  );
  return [testAlert, ...withoutOldTests];
}
