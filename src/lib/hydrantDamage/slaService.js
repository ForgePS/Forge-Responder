import { writeHydrantDamageAudit } from "./audit.js";
import { getHydrantDamageReport, updateHydrantDamageReport } from "./damageReportService.js";
import { getSlaSnapshot } from "./slaHelpers.js";

const MIN_ESCALATION_GAP_MS = 4 * 60 * 60 * 1000;
const CLOSED = new Set(["closed", "cancelled", "duplicate", "verified"]);

/**
 * @param {object} report
 * @param {number} [nowMs]
 */
export function canEscalateDamageReport(report, nowMs = Date.now()) {
  if (!report || CLOSED.has(report.status) || report.status === "draft" || report.status === "ownership_review_required") {
    return { ok: false, reason: "Report is not in an escalatable state." };
  }
  if (report.slaPaused) {
    return { ok: false, reason: "SLA is paused. Resume before escalating." };
  }
  const history = Array.isArray(report.escalationHistory) ? report.escalationHistory : [];
  const last = history[0];
  if (last?.at) {
    const gap = nowMs - new Date(last.at).getTime();
    if (Number.isFinite(gap) && gap < MIN_ESCALATION_GAP_MS) {
      const hoursLeft = Math.ceil((MIN_ESCALATION_GAP_MS - gap) / 3_600_000);
      return { ok: false, reason: `Escalation rate limit: wait ~${hoursLeft}h before repeating.` };
    }
  }
  return { ok: true, reason: "" };
}

/**
 * Record an internal escalation (does not auto-send email; avoids fake Sent).
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{
 *   channel?: string,
 *   notes?: string,
 *   notifySupervisor?: boolean,
 * }} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function escalateHydrantDamageReport(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  const gate = canEscalateDamageReport(report);
  if (!gate.ok) throw new Error(gate.reason);

  const at = new Date().toISOString();
  const entry = {
    at,
    channel: input.channel || "internal_alert",
    notes: String(input.notes || "").trim(),
    notifySupervisor: Boolean(input.notifySupervisor),
    actorUid: actor.actorUid || "system",
    actorName: actor.actorName || "User",
    slaSnapshot: getSlaSnapshot(report),
  };
  const history = [entry, ...(report.escalationHistory || [])].slice(0, 50);
  const next = await updateHydrantDamageReport(departmentId, reportId, {
    status: "escalated",
    escalationHistory: history,
    lastEscalatedAt: at,
    internalNotes: input.notes
      ? `${report.internalNotes || ""}\n[Escalation ${new Date(at).toLocaleString()}] ${input.notes}`.trim()
      : report.internalNotes,
    _reason: "sla_escalation",
  }, actor);

  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.escalated",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: entry,
  });

  return next;
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{ paused: boolean, reason?: string }} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function setDamageReportSlaPaused(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  const next = await updateHydrantDamageReport(departmentId, reportId, {
    slaPaused: Boolean(input.paused),
    slaPauseReason: input.paused ? String(input.reason || "Paused by user").trim() : "",
    _reason: input.paused ? "sla_paused" : "sla_resumed",
  }, actor);
  await writeHydrantDamageAudit(departmentId, {
    action: input.paused ? "damage_report.sla_paused" : "damage_report.sla_resumed",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    reason: input.reason || "",
  });
  return next;
}
