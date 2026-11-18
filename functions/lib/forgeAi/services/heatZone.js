/**
 * Heat Zone Intelligence. Calls the existing Heat Zone dashboard service with
 * the caller's own auth, so permissions, the analytics module check, district
 * scope and the history limit are enforced by Heat Zone itself. Forge AI never
 * reads heatZoneCalls directly.
 */
const heatZone = require("../../heatZone/service");

const pct = (v) => (v === null || v === undefined ? "n/a" : `${v > 0 ? "+" : ""}${v}%`);
const mins = (s) => (Number.isFinite(s) ? Math.round((s / 60) * 10) / 10 : null);
const hourLabel = (h) => `${String(h).padStart(2, "0")}:00–${String(h).padStart(2, "0")}:59`;

async function loadDashboard(ctx) {
  return heatZone.dashboard(ctx.db, {
    auth: ctx.auth,
    data: { departmentId: ctx.departmentId, filters: { from: ctx.query.window.from, to: ctx.query.window.to } },
  });
}

/** Compact, model-safe facts from a Heat Zone dashboard result. */
function factsFrom(d) {
  const charts = d.charts || {};
  const topHours = [...(charts.byHour || [])].sort((a, b) => b.count - a.count).filter((h) => h.count > 0).slice(0, 5);
  return {
    window: { from: d.filters.from, to: d.filters.to, historyLimited: d.filters.historyLimited === true },
    totalCalls: d.summary.totalCalls,
    mappedCalls: d.summary.mappedCalls,
    unmappedCalls: d.summary.unmappedCalls,
    highPriorityCalls: d.summary.highPriorityCalls,
    peakHour: d.summary.peakHour ? { hour: hourLabel(d.summary.peakHour.hour), count: d.summary.peakHour.count } : null,
    busiestHours: topHours.map((h) => ({ hour: hourLabel(h.key), count: h.count })),
    byWeekday: (charts.byWeekday || []).map((w) => ({ day: w.label, count: w.count })),
    topClassifications: (charts.byClassification || []).slice(0, 8).map((c) => ({ name: c.label, count: c.count })),
    averageResponseMinutes: d.summary.averageResponse?.reliable ? mins(d.summary.averageResponse.seconds) : null,
    responseSample: d.summary.averageResponse?.sampleSize ?? 0,
    districts: (d.districtComparison || []).slice(0, 15).map((x) => ({
      name: x.name, calls: x.count, sharePercent: x.share, previousCalls: x.previousCount, changePercent: x.changePct,
      highPriorityCalls: x.highPriorityCalls, topType: x.topClassification,
      averageResponseMinutes: x.averageResponse?.reliable ? mins(x.averageResponse.seconds) : null,
    })),
    comparison: d.comparison ? {
      previousFrom: d.comparison.previousFrom, previousTo: d.comparison.previousTo,
      currentTotal: d.comparison.currentTotal, previousTotal: d.comparison.previousTotal, changePercent: d.comparison.changePct,
    } : null,
    repeatLocations: d.repeatLocations ? d.repeatLocations.slice(0, 10).map((r) => ({
      address: r.address, calls: r.count, topTypes: r.topClassifications.map((c) => c.name),
    })) : null,
  };
}

function limitationsFrom(d) {
  const out = ["Heat Zone figures come from NERIS reports; they show where and when calls happened, not why."];
  if (d.filters.historyLimited) out.push("You can see the last 30 days only (no historical analytics permission).");
  if (!d.capabilities?.viewAllDistricts) out.push("Only your assigned districts are included.");
  if (!d.capabilities?.viewRepeatLocations) out.push("Repeat-location analysis needs the repeat-location permission.");
  if (!d.comparison) out.push("Period comparison needs the historical analytics permission.");
  if (d.summary.unmappedCalls) out.push(`${d.summary.unmappedCalls} call(s) have no location and are counted but not mapped to a district.`);
  if (!d.zones?.some((z) => z.kind === "district")) out.push("No district boundaries are configured, so every call is outside configured districts.");
  if (d.meta?.truncated) out.push("The window has more calls than Heat Zone reads at once; narrow the dates.");
  if (!d.summary.averageResponse?.reliable) out.push("Average response time needs at least 5 calls with dispatch and arrival times.");
  return out;
}

function fallbackFrom(f, sourceId) {
  const lines = [`**${f.totalCalls}** call(s) from ${f.window.from} to ${f.window.to} [${sourceId}].`];
  const busiest = f.districts.find((x) => x.calls > 0 && x.name !== "Outside configured districts") || f.districts[0];
  if (busiest && busiest.calls) lines.push(`- Most calls: ${busiest.name} — ${busiest.calls} (${busiest.sharePercent}% of calls)${busiest.changePercent !== null && busiest.changePercent !== undefined ? `, ${pct(busiest.changePercent)} vs previous period` : ""}`);
  if (f.peakHour) lines.push(`- Peak hour: ${f.peakHour.hour} with ${f.peakHour.count} call(s)`);
  if (f.topClassifications[0]) lines.push(`- Most common type: ${f.topClassifications[0].name} (${f.topClassifications[0].count})`);
  if (f.comparison) lines.push(`- Previous period (${f.comparison.previousFrom} to ${f.comparison.previousTo}): ${f.comparison.previousTotal} call(s), change ${pct(f.comparison.changePercent)}`);
  if (f.repeatLocations?.length) lines.push(`- Top repeat location: ${f.repeatLocations[0].address} (${f.repeatLocations[0].calls} calls)`);
  if (f.averageResponseMinutes !== null) lines.push(`- Average dispatch to first arrival: ${f.averageResponseMinutes} min`);
  return lines.join("\n");
}

function tablesFrom(f) {
  const tables = [{
    id: "districts",
    title: "District comparison",
    columns: ["District", "Calls", "Share %", "Previous", "Change %", "High priority", "Top type"],
    rows: f.districts.map((x) => [x.name, x.calls, x.sharePercent, x.previousCalls ?? "", x.changePercent ?? "", x.highPriorityCalls, x.topType || ""]),
  }, {
    id: "hours",
    title: "Busiest hours",
    columns: ["Hour", "Calls"],
    rows: f.busiestHours.map((h) => [h.hour, h.count]),
  }];
  if (f.repeatLocations?.length) {
    tables.push({ id: "repeat", title: "Repeat locations", columns: ["Address", "Calls", "Top types"], rows: f.repeatLocations.map((r) => [r.address, r.calls, r.topTypes.join(", ")]) });
  }
  return tables;
}

async function run(ctx) {
  const R = require("../records");
  const book = ctx.book || new R.SourceBook();
  const d = await loadDashboard(ctx);
  const f = factsFrom(d);
  const sourceId = book.add({
    kind: "heatZoneAnalytics",
    recordId: `${f.window.from}_${f.window.to}`,
    label: `Heat Zone Analytics ${f.window.from} to ${f.window.to}`,
    detail: `${f.totalCalls} calls · projection version ${d.meta?.version ?? 0}`,
    liveness: "historical",
    asOf: d.meta?.generatedAt ? new Date(d.meta.generatedAt).toISOString() : null,
    link: { page: "Heat Zone Analytics" },
  });
  return {
    capability: "heatZone",
    title: `Heat Zone — ${f.window.from} to ${f.window.to}`,
    liveness: "historical",
    facts: { source: sourceId, ...f },
    book,
    tables: tablesFrom(f),
    limitations: limitationsFrom(d),
    fallbackAnswer: fallbackFrom(f, sourceId),
    empty: f.totalCalls === 0,
    raw: d,
  };
}

module.exports = { run, loadDashboard, factsFrom };
