/**
 * Heat Zone Analytics — Firestore-backed service.
 *
 * Data (all under departments/{departmentId}/):
 *   heatZoneCalls/{docId}    derived projection of a NERIS report (server-only)
 *   heatZoneMeta/state       { version, zonesVersion, updatedAt, lastChange } — dashboards listen to this
 *   heatZoneZones/{zoneId}   district / response-zone boundaries (GeoJSON kept as a string)
 *   heatZoneSettings/main    priority weights, high-priority list
 *   heatZoneAccess/{uid}     assigned districts for members without "all districts"
 *   heatZoneEvents/{eventId} processed-event ledger (dedupe; expireAt for TTL)
 *
 * Every entry point derives the department from the request path (triggers) or
 * verifies the caller's membership + permissions server-side (callables).
 */
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertMemberPermission, isPlatformCreator } = require("../access");
const { itemDocId, isItemsStorage } = require("../listItemsPlan");
const { readList } = require("../listStore");
const analytics = require("./analytics");
const { featuresFromGeoJson, validateGeometry } = require("./geo");
const { SOURCE_LIST_KEY, UNASSIGNED, projectReport } = require("./projection");
const { addDays, localDayStartMs, localParts, safeTimeZone } = require("./time");
const { createCache } = require("./cache");

const PERMISSIONS = Object.freeze({
  view: "viewHeatZoneAnalytics",
  markers: "viewHeatZoneMarkers",
  allDistricts: "viewHeatZoneAllDistricts",
  history: "viewHeatZoneHistory",
  repeat: "viewHeatZoneRepeatLocations",
  export: "exportHeatZoneReports",
  manage: "manageHeatZoneSettings",
});
const PERMISSION_KEYS = Object.values(PERMISSIONS);
const MODULE_KEY = "analytics";
const MAX_ROWS = 50_000;
const EVENT_TTL_DAYS = 7;
const ZONE_KINDS = ["district", "zone"];
const REPORT_TYPES = ["geographic", "district", "hourly", "daily", "classification", "comparison"];

const cache = createCache();
const text = (v) => (v === null || v === undefined ? "" : String(v).trim());

const paths = {
  calls: (d) => `departments/${d}/heatZoneCalls`,
  meta: (d) => `departments/${d}/heatZoneMeta/state`,
  zones: (d) => `departments/${d}/heatZoneZones`,
  settings: (d) => `departments/${d}/heatZoneSettings/main`,
  access: (d, uid) => `departments/${d}/heatZoneAccess/${uid}`,
  events: (d) => `departments/${d}/heatZoneEvents`,
  sourceHeader: (d) => `departments/${d}/lists/${SOURCE_LIST_KEY}`,
  sourceItem: (d, docId) => `departments/${d}/lists/${SOURCE_LIST_KEY}/items/${docId}`,
};

function cleanDepartmentId(value) {
  const id = text(value);
  if (!id || id.length > 120 || id.includes("/") || id === "." || id === "..") {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }
  return id;
}

// ---------------------------------------------------------------- access

/**
 * Verify the caller and work out what they may see. The department id in the
 * request only selects a department; membership and permissions are looked up
 * on the server, so a forged id is denied like any non-member.
 */
async function resolveCaller(db, request, required = [PERMISSIONS.view]) {
  const departmentId = cleanDepartmentId(request.data?.departmentId);
  const permissions = await assertMemberPermission(db, departmentId, request.auth, [PERMISSIONS.view],
    "You do not have access to Heat Zone Analytics.");
  for (const key of required) {
    if (permissions[key] !== true) {
      throw new HttpsError("permission-denied", permissionMessage(key));
    }
  }
  const entitlements = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = entitlements.data()?.modules;
  if (Array.isArray(modules) && !modules.includes(MODULE_KEY)) {
    throw new HttpsError("permission-denied", "Analytics is not included in this department's plan.");
  }
  const creator = await isPlatformCreator(db, request.auth);
  const allDistricts = creator || permissions[PERMISSIONS.allDistricts] === true || permissions[PERMISSIONS.manage] === true;
  let districtIds = [];
  if (!allDistricts) {
    const access = await db.doc(paths.access(departmentId, request.auth.uid)).get();
    districtIds = Array.isArray(access.data()?.districtIds) ? access.data().districtIds.map(String) : [];
  }
  return {
    departmentId,
    uid: request.auth.uid,
    actorName: text(request.auth.token?.email) || request.auth.uid,
    permissions,
    capabilities: {
      viewMarkers: permissions[PERMISSIONS.markers] === true && permissions.viewNerisReports === true,
      viewAllDistricts: allDistricts,
      viewHistory: permissions[PERMISSIONS.history] === true,
      viewRepeatLocations: permissions[PERMISSIONS.repeat] === true,
      exportReports: permissions[PERMISSIONS.export] === true,
      manageSettings: permissions[PERMISSIONS.manage] === true,
    },
    scope: { allDistricts, districtIds },
  };
}

function permissionMessage(key) {
  return {
    [PERMISSIONS.markers]: "You do not have permission to view individual incidents.",
    [PERMISSIONS.history]: "You do not have permission to view historical analytics.",
    [PERMISSIONS.repeat]: "You do not have permission to view repeat-location analytics.",
    [PERMISSIONS.export]: "You do not have permission to export Heat Zone reports.",
    [PERMISSIONS.manage]: "You do not have permission to manage Heat Zone settings.",
    viewNerisReports: "You need permission to view NERIS fire reports to open incident details.",
  }[key] || "You do not have permission to do that.";
}

async function audit(db, departmentId, caller, action, summary, details = {}) {
  await db.collection(`departments/${departmentId}/auditLogs`).add({
    action,
    module: "Heat Zone Analytics",
    recordId: details.recordId || "heat-zone-analytics",
    summary,
    details,
    actorUid: caller?.uid || "system",
    actorName: caller?.actorName || "system",
    created_at: new Date().toISOString(),
  }).catch((error) => console.error("heat zone audit write failed", departmentId, error?.message));
}

// ---------------------------------------------------------------- context

async function loadContext(db, departmentId) {
  const [profile, zonesSnap, meta, settingsSnap] = await Promise.all([
    db.doc(`departments/${departmentId}/profile/main`).get(),
    db.collection(paths.zones(departmentId)).get(),
    db.doc(paths.meta(departmentId)).get(),
    db.doc(paths.settings(departmentId)).get(),
  ]);
  const zones = zonesSnap.docs.map((doc) => zoneFromDoc(doc)).filter(Boolean);
  return {
    departmentId,
    departmentName: text(profile.data()?.name) || departmentId,
    timeZone: safeTimeZone(profile.data()?.timezone),
    zones,
    zonesVersion: meta.data()?.zonesVersion || 0,
    version: meta.data()?.version || 0,
    meta: meta.data() || {},
    settings: normalizeSettings(settingsSnap.data()),
  };
}

function zoneFromDoc(doc) {
  const data = doc.data() || {};
  let geometry = null;
  try { geometry = JSON.parse(data.geometryJson || "null"); } catch { geometry = null; }
  if (!geometry) return null;
  return {
    id: doc.id,
    name: text(data.name) || doc.id,
    kind: ZONE_KINDS.includes(data.kind) ? data.kind : "district",
    color: text(data.color) || "#25a194",
    priority: Number(data.priority) || 0,
    active: data.active !== false,
    bbox: Array.isArray(data.bbox) ? data.bbox : null,
    geometry,
  };
}

function normalizeSettings(raw = {}) {
  const defaults = analytics.DEFAULT_SETTINGS;
  const weights = { ...defaults.priorityWeights };
  for (const [k, v] of Object.entries(raw?.priorityWeights || {})) {
    const n = Number(v);
    if (text(k) && Number.isFinite(n) && n > 0 && n <= 100) weights[text(k).slice(0, 60)] = n;
  }
  const high = Array.isArray(raw?.highPriorities) && raw.highPriorities.length
    ? raw.highPriorities.map(text).filter(Boolean).slice(0, 20)
    : [...defaults.highPriorities];
  return { priorityWeights: weights, highPriorities: high };
}

// ---------------------------------------------------------------- event processing

/** Current state of one report in the source list (either storage format). */
async function readSourceReport(tx, db, departmentId, docId) {
  const header = await tx.get(db.doc(paths.sourceHeader(departmentId)));
  const headerData = header.exists ? header.data() || {} : null;
  if (!headerData || isItemsStorage(headerData)) {
    const item = await tx.get(db.doc(paths.sourceItem(departmentId, docId)));
    if (!item.exists) return null;
    const { _order, ...report } = item.data() || {};
    return report;
  }
  const items = Array.isArray(headerData.items) ? headerData.items : [];
  return items.find((item) => item && text(item.id) && itemDocId(item.id) === docId) || null;
}

/**
 * Bring one projection in line with the source record. Always re-reads the
 * source inside a transaction, so duplicate, retried or out-of-order events
 * converge on the same result. Returns "created" | "updated" | "deleted" |
 * "unchanged" | "duplicate" | "skipped" | "rejected".
 */
async function syncReport(db, departmentId, docId, { eventId = "", reason = "write" } = {}) {
  const ctx = await loadContext(db, departmentId);
  const projectionRef = db.doc(`${paths.calls(departmentId)}/${docId}`);
  const metaRef = db.doc(paths.meta(departmentId));
  const ledgerRef = eventId ? db.doc(`${paths.events(departmentId)}/${eventId.replace(/\//g, "_").slice(0, 200)}`) : null;

  return db.runTransaction(async (tx) => {
    if (ledgerRef) {
      const seen = await tx.get(ledgerRef);
      if (seen.exists) return "duplicate";
    }
    const [report, existing] = await Promise.all([
      readSourceReport(tx, db, departmentId, docId),
      tx.get(projectionRef),
    ]);
    let outcome;
    if (report && text(report.departmentId) && text(report.departmentId) !== departmentId) {
      // A record carrying another department's id never enters this department's analytics.
      console.warn("heat zone: rejected cross-tenant record", { departmentId, docId, claimed: report.departmentId });
      outcome = "rejected";
      if (existing.exists) tx.delete(projectionRef);
    } else {
      const projection = report ? projectReport(report, ctx) : null;
      if (!projection) {
        outcome = existing.exists ? "deleted" : "skipped";
        if (existing.exists) tx.delete(projectionRef);
      } else if (existing.exists && existing.data()?.contentHash === projection.contentHash) {
        outcome = "unchanged";
      } else {
        outcome = existing.exists ? "updated" : "created";
        tx.set(projectionRef, { ...projection, syncedAt: Date.now() });
      }
    }
    const changed = ["created", "updated", "deleted"].includes(outcome) || (outcome === "rejected" && existing.exists);
    if (changed) {
      tx.set(metaRef, {
        version: FieldValue.increment(1),
        updatedAt: Date.now(),
        lastChange: { type: outcome, reason, at: Date.now() },
      }, { merge: true });
    }
    if (ledgerRef) {
      tx.set(ledgerRef, {
        docId, outcome, reason, processedAt: Date.now(),
        expireAt: new Date(Date.now() + EVENT_TTL_DAYS * 86_400_000),
      });
    }
    return outcome;
  });
}

/** Trigger: departments/{departmentId}/lists/{listKey}/items/{itemId} */
async function handleItemWritten(db, event) {
  const { departmentId, itemId, listKey = SOURCE_LIST_KEY } = event.params || {};
  if (listKey !== SOURCE_LIST_KEY) return "ignored";
  return syncReport(db, departmentId, itemId, { eventId: event.id || "", reason: "report-write" });
}

/**
 * Trigger: departments/{departmentId}/lists/{listKey} (legacy array storage).
 * Items-storage lists are handled per item, so the header is ignored then.
 */
async function handleListWritten(db, event) {
  const { departmentId, listKey = SOURCE_LIST_KEY } = event.params || {};
  if (listKey !== SOURCE_LIST_KEY) return [];
  const before = event.data?.before?.exists ? event.data.before.data() || {} : null;
  const after = event.data?.after?.exists ? event.data.after.data() || {} : null;
  if (after && isItemsStorage(after)) return [];
  const beforeItems = Array.isArray(before?.items) ? before.items : [];
  const afterItems = Array.isArray(after?.items) ? after.items : [];
  if (!beforeItems.length && !afterItems.length) return [];
  const byId = (items) => new Map(items.filter((i) => i && text(i.id)).map((i) => [itemDocId(i.id), JSON.stringify(i)]));
  const b = byId(beforeItems);
  const a = byId(afterItems);
  const touched = [...new Set([...b.keys(), ...a.keys()])].filter((id) => b.get(id) !== a.get(id));
  const results = [];
  for (const docId of touched) {
    results.push(await syncReport(db, departmentId, docId, {
      eventId: event.id ? `${event.id}-${docId}` : "",
      reason: "report-write",
    }));
  }
  return results;
}

/**
 * Recalculate every projection for one department from the source list
 * (historical recalculation after zone/time-zone changes, or a backfill).
 */
async function rebuildDepartment(db, departmentId, { reason = "rebuild", dryRun = false } = {}) {
  const ctx = await loadContext(db, departmentId);
  const source = await readList(db, departmentId, SOURCE_LIST_KEY);
  const wanted = new Map();
  let skipped = 0;
  let rejected = 0;
  for (const report of source.items) {
    if (!report || !text(report.id)) { skipped += 1; continue; }
    if (text(report.departmentId) && text(report.departmentId) !== departmentId) { rejected += 1; continue; }
    const docId = itemDocId(report.id);
    if (wanted.has(docId)) continue;
    const projection = projectReport(report, ctx);
    if (projection) wanted.set(docId, projection); else skipped += 1;
  }
  const existing = await db.collection(paths.calls(departmentId)).select("contentHash").get();
  const have = new Map(existing.docs.map((d) => [d.id, d.data()?.contentHash]));
  const writes = [];
  for (const [docId, projection] of wanted) {
    if (have.get(docId) !== projection.contentHash) writes.push(["set", docId, projection]);
  }
  for (const docId of have.keys()) if (!wanted.has(docId)) writes.push(["delete", docId]);
  const counts = { projected: wanted.size, written: writes.filter((w) => w[0] === "set").length, removed: writes.filter((w) => w[0] === "delete").length, skipped, rejected };
  if (dryRun) return counts;
  const col = db.collection(paths.calls(departmentId));
  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    for (const [op, docId, data] of writes.slice(i, i + 400)) {
      if (op === "set") batch.set(col.doc(docId), { ...data, syncedAt: Date.now() });
      else batch.delete(col.doc(docId));
    }
    await batch.commit();
  }
  await db.doc(paths.meta(departmentId)).set({
    version: FieldValue.increment(1),
    updatedAt: Date.now(),
    lastRebuildAt: Date.now(),
    lastChange: { type: "rebuild", reason, at: Date.now() },
  }, { merge: true });
  cache.clearDepartment(departmentId);
  return counts;
}

// ---------------------------------------------------------------- queries

async function loadRows(db, ctx, from, to) {
  const start = localDayStartMs(from, ctx.timeZone);
  const end = localDayStartMs(addDays(to, 1), ctx.timeZone);
  const snap = await db.collection(paths.calls(ctx.departmentId))
    .where("occurredAt", ">=", start)
    .where("occurredAt", "<", end)
    .orderBy("occurredAt")
    .limit(MAX_ROWS + 1)
    .get();
  const rows = [];
  for (const doc of snap.docs.slice(0, MAX_ROWS)) {
    const data = doc.data();
    // Defence in depth: a projection that names another department is never used.
    if (data.departmentId !== ctx.departmentId) continue;
    rows.push({ id: doc.id, ...data });
  }
  return { rows, truncated: snap.size > MAX_ROWS };
}

async function filteredRows(db, caller, ctx, filters) {
  const { rows, truncated } = await loadRows(db, ctx, filters.from, filters.to);
  return { rows: analytics.filterRows(rows, filters, caller.scope), inScope: analytics.applyScope(rows, caller.scope), truncated };
}

function today(ctx) {
  return analytics.todayIn(ctx.timeZone);
}

/** Boundaries the caller may know about: response zones, plus districts in their scope. */
function scopedZones(ctx, caller) {
  return ctx.zones.filter((z) => z.kind !== "district" || caller.scope.allDistricts || caller.scope.districtIds.includes(z.id));
}

function publicZones(ctx, caller) {
  return scopedZones(ctx, caller).map(({ id, name, kind, color, active }) => ({ id, name, kind, color, active }));
}

/** heatZoneDashboard: summary cards, charts, heat grid, comparisons. */
async function dashboard(db, request) {
  const caller = await resolveCaller(db, request);
  const ctx = await loadContext(db, caller.departmentId);
  const filters = analytics.normalizeFilters(request.data?.filters, { today: today(ctx), canViewHistory: caller.capabilities.viewHistory });
  const zoom = Number(request.data?.zoom) || 12;
  const mode = request.data?.mode === "weighted" ? "weighted" : "raw";
  const cacheKey = cache.key(caller.departmentId, ctx.version, caller.scope, {
    kind: "dashboard", filters, zoom, mode, caps: caller.capabilities, zonesVersion: ctx.zonesVersion,
  });
  const cached = cache.get(cacheKey);
  if (cached) return { ...cached, cached: true };

  const { rows, inScope, truncated } = await filteredRows(db, caller, ctx, filters);
  const opts = { zones: scopedZones(ctx, caller), settings: ctx.settings, filters };
  const result = {
    department: { id: ctx.departmentId, name: ctx.departmentName, timeZone: ctx.timeZone },
    filters,
    capabilities: caller.capabilities,
    zones: publicZones(ctx, caller),
    summary: analytics.summarize(rows, opts),
    charts: analytics.buildCharts(rows, opts),
    heat: analytics.buildHeatGrid(rows, { zoom, mode, settings: ctx.settings }),
    filterOptions: analytics.filterOptions(inScope),
    settings: { priorityWeights: ctx.settings.priorityWeights, highPriorities: ctx.settings.highPriorities },
    comparison: null,
    districtComparison: null,
    repeatLocations: caller.capabilities.viewRepeatLocations ? analytics.buildRepeatLocations(rows) : null,
    meta: { version: ctx.version, zonesVersion: ctx.zonesVersion, generatedAt: Date.now(), truncated, lastChange: ctx.meta.lastChange || null },
  };
  if (caller.capabilities.viewHistory) {
    const prevFilters = analytics.previousPeriod(filters);
    const prev = await filteredRows(db, caller, ctx, prevFilters);
    result.comparison = analytics.buildComparison(rows, prev.rows, prevFilters);
    result.districtComparison = analytics.buildDistrictComparison(rows, prev.rows, opts);
  } else {
    result.districtComparison = analytics.buildDistrictComparison(rows, null, opts);
  }
  cache.set(cacheKey, result);
  return result;
}

/** heatZoneMarkers: clustered or paged incident markers for the map viewport. */
async function markers(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.markers, "viewNerisReports"]);
  const ctx = await loadContext(db, caller.departmentId);
  const filters = analytics.normalizeFilters(request.data?.filters, { today: today(ctx), canViewHistory: caller.capabilities.viewHistory });
  const viewport = request.data?.viewport ? analytics.normalizeFilters({ bounds: request.data.viewport }, { today: today(ctx), canViewHistory: true }).bounds : null;
  const { rows } = await filteredRows(db, caller, ctx, filters);
  return analytics.buildMarkers(rows, {
    viewport,
    zoom: Number(request.data?.zoom) || 12,
    page: Number(request.data?.page) || 0,
    pageSize: Number(request.data?.pageSize) || 200,
  });
}

/** heatZoneIncident: authorized detail for one incident marker. */
async function incident(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.markers, "viewNerisReports"]);
  const id = text(request.data?.id);
  if (!id || id.includes("/") || id.length > 300) throw new HttpsError("invalid-argument", "Incident id is required.");
  const snap = await db.doc(`${paths.calls(caller.departmentId)}/${id}`).get();
  const data = snap.data();
  if (!snap.exists || data.departmentId !== caller.departmentId || data.voided) {
    throw new HttpsError("not-found", "That incident is not available.");
  }
  if (!caller.scope.allDistricts && !caller.scope.districtIds.includes(data.districtId)) {
    throw new HttpsError("not-found", "That incident is not available.");
  }
  const ctx = await loadContext(db, caller.departmentId);
  if (!caller.capabilities.viewHistory) {
    const earliest = addDays(today(ctx), -(analytics.RECENT_DAYS - 1));
    if (data.localDate < earliest) throw new HttpsError("permission-denied", permissionMessage(PERMISSIONS.history));
  }
  await audit(db, caller.departmentId, caller, "heat_zone_incident_viewed", `Viewed incident ${data.reportNumber || id} on the heat map`, { recordId: id });
  return {
    id,
    reportNumber: data.reportNumber,
    occurredAt: data.occurredAt,
    localDate: data.localDate,
    timeZone: data.timeZone,
    address: data.address,
    lat: data.lat,
    lng: data.lng,
    classification: data.classification,
    classificationDetail: data.classificationDetail,
    priority: data.priority,
    disposition: data.disposition,
    status: data.status,
    units: data.units || [],
    unitTypes: data.unitTypes || [],
    stations: data.stations || [],
    responseSeconds: data.responseSeconds,
    district: { id: data.districtId, name: data.districtId === UNASSIGNED ? "Outside configured districts" : (ctx.zones.find((z) => z.id === data.districtId)?.name || data.districtId) },
    zones: (data.zoneIds || []).map((zid) => ({ id: zid, name: ctx.zones.find((z) => z.id === zid)?.name || zid })),
  };
}

/** heatZoneBoundaries: boundary geometry for the map (district scope applied). */
async function boundaries(db, request) {
  const caller = await resolveCaller(db, request);
  const ctx = await loadContext(db, caller.departmentId);
  const visible = new Set(publicZones(ctx, caller).map((z) => z.id));
  return {
    zones: ctx.zones.filter((z) => visible.has(z.id)).map(({ id, name, kind, color, active, geometry, bbox }) => ({ id, name, kind, color, active, geometry, bbox })),
  };
}

// ---------------------------------------------------------------- reports

function formatLocal(ms, timeZone) {
  const p = localParts(ms, timeZone);
  return `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function describeFilters(filters, ctx) {
  const name = (id) => ctx.zones.find((z) => z.id === id)?.name || (id === UNASSIGNED ? "Outside configured districts" : id);
  const parts = [];
  if (filters.daysOfWeek.length) parts.push(`Days: ${filters.daysOfWeek.map((d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d]).join(", ")}`);
  const clock = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (filters.timeStart !== null || filters.timeEnd !== null) parts.push(`Time: ${clock(filters.timeStart ?? 0)}–${clock(filters.timeEnd ?? 1440)}`);
  if (filters.districtIds.length) parts.push(`Districts: ${filters.districtIds.map(name).join(", ")}`);
  if (filters.zoneIds.length) parts.push(`Response zones: ${filters.zoneIds.map(name).join(", ")}`);
  for (const [key, label] of [["classifications", "Classifications"], ["priorities", "Priorities"], ["dispositions", "Dispositions"], ["statuses", "Statuses"], ["unitTypes", "Unit types"]]) {
    if (filters[key].length) parts.push(`${label}: ${filters[key].join(", ")}`);
  }
  if (filters.bounds) parts.push(`Map area: ${filters.bounds.south.toFixed(4)},${filters.bounds.west.toFixed(4)} to ${filters.bounds.north.toFixed(4)},${filters.bounds.east.toFixed(4)}`);
  return parts.length ? parts : ["No additional filters"];
}

function reportTable(type, rows, prevRows, prevFilters, ctx, filters) {
  const opts = { zones: ctx.zones, settings: ctx.settings, filters };
  const charts = analytics.buildCharts(rows, opts);
  switch (type) {
    case "geographic": {
      const grid = analytics.buildHeatGrid(rows, { zoom: 15, settings: ctx.settings });
      return {
        title: "Geographic call activity",
        columns: ["Latitude", "Longitude", "Calls", "Weighted intensity"],
        rows: grid.cells.map((c) => [c.lat, c.lng, c.count, c.weighted]),
        notes: [`${rows.filter((r) => !r.mapped).length} call(s) have no coordinates and are not in this table.`],
      };
    }
    case "district":
      return {
        title: "District activity",
        columns: ["District", "Calls", "Share %", "High-priority calls", "Top classification", "Avg response (min)"],
        rows: analytics.buildDistrictComparison(rows, null, opts).map((d) => [d.name, d.count, d.share, d.highPriorityCalls, d.topClassification || "", d.averageResponse.reliable ? Math.round(d.averageResponse.seconds / 6) / 10 : ""]),
        notes: [],
      };
    case "hourly":
      return { title: "Calls by hour of day", columns: ["Hour", "Calls"], rows: charts.byHour.map((h) => [h.label, h.count]), notes: [`Hours are in ${ctx.timeZone}.`] };
    case "daily":
      return {
        title: "Daily and weekday trends",
        columns: ["Period", "Calls"],
        rows: [
          ...charts.trend.points.map((p) => [p.key, p.count]),
          ["", ""],
          ...charts.byWeekday.map((d) => [d.label, d.count]),
        ],
        notes: [`Trend grouped by ${charts.trend.bucket}; weekday totals follow.`],
      };
    case "classification":
      return {
        title: "Call classification breakdown",
        columns: ["Classification", "Calls", "Share %"],
        rows: charts.byClassification.map((c) => [c.label, c.count, rows.length ? Math.round((c.count / rows.length) * 1000) / 10 : 0]),
        notes: [],
      };
    case "comparison": {
      const comparison = analytics.buildDistrictComparison(rows, prevRows, opts);
      return {
        title: "Historical comparison",
        columns: ["District", "Selected period", "Previous period", "Change %"],
        rows: [
          ["All districts", rows.length, prevRows.length, analytics.buildComparison(rows, prevRows, prevFilters).changePct ?? ""],
          ...comparison.map((d) => [d.name, d.count, d.previousCount ?? 0, d.changePct ?? ""]),
        ],
        notes: [`Previous period: ${prevFilters.from} to ${prevFilters.to}.`],
      };
    }
    default:
      throw new HttpsError("invalid-argument", "Unknown report type.");
  }
}

/** heatZoneReport: tenant- and permission-scoped report data for CSV / Excel / PDF export. */
async function report(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.export]);
  const type = text(request.data?.reportType);
  if (!REPORT_TYPES.includes(type)) throw new HttpsError("invalid-argument", "Choose a report type.");
  if (type === "comparison" && !caller.capabilities.viewHistory) {
    throw new HttpsError("permission-denied", permissionMessage(PERMISSIONS.history));
  }
  const format = ["csv", "xlsx", "pdf"].includes(request.data?.format) ? request.data.format : "csv";
  const fullCtx = await loadContext(db, caller.departmentId);
  const ctx = { ...fullCtx, zones: scopedZones(fullCtx, caller) };
  const filters = analytics.normalizeFilters(request.data?.filters, { today: today(ctx), canViewHistory: caller.capabilities.viewHistory });
  const { rows, truncated } = await filteredRows(db, caller, ctx, filters);
  let prevRows = [];
  let prevFilters = analytics.previousPeriod(filters);
  if (type === "comparison") prevRows = (await filteredRows(db, caller, ctx, prevFilters)).rows;
  const table = reportTable(type, rows, prevRows, prevFilters, ctx, filters);
  const generatedAt = Date.now();
  const meta = {
    agencyName: ctx.departmentName,
    departmentId: ctx.departmentId,
    reportType: type,
    title: table.title,
    format,
    from: filters.from,
    to: filters.to,
    timeZone: ctx.timeZone,
    filters: describeFilters(filters, ctx),
    districtScope: caller.scope.allDistricts ? "All districts" : `Assigned districts only (${caller.scope.districtIds.length})`,
    totalCalls: rows.length,
    generatedAt,
    generatedAtLocal: `${formatLocal(generatedAt, ctx.timeZone)} (${ctx.timeZone})`,
    generatedBy: caller.actorName,
    truncated,
  };
  await audit(db, caller.departmentId, caller, "heat_zone_report_exported",
    `Exported "${table.title}" (${format.toUpperCase()}) for ${filters.from} to ${filters.to}`,
    { recordId: `report-${type}`, reportType: type, format, from: filters.from, to: filters.to, rows: table.rows.length });
  return { meta, columns: table.columns, rows: table.rows, notes: table.notes };
}

// ---------------------------------------------------------------- settings

async function bumpZones(db, departmentId) {
  await db.doc(paths.meta(departmentId)).set({ zonesVersion: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
}

function zoneId(name) {
  const slug = text(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return `${slug || "zone"}-${Math.random().toString(36).slice(2, 7)}`;
}

/** heatZoneGetSettings: zones, weights and member district assignments (managers). */
async function getSettings(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const ctx = await loadContext(db, caller.departmentId);
  const [users, access] = await Promise.all([
    db.collection(`departments/${caller.departmentId}/users`).get(),
    db.collection(`departments/${caller.departmentId}/heatZoneAccess`).get(),
  ]);
  const byUid = new Map(access.docs.map((d) => [d.id, d.data()?.districtIds || []]));
  return {
    settings: ctx.settings,
    timeZone: ctx.timeZone,
    zones: ctx.zones.map(({ id, name, kind, color, priority, active, bbox }) => ({ id, name, kind, color, priority, active, bbox })),
    members: users.docs
      .filter((d) => d.data()?.status === "active")
      .map((d) => ({ uid: d.id, email: text(d.data()?.email), name: text(d.data()?.displayName || d.data()?.name), role: text(d.data()?.role), districtIds: byUid.get(d.id) || [] }))
      .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
    meta: { version: ctx.version, zonesVersion: ctx.zonesVersion, lastRebuildAt: ctx.meta.lastRebuildAt || null },
  };
}

/** heatZoneSaveZones: create/update one zone, or import a GeoJSON FeatureCollection. */
async function saveZones(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const d = caller.departmentId;
  const kind = ZONE_KINDS.includes(request.data?.kind) ? request.data.kind : "district";
  const input = request.data?.zone;
  const toSave = [];
  if (input && typeof input === "object" && !request.data?.geoJson) {
    const geometry = input.geometry || featuresFromGeoJson(input.geoJson)[0]?.geometry;
    const existingId = text(input.id);
    if (existingId) {
      const current = await db.doc(`${paths.zones(d)}/${existingId}`).get();
      if (!current.exists) throw new HttpsError("not-found", "That boundary no longer exists.");
      toSave.push({ id: existingId, name: input.name ?? current.data().name, kind: input.kind || current.data().kind, color: input.color ?? current.data().color, priority: input.priority ?? current.data().priority, active: input.active ?? current.data().active, geometry: geometry || JSON.parse(current.data().geometryJson) });
    } else {
      toSave.push({ name: input.name, kind: input.kind || kind, color: input.color, priority: input.priority, active: input.active, geometry });
    }
  } else {
    const features = featuresFromGeoJson(request.data?.geoJson);
    if (!features.length) throw new HttpsError("invalid-argument", "Upload a GeoJSON Polygon, MultiPolygon, Feature or FeatureCollection.");
    if (features.length > 200) throw new HttpsError("invalid-argument", "Import up to 200 boundaries at a time.");
    const nameProperty = text(request.data?.nameProperty);
    features.forEach((f, i) => {
      const props = f.properties || {};
      const name = text(props[nameProperty]) || text(props.name) || text(props.NAME) || text(props.district) || text(props.DISTRICT) || `${kind === "district" ? "District" : "Zone"} ${i + 1}`;
      toSave.push({ name, kind, geometry: f.geometry });
    });
  }
  const saved = [];
  const batch = db.batch();
  for (const zone of toSave) {
    const name = text(zone.name).slice(0, 80);
    if (!name) throw new HttpsError("invalid-argument", "Each boundary needs a name.");
    const check = validateGeometry(zone.geometry);
    if (!check.ok) throw new HttpsError("invalid-argument", `${name}: ${check.error}`);
    const color = /^#[0-9a-fA-F]{6}$/.test(text(zone.color)) ? text(zone.color) : (zone.kind === "zone" ? "#7c5cff" : "#25a194");
    const id = zone.id || zoneId(name);
    batch.set(db.doc(`${paths.zones(d)}/${id}`), {
      name,
      kind: ZONE_KINDS.includes(zone.kind) ? zone.kind : kind,
      color,
      priority: Number.isFinite(Number(zone.priority)) ? Number(zone.priority) : 0,
      active: zone.active !== false,
      geometryJson: JSON.stringify(check.geometry),
      geometryType: check.geometry.type,
      bbox: check.bbox,
      departmentId: d,
      updatedAt: Date.now(),
      updatedBy: caller.uid,
    }, { merge: true });
    saved.push({ id, name });
  }
  await batch.commit();
  await bumpZones(db, d);
  const rebuild = await rebuildDepartment(db, d, { reason: "zones-changed" });
  await audit(db, d, caller, "heat_zone_boundaries_saved", `Saved ${saved.length} Heat Zone boundar${saved.length === 1 ? "y" : "ies"}: ${saved.map((s) => s.name).join(", ").slice(0, 300)}`, { recordId: saved[0]?.id || "zones" });
  return { saved, rebuild };
}

async function deleteZone(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const id = text(request.data?.zoneId);
  if (!id || id.includes("/")) throw new HttpsError("invalid-argument", "zoneId is required.");
  const ref = db.doc(`${paths.zones(caller.departmentId)}/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That boundary no longer exists.");
  await ref.delete();
  await bumpZones(db, caller.departmentId);
  const rebuild = await rebuildDepartment(db, caller.departmentId, { reason: "zones-changed" });
  await audit(db, caller.departmentId, caller, "heat_zone_boundary_deleted", `Deleted Heat Zone boundary ${snap.data()?.name || id}`, { recordId: id });
  return { deleted: id, rebuild };
}

async function saveSettings(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const settings = normalizeSettings(request.data?.settings || {});
  await db.doc(paths.settings(caller.departmentId)).set({ ...settings, updatedAt: Date.now(), updatedBy: caller.uid });
  await db.doc(paths.meta(caller.departmentId)).set({ version: FieldValue.increment(1), updatedAt: Date.now() }, { merge: true });
  await audit(db, caller.departmentId, caller, "heat_zone_settings_saved", "Updated Heat Zone priority weights", { recordId: "settings" });
  return { settings };
}

async function setDistrictAccess(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const uid = text(request.data?.uid);
  if (!uid || uid.includes("/")) throw new HttpsError("invalid-argument", "uid is required.");
  const member = await db.doc(`departments/${caller.departmentId}/users/${uid}`).get();
  if (!member.exists) throw new HttpsError("not-found", "That member is not in this department.");
  const ctx = await loadContext(db, caller.departmentId);
  const valid = new Set([...ctx.zones.filter((z) => z.kind === "district").map((z) => z.id), UNASSIGNED]);
  const districtIds = [...new Set((Array.isArray(request.data?.districtIds) ? request.data.districtIds : []).map(text))].filter((id) => valid.has(id));
  await db.doc(paths.access(caller.departmentId, uid)).set({ districtIds, departmentId: caller.departmentId, updatedAt: Date.now(), updatedBy: caller.uid });
  cache.clearDepartment(caller.departmentId);
  await audit(db, caller.departmentId, caller, "heat_zone_access_changed", `Set Heat Zone districts for ${text(member.data()?.email) || uid} (${districtIds.length})`, { recordId: uid, districtIds });
  return { uid, districtIds };
}

async function rebuild(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.view, PERMISSIONS.manage]);
  const result = await rebuildDepartment(db, caller.departmentId, { reason: "manual" });
  await audit(db, caller.departmentId, caller, "heat_zone_rebuilt", `Recalculated Heat Zone analytics (${result.projected} incidents)`, { recordId: "rebuild", ...result });
  return result;
}

module.exports = {
  MODULE_KEY,
  PERMISSIONS,
  PERMISSION_KEYS,
  REPORT_TYPES,
  boundaries,
  cache,
  dashboard,
  deleteZone,
  getSettings,
  handleItemWritten,
  handleListWritten,
  incident,
  markers,
  rebuild,
  rebuildDepartment,
  report,
  resolveCaller,
  saveSettings,
  saveZones,
  setDistrictAccess,
  syncReport,
};
