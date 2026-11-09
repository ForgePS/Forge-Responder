/**
 * Heat Zone analytics: pure functions over projection rows. No Firestore here,
 * so every number on the dashboard is unit-testable.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { addDays, daysBetween, isDateString, localParts, WEEKDAYS } = require("./time");
const { UNASSIGNED } = require("./projection");

const MAX_RANGE_DAYS = 3 * 366;
const RECENT_DAYS = 30; // window available without historical-analytics permission
const MAX_HEAT_CELLS = 6000;
const MAX_MARKERS = 400;
const CLUSTER_BELOW_ZOOM = 14;
const MIN_RESPONSE_SAMPLE = 5;

const DEFAULT_SETTINGS = Object.freeze({
  priorityWeights: { Emergency: 3, Urgent: 2, Routine: 1, "Non-Emergency": 1 },
  highPriorities: ["Emergency"],
});

const LIST_FILTERS = ["districtIds", "zoneIds", "classifications", "priorities", "dispositions", "statuses", "unitTypes"];

function stringList(value, max = 50) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v ?? "").trim()).filter(Boolean))].slice(0, max).map((v) => v.slice(0, 120));
}

function parseClock(value) {
  if (value === null || value === undefined || value === "") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim());
  if (!m) throw new HttpsError("invalid-argument", "Times must be HH:MM.");
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  if (Number(m[1]) > 23 || Number(m[2]) > 59) throw new HttpsError("invalid-argument", "Times must be between 00:00 and 23:59.");
  return minutes;
}

function parseBounds(value) {
  if (!value) return null;
  const b = ["south", "west", "north", "east"].map((k) => Number(value[k]));
  if (!b.every(Number.isFinite)) throw new HttpsError("invalid-argument", "Map bounds are invalid.");
  const [south, west, north, east] = b;
  if (south > north || Math.abs(south) > 90 || Math.abs(north) > 90) throw new HttpsError("invalid-argument", "Map bounds are invalid.");
  return { south, west: Math.max(-180, west), north, east: Math.min(180, east) };
}

/**
 * Validate and normalise client filters. Never trusts the client for scope:
 * the caller's district restrictions are applied separately (applyScope).
 * @param {object} raw
 * @param {{today:string, canViewHistory:boolean}} opts today = department-local "YYYY-MM-DD"
 */
function normalizeFilters(raw = {}, { today, canViewHistory }) {
  const input = raw && typeof raw === "object" ? raw : {};
  let to = isDateString(input.to) ? input.to : today;
  let from = isDateString(input.from) ? input.from : addDays(to, -(RECENT_DAYS - 1));
  if (daysBetween(from, to) < 0) throw new HttpsError("invalid-argument", "The start date must be on or before the end date.");
  if (daysBetween(from, to) + 1 > MAX_RANGE_DAYS) throw new HttpsError("invalid-argument", "Date ranges are limited to three years.");
  if (!canViewHistory) {
    const earliest = addDays(today, -(RECENT_DAYS - 1));
    if (daysBetween(earliest, from) < 0) from = earliest;
    if (daysBetween(to, today) < 0) to = today;
    if (daysBetween(from, to) < 0) from = to;
  }
  const daysOfWeek = Array.isArray(input.daysOfWeek)
    ? [...new Set(input.daysOfWeek.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    : [];
  const filters = {
    from,
    to,
    daysOfWeek,
    timeStart: parseClock(input.timeStart),
    timeEnd: parseClock(input.timeEnd),
    bounds: parseBounds(input.bounds),
    includeVoided: input.includeVoided === true,
    historyLimited: !canViewHistory,
  };
  for (const key of LIST_FILTERS) filters[key] = stringList(input[key]);
  return filters;
}

/** Minute-of-day window. start > end means the window crosses midnight (e.g. 22:00-02:00). */
function inTimeWindow(minuteOfDay, start, end) {
  if (start === null && end === null) return true;
  const s = start ?? 0;
  const e = end ?? 24 * 60;
  if (s === e) return true;
  if (s < e) return minuteOfDay >= s && minuteOfDay < e;
  return minuteOfDay >= s || minuteOfDay < e;
}

function inBounds(row, bounds) {
  if (!bounds) return true;
  if (!row.mapped) return false;
  const west = bounds.west;
  const east = bounds.east;
  const lngOk = west <= east ? row.lng >= west && row.lng <= east : row.lng >= west || row.lng <= east;
  return row.lat >= bounds.south && row.lat <= bounds.north && lngOk;
}

/** District scope from the server-side permission check (never from the client). */
function applyScope(rows, scope) {
  if (scope.allDistricts) return rows;
  const allowed = new Set(scope.districtIds || []);
  return rows.filter((row) => allowed.has(row.districtId));
}

function matchesFilters(row, f) {
  if (!f.includeVoided && row.voided) return false;
  if (row.localDate < f.from || row.localDate > f.to) return false;
  if (f.daysOfWeek.length && !f.daysOfWeek.includes(row.localDow)) return false;
  if (!inTimeWindow(row.localHour * 60 + (row.localMinute || 0), f.timeStart, f.timeEnd)) return false;
  if (f.districtIds.length && !f.districtIds.includes(row.districtId)) return false;
  if (f.zoneIds.length && !(row.zoneIds || []).some((z) => f.zoneIds.includes(z))) return false;
  if (f.classifications.length && !f.classifications.includes(row.classification)) return false;
  if (f.priorities.length && !f.priorities.includes(row.priority)) return false;
  if (f.dispositions.length && !f.dispositions.includes(row.disposition)) return false;
  if (f.statuses.length && !f.statuses.includes(row.status)) return false;
  if (f.unitTypes.length && !(row.unitTypes || []).some((u) => f.unitTypes.includes(u))) return false;
  if (!inBounds(row, f.bounds)) return false;
  return true;
}

function filterRows(rows, filters, scope) {
  return applyScope(rows, scope).filter((row) => matchesFilters(row, filters));
}

/** The same-length period immediately before the selected range. */
function previousPeriod(filters) {
  const length = daysBetween(filters.from, filters.to) + 1;
  const to = addDays(filters.from, -1);
  return { ...filters, from: addDays(to, -(length - 1)), to };
}

function countBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const keys = keyFn(row);
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      if (key === undefined || key === null || key === "") continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
  }
  return map;
}

function ranked(map, labelFn = (k) => k) {
  return [...map.entries()]
    .map(([key, count]) => ({ key, label: labelFn(key), count }))
    .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function zoneName(zones, id) {
  if (id === UNASSIGNED) return "Outside configured districts";
  return zones.find((z) => z.id === id)?.name || id;
}

function pctChange(current, previous) {
  if (!previous) return current ? null : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function weightFor(row, settings) {
  const weights = settings.priorityWeights || DEFAULT_SETTINGS.priorityWeights;
  const w = Number(weights[row.priority]);
  return Number.isFinite(w) && w > 0 ? w : 1;
}

function averageResponse(rows) {
  const samples = rows.map((r) => r.responseSeconds).filter((s) => Number.isFinite(s) && s > 0);
  if (samples.length < MIN_RESPONSE_SAMPLE) {
    return { seconds: null, sampleSize: samples.length, reliable: false, coverage: rows.length ? samples.length / rows.length : 0 };
  }
  const seconds = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
  return { seconds, sampleSize: samples.length, reliable: true, coverage: samples.length / rows.length };
}

function summarize(rows, { zones = [], settings = DEFAULT_SETTINGS } = {}) {
  const high = new Set(settings.highPriorities || DEFAULT_SETTINGS.highPriorities);
  const districts = ranked(countBy(rows, (r) => r.districtId), (id) => zoneName(zones, id));
  const hours = ranked(countBy(rows, (r) => r.localHour));
  const classes = ranked(countBy(rows, (r) => r.classification));
  const topDistrict = districts.find((d) => d.key !== UNASSIGNED) || districts[0] || null;
  return {
    totalCalls: rows.length,
    mappedCalls: rows.filter((r) => r.mapped).length,
    unmappedCalls: rows.filter((r) => !r.mapped).length,
    highestActivityDistrict: topDistrict ? { id: topDistrict.key, name: topDistrict.label, count: topDistrict.count } : null,
    peakHour: hours[0] ? { hour: Number(hours[0].key), count: hours[0].count } : null,
    topClassification: classes[0] ? { name: classes[0].key, count: classes[0].count } : null,
    highPriorityCalls: rows.filter((r) => high.has(r.priority)).length,
    highPriorities: [...high],
    averageResponse: averageResponse(rows),
  };
}

function trendBucket(filters) {
  const days = daysBetween(filters.from, filters.to) + 1;
  if (days <= 62) return "day";
  if (days <= 400) return "week";
  return "month";
}

function weekStart(date) {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(date, -dow);
}

function bucketKey(date, bucket) {
  if (bucket === "month") return date.slice(0, 7);
  if (bucket === "week") return weekStart(date);
  return date;
}

function buildTrend(rows, filters) {
  const bucket = trendBucket(filters);
  const counts = countBy(rows, (r) => bucketKey(r.localDate, bucket));
  const keys = [];
  let cursor = bucketKey(filters.from, bucket);
  const last = bucketKey(filters.to, bucket);
  for (let guard = 0; guard < 1200 && cursor <= last; guard += 1) {
    keys.push(cursor);
    if (bucket === "month") {
      const [y, m] = cursor.split("-").map(Number);
      cursor = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
    } else {
      cursor = addDays(cursor, bucket === "week" ? 7 : 1);
    }
  }
  return { bucket, points: keys.map((key) => ({ key, count: counts.get(key) || 0 })) };
}

function buildCharts(rows, { zones = [], filters }) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({ key: hour, label: `${String(hour).padStart(2, "0")}:00`, count: 0 }));
  const byWeekday = WEEKDAYS.map((label, key) => ({ key, label, count: 0 }));
  for (const row of rows) {
    byHour[row.localHour].count += 1;
    if (row.localDow >= 0) byWeekday[row.localDow].count += 1;
  }
  return {
    byHour,
    byWeekday,
    byDistrict: ranked(countBy(rows, (r) => r.districtId), (id) => zoneName(zones, id)),
    byClassification: ranked(countBy(rows, (r) => r.classification)).slice(0, 15),
    byPriority: ranked(countBy(rows, (r) => r.priority)),
    trend: buildTrend(rows, filters),
  };
}

/** Grid cell size in degrees for a zoom level (about 24px at 256px tiles). */
function cellSizeDegrees(zoom) {
  const z = Math.max(1, Math.min(19, Math.round(Number(zoom) || 12)));
  return 360 / 2 ** z / (256 / 24);
}

/**
 * Bin mapped rows into a density grid. Each cell is placed at the mean of its points.
 * @returns {{cellSize:number, mode:string, maxValue:number, cells:{lat:number,lng:number,count:number,value:number}[]}}
 */
function buildHeatGrid(rows, { zoom = 12, mode = "raw", settings = DEFAULT_SETTINGS } = {}) {
  const size = cellSizeDegrees(zoom);
  const cells = new Map();
  for (const row of rows) {
    if (!row.mapped) continue;
    const key = `${Math.floor(row.lat / size)}:${Math.floor(row.lng / size)}`;
    const cell = cells.get(key) || { latSum: 0, lngSum: 0, count: 0, weighted: 0 };
    cell.latSum += row.lat;
    cell.lngSum += row.lng;
    cell.count += 1;
    cell.weighted += weightFor(row, settings);
    cells.set(key, cell);
  }
  let list = [...cells.values()].map((c) => ({
    lat: Math.round((c.latSum / c.count) * 1e5) / 1e5,
    lng: Math.round((c.lngSum / c.count) * 1e5) / 1e5,
    count: c.count,
    weighted: c.weighted,
    value: mode === "weighted" ? c.weighted : c.count,
  }));
  list.sort((a, b) => b.value - a.value);
  const truncated = list.length > MAX_HEAT_CELLS;
  if (truncated) list = list.slice(0, MAX_HEAT_CELLS);
  return { cellSize: size, mode: mode === "weighted" ? "weighted" : "raw", maxValue: list[0]?.value || 0, truncated, cells: list };
}

/**
 * Markers for the visible map area: clusters when zoomed out or crowded,
 * otherwise a page of individual incidents (newest first).
 */
function buildMarkers(rows, { viewport, zoom = 12, page = 0, pageSize = 200 } = {}) {
  const visible = rows.filter((r) => r.mapped && inBounds(r, viewport));
  const size = Math.max(1, Math.min(MAX_MARKERS, Number(pageSize) || 200));
  if (Number(zoom) < CLUSTER_BELOW_ZOOM && visible.length > 60) {
    const cell = cellSizeDegrees(zoom) * 3;
    const groups = new Map();
    for (const r of visible) {
      const key = `${Math.floor(r.lat / cell)}:${Math.floor(r.lng / cell)}`;
      const g = groups.get(key) || { latSum: 0, lngSum: 0, count: 0 };
      g.latSum += r.lat; g.lngSum += r.lng; g.count += 1;
      groups.set(key, g);
    }
    return {
      mode: "clusters",
      total: visible.length,
      clusters: [...groups.values()].map((g) => ({
        lat: Math.round((g.latSum / g.count) * 1e5) / 1e5,
        lng: Math.round((g.lngSum / g.count) * 1e5) / 1e5,
        count: g.count,
      })),
    };
  }
  const sorted = [...visible].sort((a, b) => b.occurredAt - a.occurredAt);
  const start = Math.max(0, Number(page) || 0) * size;
  return {
    mode: "markers",
    total: sorted.length,
    page: Math.max(0, Number(page) || 0),
    pageSize: size,
    hasMore: start + size < sorted.length,
    markers: sorted.slice(start, start + size).map(markerOf),
  };
}

function markerOf(row) {
  return {
    id: row.id,
    lat: row.lat,
    lng: row.lng,
    occurredAt: row.occurredAt,
    classification: row.classification,
    priority: row.priority,
    districtId: row.districtId,
  };
}

function buildRepeatLocations(rows, { minCount = 2, limit = 25 } = {}) {
  const groups = new Map();
  for (const row of rows) {
    if (!row.locationKey) continue;
    const g = groups.get(row.locationKey) || { address: row.address, lat: row.lat, lng: row.lng, count: 0, last: 0, classes: new Map(), districtId: row.districtId };
    g.count += 1;
    if (row.occurredAt > g.last) g.last = row.occurredAt;
    if (!g.address && row.address) g.address = row.address;
    if (g.lat === null && row.mapped) { g.lat = row.lat; g.lng = row.lng; }
    g.classes.set(row.classification, (g.classes.get(row.classification) || 0) + 1);
    groups.set(row.locationKey, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= minCount)
    .map(([key, g]) => ({
      key,
      address: g.address || (g.lat !== null ? `${g.lat.toFixed(4)}, ${g.lng.toFixed(4)}` : "Unknown location"),
      lat: g.lat,
      lng: g.lng,
      count: g.count,
      lastOccurredAt: g.last,
      districtId: g.districtId,
      topClassifications: ranked(g.classes).slice(0, 3).map((c) => ({ name: c.key, count: c.count })),
    }))
    .sort((a, b) => b.count - a.count || b.lastOccurredAt - a.lastOccurredAt)
    .slice(0, limit);
}

function buildDistrictComparison(rows, previousRows, { zones = [], settings = DEFAULT_SETTINGS } = {}) {
  const high = new Set(settings.highPriorities || DEFAULT_SETTINGS.highPriorities);
  const ids = new Set([...rows.map((r) => r.districtId), ...(previousRows || []).map((r) => r.districtId)]);
  for (const z of zones) if (z.kind === "district" && z.active !== false) ids.add(z.id);
  const total = rows.length;
  return [...ids].map((id) => {
    const current = rows.filter((r) => r.districtId === id);
    const prev = previousRows ? previousRows.filter((r) => r.districtId === id).length : null;
    const top = ranked(countBy(current, (r) => r.classification))[0];
    return {
      id,
      name: zoneName(zones, id),
      count: current.length,
      share: total ? Math.round((current.length / total) * 1000) / 10 : 0,
      previousCount: prev,
      changePct: prev === null ? null : pctChange(current.length, prev),
      highPriorityCalls: current.filter((r) => high.has(r.priority)).length,
      topClassification: top ? top.key : null,
      averageResponse: averageResponse(current),
    };
  }).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildComparison(rows, previousRows, previousFilters) {
  return {
    previousFrom: previousFilters.from,
    previousTo: previousFilters.to,
    currentTotal: rows.length,
    previousTotal: previousRows.length,
    changePct: pctChange(rows.length, previousRows.length),
  };
}

/** Distinct values for the filter dropdowns, from the caller's in-scope rows. */
function filterOptions(rows) {
  const values = (fn) => [...new Set(rows.flatMap((r) => [].concat(fn(r))).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    classifications: values((r) => r.classification),
    priorities: values((r) => r.priority),
    dispositions: values((r) => r.disposition),
    statuses: values((r) => r.status),
    unitTypes: values((r) => r.unitTypes || []),
  };
}

function todayIn(timeZone, now = Date.now()) {
  return localParts(now, timeZone).date;
}

module.exports = {
  CLUSTER_BELOW_ZOOM,
  DEFAULT_SETTINGS,
  MAX_RANGE_DAYS,
  RECENT_DAYS,
  applyScope,
  averageResponse,
  buildCharts,
  buildComparison,
  buildDistrictComparison,
  buildHeatGrid,
  buildMarkers,
  buildRepeatLocations,
  buildTrend,
  cellSizeDegrees,
  filterOptions,
  filterRows,
  inTimeWindow,
  matchesFilters,
  normalizeFilters,
  previousPeriod,
  summarize,
  todayIn,
};
