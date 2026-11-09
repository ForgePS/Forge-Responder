/**
 * Incident Intelligence and Dispatch Intelligence (they read the same records:
 * NERIS reports, whose CAD fields come from CAD imports - there is no live
 * CAD feed - plus the Active911 alert window).
 */
const { buildNarrativeFacts } = require("../../nerisNarrative");
const R = require("../records");
const { checkReport } = require("../nerisRules");
const { normalUnit } = require("../query");

const LIST_LIMIT = 40;
const TABLE_LIMIT = 50;

function filterRows(rows, ctx) {
  const q = ctx.query;
  return rows.filter((row) => {
    if (!R.inWindow(row, q.window, ctx.timeZone, ctx.now)) return false;
    if (!R.categoryMatches(row, q.categories)) return false;
    if (q.address && !String(row.report.incidentAddress || "").toLowerCase().includes(q.address.replace(/\b(st|street|ave|avenue|rd|road|dr|drive)\b/g, "").trim())) return false;
    if (q.units.length) {
      const units = new Set((row.p?.units || []).map(normalUnit));
      if (!q.units.some((u) => units.has(u))) return false;
    }
    return true;
  });
}

function countBy(list, fn) {
  const map = {};
  for (const item of list) {
    const key = fn(item) || "Unspecified";
    map[key] = (map[key] || 0) + 1;
  }
  return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

function averageMinutes(rows) {
  const samples = rows.map((r) => r.p?.responseSeconds).filter((s) => Number.isFinite(s) && s > 0);
  if (samples.length < 5) return { minutes: null, sample: samples.length };
  return { minutes: R.minutes(samples.reduce((a, b) => a + b, 0) / samples.length), sample: samples.length };
}

function windowText(q) {
  return `${q.window.label} (${q.window.from}${q.window.to !== q.window.from ? ` to ${q.window.to}` : ""})`;
}

function filterText(q) {
  const parts = [];
  if (q.categories.length) parts.push(`type: ${q.categories.join(", ")}`);
  if (q.units.length) parts.push(`units: ${q.units.join(", ")}`);
  if (q.address) parts.push(`address contains "${q.address}"`);
  return parts.join("; ");
}

// ------------------------------------------------------------------ one report

function detailFor(row, allRows, ctx, book) {
  const sourceId = R.addReportSource(book, row, ctx.timeZone);
  const check = checkReport(row.report);
  const similar = R.similarIncidents(row, allRows).map(({ row: other, sameAddress }) => ({
    ...R.incidentFact(other, ctx.timeZone, R.addReportSource(book, other, ctx.timeZone)),
    sameAddress,
  }));
  const facts = buildNarrativeFacts(row.report);
  return {
    source: sourceId,
    summary: R.incidentFact(row, ctx.timeZone, sourceId),
    reportFacts: facts,
    timeline: R.timeline(row.report, ctx.timeZone),
    validation: {
      completionPercent: check.completion,
      blockingIssues: check.issues.filter((i) => i.blocking).map((i) => i.message),
      warnings: check.issues.filter((i) => !i.blocking).map((i) => i.message),
    },
    similarIncidents: similar,
  };
}

function detailAnswer(details) {
  return details.map((d) => {
    const s = d.summary;
    const lines = [
      `**Report ${s.reportNumber}** [${d.source}] — ${s.type}${s.typeDetail ? ` (${s.typeDetail})` : ""}, ${s.occurred || "time not recorded"}${s.address ? `, ${s.address}` : ""}. Status: ${s.status}.`,
    ];
    if (s.units.length) lines.push(`- Units: ${s.units.join(", ")}`);
    if (s.responseMinutes !== null) lines.push(`- Dispatch to first arrival: ${s.responseMinutes} min`);
    if (d.timeline.length) lines.push(`- Timeline: ${d.timeline.length} recorded times (see table)`);
    else lines.push("- No CAD or unit times are recorded on this report.");
    lines.push(`- Forge NERIS checks: ${d.validation.completionPercent}% complete, ${d.validation.blockingIssues.length} required item(s) open${d.validation.blockingIssues.length ? `: ${d.validation.blockingIssues.slice(0, 5).join("; ")}` : ""}.`);
    if (d.similarIncidents.length) lines.push(`- Similar incidents in the last year: ${d.similarIncidents.map((x) => `${x.reportNumber} [${x.source}]`).join(", ")}`);
    return lines.join("\n");
  }).join("\n\n");
}

// ------------------------------------------------------------------ service

async function run(ctx, { mode = "incident" } = {}) {
  const book = new R.SourceBook();
  const { rows, truncated } = await R.loadReports(ctx.db, ctx.departmentId, ctx.timeZone);
  const limitations = [
    "There is no live CAD feed. CAD times and numbers come from CAD data imported into NERIS reports.",
  ];
  if (truncated) limitations.push("Only the newest 20,000 reports were read.");
  const tables = [];
  const q = ctx.query;

  const targets = R.findReports(rows, { reportId: ctx.context.reportId, reportNumbers: q.reportNumbers }).slice(0, 3);
  if (targets.length && mode === "incident") {
    const details = targets.map((row) => detailFor(row, rows, ctx, book));
    for (const d of details) {
      if (d.timeline.length) tables.push({ id: `timeline-${d.source}`, title: `Timeline — Report ${d.summary.reportNumber}`, columns: ["Time", "Event"], rows: d.timeline.map((e) => [e.time, e.event]) });
      const issues = [...d.validation.blockingIssues.map((m) => ["Required", m]), ...d.validation.warnings.map((m) => ["Recommended", m])];
      if (issues.length) tables.push({ id: `checks-${d.source}`, title: `Open NERIS items — Report ${d.summary.reportNumber}`, columns: ["Level", "Item"], rows: issues });
      if (d.similarIncidents.length) tables.push({ id: `similar-${d.source}`, title: "Similar incidents (last 12 months)", columns: ["Report", "Occurred", "Type", "Address", "Same address"], rows: d.similarIncidents.map((x) => [x.reportNumber, x.occurred, x.type, x.address || "", x.sameAddress ? "Yes" : "No"]) });
    }
    return {
      capability: "incident",
      title: details.length === 1 ? `Report ${details[0].summary.reportNumber}` : "Incident details",
      liveness: "historical",
      facts: { mode: "incident-detail", incidents: details },
      book, tables, limitations,
      fallbackAnswer: detailAnswer(details),
      empty: false,
    };
  }

  const matched = filterRows(rows, ctx);
  const undated = rows.filter((r) => !r.p || !Number.isFinite(r.p.occurredAt)).length;
  if (undated) limitations.push(`${undated} report(s) have no usable call or incident time and can't be placed in a time window.`);
  if (q.reportNumbers.length && !targets.length) limitations.push(`No report matched ${q.reportNumbers.join(", ")}.`);

  const shown = matched.slice(0, LIST_LIMIT).map((row) => R.incidentFact(row, ctx.timeZone, R.addReportSource(book, row, ctx.timeZone)));
  const response = averageMinutes(matched);
  const facts = {
    mode: mode === "dispatch" ? "call-search" : "incident-list",
    window: { from: q.window.from, to: q.window.to, label: q.window.label },
    filters: filterText(q) || "none",
    matchedCount: matched.length,
    byType: countBy(matched, (r) => r.p?.classification).slice(0, 10),
    byPriority: countBy(matched, (r) => r.p?.priority).slice(0, 6),
    byStatus: countBy(matched, (r) => r.report.status || "Draft"),
    averageResponseMinutes: response.minutes,
    responseSample: response.sample,
    incidentsShown: shown.length,
    incidents: shown,
  };

  if (mode === "dispatch") {
    tables.push({
      id: "calls",
      title: `Calls — ${windowText(q)}`,
      columns: ["Call / incident #", "Received", "Dispatched", "First on scene", "Type", "Priority", "Address", "Units"],
      rows: matched.slice(0, TABLE_LIMIT).map((row) => {
        const cad = row.report.workspace?.cad || {};
        const t = R.timeline(row.report, ctx.timeZone);
        const find = (label) => t.find((e) => e.event === label)?.time || "";
        return [R.text(cad.cadCallNumber || cad.incidentNumber, 40) || R.reportNumber(row), find("Call received") || R.formatLocal(row.p.occurredAt, ctx.timeZone), find("Dispatched"), find("First unit on scene"), row.p.classification, row.p.priority, R.text(row.report.incidentAddress, 80), (row.p.units || []).join(", ")];
      }),
    });
    const a911 = await R.loadActive911(ctx.db, ctx.departmentId);
    if (a911.alerts.length) {
      const alerts = a911.alerts.slice(0, 25).map((alert) => {
        const sid = book.add({ kind: "active911Alert", recordId: R.text(alert.id, 80), label: `Active911: ${R.text(alert.description, 60) || "alert"}`, detail: [R.text(alert.sentAt, 30), R.text(alert.address, 80)].filter(Boolean).join(" · "), liveness: "live", asOf: a911.syncedAt, link: { page: "Digital Dashboard" } });
        return { source: sid, description: R.scrubFreeText(alert.description, 120), address: R.text(alert.address, 120), units: R.text(alert.units, 120), priority: R.text(alert.priority, 30), sentAt: R.text(alert.sentAt, 40) };
      });
      facts.active911 = { syncedAt: a911.syncedAt, note: "Rolling window from the last Active911 sync, not a call history.", alerts };
      tables.push({ id: "active911", title: `Active911 alerts (live window, synced ${a911.syncedAt || "time unknown"})`, columns: ["Sent", "Description", "Address", "Units", "Priority"], rows: alerts.map((x) => [x.sentAt, x.description, x.address, x.units, x.priority]) });
    } else {
      limitations.push("No Active911 alerts are stored for this department, so there is no live call window.");
    }
    limitations.push("Live unit status, pending calls and dispatch recommendations need a CAD integration, which isn't connected.");
  } else {
    tables.push({
      id: "incidents",
      title: `Incidents — ${windowText(q)}`,
      columns: ["Report", "Occurred", "Type", "Priority", "Address", "Units", "Status", "Response (min)"],
      rows: matched.slice(0, TABLE_LIMIT).map((row) => {
        const f = R.incidentFact(row, ctx.timeZone, "");
        return [f.reportNumber, f.occurred, f.type, f.priority, f.address || "", f.units.join(", "), f.status, f.responseMinutes ?? ""];
      }),
    });
  }
  if (matched.length > TABLE_LIMIT) limitations.push(`The table shows the newest ${TABLE_LIMIT} of ${matched.length} matching records.`);
  if (response.minutes === null && matched.length) limitations.push(`Average response time needs at least 5 reports with dispatch and arrival times (found ${response.sample}).`);

  const lines = [`**${matched.length}** ${mode === "dispatch" ? "call(s)" : "incident(s)"} — ${windowText(q)}${facts.filters !== "none" ? ` matching ${facts.filters}` : ""}.`];
  if (matched.length) {
    lines.push(`- Most common types: ${facts.byType.slice(0, 4).map((t) => `${t.name} (${t.count})`).join(", ")}`);
    if (response.minutes !== null) lines.push(`- Average dispatch to first arrival: ${response.minutes} min (${response.sample} reports with both times)`);
    lines.push(`- Newest: ${shown.slice(0, 5).map((s) => `${s.reportNumber} [${s.source}]`).join(", ")}`);
  }
  if (facts.active911) lines.push(`- Active911 window: ${facts.active911.alerts.length} alert(s), last synced ${facts.active911.syncedAt || "at an unknown time"}.`);

  return {
    capability: mode,
    title: mode === "dispatch" ? `Calls — ${q.window.label}` : `Incidents — ${q.window.label}`,
    liveness: facts.active911 ? "mixed" : "historical",
    facts, book, tables, limitations,
    fallbackAnswer: lines.join("\n"),
    empty: matched.length === 0 && !facts.active911,
  };
}

module.exports = {
  run,
  runDispatch: (ctx) => run(ctx, { mode: "dispatch" }),
  filterRows,
  countBy,
  averageMinutes,
};
