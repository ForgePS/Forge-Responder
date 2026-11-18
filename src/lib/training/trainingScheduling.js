/**
 * Scheduling logic for training sessions, enrollment and resource reservations.
 * Pure functions, unit tested.
 */

const DAY = 86400000;

function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/**
 * Dates for a recurring series. pattern: "none" | "weekly" | "biweekly" | "monthly".
 * monthly keeps the day of month (skips months that don't have it).
 * Capped at `maxCount` occurrences and `until` (inclusive).
 */
export function recurrenceDates(startIso, { pattern = "none", until = "", count = 0, maxCount = 52 } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startIso))) return [];
  if (pattern === "none") return [startIso];
  const limit = Math.min(maxCount, count > 0 ? count : maxCount);
  const out = [];
  const start = new Date(`${startIso}T00:00:00Z`);
  for (let i = 0; out.length < limit && i < limit * 2; i += 1) {
    let d;
    if (pattern === "weekly") d = new Date(start.getTime() + i * 7 * DAY);
    else if (pattern === "biweekly") d = new Date(start.getTime() + i * 14 * DAY);
    else if (pattern === "monthly") {
      d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, start.getUTCDate()));
      if (d.getUTCDate() !== start.getUTCDate()) continue;
    } else break;
    const iso = d.toISOString().slice(0, 10);
    if (until && iso > until) break;
    out.push(iso);
  }
  if (!until && !count) return out.slice(0, Math.min(limit, 12));
  return out;
}

/**
 * Who is enrolled and who is waitlisted. First come, first served by enrolledAt
 * among active enrollments; assigned (mandatory) members always get a seat.
 * Enrollment never means attendance: attendance is marked on the training record.
 */
export function enrollmentStanding(enrollments = [], capacity = 0) {
  const active = enrollments.filter((e) => e.status !== "cancelled")
    .sort((a, b) => Number(Boolean(b.assigned)) - Number(Boolean(a.assigned)) || String(a.enrolledAt).localeCompare(String(b.enrolledAt)));
  const cap = Number(capacity) > 0 ? Number(capacity) : Infinity;
  const enrolled = [];
  const waitlist = [];
  for (const e of active) {
    if (e.assigned || enrolled.length < cap) enrolled.push(e);
    else waitlist.push(e);
  }
  return { enrolled, waitlist, seatsLeft: cap === Infinity ? null : Math.max(0, cap - enrolled.length), full: enrolled.length >= cap };
}

/** Do two time ranges on the same date overlap? */
export function overlaps(a, b) {
  if (!a?.date || a.date !== b?.date) return false;
  const as = toMinutes(a.startTime) ?? 0;
  const ae = toMinutes(a.endTime) ?? 24 * 60;
  const bs = toMinutes(b.startTime) ?? 0;
  const be = toMinutes(b.endTime) ?? 24 * 60;
  return as < be && bs < ae;
}

/**
 * Problems with booking `resourceIds` for `slot`:
 * - another reservation overlaps (conflict)
 * - the resource is out of service / under maintenance
 * - its inspection is past due on the date
 */
export function reservationProblems(slot, resourceIds = [], { resources = [], reservations = [] } = {}) {
  const problems = [];
  for (const rid of resourceIds) {
    const resource = resources.find((r) => r.id === rid);
    if (!resource) { problems.push({ resourceId: rid, kind: "missing", message: "This resource no longer exists." }); continue; }
    if (["out_of_service", "maintenance"].includes(resource.status)) {
      problems.push({ resourceId: rid, kind: "unavailable", message: `${resource.name} is ${resource.status === "maintenance" ? "under maintenance" : "out of service"}.` });
    }
    if (resource.inspectionDue && slot.date && resource.inspectionDue < slot.date) {
      problems.push({ resourceId: rid, kind: "inspection", message: `${resource.name}'s inspection was due ${resource.inspectionDue}.` });
    }
    for (const r of reservations) {
      if (r.resourceId !== rid || r.status === "cancelled" || (slot.id && r.sessionId === slot.id) || (slot.reservationId && r.id === slot.reservationId)) continue;
      if (overlaps(slot, r)) problems.push({ resourceId: rid, kind: "conflict", message: `${resource.name} is already reserved ${r.date} ${r.startTime || ""}–${r.endTime || ""}${r.title ? ` (${r.title})` : ""}.` });
    }
  }
  return problems;
}

/** Instructors double-booked in another session at the same time. */
export function instructorConflicts(session, sessions = []) {
  const ids = new Set((session.instructorIds || []).map(String));
  if (!ids.size) return [];
  return sessions.filter((s) => s.id !== session.id && s.status !== "cancelled" && overlaps(session, s) && (s.instructorIds || []).some((i) => ids.has(String(i))));
}

/** Prerequisites a member hasn't met: course ids with no approved record or completion. */
export function missingPrerequisites(course = {}, personId, { records = [], completions = [] } = {}) {
  const needed = (course.prerequisiteCourseIds || []).map(String);
  if (!needed.length) return [];
  const done = new Set();
  for (const r of records) {
    if (!["approved", "locked"].includes(r.status) || !r.courseId) continue;
    const p = (r.participants || []).find((x) => String(x.personId) === String(personId));
    if (p && (p.attendance === "present" || p.attendance === "partial")) done.add(String(r.courseId));
  }
  for (const c of completions) if (String(c.personId) === String(personId) && ["passed", "completed"].includes(c.status)) done.add(String(c.courseId));
  return needed.filter((id) => !done.has(id));
}

/** Build an .ics calendar file for sessions (floating local times in the department's zone). */
export function sessionsToIcs(sessions = [], { departmentName = "FORGE", timezone = "" } = {}) {
  const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/[,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const dt = (date, time) => `${date.replace(/-/g, "")}T${(time || "00:00").replace(":", "")}00`;
  const tz = timezone ? `;TZID=${timezone}` : "";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${esc(departmentName)}//FORGE Training//EN`, "CALSCALE:GREGORIAN"];
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    lines.push("BEGIN:VEVENT", `UID:${s.id}@forge-training`, `DTSTAMP:${stamp}`,
      `DTSTART${tz}:${dt(s.date, s.startTime)}`, `DTEND${tz}:${dt(s.date, s.endTime || s.startTime)}`,
      `SUMMARY:${esc(s.title)}`, `LOCATION:${esc(s.location)}`, `DESCRIPTION:${esc(s.description || "")}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
