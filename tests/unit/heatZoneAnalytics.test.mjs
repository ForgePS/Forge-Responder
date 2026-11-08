// Run: npm run test:unit
// Pure Heat Zone analytics: filters, time windows, aggregates, grid, projection, cache.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { crossesMidnight, defaultFilters, presetRange, toRequestFilters } from "../../src/lib/heatZone/heatZoneFilters.js";
import { cadCoordinates, parseCadPayload } from "../../src/lib/neris/cadImport.js";

const require = createRequire(import.meta.url);
const analytics = require("../../functions/lib/heatZone/analytics.js");
const { projectReport, assignZones, UNASSIGNED } = require("../../functions/lib/heatZone/projection.js");
const { localParts, parseToUtcMs } = require("../../functions/lib/heatZone/time.js");
const { validateGeometry, featuresFromGeoJson } = require("../../functions/lib/heatZone/geo.js");
const { createCache } = require("../../functions/lib/heatZone/cache.js");

const TZ = "America/Chicago";
const ALL = { allDistricts: true, districtIds: [] };
const square = (s, w, n, e) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });

function report(id, overrides = {}) {
  const { cad = {}, location, units, modules, ...rest } = overrides;
  return {
    id,
    reportNumber: id,
    incidentAddress: "100 Main St",
    status: "Submitted",
    incidentTypeSummary: "MEDICAL: ILLNESS: SICK_CASE",
    workspace: {
      cad: { receivedTime: "2026-10-14T14:05", dispatchTime: "2026-10-14T14:06", arrivalTime: "2026-10-14T14:12", priority: "Emergency", ...cad },
      location: location === undefined ? { latitude: 32.36, longitude: -89.47 } : location,
      units: units || [{ unitId: "E1", apparatusType: "Engine", station: "Station 1" }],
    },
    modules: modules || {},
    ...rest,
  };
}

const ctx = { departmentId: "dept-a", timeZone: TZ, zones: [] };
const rowOf = (r, c = ctx) => ({ id: r.id, ...projectReport(r, c) });

describe("heat zone time handling", () => {
  it("reads wall-clock report times in the department zone and stores UTC", () => {
    // 14:05 CDT (UTC-5) on 14 Oct = 19:05Z
    assert.equal(new Date(parseToUtcMs("2026-10-14T14:05", TZ)).toISOString(), "2026-10-14T19:05:00.000Z");
    // After the DST change (CST, UTC-6)
    assert.equal(new Date(parseToUtcMs("2026-11-14T14:05", TZ)).toISOString(), "2026-11-14T20:05:00.000Z");
    // Values with an explicit zone are kept as-is
    assert.equal(parseToUtcMs("2026-10-14T19:05:00Z", TZ), Date.UTC(2026, 9, 14, 19, 5));
  });

  it("derives local date/hour/weekday in the department zone, not UTC", () => {
    const ms = Date.UTC(2026, 9, 15, 3, 30); // 15 Oct 03:30Z = 14 Oct 22:30 CDT (Wednesday)
    assert.deepEqual(localParts(ms, TZ), { date: "2026-10-14", month: "2026-10", hour: 22, minute: 30, dow: 3 });
    assert.equal(localParts(ms, "UTC").date, "2026-10-15");
  });
});

describe("heat zone time-of-day window", () => {
  it("handles ordinary windows (start inclusive, end exclusive)", () => {
    assert.equal(analytics.inTimeWindow(8 * 60, 8 * 60, 17 * 60), true);
    assert.equal(analytics.inTimeWindow(17 * 60, 8 * 60, 17 * 60), false);
    assert.equal(analytics.inTimeWindow(7 * 60 + 59, 8 * 60, 17 * 60), false);
  });

  it("handles windows that cross midnight", () => {
    const s = 22 * 60;
    const e = 2 * 60;
    assert.equal(analytics.inTimeWindow(23 * 60, s, e), true);
    assert.equal(analytics.inTimeWindow(0, s, e), true);
    assert.equal(analytics.inTimeWindow(60 + 59, s, e), true);
    assert.equal(analytics.inTimeWindow(2 * 60, s, e), false);
    assert.equal(analytics.inTimeWindow(12 * 60, s, e), false);
  });

  it("filters rows across midnight using local time", () => {
    const rows = [
      rowOf(report("late", { cad: { receivedTime: "2026-10-14T23:10" } })),
      rowOf(report("early", { cad: { receivedTime: "2026-10-15T01:20" } })),
      rowOf(report("noon", { cad: { receivedTime: "2026-10-15T12:00" } })),
    ];
    const f = analytics.normalizeFilters({ from: "2026-10-01", to: "2026-10-31", timeStart: "22:00", timeEnd: "02:00" }, { today: "2026-10-31", canViewHistory: true });
    assert.deepEqual(analytics.filterRows(rows, f, ALL).map((r) => r.id).sort(), ["early", "late"]);
  });
});

describe("heat zone filters", () => {
  const rows = [
    rowOf(report("a", { cad: { receivedTime: "2026-10-05T10:00", priority: "Routine" }, incidentTypeSummary: "FIRE: STRUCTURE_FIRE: RESIDENTIAL" })),
    rowOf(report("b", { cad: { receivedTime: "2026-10-12T10:00" }, units: [{ unitId: "M1", apparatusType: "ALS Ambulance" }] })),
    rowOf(report("c", { cad: { receivedTime: "2026-09-01T10:00" } })),
    rowOf(report("d", { location: { latitude: 33.5, longitude: -88.0 }, cad: { receivedTime: "2026-10-20T10:00" } })),
    rowOf(report("v", { cad: { receivedTime: "2026-10-20T10:00" }, status: "Voided" })),
  ];
  const norm = (f) => analytics.normalizeFilters({ from: "2026-10-01", to: "2026-10-31", ...f }, { today: "2026-10-31", canViewHistory: true });
  const ids = (f) => analytics.filterRows(rows, norm(f), ALL).map((r) => r.id).sort();

  it("date range is inclusive and local", () => assert.deepEqual(ids({}), ["a", "b", "d"]));
  it("excludes voided calls", () => assert.ok(!ids({}).includes("v")));
  it("day of week (2026-10-05 is a Monday)", () => assert.deepEqual(ids({ daysOfWeek: [1] }), ["a", "b"]));
  it("classification", () => assert.deepEqual(ids({ classifications: ["Fire"] }), ["a"]));
  it("priority", () => assert.deepEqual(ids({ priorities: ["Emergency"] }), ["b", "d"]));
  it("unit type", () => assert.deepEqual(ids({ unitTypes: ["ALS Ambulance"] }), ["b"]));
  it("status", () => assert.deepEqual(ids({ statuses: ["Submitted"] }), ["a", "b", "d"]));
  it("geographic bounds", () => assert.deepEqual(ids({ bounds: { south: 33, west: -89, north: 34, east: -87 } }), ["d"]));
  it("combines multiple filters", () => assert.deepEqual(ids({ priorities: ["Emergency"], daysOfWeek: [1] }), ["b"]));

  it("rejects malformed filters", () => {
    assert.throws(() => norm({ timeStart: "25:00" }));
    assert.throws(() => norm({ from: "2026-11-01", to: "2026-10-01" }));
    assert.throws(() => norm({ bounds: { south: 50, north: 10, west: 0, east: 1 } }));
    assert.throws(() => analytics.normalizeFilters({ from: "2020-01-01", to: "2026-01-01" }, { today: "2026-01-01", canViewHistory: true }));
  });

  it("clamps the range to recent days without history permission", () => {
    const f = analytics.normalizeFilters({ from: "2025-01-01", to: "2026-10-31" }, { today: "2026-10-31", canViewHistory: false });
    assert.equal(f.from, "2026-10-02");
    assert.equal(f.to, "2026-10-31");
    assert.equal(f.historyLimited, true);
  });

  it("district scope comes from the server, not the filters", () => {
    const zones = [{ id: "north", kind: "district", geometry: square(32, -90, 33, -89) }];
    const r = rows.map((row) => ({ ...row, districtId: assignZones({ lat: row.lat, lng: row.lng }, zones).districtId }));
    const f = norm({ districtIds: ["north", UNASSIGNED] });
    const restricted = analytics.filterRows(r, f, { allDistricts: false, districtIds: ["north"] });
    assert.ok(restricted.every((row) => row.districtId === "north"));
    assert.deepEqual(analytics.filterRows(r, f, { allDistricts: false, districtIds: [] }), []);
  });
});

describe("heat zone aggregates", () => {
  const rows = [
    rowOf(report("1", { cad: { receivedTime: "2026-10-05T17:10", dispatchTime: "2026-10-05T17:11", arrivalTime: "2026-10-05T17:16" } })),
    rowOf(report("2", { cad: { receivedTime: "2026-10-06T17:40", dispatchTime: "2026-10-06T17:41", arrivalTime: "2026-10-06T17:48" } })),
    rowOf(report("3", { cad: { receivedTime: "2026-10-07T03:00", dispatchTime: "2026-10-07T03:01", arrivalTime: "2026-10-07T03:10", priority: "Routine" }, incidentTypeSummary: "FIRE: OUTSIDE_FIRE: BRUSH" })),
    rowOf(report("4", { cad: { receivedTime: "2026-10-08T17:00", dispatchTime: "", arrivalTime: "" }, location: null, units: [] })),
  ];
  const s = analytics.summarize(rows);

  it("counts totals and mapped / unmapped calls", () => {
    assert.equal(s.totalCalls, 4);
    assert.equal(s.mappedCalls, 3);
    assert.equal(s.unmappedCalls, 1);
  });
  it("finds the peak hour and top classification", () => {
    assert.deepEqual(s.peakHour, { hour: 17, count: 3 });
    assert.deepEqual(s.topClassification, { name: "Medical", count: 3 });
    assert.equal(s.highPriorityCalls, 3);
  });
  it("only reports an average response time with enough samples", () => {
    assert.equal(s.averageResponse.reliable, false);
    assert.equal(s.averageResponse.seconds, null);
    assert.equal(s.averageResponse.sampleSize, 3);
    const many = Array.from({ length: 6 }, (_, i) => ({ responseSeconds: 300 + i * 60 }));
    assert.deepEqual(analytics.averageResponse(many).seconds, 450);
  });
  it("charts sum to the total", () => {
    const f = analytics.normalizeFilters({ from: "2026-10-01", to: "2026-10-31" }, { today: "2026-10-31", canViewHistory: true });
    const charts = analytics.buildCharts(rows, { filters: f });
    assert.equal(charts.byHour.reduce((a, b) => a + b.count, 0), 4);
    assert.equal(charts.byWeekday.reduce((a, b) => a + b.count, 0), 4);
    assert.equal(charts.trend.bucket, "day");
    assert.equal(charts.trend.points.length, 31);
    assert.equal(charts.trend.points.reduce((a, b) => a + b.count, 0), 4);
  });
  it("compares with the previous same-length period", () => {
    const f = analytics.normalizeFilters({ from: "2026-10-11", to: "2026-10-20" }, { today: "2026-10-31", canViewHistory: true });
    const prev = analytics.previousPeriod(f);
    assert.equal(prev.from, "2026-10-01");
    assert.equal(prev.to, "2026-10-10");
    assert.equal(analytics.buildComparison([1, 2, 3], [1, 2], prev).changePct, 50);
  });
});

describe("heat zone grid, markers and repeat locations", () => {
  const rows = Array.from({ length: 80 }, (_, i) => rowOf(report(`r${i}`, {
    location: { latitude: 32.3 + (i % 8) * 0.01, longitude: -89.5 + Math.floor(i / 8) * 0.01 },
    cad: { receivedTime: `2026-10-${String(1 + (i % 28)).padStart(2, "0")}T10:00`, priority: i % 2 ? "Routine" : "Emergency" },
  })));

  it("bins every mapped call exactly once", () => {
    const grid = analytics.buildHeatGrid(rows, { zoom: 14 });
    assert.equal(grid.cells.reduce((a, c) => a + c.count, 0), 80);
    assert.equal(grid.maxValue, grid.cells[0].value);
  });
  it("weighted mode applies priority weights", () => {
    const raw = analytics.buildHeatGrid(rows, { zoom: 3 });
    const weighted = analytics.buildHeatGrid(rows, { zoom: 3, mode: "weighted" });
    assert.equal(raw.cells.reduce((a, c) => a + c.value, 0), 80);
    assert.equal(weighted.cells.reduce((a, c) => a + c.value, 0), 40 * 3 + 40 * 1);
  });
  it("clusters when zoomed out and pages individual markers when zoomed in", () => {
    const viewport = { south: 32, west: -90, north: 33, east: -89 };
    const clustered = analytics.buildMarkers(rows, { viewport, zoom: 10 });
    assert.equal(clustered.mode, "clusters");
    assert.equal(clustered.clusters.reduce((a, c) => a + c.count, 0), 80);
    const page0 = analytics.buildMarkers(rows, { viewport, zoom: 16, pageSize: 50 });
    assert.equal(page0.mode, "markers");
    assert.equal(page0.markers.length, 50);
    assert.equal(page0.hasMore, true);
    const page1 = analytics.buildMarkers(rows, { viewport, zoom: 16, pageSize: 50, page: 1 });
    assert.equal(page1.markers.length, 30);
    assert.equal(new Set([...page0.markers, ...page1.markers].map((m) => m.id)).size, 80);
  });
  it("markers only include the visible area", () => {
    const m = analytics.buildMarkers(rows, { viewport: { south: 32.29, west: -89.51, north: 32.315, east: -89.49 }, zoom: 17 });
    assert.ok(m.markers.length > 0 && m.markers.every((x) => x.lat <= 32.315 && x.lng <= -89.49));
  });
  it("groups repeat locations by normalised address", () => {
    const rep = [
      rowOf(report("x1", { incidentAddress: "12 Oak St." })),
      rowOf(report("x2", { incidentAddress: "12  oak st" })),
      rowOf(report("x3", { incidentAddress: "99 Elm St" })),
    ];
    const out = analytics.buildRepeatLocations(rep);
    assert.equal(out.length, 1);
    assert.equal(out[0].count, 2);
  });
});

describe("heat zone projection", () => {
  it("maps NERIS report fields without inventing data", () => {
    const p = projectReport(report("p1", {
      modules: { core_mod_incident: { incident_final_type: ["FIRE: STRUCTURE_FIRE: RESIDENTIAL_SINGLE"], incident_noaction: "CANCELLED" } },
      units: [{ unitId: "E1", apparatusType: "Engine", station: "Station 1" }, { unitId: "L2", apparatusType: "Ladder", station: "Station 2" }],
    }), ctx);
    assert.equal(p.classification, "Fire");
    assert.equal(p.classificationDetail, "Structure Fire");
    assert.equal(p.disposition, "Cancelled");
    assert.equal(p.priority, "Emergency");
    assert.deepEqual(p.unitTypes, ["Engine", "Ladder"]);
    assert.equal(p.responseSeconds, 360);
    assert.equal(p.departmentId, "dept-a");
  });
  it("falls back to dispatch time, then incident date", () => {
    assert.equal(projectReport(report("p2", { cad: { receivedTime: "", dispatchTime: "2026-10-14T08:00" } }), ctx).localHour, 8);
    const dateOnly = projectReport({ id: "p3", incidentDate: "2026-10-14", workspace: {} }, ctx);
    assert.equal(dateOnly.localDate, "2026-10-14");
    assert.equal(dateOnly.mapped, false);
    assert.equal(projectReport({ id: "p4", workspace: {} }, ctx), null);
  });
  it("treats (0,0) and out-of-range coordinates as unmapped", () => {
    assert.equal(projectReport(report("p5", { location: { latitude: 0, longitude: 0 } }), ctx).mapped, false);
    assert.equal(projectReport(report("p6", { location: { latitude: 120, longitude: 10 } }), ctx).mapped, false);
  });
  it("assigns the first district and every response zone containing the point", () => {
    const zones = [
      { id: "z-east", kind: "zone", geometry: square(32, -89.6, 33, -89) },
      { id: "d-b", kind: "district", priority: 2, geometry: square(32, -90, 33, -89) },
      { id: "d-a", kind: "district", priority: 1, geometry: square(32.3, -89.5, 32.4, -89.4) },
    ];
    assert.deepEqual(assignZones({ lat: 32.36, lng: -89.47 }, zones), { districtId: "d-a", zoneIds: ["z-east"] });
    assert.deepEqual(assignZones({ lat: 40, lng: -89.47 }, zones), { districtId: UNASSIGNED, zoneIds: [] });
    assert.deepEqual(assignZones(null, zones), { districtId: UNASSIGNED, zoneIds: [] });
  });
  it("content hash changes when an analysed field changes and not otherwise", () => {
    const a = projectReport(report("h"), ctx).contentHash;
    assert.equal(projectReport(report("h", { narrative: "edited narrative" }), ctx).contentHash, a);
    assert.notEqual(projectReport(report("h", { cad: { priority: "Routine" } }), ctx).contentHash, a);
    assert.notEqual(projectReport(report("h"), { ...ctx, zonesVersion: 2 }).contentHash, a);
  });
});

describe("heat zone geometry validation", () => {
  it("accepts polygons and rejects bad input", () => {
    assert.equal(validateGeometry(square(32, -90, 33, -89)).ok, true);
    assert.equal(validateGeometry({ type: "Point", coordinates: [0, 0] }).ok, false);
    assert.equal(validateGeometry({ type: "Polygon", coordinates: [[[0, 95], [1, 1], [2, 2], [0, 95]]] }).ok, false);
    assert.deepEqual(validateGeometry(square(32, -90, 33, -89)).bbox, [32, -90, 33, -89]);
  });
  it("reads features from a FeatureCollection", () => {
    const fc = { type: "FeatureCollection", features: [{ type: "Feature", properties: { name: "A" }, geometry: square(0, 0, 1, 1) }, { type: "Feature", geometry: null }] };
    assert.equal(featuresFromGeoJson(JSON.stringify(fc)).length, 1);
  });
});

describe("heat zone cache isolation", () => {
  it("keys never collide across departments, versions or district scopes", () => {
    const cache = createCache();
    const payload = { filters: { from: "2026-10-01" } };
    const a = cache.key("dept-a", 1, ALL, payload);
    const b = cache.key("dept-b", 1, ALL, payload);
    const a2 = cache.key("dept-a", 2, ALL, payload);
    const aRestricted = cache.key("dept-a", 1, { allDistricts: false, districtIds: ["n"] }, payload);
    assert.equal(new Set([a, b, a2, aRestricted]).size, 4);
    cache.set(a, "A");
    assert.equal(cache.get(b), undefined);
    assert.equal(cache.get(a), "A");
    cache.clearDepartment("dept-a");
    assert.equal(cache.get(a), undefined);
    assert.throws(() => cache.key("", 1, ALL, payload));
  });
  it("expires entries after the TTL", () => {
    let t = 0;
    const cache = createCache({ ttlMs: 1000, now: () => t });
    const k = cache.key("dept-a", 1, ALL, {});
    cache.set(k, 1);
    t = 1500;
    assert.equal(cache.get(k), undefined);
  });
});

describe("heat zone client filters", () => {
  it("builds default and preset ranges", () => {
    assert.deepEqual(presetRange("7d", "2026-10-31"), { from: "2026-10-25", to: "2026-10-31" });
    assert.equal(defaultFilters("2026-10-31").from, "2026-10-02");
  });
  it("sends only active filters and flags midnight crossing", () => {
    const f = { ...defaultFilters("2026-10-31"), timeStart: "22:00", timeEnd: "02:00", priorities: ["Emergency"] };
    assert.deepEqual(toRequestFilters(f), { from: "2026-10-02", to: "2026-10-31", timeStart: "22:00", timeEnd: "02:00", priorities: ["Emergency"] });
    assert.equal(crossesMidnight(f), true);
  });
});

describe("CAD import coordinates", () => {
  it("maps CAD latitude/longitude into the report location", () => {
    const payload = parseCadPayload(JSON.stringify({ incident_number: "26-1", address: "1 Main St", latitude: "34.9551", longitude: "-90.0423" }), "run.json").payload;
    assert.deepEqual(payload.location, { latitude: 34.9551, longitude: -90.0423 });
  });
  it("ignores missing or invalid coordinates", () => {
    assert.equal(cadCoordinates("", "-90"), null);
    assert.equal(cadCoordinates("0", "0"), null);
    assert.equal(cadCoordinates("95", "10"), null);
    assert.equal(parseCadPayload(JSON.stringify({ incident_number: "26-2", address: "1 Main St" }), "run.json").payload.location, undefined);
  });
});

describe("address geocoding helpers", () => {
  const geocode = require("../../functions/lib/heatZone/geocode.js");
  const { geocodeAddress } = require("../../functions/lib/googleMapsService.js");
  const place = { city: "Forest", state: "MS", zip: "39074" };

  it("completes short addresses with the department city, state and ZIP", () => {
    assert.equal(geocode.geocodeQuery("12 Oak St", place), "12 Oak St, Forest, MS 39074");
    assert.equal(geocode.geocodeQuery("12 Oak St, Morton, MS", place), "12 Oak St, Morton, MS");
    assert.equal(geocode.geocodeQuery("12 Oak St", {}), "12 Oak St");
    assert.equal(geocode.geocodeQuery("", place), "");
    assert.equal(geocode.geocodeQuery("123", place), "");
  });

  it("keys ignore case, spacing and punctuation, and differ by address", () => {
    const a = geocode.geocodeKey("12 Oak St, Forest, MS 39074");
    assert.equal(a, geocode.geocodeKey("12  oak st. ,forest, ms 39074"));
    assert.notEqual(a, geocode.geocodeKey("14 Oak St, Forest, MS 39074"));
    assert.equal(geocode.geocodeKey(""), "");
    assert.match(a, /^[0-9a-f]{32}$/);
  });

  it("keeps precise matches and rejects town-level, partial and missing ones", () => {
    const ok = geocode.entryFromResult("q", { latitude: 32.36, longitude: -89.47, locationType: "ROOFTOP" }, 1000);
    assert.equal(ok.status, "ok");
    assert.deepEqual(geocode.entryPoint(ok), { lat: 32.36, lng: -89.47 });
    assert.equal(geocode.entryFromResult("q", { latitude: 32.36, longitude: -89.47, locationType: "APPROXIMATE" }).status, "imprecise");
    assert.equal(geocode.entryFromResult("q", { latitude: 32.36, longitude: -89.47, locationType: "ROOFTOP", partialMatch: true }).status, "imprecise");
    const missing = geocode.entryFromResult("q", null, 1000);
    assert.equal(missing.status, "not_found");
    assert.equal(geocode.entryPoint(missing), null);
    assert.equal(geocode.entryFromResult("q", { latitude: 0, longitude: 0, locationType: "ROOFTOP" }).status, "not_found");
  });

  it("looks up again only new addresses and old misses", () => {
    assert.equal(geocode.needsLookup(undefined), true);
    assert.equal(geocode.needsLookup({ status: "ok" }), false);
    assert.equal(geocode.needsLookup({ status: "imprecise" }), false);
    assert.equal(geocode.needsLookup({ status: "not_found", retryAfter: 2000 }, 1000), false);
    assert.equal(geocode.needsLookup({ status: "not_found", retryAfter: 2000 }, 3000), true);
  });

  it("projections prefer report coordinates over a geocoded address", () => {
    const point = { lat: 32.3, lng: -89.4 };
    const ctx = { departmentId: "d", timeZone: TZ, zones: [], geocodePoint: () => point };
    const withCoords = projectReport(report("r1"), ctx);
    assert.equal(withCoords.locationSource, "report");
    const bare = report("r2");
    bare.workspace.location = {};
    const geocoded = projectReport(bare, ctx);
    assert.equal(geocoded.locationSource, "geocoded");
    assert.equal(geocoded.lat, 32.3);
    const unmapped = projectReport(bare, { ...ctx, geocodePoint: () => null });
    assert.equal(unmapped.mapped, false);
    assert.equal(unmapped.locationSource, "");
    assert.notEqual(geocoded.contentHash, unmapped.contentHash);
  });

  it("Google answers carry precision, and errors carry Google's status", async () => {
    const realFetch = globalThis.fetch;
    const db = { doc: () => ({ get: async () => ({ exists: true, data: () => ({ geocodingApiKey: "k" }) }) }) };
    try {
      globalThis.fetch = async () => ({ json: async () => ({ status: "OK", results: [{ formatted_address: "x", geometry: { location: { lat: 1, lng: 2 }, location_type: "ROOFTOP" }, partial_match: true }] }) });
      const res = await geocodeAddress(db, "d", "12 Oak St");
      assert.equal(res.locationType, "ROOFTOP");
      assert.equal(res.partialMatch, true);
      globalThis.fetch = async () => ({ json: async () => ({ status: "ZERO_RESULTS", results: [] }) });
      await assert.rejects(geocodeAddress(db, "d", "nowhere"), (e) => e.status === "ZERO_RESULTS");
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
