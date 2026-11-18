/**
 * Training compliance engine.
 *
 * Pure functions: given requirement rules, members, and verified evidence, it
 * returns one result per (member, requirement) with the status AND the facts
 * that produced it, so every status on screen can be explained.
 *
 * Only approved/locked training records count as verified evidence. Submitted
 * records that would satisfy a requirement produce "awaiting_verification",
 * never "compliant".
 *
 * Rules are versioned: each rule carries a version and effective dates, and a
 * result records the rule version it was computed against. Snapshots of results
 * are saved separately (trainingService.saveComplianceSnapshot) so history is
 * preserved when a rule later changes.
 */
import { creditedHoursFor } from "./trainingHours.js";

export const COMPLIANCE_STATUSES = {
  compliant: { label: "Compliant", tone: "success", rank: 0 },
  exempt: { label: "Exempt", tone: "neutral", rank: 0 },
  not_applicable: { label: "Not applicable", tone: "neutral", rank: 0 },
  in_progress: { label: "In progress", tone: "info", rank: 2 },
  awaiting_verification: { label: "Awaiting verification", tone: "info", rank: 2 },
  due_soon: { label: "Due soon", tone: "warning", rank: 3 },
  overdue: { label: "Overdue", tone: "critical", rank: 5 },
  not_qualified: { label: "Not qualified", tone: "critical", rank: 5 },
};

export const REQUIREMENT_KINDS = [
  { value: "hours", label: "Minimum training hours" },
  { value: "course", label: "Course completion" },
  { value: "skill", label: "Skills evaluation (passed)" },
  { value: "credential", label: "Current credential" },
];

export const REQUIREMENT_PERIODS = [
  { value: "annual", label: "Annual" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
  { value: "rolling", label: "Rolling window" },
  { value: "once", label: "One time (e.g. new hire)" },
];

const DAY = 86400000;

function iso(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function parseDay(value) {
  if (!value) return null;
  const s = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(`${s}T00:00:00Z`);
}

/**
 * The compliance window [start, end] (inclusive ISO dates) containing `asOf`.
 * annual/quarterly use the department's fiscal start month (1-12, default January).
 * rolling: the last `rollingDays` days ending on asOf (always "current").
 * once: from the member's start date (hire date) to start + dueWithinDays.
 */
export function periodFor(rule = {}, asOfIso, member = {}) {
  const asOf = parseDay(asOfIso) || parseDay(iso(Date.now()));
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth();
  const fiscal = Math.min(12, Math.max(1, Number(rule.fiscalStartMonth) || 1)) - 1;
  const utc = (yy, mm, dd) => new Date(Date.UTC(yy, mm, dd));
  switch (rule.period) {
    case "monthly":
      return { start: iso(utc(y, m, 1)), end: iso(utc(y, m + 1, 0)) };
    case "quarterly": {
      const offset = (m - fiscal + 12) % 12;
      const qStartMonth = m - (offset % 3);
      return { start: iso(utc(y, qStartMonth, 1)), end: iso(utc(y, qStartMonth + 3, 0)) };
    }
    case "rolling": {
      const days = Math.max(1, Number(rule.rollingDays) || 365);
      return { start: iso(asOf.getTime() - (days - 1) * DAY), end: iso(asOf), rolling: true };
    }
    case "once": {
      const from = parseDay(member.hireDate || member.startDate) || parseDay(rule.effectiveFrom) || asOf;
      const within = Math.max(0, Number(rule.dueWithinDays) || 0);
      return { start: iso(from), end: within ? iso(from.getTime() + within * DAY) : "9999-12-31", once: true };
    }
    case "annual":
    default: {
      const startYear = m >= fiscal ? y : y - 1;
      return { start: iso(utc(startYear, fiscal, 1)), end: iso(utc(startYear + 1, fiscal, 0)) };
    }
  }
}

function list(value) {
  return Array.isArray(value) ? value.filter((v) => v !== "" && v !== null && v !== undefined).map(String) : [];
}

/** Does the rule apply to this member? Empty criteria mean "everyone". All given criteria must match. */
export function ruleApplies(rule = {}, member = {}) {
  const a = rule.appliesTo || {};
  const checks = [
    [list(a.personIds), member.id],
    [list(a.ranks), member.rank],
    [list(a.stations), member.station],
    [list(a.shifts), member.shift],
    [list(a.divisions), member.division],
    [list(a.positions), member.position],
    [list(a.emsLevels), member.emsLevel],
    [list(a.specialtyTeams), null, list(member.specialtyTeams)],
  ];
  return checks.every(([wanted, value, values]) => {
    if (!wanted.length) return true;
    if (values) return values.some((v) => wanted.includes(v));
    return wanted.includes(String(value ?? ""));
  });
}

/** Is the rule in force on `asOf`? */
export function ruleInEffect(rule = {}, asOfIso) {
  if (rule.active === false) return false;
  if (rule.effectiveFrom && asOfIso < rule.effectiveFrom) return false;
  if (rule.effectiveTo && asOfIso > rule.effectiveTo) return false;
  return true;
}

function inWindow(dateIso, range) {
  const d = String(dateIso || "").slice(0, 10);
  return d && d >= range.start && d <= range.end;
}

function recordMatchesHours(rule, record) {
  const disciplines = list(rule.disciplines);
  if (!disciplines.length) return true;
  return disciplines.includes(String(record.discipline || ""));
}

function recordMatchesCourse(rule, record) {
  const ids = [rule.courseId, ...list(rule.equivalentCourseIds)].filter(Boolean).map(String);
  return ids.includes(String(record.courseId || ""));
}

function participantOf(record, memberId) {
  return (record.participants || []).find((p) => String(p.personId) === String(memberId));
}

const VERIFIED = new Set(["approved", "locked"]);
const PENDING = new Set(["submitted"]);

/**
 * Evaluate one member against one rule.
 * evidence: { records, evaluations, completions, credentials, exemptions }
 */
export function evaluateRequirement(rule, member, evidence = {}, asOfIso = iso(Date.now())) {
  const base = {
    ruleId: rule.id,
    ruleVersion: rule.version || 1,
    ruleName: rule.name || "",
    personId: member.id,
    asOf: asOfIso,
  };
  if (!ruleInEffect(rule, asOfIso) || !ruleApplies(rule, member)) {
    return { ...base, status: "not_applicable", explanation: "This requirement doesn't apply to this member on this date.", evidence: [] };
  }
  const period = periodFor(rule, asOfIso, member);
  // Evidence dated after the as-of date doesn't count (historical views and snapshots);
  // the period end is still used for the deadline.
  const window = { start: period.start, end: asOfIso < period.end ? asOfIso : period.end };
  const dueSoonDays = Number(rule.dueSoonDays ?? 30);

  const exemption = (evidence.exemptions || []).find((x) =>
    String(x.personId) === String(member.id)
    && String(x.ruleId) === String(rule.id)
    && x.status !== "revoked"
    && (!x.until || x.until >= asOfIso));
  if (exemption) {
    return { ...base, period, status: "exempt", explanation: `Exempt: ${exemption.reason || "approved exemption"}${exemption.until ? ` (until ${exemption.until})` : ""}.`, evidence: [{ type: "exemption", id: exemption.id }] };
  }

  if (rule.kind === "credential") {
    return evaluateCredential(rule, member, evidence, asOfIso, base, dueSoonDays);
  }

  let required = 1;
  let earned = 0;
  let pending = 0;
  const used = [];
  const unit = rule.kind === "hours" ? "hours" : "completion";

  if (rule.kind === "hours") {
    required = Number(rule.minHours) || 0;
    for (const record of evidence.records || []) {
      if (!inWindow(record.date, window) || !recordMatchesHours(rule, record)) continue;
      const p = participantOf(record, member.id);
      if (!p) continue;
      const h = creditedHoursFor(p, record);
      if (!h) continue;
      if (VERIFIED.has(record.status)) { earned += h; used.push({ type: "record", id: record.id, title: record.title, date: record.date, hours: h }); }
      else if (PENDING.has(record.status)) pending += h;
    }
  } else if (rule.kind === "course") {
    for (const record of evidence.records || []) {
      if (!inWindow(record.date, window) || !recordMatchesCourse(rule, record)) continue;
      const p = participantOf(record, member.id);
      if (!p || !creditedHoursFor(p, record)) continue;
      if (VERIFIED.has(record.status)) { earned = 1; used.push({ type: "record", id: record.id, title: record.title, date: record.date }); }
      else if (PENDING.has(record.status)) pending = 1;
    }
    for (const c of evidence.completions || []) {
      if (String(c.personId) !== String(member.id) || !inWindow(c.completedAt, window) || !recordMatchesCourse(rule, c)) continue;
      if (c.status === "passed" || c.status === "completed") { earned = 1; used.push({ type: "completion", id: c.id, title: c.courseTitle, date: String(c.completedAt).slice(0, 10) }); }
    }
  } else if (rule.kind === "skill") {
    for (const ev of evidence.evaluations || []) {
      if (String(ev.personId) !== String(member.id) || String(ev.skillId) !== String(rule.skillId) || !inWindow(ev.date, window)) continue;
      if (ev.result === "pass" && ev.status === "approved") { earned = 1; used.push({ type: "evaluation", id: ev.id, title: ev.skillTitle, date: ev.date }); }
      else if (ev.result === "pass" && ev.status === "submitted") pending = 1;
    }
  }

  earned = Math.round(earned * 100) / 100;
  pending = Math.round(pending * 100) / 100;
  const facts = { ...base, period, required, earned, pending, unit, evidence: used };
  const describe = rule.kind === "hours"
    ? `${earned} of ${required} verified hours between ${period.start} and ${period.end}${pending ? `; ${pending} more awaiting approval` : ""}.`
    : earned ? `Completed (verified) within ${period.start} – ${period.end}.` : `Not completed between ${period.start} and ${period.end}${pending ? "; a completion is awaiting approval" : ""}.`;

  if (earned >= required && required > 0) return { ...facts, status: "compliant", explanation: describe };
  if (required === 0) return { ...facts, status: "compliant", explanation: "No minimum set." };

  const daysLeft = Math.round((parseDay(period.end) - parseDay(asOfIso)) / DAY);
  const pastDue = period.rolling || (period.end !== "9999-12-31" && daysLeft < 0);
  if (earned + pending >= required) return { ...facts, status: "awaiting_verification", explanation: describe };
  if (pastDue) return { ...facts, status: "overdue", explanation: describe };
  if (daysLeft <= dueSoonDays && period.end !== "9999-12-31") return { ...facts, status: "due_soon", daysLeft, explanation: `${describe} Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.` };
  if (earned > 0 || pending > 0) return { ...facts, status: "in_progress", daysLeft, explanation: describe };
  return { ...facts, status: "in_progress", daysLeft, explanation: describe };
}

function evaluateCredential(rule, member, evidence, asOfIso, base, dueSoonDays) {
  const wanted = String(rule.credentialName || "").trim().toLowerCase();
  const matches = (evidence.credentials || []).filter((c) =>
    String(c.personId) === String(member.id)
    && wanted
    && String(c.name || c.type || "").trim().toLowerCase() === wanted
    && !["revoked", "suspended"].includes(String(c.status || "").toLowerCase()));
  if (!matches.length) {
    return { ...base, status: "not_qualified", explanation: `No ${rule.credentialName || "required credential"} on file.`, evidence: [] };
  }
  const best = matches.slice().sort((a, b) => String(b.expirationDate || "9999").localeCompare(String(a.expirationDate || "9999")))[0];
  const ref = [{ type: "credential", id: best.id, title: best.name || best.type, date: best.expirationDate || "" }];
  if (!best.expirationDate) return { ...base, status: "compliant", explanation: `${best.name || best.type} on file (no expiration).`, evidence: ref };
  const daysLeft = Math.round((parseDay(best.expirationDate) - parseDay(asOfIso)) / DAY);
  if (daysLeft < 0) return { ...base, status: "not_qualified", daysLeft, explanation: `${best.name || best.type} expired ${best.expirationDate}.`, evidence: ref };
  if (daysLeft <= dueSoonDays) return { ...base, status: "due_soon", daysLeft, explanation: `${best.name || best.type} expires ${best.expirationDate} (${daysLeft} days).`, evidence: ref };
  return { ...base, status: "compliant", daysLeft, explanation: `${best.name || best.type} current until ${best.expirationDate}.`, evidence: ref };
}

/** Evaluate every member against every rule. Returns a flat list of results. */
export function evaluateCompliance({ rules = [], members = [], evidence = {}, asOf = iso(Date.now()) } = {}) {
  const results = [];
  for (const member of members) {
    for (const rule of rules) {
      results.push(evaluateRequirement(rule, member, evidence, asOf));
    }
  }
  return results;
}

/** One status per member: the worst applicable result. */
export function memberStatus(results = []) {
  const applicable = results.filter((r) => r.status !== "not_applicable");
  if (!applicable.length) return "not_applicable";
  return applicable.reduce((worst, r) => (COMPLIANCE_STATUSES[r.status].rank > COMPLIANCE_STATUSES[worst].rank ? r.status : worst), "compliant");
}

/** Percent of applicable (member, rule) pairs that are compliant or exempt. */
export function compliancePercent(results = []) {
  const applicable = results.filter((r) => r.status !== "not_applicable");
  if (!applicable.length) return null;
  const ok = applicable.filter((r) => r.status === "compliant" || r.status === "exempt").length;
  return Math.round((ok / applicable.length) * 100);
}
