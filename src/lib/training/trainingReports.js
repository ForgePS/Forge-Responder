/**
 * Training aggregates for the dashboard and reports. Everything is computed from
 * the department's actual records; nothing here invents a figure.
 *
 * Totals only count verified (approved/locked) records unless `includePending`
 * is set, and they keep instructional hours, person-hours and instructor hours
 * apart (see trainingHours.js).
 */
import { creditedHoursFor, instructionalHours, instructorHoursFor, roundHours } from "./trainingHours.js";

export const DISCIPLINES = ["Fire", "EMS", "HazMat", "Rescue", "Driver/Operator", "Officer Development", "Instructor", "Health & Safety", "Prevention", "Other"];

const VERIFIED = new Set(["approved", "locked"]);

export function isVerified(record) {
  return VERIFIED.has(record?.status);
}

function inRange(date, from, to) {
  const d = String(date || "").slice(0, 10);
  return Boolean(d) && (!from || d >= from) && (!to || d <= to);
}

/** Filter records by the common report filters. */
export function filterRecords(records = [], f = {}) {
  return records.filter((r) => {
    if (!f.includePending && !isVerified(r)) return false;
    if (!inRange(r.date, f.from, f.to)) return false;
    if (f.discipline && r.discipline !== f.discipline) return false;
    if (f.station && String(r.stationId || r.station || "") !== String(f.station)) return false;
    if (f.shift && String(r.shift || "") !== String(f.shift)) return false;
    if (f.courseId && String(r.courseId || "") !== String(f.courseId)) return false;
    if (f.instructorId && !(r.instructors || []).some((i) => String(i.personId) === String(f.instructorId))) return false;
    if (f.personId && !(r.participants || []).some((p) => String(p.personId) === String(f.personId))) return false;
    return true;
  });
}

/** Headline totals for a set of records. */
export function summarize(records = []) {
  let instructional = 0;
  let person = 0;
  let instructor = 0;
  const attendees = new Set();
  for (const r of records) {
    instructional += instructionalHours(r);
    for (const p of r.participants || []) {
      const h = creditedHoursFor(p, r);
      person += h;
      if (h > 0) attendees.add(String(p.personId));
    }
    for (const i of r.instructors || []) instructor += instructorHoursFor(i, r);
  }
  return {
    sessions: records.length,
    instructionalHours: roundHours(instructional),
    personHours: roundHours(person),
    instructorHours: roundHours(instructor),
    uniqueAttendees: attendees.size,
  };
}

/** Person-hours grouped by a key function (discipline, station, shift…). */
export function personHoursBy(records = [], keyOf) {
  const out = new Map();
  for (const r of records) {
    const key = keyOf(r) || "Unassigned";
    const prev = out.get(key) || { key, sessions: 0, instructionalHours: 0, personHours: 0 };
    prev.sessions += 1;
    prev.instructionalHours = roundHours(prev.instructionalHours + instructionalHours(r));
    prev.personHours = roundHours(prev.personHours + (r.participants || []).reduce((s, p) => s + creditedHoursFor(p, r), 0));
    out.set(key, prev);
  }
  return [...out.values()].sort((a, b) => b.personHours - a.personHours);
}

/** One member's transcript: every record they attended, with their own credited hours. */
export function transcriptFor(personId, records = []) {
  const rows = [];
  for (const r of records) {
    const p = (r.participants || []).find((x) => String(x.personId) === String(personId));
    if (!p) continue;
    rows.push({
      recordId: r.id,
      date: r.date,
      title: r.title,
      discipline: r.discipline || "",
      courseId: r.courseId || "",
      courseVersion: r.courseVersion || "",
      attendance: p.attendance || "",
      creditedHours: creditedHoursFor(p, r),
      status: r.status,
    });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Hours each person taught (instructor transcript). */
export function instructorHoursByPerson(records = []) {
  const out = new Map();
  for (const r of records) {
    for (const i of r.instructors || []) {
      const key = String(i.personId || i.name);
      const prev = out.get(key) || { personId: i.personId || "", name: i.name || key, sessions: 0, hours: 0 };
      prev.sessions += 1;
      prev.hours = roundHours(prev.hours + instructorHoursFor(i, r));
      out.set(key, prev);
    }
  }
  return [...out.values()].sort((a, b) => b.hours - a.hours);
}

/** Start dates of today / week / month / year (ISO), for dashboard windows. */
export function windows(todayIso) {
  const d = new Date(`${todayIso}T00:00:00Z`);
  const dow = d.getUTCDay();
  const weekStart = new Date(d.getTime() - dow * 86400000).toISOString().slice(0, 10);
  return {
    today: { from: todayIso, to: todayIso, label: "Today" },
    week: { from: weekStart, to: todayIso, label: "This week" },
    month: { from: `${todayIso.slice(0, 7)}-01`, to: todayIso, label: "This month" },
    year: { from: `${todayIso.slice(0, 4)}-01-01`, to: todayIso, label: "This year" },
  };
}

/** Rows → CSV text (RFC 4180 quoting). */
export function toCsv(rows = []) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const q = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(q).join(","), ...rows.map((r) => headers.map((h) => q(r[h])).join(","))].join("\r\n");
}

/** Task book progress: an item is done when signed off, or met by verified evidence. */
export function taskBookProgress(assignment = {}, { records = [], evaluations = [] } = {}) {
  const items = assignment.items || [];
  const personId = String(assignment.personId);
  const status = items.map((item) => {
    const signoff = assignment.signoffs?.[item.id];
    if (signoff) return { item, done: true, how: `Signed off by ${signoff.byName || "evaluator"} on ${String(signoff.at).slice(0, 10)}` };
    if (item.type === "course" && item.refId) {
      const rec = records.find((r) => isVerified(r) && String(r.courseId) === String(item.refId) && (r.participants || []).some((p) => String(p.personId) === personId && creditedHoursFor(p, r) > 0));
      if (rec) return { item, done: true, how: `Completed ${rec.date} (${rec.title})` };
    }
    if (item.type === "skill" && item.refId) {
      const ev = evaluations.find((e) => String(e.personId) === personId && String(e.skillId) === String(item.refId) && e.result === "pass" && e.status === "approved");
      if (ev) return { item, done: true, how: `Passed ${ev.date}` };
    }
    return { item, done: false, how: "" };
  });
  const required = status.filter((s) => s.item.required !== false);
  const done = required.filter((s) => s.done).length;
  return { items: status, done, total: required.length, percent: required.length ? Math.round((done / required.length) * 100) : 0, readyForFinal: required.length > 0 && done === required.length };
}
