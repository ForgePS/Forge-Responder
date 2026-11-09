/**
 * Time helpers. Stored values are UTC epoch millis; local parts (date, hour,
 * weekday) are always worked out in the department's IANA time zone.
 */
const { toNerisTimestamp } = require("../nerisIncident");

const DEFAULT_TIME_ZONE = "America/Chicago";
const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function safeTimeZone(timeZone) {
  const zone = String(timeZone || "").trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

/**
 * Parse a stored report time into UTC millis. Wall-clock values without a zone
 * ("2026-10-20T14:02") are read in the department zone; "YYYY-MM-DD" is local midnight.
 */
function parseToUtcMs(value, timeZone) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value?.toMillis === "function") return value.toMillis();
  let raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) raw = `${raw}T00:00`;
  const iso = toNerisTimestamp(raw, safeTimeZone(timeZone));
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

const formatterCache = new Map();
function partsFormatter(timeZone) {
  const zone = safeTimeZone(timeZone);
  if (!formatterCache.has(zone)) {
    formatterCache.set(zone, new Intl.DateTimeFormat("en-US", {
      timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short",
    }));
  }
  return formatterCache.get(zone);
}

/** { date: "YYYY-MM-DD", month: "YYYY-MM", hour: 0-23, minute, dow: 0-6 (Sun=0) } */
function localParts(utcMs, timeZone) {
  const parts = partsFormatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  return {
    date,
    month: date.slice(0, 7),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    dow: WEEKDAYS.indexOf(get("weekday")),
  };
}

/** UTC millis for local midnight at the start of a "YYYY-MM-DD" day. */
function localDayStartMs(date, timeZone) {
  return parseToUtcMs(`${date}T00:00`, timeZone);
}

/** Add whole days to a "YYYY-MM-DD" string (calendar arithmetic, zone-independent). */
function addDays(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(fromDate, toDate) {
  const a = Date.UTC(...fromDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...toDate.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / DAY_MS);
}

function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

module.exports = {
  DAY_MS,
  DEFAULT_TIME_ZONE,
  WEEKDAYS,
  addDays,
  daysBetween,
  isDateString,
  localDayStartMs,
  localParts,
  parseToUtcMs,
  safeTimeZone,
};
