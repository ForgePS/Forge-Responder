/**
 * Practical skills evaluation scoring.
 *
 * A skill definition is a rubric: an ordered list of steps, each with a point
 * value and an optional "critical" flag, plus a minimum passing score. A missed
 * critical step, or a recorded critical failure, fails the attempt regardless of
 * points. The rubric version used is stored on each attempt.
 */

export const STEP_RESULTS = ["done", "missed", "na"];

export function blankSkillDefinition() {
  return {
    title: "",
    code: "",
    discipline: "Fire",
    standardRef: "",
    standardEdition: "",
    equipment: "",
    passingPercent: 70,
    maxAttempts: 2,
    version: 1,
    steps: [],
    criticalFailures: [],
    status: "active",
  };
}

function stepPoints(step) {
  const n = Number(step.points);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Score an attempt.
 * definition: { steps: [{ id, text, points, critical }], criticalFailures: [{ id, text }], passingPercent }
 * marks: { [stepId]: "done" | "missed" | "na" }
 * failuresObserved: [criticalFailureId]
 */
export function scoreAttempt(definition = {}, marks = {}, failuresObserved = []) {
  const steps = Array.isArray(definition.steps) ? definition.steps : [];
  const unmarked = steps.filter((s) => !STEP_RESULTS.includes(marks[s.id]));
  const scored = steps.filter((s) => marks[s.id] !== "na");
  const possible = scored.reduce((sum, s) => sum + stepPoints(s), 0);
  const earned = scored.filter((s) => marks[s.id] === "done").reduce((sum, s) => sum + stepPoints(s), 0);
  const percent = possible ? Math.round((earned / possible) * 1000) / 10 : 0;
  const missedCritical = steps.filter((s) => s.critical && marks[s.id] === "missed");
  const failureList = (definition.criticalFailures || []).filter((f) => failuresObserved.includes(f.id));
  const passing = Number(definition.passingPercent ?? 70);
  const reasons = [];
  if (missedCritical.length) reasons.push(`Critical step missed: ${missedCritical.map((s) => s.text).join("; ")}`);
  if (failureList.length) reasons.push(`Critical failure: ${failureList.map((f) => f.text).join("; ")}`);
  if (percent < passing) reasons.push(`Score ${percent}% is below the ${passing}% passing score.`);
  const complete = unmarked.length === 0;
  return {
    complete,
    unmarked: unmarked.map((s) => s.id),
    earned,
    possible,
    percent,
    passingPercent: passing,
    missedCritical: missedCritical.map((s) => s.id),
    criticalFailures: failureList.map((f) => f.id),
    result: !complete ? "incomplete" : reasons.length ? "fail" : "pass",
    reasons,
  };
}

/** Attempt count and whether another attempt is allowed before remediation. */
export function attemptStanding(attempts = [], definition = {}) {
  const max = Math.max(1, Number(definition.maxAttempts) || 2);
  const ordered = attempts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
  // Remediation completed resets the attempt counter.
  let sinceRemediation = [];
  for (const a of ordered) {
    if (a.kind === "remediation" && a.remediationComplete) sinceRemediation = [];
    else if (a.kind !== "remediation") sinceRemediation.push(a);
  }
  const passed = sinceRemediation.some((a) => a.result === "pass");
  const failures = sinceRemediation.filter((a) => a.result === "fail").length;
  return {
    attemptsUsed: sinceRemediation.length,
    maxAttempts: max,
    passed,
    remediationRequired: !passed && failures >= max,
    canAttempt: !passed && failures < max,
  };
}

/** Is this person allowed to sign off this skill? */
export function canEvaluate(evaluator = {}, definition = {}) {
  if (!evaluator.canEvaluate) return { ok: false, reason: "You aren't authorized to conduct skills evaluations." };
  const needed = String(definition.evaluatorQualification || "").trim().toLowerCase();
  if (needed) {
    const held = (evaluator.qualifications || []).map((q) => String(q).trim().toLowerCase());
    if (!held.includes(needed)) return { ok: false, reason: `This skill requires an evaluator holding ${definition.evaluatorQualification}.` };
  }
  return { ok: true, reason: "" };
}
