import { test } from "node:test";
import assert from "node:assert/strict";
import {
  creditedHoursFor, durationFromTimes, instructionalHours, personHours, recordTotals, totalInstructorHours,
} from "../../src/lib/training/trainingHours.js";
import { canAmend, canTransition, diffForAmendment, submissionProblems } from "../../src/lib/training/trainingWorkflow.js";
import { compliancePercent, evaluateCompliance, evaluateRequirement, memberStatus, periodFor } from "../../src/lib/training/trainingCompliance.js";
import { ceProgress, findDuplicateAward, nccpStarterTemplate } from "../../src/lib/training/trainingCe.js";
import { attemptStanding, canEvaluate, scoreAttempt } from "../../src/lib/training/trainingSkills.js";

const roster = (n, attendance = "present") => Array.from({ length: n }, (_, i) => ({ personId: `p${i + 1}`, name: `FF ${i + 1}`, attendance }));

// ---------- hours ----------

test("five members at two hours is ten person-hours; instructors are separate", () => {
  const record = { durationHours: 2, participants: roster(5), instructors: [{ personId: "lt1" }] };
  assert.equal(instructionalHours(record), 2);
  assert.equal(personHours(record), 10);
  assert.equal(totalInstructorHours(record), 2);
  assert.deepEqual(recordTotals(record), { instructionalHours: 2, personHours: 10, presentCount: 5, instructorHours: 2 });
});

test("absent and excused members earn nothing; partial credit is capped at the duration", () => {
  const record = {
    durationHours: 3,
    participants: [
      { personId: "a", attendance: "present" },
      { personId: "b", attendance: "absent" },
      { personId: "c", attendance: "excused" },
      { personId: "d", attendance: "partial", creditedHours: 1.5 },
      { personId: "e", attendance: "partial", creditedHours: 9 },
      { personId: "f", attendance: "" },
    ],
  };
  assert.equal(creditedHoursFor(record.participants[1], record), 0);
  assert.equal(creditedHoursFor(record.participants[3], record), 1.5);
  assert.equal(creditedHoursFor(record.participants[4], record), 3);
  assert.equal(personHours(record), 7.5);
});

test("duration from times subtracts breaks and crosses midnight", () => {
  assert.equal(durationFromTimes("08:00", "12:00", 30), 3.5);
  assert.equal(durationFromTimes("22:00", "01:00", 0), 3);
  assert.equal(durationFromTimes("bad", "12:00"), null);
  assert.equal(instructionalHours({ startTime: "09:00", endTime: "10:15" }), 1.25);
});

// ---------- workflow ----------

test("records move draft -> submitted -> approved -> locked with separation of duties", () => {
  const author = { uid: "u1", canEdit: true, canApprove: true };
  const approver = { uid: "u2", canEdit: true, canApprove: true };
  const member = { uid: "u3", canEdit: false, canApprove: false };
  assert.equal(canTransition({ status: "draft", createdBy: "u1" }, "submit", author).ok, true);
  assert.equal(canTransition({ status: "approved" }, "submit", author).ok, false);
  const submitted = { status: "submitted", submittedBy: "u1" };
  assert.equal(canTransition(submitted, "approve", author).ok, false, "submitter can't approve own record");
  assert.equal(canTransition(submitted, "approve", member).ok, false);
  assert.equal(canTransition(submitted, "approve", approver).ok, true);
  assert.equal(canTransition(submitted, "return", approver).ok, true);
  assert.equal(canTransition({ status: "returned", createdBy: "u1" }, "submit", author).ok, true);
  assert.equal(canTransition({ status: "approved" }, "lock", approver).ok, true);
  assert.equal(canTransition({ status: "locked" }, "reopen", approver).ok, false);
});

test("submission requires topic, date, duration, participants and attendance", () => {
  const problems = submissionProblems({ participants: [{ personId: "a" }] });
  assert.ok(problems.some((p) => /topic/.test(p)));
  assert.ok(problems.some((p) => /date/.test(p)));
  assert.ok(problems.some((p) => /how long/.test(p)));
  assert.ok(problems.some((p) => /Mark attendance/.test(p)));
  const ok = submissionProblems({ title: "Ladders", date: "2026-11-01", durationHours: 2, participants: roster(3) });
  assert.deepEqual(ok, []);
  assert.ok(submissionProblems({ title: "x", date: "2026-11-01", durationHours: 1, participants: roster(2, "absent") }).some((p) => /Nobody/.test(p)));
  assert.ok(submissionProblems({ title: "x", date: "2026-11-01", durationHours: 1, participants: roster(1) }, { requireEvidence: true }).some((p) => /documentation/.test(p)));
});

test("amendments keep old and new values; locked records can't be amended", () => {
  const diff = diffForAmendment({ title: "Ladders", durationHours: 2, notes: "" }, { title: "Ground ladders", durationHours: 2, notes: "" });
  assert.deepEqual(diff, [{ field: "title", label: "Topic", from: "Ladders", to: "Ground ladders" }]);
  assert.equal(canAmend({ status: "locked" }, { canApprove: true }).ok, false);
  assert.equal(canAmend({ status: "draft" }, { canApprove: true }).ok, false);
  assert.equal(canAmend({ status: "approved" }, { canApprove: false }).ok, false);
  assert.equal(canAmend({ status: "approved" }, { canApprove: true }).ok, true);
});

// ---------- compliance ----------

const member = { id: "p1", rank: "Firefighter", station: "1", shift: "A", emsLevel: "EMT", hireDate: "2026-01-15" };
const hoursRule = { id: "r1", name: "Annual fire hours", version: 3, kind: "hours", period: "annual", minHours: 24, disciplines: ["Fire"], dueSoonDays: 45 };
const rec = (id, date, hours, status, discipline = "Fire", personId = "p1") => ({ id, date, durationHours: hours, status, discipline, participants: [{ personId, attendance: "present" }] });

test("annual periods follow the fiscal start month", () => {
  assert.deepEqual(periodFor({ period: "annual" }, "2026-11-17"), { start: "2026-01-01", end: "2026-12-31" });
  assert.deepEqual(periodFor({ period: "annual", fiscalStartMonth: 7 }, "2026-03-01"), { start: "2025-07-01", end: "2026-06-30" });
  assert.deepEqual(periodFor({ period: "quarterly" }, "2026-11-17"), { start: "2026-10-01", end: "2026-12-31" });
  assert.deepEqual(periodFor({ period: "monthly" }, "2026-02-10"), { start: "2026-02-01", end: "2026-02-28" });
});

test("only approved hours count; submitted hours make it awaiting verification", () => {
  const evidence = { records: [rec("a", "2026-03-01", 12, "approved"), rec("b", "2026-04-01", 12, "submitted"), rec("c", "2026-04-02", 50, "approved", "EMS"), rec("d", "2025-12-30", 50, "approved")] };
  const r = evaluateRequirement(hoursRule, member, evidence, "2026-06-01");
  assert.equal(r.earned, 12);
  assert.equal(r.pending, 12);
  assert.equal(r.status, "awaiting_verification");
  assert.equal(r.ruleVersion, 3);
  assert.deepEqual(r.evidence.map((e) => e.id), ["a"]);
  assert.match(r.explanation, /12 of 24 verified hours/);
});

test("compliance status: compliant, due soon, in progress, exempt, not applicable", () => {
  const full = { records: [rec("a", "2026-03-01", 24, "approved")] };
  assert.equal(evaluateRequirement(hoursRule, member, full, "2026-06-01").status, "compliant");
  const some = { records: [rec("a", "2026-03-01", 4, "approved")] };
  assert.equal(evaluateRequirement(hoursRule, member, some, "2026-06-01").status, "in_progress");
  assert.equal(evaluateRequirement(hoursRule, member, some, "2026-12-01").status, "due_soon");
  const exempt = { ...some, exemptions: [{ id: "x", personId: "p1", ruleId: "r1", reason: "Light duty" }] };
  assert.equal(evaluateRequirement(hoursRule, member, exempt, "2026-12-01").status, "exempt");
  const stationRule = { ...hoursRule, appliesTo: { stations: ["2"] } };
  assert.equal(evaluateRequirement(stationRule, member, some, "2026-06-01").status, "not_applicable");
  const future = { ...hoursRule, effectiveFrom: "2027-01-01" };
  assert.equal(evaluateRequirement(future, member, some, "2026-06-01").status, "not_applicable");
});

test("one-time new-hire requirement goes overdue after its window", () => {
  const rule = { id: "nh", name: "SCBA orientation", kind: "course", period: "once", dueWithinDays: 90, courseId: "scba" };
  assert.equal(evaluateRequirement(rule, member, {}, "2026-03-01").status, "in_progress");
  assert.equal(evaluateRequirement(rule, member, {}, "2026-05-01").status, "overdue");
  const done = { records: [{ ...rec("s", "2026-02-01", 2, "approved"), courseId: "scba" }] };
  assert.equal(evaluateRequirement(rule, member, done, "2026-05-01").status, "compliant");
  const equivalent = { records: [{ ...rec("s", "2026-02-01", 2, "approved"), courseId: "scba-alt" }] };
  assert.equal(evaluateRequirement({ ...rule, equivalentCourseIds: ["scba-alt"] }, member, equivalent, "2026-05-01").status, "compliant");
});

test("skills and credentials", () => {
  const skillRule = { id: "sk", kind: "skill", period: "annual", skillId: "mayday" };
  const evals = { evaluations: [{ id: "e1", personId: "p1", skillId: "mayday", date: "2026-02-01", result: "pass", status: "approved" }] };
  assert.equal(evaluateRequirement(skillRule, member, evals, "2026-06-01").status, "compliant");
  const failed = { evaluations: [{ id: "e1", personId: "p1", skillId: "mayday", date: "2026-02-01", result: "fail", status: "approved" }] };
  assert.notEqual(evaluateRequirement(skillRule, member, failed, "2026-06-01").status, "compliant");
  const credRule = { id: "cpr", kind: "credential", credentialName: "CPR", dueSoonDays: 30 };
  assert.equal(evaluateRequirement(credRule, member, { credentials: [] }, "2026-06-01").status, "not_qualified");
  assert.equal(evaluateRequirement(credRule, member, { credentials: [{ id: "c", personId: "p1", name: "CPR", expirationDate: "2026-06-20" }] }, "2026-06-01").status, "due_soon");
  assert.equal(evaluateRequirement(credRule, member, { credentials: [{ id: "c", personId: "p1", name: "cpr", expirationDate: "2026-05-01" }] }, "2026-06-01").status, "not_qualified");
  assert.equal(evaluateRequirement(credRule, member, { credentials: [{ id: "c", personId: "p1", name: "CPR", expirationDate: "2027-05-01", status: "revoked" }] }, "2026-06-01").status, "not_qualified");
});

test("member roll-up takes the worst status; percent ignores not-applicable", () => {
  const results = evaluateCompliance({ rules: [hoursRule, { ...hoursRule, id: "r2", appliesTo: { stations: ["9"] } }], members: [member], evidence: { records: [rec("a", "2026-01-05", 30, "approved")] }, asOf: "2026-06-01" });
  assert.equal(results.length, 2);
  assert.equal(memberStatus(results), "compliant");
  assert.equal(compliancePercent(results), 100);
  assert.equal(memberStatus([{ status: "compliant" }, { status: "overdue" }, { status: "due_soon" }]), "overdue");
  assert.equal(compliancePercent([{ status: "not_applicable" }]), null);
});

// ---------- CE ----------

const ruleSet = { ...nccpStarterTemplate(), id: "nccp", active: true };
const award = (id, component, creditHours, extra = {}) => ({ id, personId: "p1", component, creditHours, status: "approved", date: "2026-03-01", ...extra });

test("CE starter template ships inactive and flagged for verification", () => {
  const t = nccpStarterTemplate();
  assert.equal(t.active, false);
  assert.equal(t.needsVerification, true);
});

test("CE progress by component with spillover and no double counting", () => {
  const awards = [
    award("a", "national", 25, { recordId: "r1" }),
    award("b", "local", 10, { recordId: "r2" }),
    award("dup", "individual", 10, { recordId: "r2" }),
    award("c", "individual", 4, { courseTitle: "Conference", approvalNumber: "CAPCE-1" }),
    award("p", "individual", 8, { status: "pending", recordId: "r9" }),
    award("old", "individual", 8, { date: "2023-01-01", recordId: "r8" }),
  ];
  const p = ceProgress({ ruleSet, level: "EMT", awards, cycle: { start: "2025-04-01", end: "2027-03-31" } });
  const by = Object.fromEntries(p.components.map((c) => [c.component, c]));
  assert.equal(by.national.earned, 20);
  assert.equal(by.local.earned, 10);
  assert.equal(by.individual.earned, 9, "5 national spillover + 4 individual");
  assert.equal(by.individual.missing, 1);
  assert.equal(p.totalEarned, 39);
  assert.equal(p.complete, false);
  assert.equal(p.ignored.length, 3);
  assert.ok(p.ignored.some((i) => /Duplicate/.test(i.reason)));
});

test("duplicate award detection uses the learning source", () => {
  const existing = [award("a", "national", 2, { recordId: "r1" })];
  assert.ok(findDuplicateAward(award("b", "local", 2, { recordId: "r1" }), existing));
  assert.equal(findDuplicateAward(award("b", "local", 2, { recordId: "r2" }), existing), null);
  assert.equal(findDuplicateAward(award("b", "local", 2, { recordId: "r1" }), existing, { allowRepeatSources: true }), null);
  assert.equal(ceProgress({ ruleSet, level: "Unknown", awards: [] }).ok, false);
});

// ---------- skills ----------

const skill = {
  passingPercent: 80,
  maxAttempts: 2,
  steps: [
    { id: "s1", text: "Don SCBA", points: 2, critical: true },
    { id: "s2", text: "Check gauge", points: 1 },
    { id: "s3", text: "Seal mask", points: 2 },
  ],
  criticalFailures: [{ id: "cf1", text: "Removed facepiece in IDLH" }],
};

test("a missed critical step fails even with a passing score", () => {
  const pass = scoreAttempt(skill, { s1: "done", s2: "missed", s3: "done" });
  assert.equal(pass.percent, 80);
  assert.equal(pass.result, "pass");
  const critical = scoreAttempt({ ...skill, passingPercent: 50 }, { s1: "missed", s2: "done", s3: "done" });
  assert.equal(critical.result, "fail");
  assert.match(critical.reasons[0], /Critical step/);
  const failure = scoreAttempt(skill, { s1: "done", s2: "done", s3: "done" }, ["cf1"]);
  assert.equal(failure.result, "fail");
  assert.equal(scoreAttempt(skill, { s1: "done" }).result, "incomplete");
  assert.equal(scoreAttempt(skill, { s1: "done", s2: "na", s3: "done" }).percent, 100);
});

test("attempt limits require remediation, which resets the count", () => {
  const fails = [{ date: "2026-01-01", result: "fail" }, { date: "2026-01-02", result: "fail" }];
  assert.equal(attemptStanding(fails, skill).remediationRequired, true);
  assert.equal(attemptStanding(fails, skill).canAttempt, false);
  const remediated = [...fails, { date: "2026-01-03", kind: "remediation", remediationComplete: true }];
  assert.equal(attemptStanding(remediated, skill).canAttempt, true);
  assert.equal(attemptStanding([...remediated, { date: "2026-01-04", result: "pass" }], skill).passed, true);
});

test("evaluators need permission and any required qualification", () => {
  assert.equal(canEvaluate({ canEvaluate: false }, {}).ok, false);
  assert.equal(canEvaluate({ canEvaluate: true, qualifications: [] }, { evaluatorQualification: "Fire Instructor I" }).ok, false);
  assert.equal(canEvaluate({ canEvaluate: true, qualifications: ["fire instructor i"] }, { evaluatorQualification: "Fire Instructor I" }).ok, true);
});

test("live-fire records can't be submitted until roles and the full checklist are complete", async () => {
  const { submissionProblems, liveFireProblems, LIVE_FIRE_CHECKS } = await import("../../src/lib/training/trainingWorkflow.js");
  const base = { title: "Acquired structure burn", date: "2026-01-10", durationHours: 4, type: "Live fire", participants: [{ personId: "1", attendance: "present" }] };
  const open = submissionProblems(base);
  assert.ok(open.some((p) => p.includes("instructor-in-charge")));
  assert.ok(open.some((p) => p.includes(`${LIVE_FIRE_CHECKS.length} safety checklist items`)));
  const checks = Object.fromEntries(LIVE_FIRE_CHECKS.map(([k]) => [k, true]));
  const same = liveFireProblems({ ...base, liveFire: { instructorInCharge: "A", safetyOfficer: "B", ignitionOfficer: "b ", checks } });
  assert.deepEqual(same, ["Live fire: the safety officer can't also be the ignition officer."]);
  assert.deepEqual(submissionProblems({ ...base, liveFire: { instructorInCharge: "A", safetyOfficer: "B", ignitionOfficer: "C", checks } }), []);
  // Not a live-fire record: no live-fire checks.
  assert.deepEqual(liveFireProblems({ ...base, type: "Company drill" }), []);
});
