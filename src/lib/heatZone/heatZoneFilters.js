/**
 * Heat Zone filter state (pure; unit-tested). Filters are kept per department
 * in sessionStorage so they survive moving between analytics tabs and pages.
 */

export const LIST_FILTER_KEYS = ["districtIds", "zoneIds", "classifications", "priorities", "dispositions", "statuses", "unitTypes"];

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DATE_PRESETS = [
  { id: "7d", label: "7 days", days: 7 },
  { id: "30d", label: "30 days", days: 30 },
  { id: "90d", label: "90 days", days: 90 },
  { id: "365d", label: "12 months", days: 365 },
];

/** "YYYY-MM-DD" for today in an IANA time zone. */
export function todayInZone(timeZone, now = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

export function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function presetRange(presetId, today) {
  const preset = DATE_PRESETS.find((p) => p.id === presetId) || DATE_PRESETS[1];
  return { from: shiftDate(today, -(preset.days - 1)), to: today };
}

export function defaultFilters(today) {
  return {
    ...presetRange("30d", today),
    preset: "30d",
    daysOfWeek: [],
    timeStart: "",
    timeEnd: "",
    bounds: null,
    ...Object.fromEntries(LIST_FILTER_KEYS.map((k) => [k, []])),
  };
}

/** Payload for the server (blank values removed). The server re-validates everything. */
export function toRequestFilters(filters) {
  const out = { from: filters.from, to: filters.to };
  if (filters.daysOfWeek?.length) out.daysOfWeek = filters.daysOfWeek;
  if (filters.timeStart) out.timeStart = filters.timeStart;
  if (filters.timeEnd) out.timeEnd = filters.timeEnd;
  if (filters.bounds) out.bounds = filters.bounds;
  for (const key of LIST_FILTER_KEYS) if (filters[key]?.length) out[key] = filters[key];
  return out;
}

export function crossesMidnight(filters) {
  return Boolean(filters.timeStart && filters.timeEnd && filters.timeStart > filters.timeEnd);
}

export function activeFilterCount(filters) {
  let count = 0;
  if (filters.daysOfWeek?.length) count += 1;
  if (filters.timeStart || filters.timeEnd) count += 1;
  if (filters.bounds) count += 1;
  for (const key of LIST_FILTER_KEYS) if (filters[key]?.length) count += 1;
  return count;
}

export function toggleValue(list = [], value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const storageKey = (departmentId) => `forge-heat-zone-filters:${departmentId}`;

export function loadStoredFilters(departmentId, today) {
  const base = defaultFilters(today);
  try {
    const raw = window.sessionStorage.getItem(storageKey(departmentId));
    if (!raw) return base;
    const stored = JSON.parse(raw);
    const merged = { ...base, ...stored };
    for (const key of [...LIST_FILTER_KEYS, "daysOfWeek"]) if (!Array.isArray(merged[key])) merged[key] = [];
    if (stored.preset && stored.preset !== "custom") Object.assign(merged, presetRange(stored.preset, today));
    return merged;
  } catch {
    return base;
  }
}

export function storeFilters(departmentId, filters) {
  try {
    window.sessionStorage.setItem(storageKey(departmentId), JSON.stringify(filters));
  } catch {
    // Private mode or storage blocked: filters still work for this visit.
  }
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatHour(hour) {
  if (!Number.isInteger(hour)) return "—";
  return `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;
}

/** Local date-time text for a UTC timestamp in the department's zone. */
export function formatInZone(ms, timeZone) {
  if (!Number.isFinite(ms)) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toLocaleString();
  }
}
