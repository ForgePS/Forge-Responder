import {
  DAMAGE_SEVERITIES,
} from "./defaults.js";

const CLOSED = new Set(["closed", "cancelled", "duplicate", "verified"]);

/**
 * @param {string} iso
 * @param {number} [nowMs]
 */
export function isDuePast(iso, nowMs = Date.now()) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < nowMs;
}

/**
 * @param {object} report
 * @param {number} [nowMs]
 */
export function getSlaSnapshot(report = {}, nowMs = Date.now()) {
  if (!report || CLOSED.has(report.status)) {
    return {
      overdue: false,
      paused: false,
      level: "ok",
      label: "Closed",
      reasons: [],
      nextDueAt: "",
      nextDueLabel: "",
    };
  }

  if (report.slaPaused) {
    return {
      overdue: false,
      paused: true,
      level: "paused",
      label: "SLA paused",
      reasons: [report.slaPauseReason || "Paused"],
      nextDueAt: "",
      nextDueLabel: "",
    };
  }

  /** @type {{ key: string, label: string, dueAt: string }[]} */
  const checks = [];
  if (!report.acknowledgedAt && report.acknowledgmentDueAt) {
    checks.push({ key: "acknowledgment", label: "Acknowledgment", dueAt: report.acknowledgmentDueAt });
  }
  if (!["repair_completed", "temporary_repair_completed", "ready_for_verification", "verification_scheduled", "verified", "closed"].includes(report.status)
    && report.repairTargetAt) {
    checks.push({ key: "repair", label: "Repair completion", dueAt: report.repairTargetAt });
  }
  if (["ready_for_verification", "verification_scheduled", "repair_completed", "temporary_repair_completed"].includes(report.status)
    && report.verificationDueAt
    && !report.verifiedAt) {
    checks.push({ key: "verification", label: "FD verification", dueAt: report.verificationDueAt });
  }

  const overdueReasons = checks.filter((row) => isDuePast(row.dueAt, nowMs));
  const upcoming = checks
    .filter((row) => !isDuePast(row.dueAt, nowMs))
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())[0];

  const severityRank = DAMAGE_SEVERITIES.find((row) => row.id === report.severity)?.rank || 0;
  const hazardBoost = report.leaking || report.roadwayHazard || report.publicSafetyHazard || severityRank >= 4;

  if (overdueReasons.length) {
    return {
      overdue: true,
      paused: false,
      level: hazardBoost ? "critical" : "warning",
      label: overdueReasons.length === 1 ? `${overdueReasons[0].label} overdue` : `${overdueReasons.length} SLA items overdue`,
      reasons: overdueReasons.map((row) => `${row.label} due ${new Date(row.dueAt).toLocaleString()}`),
      nextDueAt: overdueReasons[0].dueAt,
      nextDueLabel: overdueReasons[0].label,
    };
  }

  return {
    overdue: false,
    paused: false,
    level: upcoming ? "info" : "ok",
    label: upcoming ? `${upcoming.label} due` : "On track",
    reasons: upcoming ? [`${upcoming.label} due ${new Date(upcoming.dueAt).toLocaleString()}`] : [],
    nextDueAt: upcoming?.dueAt || "",
    nextDueLabel: upcoming?.label || "",
  };
}

/**
 * @param {object[]} reports
 * @param {number} [nowMs]
 */
export function summarizeSlaQueue(reports = [], nowMs = Date.now()) {
  let overdue = 0;
  let paused = 0;
  let awaitingAck = 0;
  let readyVerify = 0;
  for (const row of reports) {
    const snap = getSlaSnapshot(row, nowMs);
    if (snap.overdue) overdue += 1;
    if (snap.paused) paused += 1;
    if (["awaiting_acknowledgment", "sent", "escalated"].includes(row.status)) awaitingAck += 1;
    if (["ready_for_verification", "verification_scheduled", "repair_completed", "temporary_repair_completed"].includes(row.status)) {
      readyVerify += 1;
    }
  }
  return { overdue, paused, awaitingAck, readyVerify, total: reports.length };
}

/**
 * Apply company SLA targets onto a report when company is known.
 * @param {object} report
 * @param {object|null} company
 * @param {number} [nowMs]
 */
export function applyCompanySlaDefaults(report = {}, company = null, nowMs = Date.now()) {
  if (!company) return report;
  const ackMinutes = Number(company.acknowledgmentSlaMinutes) || 240;
  const repairHours = Number(company.normalRepairSlaHours) || 72;
  const emergencyMinutes = Number(company.emergencyResponseSlaMinutes) || 60;
  const severityRank = DAMAGE_SEVERITIES.find((row) => row.id === report.severity)?.rank || 0;
  const urgent = severityRank >= 4 || report.leaking || report.roadwayHazard || report.publicSafetyHazard;
  return {
    ...report,
    acknowledgmentDueAt: report.acknowledgmentDueAt
      || new Date(nowMs + (urgent ? emergencyMinutes : ackMinutes) * 60_000).toISOString(),
    repairTargetAt: report.repairTargetAt
      || new Date(nowMs + (urgent ? Math.max(repairHours / 2, 12) : repairHours) * 3_600_000).toISOString(),
  };
}
