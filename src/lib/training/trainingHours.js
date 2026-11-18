/**
 * Training hour math.
 *
 * Four quantities are kept apart on purpose. They are easy to confuse, and
 * reports that add one to another produce wrong totals:
 *
 *  - instructionalHours: how long the class ran (end - start - breaks), once per record.
 *  - creditedHours (per person): the hours one attendee is credited with. Defaults to
 *    the instructional hours; less for a late arrival or early departure.
 *  - personHours: the sum of credited hours over attendees who were present.
 *    Five members at two hours each = ten person-hours.
 *  - instructorHours: hours each instructor taught. Instructors are not attendees
 *    and are not counted in person-hours.
 *  - ceCredits: approved continuing-education credit, which is never derived
 *    automatically from time (see trainingCe.js).
 */

/** Attendance statuses that earn credit. Anything else (absent, excused, enrolled) does not. */
export const CREDITED_ATTENDANCE = new Set(["present", "partial"]);

export const ATTENDANCE_STATUSES = [
  { value: "present", label: "Present" },
  { value: "partial", label: "Partial" },
  { value: "absent", label: "Absent" },
  { value: "excused", label: "Excused" },
];

/** Round to the nearest hundredth so float noise never reaches a report. */
export function roundHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function minutesOfDay(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Instructional hours from start/end times ("HH:MM") and a break in minutes.
 * An end before the start is treated as crossing midnight (a night drill).
 * Returns null when the times are missing or invalid.
 */
export function durationFromTimes(startTime, endTime, breakMinutes = 0) {
  const start = minutesOfDay(startTime);
  const end = minutesOfDay(endTime);
  if (start === null || end === null) return null;
  let minutes = end - start;
  if (minutes <= 0) minutes += 24 * 60;
  minutes -= Math.max(0, Number(breakMinutes) || 0);
  if (minutes <= 0) return 0;
  return roundHours(minutes / 60);
}

/**
 * The record's instructional duration. An explicit duration wins (the quick-entry
 * form asks for it directly); otherwise it comes from the times.
 */
export function instructionalHours(record = {}) {
  const explicit = Number(record.durationHours);
  if (record.durationHours !== "" && record.durationHours !== undefined && record.durationHours !== null && Number.isFinite(explicit)) {
    return roundHours(Math.max(0, explicit));
  }
  return durationFromTimes(record.startTime, record.endTime, record.breakMinutes) ?? 0;
}

/** Hours credited to one participant. Never more than the instructional duration. */
export function creditedHoursFor(participant = {}, record = {}) {
  if (!CREDITED_ATTENDANCE.has(participant.attendance)) return 0;
  const cap = instructionalHours(record);
  const own = Number(participant.creditedHours);
  if (participant.creditedHours === "" || participant.creditedHours === undefined || participant.creditedHours === null || !Number.isFinite(own)) {
    return cap;
  }
  return roundHours(Math.min(Math.max(0, own), cap));
}

export function personHours(record = {}) {
  const participants = Array.isArray(record.participants) ? record.participants : [];
  return roundHours(participants.reduce((sum, p) => sum + creditedHoursFor(p, record), 0));
}

export function presentCount(record = {}) {
  const participants = Array.isArray(record.participants) ? record.participants : [];
  return participants.filter((p) => CREDITED_ATTENDANCE.has(p.attendance)).length;
}

/** Hours taught by one instructor on this record (defaults to the full duration). */
export function instructorHoursFor(instructor = {}, record = {}) {
  const cap = instructionalHours(record);
  const own = Number(instructor.hours);
  if (instructor.hours === "" || instructor.hours === undefined || instructor.hours === null || !Number.isFinite(own)) return cap;
  return roundHours(Math.min(Math.max(0, own), cap));
}

export function totalInstructorHours(record = {}) {
  const instructors = Array.isArray(record.instructors) ? record.instructors : [];
  return roundHours(instructors.reduce((sum, i) => sum + instructorHoursFor(i, record), 0));
}

/** The derived figures stored on a record when it is saved, so lists and reports read them cheaply. */
export function recordTotals(record = {}) {
  return {
    instructionalHours: instructionalHours(record),
    personHours: personHours(record),
    presentCount: presentCount(record),
    instructorHours: totalInstructorHours(record),
  };
}
