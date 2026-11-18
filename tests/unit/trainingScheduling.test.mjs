import { test } from "node:test";
import assert from "node:assert/strict";
import { enrollmentStanding, instructorConflicts, missingPrerequisites, recurrenceDates, reservationProblems, sessionsToIcs } from "../../src/lib/training/trainingScheduling.js";
import { filterRecords, personHoursBy, summarize, taskBookProgress, toCsv, transcriptFor } from "../../src/lib/training/trainingReports.js";
import { completionsFromLegacy, credentialsFromCertifications } from "../../src/lib/training/trainingEvidence.js";

test("weekly recurrence stops at the until date; monthly skips months without the day", () => {
  assert.deepEqual(recurrenceDates("2026-01-05", { pattern: "weekly", until: "2026-01-26" }), ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26"]);
  assert.deepEqual(recurrenceDates("2026-01-31", { pattern: "monthly", count: 3 }), ["2026-01-31", "2026-03-31", "2026-05-31"]);
  assert.deepEqual(recurrenceDates("2026-01-05"), ["2026-01-05"]);
});

test("enrollment: first come first served, assigned members always seated, cancelled ignored", () => {
  const e = [
    { personId: "a", enrolledAt: "2026-01-01T01:00:00Z" },
    { personId: "b", enrolledAt: "2026-01-01T02:00:00Z" },
    { personId: "c", enrolledAt: "2026-01-01T00:30:00Z", status: "cancelled" },
    { personId: "d", enrolledAt: "2026-01-01T03:00:00Z", assigned: true },
  ];
  const s = enrollmentStanding(e, 2);
  assert.deepEqual(s.enrolled.map((x) => x.personId), ["d", "a"]);
  assert.deepEqual(s.waitlist.map((x) => x.personId), ["b"]);
  assert.equal(s.seatsLeft, 0);
});

test("reservations: overlapping booking, out-of-service and past-due inspection are reported", () => {
  const resources = [{ id: "R1", name: "Burn building", status: "available", inspectionDue: "2026-02-01" }, { id: "R2", name: "Tower", status: "out_of_service" }];
  const reservations = [{ id: "X", resourceId: "R1", date: "2026-03-01", startTime: "08:00", endTime: "12:00", status: "reserved" }];
  const kinds = reservationProblems({ date: "2026-03-01", startTime: "11:00", endTime: "13:00" }, ["R1", "R2"], { resources, reservations }).map((p) => p.kind).sort();
  assert.deepEqual(kinds, ["conflict", "inspection", "unavailable"]);
  // Back-to-back is not a conflict.
  assert.equal(reservationProblems({ date: "2026-03-01", startTime: "12:00", endTime: "13:00" }, ["R1"], { resources: [{ ...resources[0], inspectionDue: "" }], reservations }).length, 0);
});

test("instructor double-booking and missing prerequisites", () => {
  const sessions = [{ id: "S1", date: "2026-03-01", startTime: "08:00", endTime: "10:00", instructorIds: ["7"] }];
  assert.equal(instructorConflicts({ id: "S2", date: "2026-03-01", startTime: "09:00", endTime: "11:00", instructorIds: ["7"] }, sessions).length, 1);
  const records = [{ status: "approved", courseId: "C1", participants: [{ personId: "1", attendance: "present" }] }, { status: "submitted", courseId: "C2", participants: [{ personId: "1", attendance: "present" }] }];
  assert.deepEqual(missingPrerequisites({ prerequisiteCourseIds: ["C1", "C2"] }, "1", { records }), ["C2"]);
});

test(".ics export escapes text and skips cancelled sessions", () => {
  const ics = sessionsToIcs([{ id: "S1", date: "2026-03-01", startTime: "08:00", endTime: "10:00", title: "Ladders, ropes; knots" }, { id: "S2", date: "2026-03-02", status: "cancelled", title: "x" }], { timezone: "America/Chicago" });
  assert.ok(ics.includes("SUMMARY:Ladders\\, ropes\\; knots"));
  assert.match(ics, /DTSTART;TZID=America\/Chicago:20260301T080000/);
  assert.ok(!ics.includes("UID:S2"));
});

test("reports count only approved records by default and keep person-hours separate", () => {
  const records = [
    { id: "1", status: "approved", date: "2026-01-02", discipline: "Fire", durationHours: 2, participants: [{ personId: "a", attendance: "present" }, { personId: "b", attendance: "present" }], instructors: [{ personId: "i", name: "I" }] },
    { id: "2", status: "submitted", date: "2026-01-03", discipline: "EMS", durationHours: 3, participants: [{ personId: "a", attendance: "present" }] },
  ];
  const s = summarize(filterRecords(records, {}));
  assert.deepEqual(s, { sessions: 1, instructionalHours: 2, personHours: 4, instructorHours: 2, uniqueAttendees: 2 });
  assert.equal(summarize(filterRecords(records, { includePending: true })).personHours, 7);
  assert.equal(personHoursBy(filterRecords(records, {}), (r) => r.discipline)[0].personHours, 4);
  assert.equal(transcriptFor("a", records).length, 2);
  assert.equal(toCsv([{ a: 'x,"y"', b: 1 }]), 'a,b\r\n"x,""y""",1');
});

test("task book items complete by sign-off or verified evidence only", () => {
  const assignment = { personId: "a", items: [{ id: "1", type: "course", refId: "C1" }, { id: "2", type: "skill", refId: "K1" }, { id: "3", type: "task" }, { id: "4", type: "task", required: false }], signoffs: { 3: { byName: "Lt", at: "2026-01-05T00:00:00Z" } } };
  const records = [{ status: "submitted", courseId: "C1", participants: [{ personId: "a", attendance: "present" }], durationHours: 2 }];
  const evaluations = [{ personId: "a", skillId: "K1", result: "pass", status: "approved", date: "2026-01-04" }];
  let p = taskBookProgress(assignment, { records, evaluations });
  assert.equal(p.done, 2); assert.equal(p.total, 3); assert.equal(p.readyForFinal, false);
  p = taskBookProgress(assignment, { records: [{ ...records[0], status: "approved" }], evaluations });
  assert.equal(p.readyForFinal, true);
});

test("credentials link by personnel id or exact name; Academy completions need a person", () => {
  const creds = credentialsFromCertifications([{ id: "c1", person: "Jane Doe", type: "EMT", expires: "2027-03-31" }, { id: "c2", person: "Nobody", type: "X" }], [{ id: "9", name: "Jane Doe" }]);
  assert.deepEqual(creds.map((c) => [c.personId, c.name]), [["9", "EMT"]]);
  const done = completionsFromLegacy([{ id: "a", source: "forge_academy", status: "Completed", personnelId: "9", course: "HazMat Ops", courseNumber: "HM-1", endDate: "2026-02-01" }, { id: "b", source: "forge_academy", status: "Completed" }]);
  assert.equal(done.length, 1);
  assert.equal(done[0].courseId, "HM-1");
});
