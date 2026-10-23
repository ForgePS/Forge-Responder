import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import { HYDRANT_DAMAGE_ACKNOWLEDGMENTS_COLLECTION } from "./paths.js";
import { getHydrantDamageReport, updateHydrantDamageReport } from "./damageReportService.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeAcknowledgment(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reportId: data.reportId || "",
    waterCompanyId: data.waterCompanyId || "",
    acknowledgedAt: data.acknowledgedAt || "",
    acknowledgedByName: String(data.acknowledgedByName || "").trim(),
    acknowledgedByEmail: String(data.acknowledgedByEmail || "").trim(),
    utilityWorkOrderNumber: String(data.utilityWorkOrderNumber || "").trim(),
    estimatedRepairAt: data.estimatedRepairAt || "",
    utilityNotes: String(data.utilityNotes || "").trim(),
    source: data.source || "fire_department",
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
  };
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 */
export async function listAcknowledgmentsForReport(departmentId, reportId) {
  const rows = await listRecords(departmentId, HYDRANT_DAMAGE_ACKNOWLEDGMENTS_COLLECTION);
  return rows
    .map((row) => normalizeAcknowledgment(row, departmentId))
    .filter((row) => row.reportId === reportId)
    .sort((a, b) => String(b.acknowledgedAt || b.createdAt).localeCompare(String(a.acknowledgedAt || a.createdAt)));
}

/**
 * Record utility acknowledgment (internal FD entry until public portal ships).
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{
 *   acknowledgedByName?: string,
 *   acknowledgedByEmail?: string,
 *   utilityWorkOrderNumber?: string,
 *   estimatedRepairAt?: string,
 *   utilityNotes?: string,
 *   source?: string,
 * }} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function acknowledgeHydrantDamageReport(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  const sendable = [
    "sent",
    "awaiting_acknowledgment",
    "ready_to_send",
    "acknowledged",
    "escalated",
    "repair_scheduled",
    "repair_in_progress",
  ];
  if (!sendable.includes(report.status) && report.emailStatus !== "accepted" && !report.sentAt) {
    throw new Error("Acknowledge after the report has been sent (or accepted by the email provider).");
  }

  const id = newId("ACK");
  const acknowledgedAt = nowIso();
  const ack = normalizeAcknowledgment({
    id,
    reportId,
    waterCompanyId: report.waterCompanyId,
    acknowledgedAt,
    acknowledgedByName: input.acknowledgedByName || actor.actorName || "Utility contact",
    acknowledgedByEmail: input.acknowledgedByEmail || "",
    utilityWorkOrderNumber: input.utilityWorkOrderNumber || report.utilityWorkOrderNumber || "",
    estimatedRepairAt: input.estimatedRepairAt || "",
    utilityNotes: input.utilityNotes || "",
    source: input.source || "fire_department",
    createdAt: acknowledgedAt,
    createdBy: actor.actorUid || "system",
  }, departmentId);

  await createRecord(departmentId, HYDRANT_DAMAGE_ACKNOWLEDGMENTS_COLLECTION, id, ack);

  const repairTargetAt = input.estimatedRepairAt || report.repairTargetAt || "";
  const next = await updateHydrantDamageReport(departmentId, reportId, {
    status: "acknowledged",
    repairStatus: "assigned",
    acknowledgedAt,
    utilityWorkOrderNumber: ack.utilityWorkOrderNumber,
    repairTargetAt,
    utilityFacingNotes: input.utilityNotes
      ? `${report.utilityFacingNotes || ""}\n[Ack] ${input.utilityNotes}`.trim()
      : report.utilityFacingNotes,
    _reason: "utility_acknowledgment",
  }, actor);

  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.acknowledged",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: { acknowledgmentId: id, ...ack },
  });

  return { acknowledgment: ack, report: next };
}

/**
 * Update work-order / repair progress from utility communication.
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{
 *   utilityWorkOrderNumber?: string,
 *   repairStatus?: string,
 *   status?: string,
 *   repairTargetAt?: string,
 *   utilityNotes?: string,
 * }} patch
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function recordUtilityRepairUpdate(departmentId, reportId, patch = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  if (patch.repairStatus === "completed") {
    const { markReadyForVerification } = await import("./verificationService.js");
    return markReadyForVerification(departmentId, reportId, {
      notes: patch.utilityNotes || "",
    }, actor);
  }

  const nextStatus = patch.status
    || (patch.repairStatus === "in_progress" ? "repair_in_progress"
      : patch.repairStatus === "scheduled" ? "repair_scheduled"
        : report.status);

  const next = await updateHydrantDamageReport(departmentId, reportId, {
    utilityWorkOrderNumber: patch.utilityWorkOrderNumber ?? report.utilityWorkOrderNumber,
    repairStatus: patch.repairStatus || report.repairStatus,
    status: nextStatus,
    repairTargetAt: patch.repairTargetAt || patch.estimatedRepairAt || report.repairTargetAt,
    utilityFacingNotes: patch.utilityNotes
      ? `${report.utilityFacingNotes || ""}\n[Update] ${patch.utilityNotes}`.trim()
      : report.utilityFacingNotes,
    _reason: "utility_repair_update",
  }, actor);

  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.utility_update",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: patch,
  });
  return next;
}
