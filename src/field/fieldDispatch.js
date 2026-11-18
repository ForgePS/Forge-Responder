/**
 * Dispatches a new patient care report can start from. Today: Active911 alerts the RMS syncs into the
 * hlfd-rms-active911-alerts tenant list (functions/lib/active911Store.js). Pure; unit tested.
 *
 * Alerts carry addresses and call descriptions, not patient details, so the list is downloaded like other
 * reference data. What a crew picks is copied into the (encrypted) report.
 */
import { nemsisDateTime } from "../lib/nemsis/pcrModel.js";

/** USPS state/territory abbreviation → ANSI (FIPS) code, as NEMSIS stores states (eScene.18, dAgency.04). */
export const ANSI_STATE_CODES = Object.freeze({
  AL: "01", AK: "02", AZ: "04", AR: "05", CA: "06", CO: "08", CT: "09", DE: "10", DC: "11", FL: "12", GA: "13",
  HI: "15", ID: "16", IL: "17", IN: "18", IA: "19", KS: "20", KY: "21", LA: "22", ME: "23", MD: "24", MA: "25",
  MI: "26", MN: "27", MS: "28", MO: "29", MT: "30", NE: "31", NV: "32", NH: "33", NJ: "34", NM: "35", NY: "36",
  NC: "37", ND: "38", OH: "39", OK: "40", OR: "41", PA: "42", RI: "44", SC: "45", SD: "46", TN: "47", TX: "48",
  UT: "49", VT: "50", VA: "51", WA: "53", WV: "54", WI: "55", WY: "56", AS: "60", GU: "66", MP: "69", PR: "72",
  VI: "78",
});

export function ansiStateCode(value) {
  const text = String(value ?? "").trim().toUpperCase();
  if (/^\d{2}$/.test(text)) return Object.values(ANSI_STATE_CODES).includes(text) ? text : "";
  return ANSI_STATE_CODES[text] ?? "";
}

/** "lat,long" as NEMSIS GPSLocation (at most 6 decimals), or "" when missing or out of range. */
export function gpsLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (latitude === null || longitude === null || latitude === "" || longitude === "") return "";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return "";
  if (lat === 0 && lon === 0) return "";
  const fix = (n) => String(Number(n.toFixed(6)));
  return `${fix(lat)},${fix(lon)}`;
}

function parseTime(value) {
  if (!value) return null;
  const t = Date.parse(String(value).replace(" ", "T"));
  return Number.isNaN(t) ? null : new Date(t);
}

/**
 * Recent dispatches for the "start from a dispatch" list, newest first.
 * @param {object[]} alerts items of the Active911 alert list
 * @param {{ now?: Date, hours?: number, limit?: number }} [options]
 */
export function recentDispatches(alerts = [], { now = new Date(), hours = 12, limit = 20 } = {}) {
  const since = now.getTime() - hours * 3600_000;
  return alerts
    .map((alert) => ({ alert, at: parseTime(alert?.sentAt || alert?.syncedAt) }))
    .filter(({ alert, at }) => alert?.id && at && at.getTime() >= since && at.getTime() <= now.getTime() + 300_000)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ alert, at }) => ({
      id: String(alert.id),
      source: "active911",
      sentAt: at.toISOString(),
      description: String(alert.description || "Dispatch"),
      address: String(alert.address || ""),
      city: String(alert.city || ""),
      state: String(alert.state || ""),
      crossStreet: String(alert.crossStreet || ""),
      units: String(alert.units || ""),
      cadCode: String(alert.cadCode || ""),
      latitude: alert.latitude ?? null,
      longitude: alert.longitude ?? null,
    }));
}

/** newPcr `cad` input for a chosen dispatch (unit notified time, scene address, GPS, state). */
export function dispatchPrefill(dispatch) {
  if (!dispatch) return {};
  const at = parseTime(dispatch.sentAt);
  return {
    notified: at ? nemsisDateTime(at) : "",
    address: String(dispatch.address || "").trim().slice(0, 255),
    gps: gpsLocation(dispatch.latitude, dispatch.longitude),
    stateCode: ansiStateCode(dispatch.state),
  };
}
