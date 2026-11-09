/**
 * NERIS Data Quality Assistant and Supervisor QA.
 *
 * Both use Forge's own NERIS rules (../nerisRules.js). Neither writes, edits or
 * submits a report, and neither drafts narratives: the AI Narrative Writer in
 * the report editor stays the only narrative tool.
 *
 * Supervisor QA keeps three buckets apart:
 *   confirmed - a Forge rule failed (rule output, not AI)
 *   potential - a warning or a statistical outlier worth a look
 *   AI observations - model text, labelled, added later by the orchestrator
 * It never names members and never infers fault, discipline or misconduct.
 */
const R = require("../records");
const { checkReport } = require("../nerisRules");
const { filterRows } = require("./incident");

const SUBMITTED = /^(submitted|accepted)$/i;
const REVIEW = /^(returned|needs review)$/i;

function scope(ctx, rows, { includeUndatedDrafts = true } = {}) {
  const targets = R.findReports(rows, { reportId: ctx.context.reportId, reportNumbers: ctx.query.reportNumbers });
  if (targets.length) return { rows: targets.slice(0, 10), targeted: true };
  const inWindow = filterRows(rows, ctx);
  const undated = includeUndatedDrafts
    ? rows.filter((r) => (!r.p || !Number.isFinite(r.p.occurredAt)) && !SUBMITTED.test(String(r.report.status || "")))
    : [];
  return { rows: [...inWindow, ...undated], targeted: false };
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

// ------------------------------------------------------------------ data quality

async function runNerisQuality(ctx) {
  const book = new R.SourceBook();
  const { rows } = await R.loadReports(ctx.db, ctx.departmentId, ctx.timeZone);
  const { rows: checked, targeted } = scope(ctx, rows);
  const results = checked.map((row) => {
    const check = checkReport(row.report);
    const source = R.addReportSource(book, row, ctx.timeZone);
    return {
      source,
      reportNumber: R.reportNumber(row),
      status: R.text(row.report.status, 40) || "Draft",
      occurred: R.formatLocal(row.p?.occurredAt, ctx.timeZone) || "no time recorded",
      completionPercent: check.completion,
      required: check.issues.filter((i) => i.blocking).map((i) => i.message),
      recommended: check.issues.filter((i) => !i.blocking).map((i) => i.message),
      submitted: SUBMITTED.test(String(row.report.status || "")),
    };
  });
  const open = results.filter((r) => !r.submitted);
  const ready = open.filter((r) => r.required.length === 0);
  const itemCounts = {};
  for (const r of open) for (const m of r.required) itemCounts[m] = (itemCounts[m] || 0) + 1;
  const commonItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([item, reports]) => ({ item, reports }));
  const worst = [...open].sort((a, b) => b.required.length - a.required.length || a.completionPercent - b.completionPercent).slice(0, 25);
  const narrativeMissing = open.filter((r) => r.required.some((m) => /narrative/i.test(m))).length;

  const facts = {
    rules: "Forge NERIS validation rules (the same checks as the report editor's checklist)",
    scope: targeted ? "named reports" : `reports from ${ctx.query.window.label} plus undated drafts`,
    reportsChecked: results.length,
    alreadySubmitted: results.length - open.length,
    openReports: open.length,
    readyToSubmit: ready.length,
    withRequiredItems: open.length - ready.length,
    mostCommonRequiredItems: commonItems,
    reports: (targeted ? results : worst).map((r) => ({ ...r, recommended: r.recommended.slice(0, 8) })),
    narrativeMissing,
  };
  const lines = [];
  if (!results.length) {
    lines.push(`No reports to check in ${facts.scope}.`);
  } else {
    lines.push(`Checked **${results.length}** report(s) with Forge's NERIS rules: ${ready.length} open report(s) have no required items left, ${open.length - ready.length} still have required items${facts.alreadySubmitted ? `, ${facts.alreadySubmitted} already submitted` : ""}.`);
    if (commonItems.length) lines.push(`- Most common required items: ${commonItems.slice(0, 5).map((c) => `${c.item} (${c.reports})`).join("; ")}`);
    for (const r of facts.reports.slice(0, targeted ? 10 : 5)) {
      lines.push(`- ${r.reportNumber} [${r.source}] — ${r.completionPercent}% complete${r.required.length ? `; required: ${r.required.slice(0, 4).join(", ")}` : "; no required items open"}`);
    }
    if (narrativeMissing) lines.push(`- ${narrativeMissing} report(s) need a narrative; the AI Narrative Writer in the report editor can draft one for review.`);
  }
  return {
    capability: "nerisQuality",
    title: targeted ? "NERIS data quality — selected reports" : `NERIS data quality — ${ctx.query.window.label}`,
    liveness: "historical",
    facts, book,
    tables: [
      { id: "reports", title: "Reports checked", columns: ["Report", "Status", "Occurred", "Complete %", "Required items open", "Recommended items open"], rows: facts.reports.map((r) => [r.reportNumber, r.status, r.occurred, r.completionPercent, r.required.length, r.recommended.length]) },
      { id: "items", title: "Most common required items", columns: ["Item", "Reports"], rows: commonItems.map((c) => [c.item, c.reports]) },
    ].filter((t) => t.rows.length),
    limitations: [
      "These are Forge's validation rules. NERIS may apply further checks when a report is submitted.",
      "Forge AI does not edit, approve or submit reports.",
    ],
    fallbackAnswer: lines.join("\n"),
    empty: results.length === 0,
  };
}

// ------------------------------------------------------------------ supervisor QA

async function runSupervisorQa(ctx) {
  const book = new R.SourceBook();
  const { rows } = await R.loadReports(ctx.db, ctx.departmentId, ctx.timeZone);
  const { rows: reviewed, targeted } = scope(ctx, rows, { includeUndatedDrafts: false });
  const confirmed = [];
  const potential = [];
  const responses = reviewed.map((r) => r.p?.responseSeconds).filter((s) => Number.isFinite(s));
  const p90 = responses.length >= 10 ? percentile(responses, 90) : null;

  for (const row of reviewed) {
    const source = R.addReportSource(book, row, ctx.timeZone);
    const number = R.reportNumber(row);
    const check = checkReport(row.report);
    for (const issue of check.issues) {
      (issue.blocking ? confirmed : potential).push({ source, report: number, check: issue.blocking ? "Forge rule (required)" : "Forge rule (recommended)", detail: issue.message });
    }
    if (p90 !== null && Number.isFinite(row.p?.responseSeconds) && row.p.responseSeconds > p90) {
      potential.push({ source, report: number, check: "Response time outlier", detail: `Dispatch to first arrival ${R.minutes(row.p.responseSeconds)} min, above this period's 90th percentile (${R.minutes(p90)} min). Worth checking the recorded times.` });
    }
    const units = R.unitsOf(row.report);
    const noArrival = units.filter((u) => u.dispatchTime && !u.arrivalTime && !u.cancelled && !/cancel/i.test(String(u.status || ""))).map((u) => R.text(u.unitId, 20));
    if (noArrival.length) potential.push({ source, report: number, check: "Unit times", detail: `Dispatched without an on-scene time: ${noArrival.join(", ")} (may be cancelled en route).` });
    if (REVIEW.test(String(row.report.status || ""))) potential.push({ source, report: number, check: "Review status", detail: `Report is "${R.text(row.report.status, 30)}".` });
  }

  const facts = {
    scope: targeted ? "named reports" : `reports from ${ctx.query.window.label}`,
    reportsReviewed: reviewed.length,
    confirmedIssues: confirmed.slice(0, 60),
    potentialIssues: potential.slice(0, 60),
    responseTime90thPercentileMinutes: R.minutes(p90),
    guardrail: "QA output describes records, not people. It is not a finding of fault, discipline or misconduct.",
  };
  const lines = [
    `Reviewed **${reviewed.length}** report(s) (${facts.scope}).`,
    `- Confirmed issues (Forge rules failed): ${confirmed.length}`,
    `- Potential issues (worth a look): ${potential.length}`,
  ];
  for (const c of confirmed.slice(0, 5)) lines.push(`  - ${c.report} [${c.source}]: ${c.detail}`);
  lines.push("", "_QA output describes records, not people, and is not a finding about any member._");
  return {
    capability: "supervisorQa",
    title: `Supervisor QA — ${targeted ? "selected reports" : ctx.query.window.label}`,
    liveness: "historical",
    facts, book,
    sections: [
      { id: "confirmed", title: "Confirmed issues", fallback: confirmed.length ? `${confirmed.length} required item(s) fail Forge's NERIS rules (table below).` : "No report fails Forge's NERIS rules." },
      { id: "potential", title: "Potential issues", fallback: potential.length ? `${potential.length} item(s) worth a look (table below). These are prompts to check the record, not errors.` : "No potential issues found." },
      { id: "observations", title: "AI observations", ai: true },
    ],
    tables: [
      { id: "confirmed", title: "Confirmed issues (Forge rules)", columns: ["Report", "Check", "Detail"], rows: confirmed.slice(0, 60).map((c) => [c.report, c.check, c.detail]) },
      { id: "potential", title: "Potential issues", columns: ["Report", "Check", "Detail"], rows: potential.slice(0, 60).map((c) => [c.report, c.check, c.detail]) },
    ].filter((t) => t.rows.length),
    limitations: [
      "Confirmed issues are Forge rule results. Potential issues are prompts to check the record, not errors.",
      "QA does not look at who wrote or responded to a report and makes no fault, discipline or misconduct findings.",
      p90 === null ? "Response-time outliers need at least 10 reports with dispatch and arrival times." : "",
    ].filter(Boolean),
    fallbackAnswer: lines.join("\n"),
    empty: reviewed.length === 0,
  };
}

module.exports = { runNerisQuality, runSupervisorQa, percentile };
