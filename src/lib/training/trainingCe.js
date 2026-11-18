/**
 * EMS continuing-education (NCCP-style) tracking engine.
 *
 * Nothing here decides that training *is* CE. A CE credit award exists only when
 * an authorized person records one (trainingService.awardCeCredit): the approved
 * credit hours, the component it applies to, and the provider/approval number.
 * Instructional time on a training record is never turned into CE credit here.
 *
 * Requirements are data, not code: a "CE rule set" is a versioned document with
 * per-level component hours. The department enters and verifies the numbers from
 * the National Registry / state office; the starter template below ships
 * inactive and flagged for verification.
 *
 * Double counting: one award counts toward exactly one component, and the same
 * source (same course/record for the same person) is counted only once per cycle
 * unless the rule set allows repeats.
 */

export const CE_LEVELS = ["EMR", "EMT", "AEMT", "Paramedic"];
export const CE_COMPONENTS = [
  { value: "national", label: "National" },
  { value: "local", label: "Local / state" },
  { value: "individual", label: "Individual" },
];

/**
 * Starter template. The hour values are placeholders taken from the long-standing
 * NCCP model and MUST be checked against the current National Registry
 * requirements (including the 2025 revision) before the rule set is activated.
 */
export function nccpStarterTemplate() {
  return {
    name: "NCCP (verify before use)",
    framework: "NREMT NCCP",
    version: 1,
    active: false,
    needsVerification: true,
    verificationNote: "Hour values are placeholders. Confirm every level and component against the current NREMT recertification requirements and your state EMS office, then mark verified.",
    cycleYears: 2,
    allowRepeatSources: false,
    spillover: true,
    levels: {
      EMR: { totalHours: 16, components: { national: { hours: 8 }, local: { hours: 4 }, individual: { hours: 4 } } },
      EMT: { totalHours: 40, components: { national: { hours: 20 }, local: { hours: 10 }, individual: { hours: 10 } } },
      AEMT: { totalHours: 50, components: { national: { hours: 25 }, local: { hours: 12.5 }, individual: { hours: 12.5 } } },
      Paramedic: { totalHours: 60, components: { national: { hours: 30 }, local: { hours: 15 }, individual: { hours: 15 } } },
    },
  };
}

function round(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Key identifying the learning source, for duplicate prevention. */
export function ceSourceKey(award = {}) {
  if (award.recordId) return `record:${award.recordId}`;
  if (award.completionId) return `completion:${award.completionId}`;
  const course = String(award.courseTitle || "").trim().toLowerCase();
  const approval = String(award.approvalNumber || "").trim().toLowerCase();
  return `external:${approval || course}:${String(award.date || "").slice(0, 10)}`;
}

/**
 * Would this award duplicate one already on file for the person in the cycle?
 * Returns the conflicting award or null.
 */
export function findDuplicateAward(award, existing = [], { allowRepeatSources = false } = {}) {
  if (allowRepeatSources) return null;
  const key = ceSourceKey(award);
  return existing.find((a) =>
    a.id !== award.id
    && a.status !== "voided"
    && String(a.personId) === String(award.personId)
    && ceSourceKey(a) === key) || null;
}

/**
 * Progress for one member in one cycle.
 * awards: CE credit awards for the person (approved ones count; pending are reported separately).
 * cycle: { start, end } ISO dates.
 */
export function ceProgress({ ruleSet, level, awards = [], cycle }) {
  const levelRule = ruleSet?.levels?.[level];
  if (!levelRule) {
    return { ok: false, reason: `The rule set has no requirements for ${level || "this level"}.`, components: [], totalRequired: 0, totalEarned: 0 };
  }
  const inCycle = (a) => {
    const d = String(a.date || "").slice(0, 10);
    return (!cycle?.start || d >= cycle.start) && (!cycle?.end || d <= cycle.end);
  };
  const seen = new Set();
  const counted = [];
  const ignored = [];
  for (const a of awards) {
    if (a.status === "voided") continue;
    if (!inCycle(a)) { ignored.push({ award: a, reason: "Outside the certification cycle." }); continue; }
    if (a.status !== "approved") { ignored.push({ award: a, reason: "Not yet approved." }); continue; }
    const key = ceSourceKey(a);
    if (!ruleSet.allowRepeatSources && seen.has(key)) { ignored.push({ award: a, reason: "Duplicate of a source already counted this cycle." }); continue; }
    seen.add(key);
    counted.push(a);
  }

  const order = ["national", "local", "individual"];
  const required = Object.fromEntries(order.map((c) => [c, round(levelRule.components?.[c]?.hours)]));
  const raw = Object.fromEntries(order.map((c) => [c, 0]));
  const topics = {};
  for (const a of counted) {
    const comp = order.includes(a.component) ? a.component : "individual";
    raw[comp] = round(raw[comp] + Number(a.creditHours || 0));
    if (a.topic) topics[a.topic] = round((topics[a.topic] || 0) + Number(a.creditHours || 0));
  }

  // Spillover: hours beyond a component's requirement flow to the next component
  // (national -> local -> individual) when the rule set allows it.
  const applied = { ...raw };
  if (ruleSet.spillover) {
    for (let i = 0; i < order.length - 1; i += 1) {
      const c = order[i];
      const extra = round(applied[c] - required[c]);
      if (extra > 0) {
        applied[c] = required[c];
        applied[order[i + 1]] = round(applied[order[i + 1]] + extra);
      }
    }
  }

  const components = order.map((c) => {
    const topicRules = levelRule.components?.[c]?.topics || {};
    const topicProgress = Object.entries(topicRules).map(([topic, hours]) => ({
      topic, required: round(hours), earned: round(Math.min(topics[topic] || 0, hours)), missing: round(Math.max(0, hours - (topics[topic] || 0))),
    }));
    return {
      component: c,
      required: required[c],
      earned: round(Math.min(applied[c], required[c] || applied[c])),
      raw: raw[c],
      missing: round(Math.max(0, required[c] - applied[c])),
      topics: topicProgress,
    };
  });
  const totalRequired = round(levelRule.totalHours ?? order.reduce((s, c) => s + required[c], 0));
  const totalEarned = round(counted.reduce((s, a) => s + Number(a.creditHours || 0), 0));
  const componentsMet = components.every((c) => c.missing === 0 && c.topics.every((t) => t.missing === 0));
  const complete = componentsMet && totalEarned >= totalRequired;
  return {
    ok: true,
    level,
    ruleSetId: ruleSet.id,
    ruleSetVersion: ruleSet.version,
    needsVerification: Boolean(ruleSet.needsVerification),
    cycle,
    totalRequired,
    totalEarned,
    totalMissing: round(Math.max(0, totalRequired - totalEarned)),
    components,
    counted,
    ignored,
    complete,
    status: complete ? "complete" : totalEarned > 0 ? "in_progress" : "not_started",
  };
}
