/**
 * Shift and command briefings. Composed from the other services, so every
 * section obeys the caller's permissions: a section whose data the caller
 * can't see (or that has no data) is left out. Data Limitations is always in.
 */
const R = require("../records");
const { capabilityAccess } = require("../capabilities");
const incident = require("./incident");
const heatZoneService = require("./heatZone");
const unitsService = require("./units");
const { percentile } = require("./quality");
const { checkReport } = require("../nerisRules");

const SECTION_ORDER = [
  ["executiveSummary", "Executive Summary"],
  ["callActivity", "Call Activity"],
  ["significantIncidents", "Significant Incidents"],
  ["districtActivity", "District Activity"],
  ["unitActivity", "Unit and Resource Activity"],
  ["geographicTrends", "Geographic Trends"],
  ["responseTime", "Response-Time Performance"],
  ["outstandingItems", "Outstanding Items"],
  ["notableObservations", "Notable Observations"],
  ["dataLimitations", "Data Limitations"],
];

const HIGH_PRIORITY = /^(emergency|urgent|priority ?1|p1|high|hot)$/i;

function significance(row) {
  const reasons = [];
  const r = row.report;
  if (/fire/i.test(row.p?.classification || "") && /structure|building|residential|commercial/i.test(`${row.p?.classificationDetail} ${r.incidentTypeSummary}`)) reasons.push("structure fire");
  const cas = r.workspace?.casualties || {};
  if (Number(cas.fatalities) > 0) reasons.push("civilian fatality recorded");
  if (Number(cas.injuries) > 0) reasons.push("civilian injury recorded");
  if (Number(cas.ffInjuries) > 0) reasons.push("firefighter injury recorded");
  if (Number(r.workspace?.cad?.alarmLevel) > 1) reasons.push(`alarm level ${Number(r.workspace.cad.alarmLevel)}`);
  if ((row.p?.units || []).length >= 4) reasons.push(`${row.p.units.length} units`);
  if (HIGH_PRIORITY.test(String(row.p?.priority || "")) && reasons.length) reasons.push("high priority");
  return reasons;
}

async function run(ctx) {
  const book = new R.SourceBook();
  const q = ctx.query;
  const kind = /\bcommand\b|\bweek(ly)?\b|\bmonth(ly)?\b/i.test(ctx.message) ? "command" : "shift";
  const limitations = [
    "There is no live CAD feed; call data comes from NERIS reports and their imported CAD times.",
    "Staffing is not included: on-duty rosters are worked out in the browser and have no server record to brief from.",
  ];
  const sections = [];
  const tables = [];
  const can = (id) => capabilityAccess(id, ctx.accessInput).allowed;

  const { rows } = await R.loadReports(ctx.db, ctx.departmentId, ctx.timeZone);
  const windowRows = incident.filterRows(rows, ctx);
  const cite = (row) => R.addReportSource(book, row, ctx.timeZone);

  // Call activity
  if (windowRows.length) {
    const byType = incident.countBy(windowRows, (r) => r.p?.classification);
    const byPriority = incident.countBy(windowRows, (r) => r.p?.priority);
    sections.push({ id: "callActivity", facts: { totalCalls: windowRows.length, byType: byType.slice(0, 8), byPriority }, fallback: `${windowRows.length} call(s): ${byType.slice(0, 5).map((t) => `${t.name} ${t.count}`).join(", ")}.` });
    tables.push({ id: "callActivity", title: "Calls by type", columns: ["Type", "Calls"], rows: byType.slice(0, 10).map((t) => [t.name, t.count]) });
  }

  // Significant incidents
  const significant = windowRows.map((row) => ({ row, reasons: significance(row) })).filter((x) => x.reasons.length).slice(0, 8);
  if (significant.length) {
    const items = significant.map(({ row, reasons }) => ({ ...R.incidentFact(row, ctx.timeZone, cite(row)), why: reasons }));
    sections.push({ id: "significantIncidents", facts: { incidents: items }, fallback: items.map((i) => `${i.reportNumber} [${i.source}] — ${i.type}, ${i.occurred}${i.address ? `, ${i.address}` : ""} (${i.why.join(", ")})`).join("\n") });
  }

  // Heat Zone sections (only when the caller has Heat Zone access)
  if (can("heatZone")) {
    try {
      const hz = await heatZoneService.run({ ...ctx, book });
      const sid = hz.facts.source;
      if (hz.facts.totalCalls) {
        const districts = hz.facts.districts.filter((d) => d.calls > 0);
        if (districts.length) {
          sections.push({ id: "districtActivity", facts: { source: sid, districts: districts.slice(0, 10) }, fallback: districts.slice(0, 5).map((d) => `${d.name}: ${d.calls} call(s)${d.changePercent !== null && d.changePercent !== undefined ? ` (${d.changePercent > 0 ? "+" : ""}${d.changePercent}% vs previous period)` : ""} [${sid}]`).join("\n") });
        }
        const geo = { source: sid, busiestHours: hz.facts.busiestHours, repeatLocations: hz.facts.repeatLocations, comparison: hz.facts.comparison };
        const geoLines = [];
        if (geo.busiestHours.length) geoLines.push(`Busiest hours: ${geo.busiestHours.slice(0, 3).map((h) => `${h.hour} (${h.count})`).join(", ")} [${sid}]`);
        if (geo.repeatLocations?.length) geoLines.push(`Repeat locations: ${geo.repeatLocations.slice(0, 3).map((r) => `${r.address} (${r.calls})`).join("; ")}`);
        if (geo.comparison) geoLines.push(`Previous period: ${geo.comparison.previousTotal} call(s) vs ${geo.comparison.currentTotal} now`);
        if (geoLines.length) sections.push({ id: "geographicTrends", facts: geo, fallback: geoLines.join("\n") });
      }
      limitations.push(...hz.limitations.filter((l) => !/not why/.test(l)));
    } catch (error) {
      limitations.push("Heat Zone sections were left out: Heat Zone data isn't available to you right now.");
    }
  } else {
    limitations.push("District and geographic sections need Heat Zone Analytics access.");
  }

  // Units
  if (can("units")) {
    const u = await unitsService.run({ ...ctx, book });
    const notReady = u.facts.units.filter((x) => !/^(available|in service)/i.test(x.readiness));
    if (u.facts.units.length || u.facts.activity.length) {
      sections.push({ id: "unitActivity", facts: { readinessCounts: u.facts.readinessCounts, notFullyAvailable: notReady.slice(0, 15), busiestUnits: u.facts.activity.slice(0, 10) }, fallback: [notReady.length ? `Not fully available: ${notReady.map((x) => `${x.unit} (${x.readiness})`).join(", ")}` : "All recorded units are available.", u.facts.activity.length ? `Busiest: ${u.facts.activity.slice(0, 5).map((x) => `${x.unit} ${x.incidents}`).join(", ")}` : ""].filter(Boolean).join("\n") });
    }
  } else {
    limitations.push("Unit and resource activity needs Apparatus or Fleet access.");
  }

  // Response time
  const samples = windowRows.map((r) => r.p?.responseSeconds).filter((s) => Number.isFinite(s));
  if (samples.length >= 5) {
    const avg = R.minutes(samples.reduce((a, b) => a + b, 0) / samples.length);
    const p90 = R.minutes(percentile(samples, 90));
    sections.push({ id: "responseTime", facts: { averageMinutes: avg, percentile90Minutes: p90, sample: samples.length, definition: "dispatch to first unit on scene" }, fallback: `Average ${avg} min, 90th percentile ${p90} min, dispatch to first arrival (${samples.length} reports with both times).` });
  } else {
    limitations.push(`Response-time performance needs at least 5 reports with dispatch and arrival times (found ${samples.length}).`);
  }

  // Outstanding items
  const open = rows.filter((r) => !/^(submitted|accepted)$/i.test(String(r.report.status || "")));
  const returned = open.filter((r) => /^(returned|needs review)$/i.test(String(r.report.status || "")));
  const blocked = open.map((row) => ({ row, check: checkReport(row.report) })).filter((x) => x.check.blocking > 0);
  if (open.length) {
    const sample = [...returned, ...blocked.map((b) => b.row)].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);
    sections.push({ id: "outstandingItems", facts: { openReports: open.length, returnedOrNeedsReview: returned.length, withRequiredItems: blocked.length, examples: sample.map((row) => ({ ...R.incidentFact(row, ctx.timeZone, cite(row)) })) }, fallback: `${open.length} report(s) not yet submitted; ${returned.length} returned or awaiting review; ${blocked.length} with required NERIS items open.` });
  }

  const present = new Map(sections.map((s) => [s.id, s]));
  const ordered = SECTION_ORDER
    .filter(([id]) => id === "executiveSummary" ? sections.length > 0 : id === "notableObservations" ? sections.length > 0 : id === "dataLimitations" || present.has(id))
    .map(([id, title]) => ({ id, title, ai: id === "notableObservations" || id === "executiveSummary", ...(present.get(id) || {}) }));
  const execFallback = sections.length
    ? `${kind === "command" ? "Command" : "Shift"} briefing for ${q.window.label} (${q.window.from} to ${q.window.to}): ${windowRows.length} call(s) recorded${significant.length ? `, ${significant.length} significant incident(s)` : ""}${open.length ? `, ${open.length} report(s) still open` : ""}.`
    : "";
  for (const s of ordered) {
    if (s.id === "executiveSummary") s.fallback = execFallback;
    if (s.id === "dataLimitations") s.fallback = limitations.map((l) => `- ${l}`).join("\n");
  }

  return {
    capability: "briefing",
    title: `${kind === "command" ? "Command" : "Shift"} briefing — ${q.window.label}`,
    briefingKind: kind,
    liveness: "mixed",
    facts: {
      briefingKind: kind,
      window: { from: q.window.from, to: q.window.to, label: q.window.label },
      sections: ordered.filter((s) => s.facts).map((s) => ({ id: s.id, title: s.title, facts: s.facts })),
    },
    book,
    sections: ordered.map(({ id, title, ai, fallback }) => ({ id, title, ai: Boolean(ai), fallback: fallback || "" })),
    tables,
    limitations,
    fallbackAnswer: execFallback || `No calls or open items found for ${q.window.label}.`,
    empty: sections.length === 0,
  };
}

module.exports = { run, SECTION_ORDER, significance };
