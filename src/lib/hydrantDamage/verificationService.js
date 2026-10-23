import {
  createRecord,
  listRecords,
} from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import {
  VERIFICATION_RESULTS,
  VERIFICATION_TYPES,
} from "./defaults.js";
import { HYDRANT_REPAIR_VERIFICATIONS_COLLECTION } from "./paths.js";
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
export function normalizeVerification(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const result = data.result || "incomplete";
  const type = data.verificationType || "visual_inspection";
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reportId: data.reportId || "",
    verifiedAt: data.verifiedAt || "",
    verifiedBy: data.verifiedBy || "",
    verificationType: type,
    verificationTypeLabel: VERIFICATION_TYPES.find((row) => row.id === type)?.label || type,
    result,
    resultLabel: VERIFICATION_RESULTS.find((row) => row.id === result)?.label || result,
    hydrantCondition: String(data.hydrantCondition || "").trim(),
    opensAndCloses: data.opensAndCloses !== false,
    capsSecure: data.capsSecure !== false,
    leakageObserved: Boolean(data.leakageObserved),
    drainageOk: data.drainageOk !== false,
    accessible: data.accessible !== false,
    markingOk: data.markingOk !== false,
    staticPressure: data.staticPressure ?? "",
    residualPressure: data.residualPressure ?? "",
    flowGpm: data.flowGpm ?? "",
    notes: String(data.notes || "").trim(),
    newDefect: String(data.newDefect || "").trim(),
    returnToService: data.returnToService !== false,
    operationalStatusAfter: data.operationalStatusAfter || "in_service",
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
  };
}

export function getVerificationTypeOptions() {
  return VERIFICATION_TYPES;
}

export function getVerificationResultOptions() {
  return VERIFICATION_RESULTS;
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 */
export async function listVerificationsForReport(departmentId, reportId) {
  const rows = await listRecords(departmentId, HYDRANT_REPAIR_VERIFICATIONS_COLLECTION);
  return rows
    .map((row) => normalizeVerification(row, departmentId))
    .filter((row) => row.reportId === reportId)
    .sort((a, b) => String(b.verifiedAt || b.createdAt).localeCompare(String(a.verifiedAt || a.createdAt)));
}

/**
 * Mark repair complete and queue FD verification (utility completion does not auto-close).
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{ temporary?: boolean, notes?: string, verificationDueHours?: number }} [input]
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function markReadyForVerification(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  const hours = Number(input.verificationDueHours) || 48;
  const verificationDueAt = new Date(Date.now() + hours * 3_600_000).toISOString();
  const status = input.temporary ? "temporary_repair_completed" : "ready_for_verification";
  const next = await updateHydrantDamageReport(departmentId, reportId, {
    status,
    repairStatus: input.temporary ? "temporary_repair" : "completed",
    repairCompletedAt: nowIso(),
    verificationStatus: "pending",
    verificationDueAt,
    utilityFacingNotes: input.notes
      ? `${report.utilityFacingNotes || ""}\n[Ready for verification] ${input.notes}`.trim()
      : report.utilityFacingNotes,
    _reason: "ready_for_verification",
  }, actor);
  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.ready_for_verification",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return next;
}

/**
 * Submit FD verification. Passed results can close; failures reopen repair workflow.
 * @param {string} departmentId
 * @param {string} reportId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function submitHydrantDamageVerification(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  const allowed = [
    "ready_for_verification",
    "verification_scheduled",
    "repair_completed",
    "temporary_repair_completed",
    "verification_failed",
  ];
  if (!allowed.includes(report.status)) {
    throw new Error("Report is not in a verification-ready status.");
  }

  const result = input.result || "passed";
  const passed = result === "passed" || result === "passed_with_limitation" || result === "no_verification_required";
  const failed = ["failed", "further_repair_required", "unable_to_access", "incomplete", "flow_test_required"].includes(result);

  const id = newId("VER");
  const verifiedAt = nowIso();
  const verification = normalizeVerification({
    id,
    reportId,
    verifiedAt,
    verifiedBy: actor.actorName || input.verifiedBy || "Inspector",
    verificationType: input.verificationType || "visual_inspection",
    result,
    hydrantCondition: input.hydrantCondition || "",
    opensAndCloses: input.opensAndCloses !== false,
    capsSecure: input.capsSecure !== false,
    leakageObserved: Boolean(input.leakageObserved),
    drainageOk: input.drainageOk !== false,
    accessible: input.accessible !== false,
    markingOk: input.markingOk !== false,
    staticPressure: input.staticPressure ?? "",
    residualPressure: input.residualPressure ?? "",
    flowGpm: input.flowGpm ?? "",
    notes: input.notes || "",
    newDefect: input.newDefect || "",
    returnToService: input.returnToService !== false,
    operationalStatusAfter: input.operationalStatusAfter
      || (passed ? (result === "passed_with_limitation" ? "in_service_limited" : "in_service") : report.operationalStatus),
    createdAt: verifiedAt,
    createdBy: actor.actorUid || "system",
  }, departmentId);

  await createRecord(departmentId, HYDRANT_REPAIR_VERIFICATIONS_COLLECTION, id, verification);

  /** @type {Record<string, unknown>} */
  let patch = {
    verificationStatus: result,
    verifiedAt,
    verifiedBy: verification.verifiedBy,
    _reason: "verification_submitted",
  };

  if (passed) {
    patch = {
      ...patch,
      repairStatus: "completed",
      operationalStatus: verification.operationalStatusAfter,
      closedAt: verification.returnToService ? verifiedAt : "",
      status: verification.returnToService ? "closed" : "verified",
    };
  } else if (failed) {
    patch = {
      ...patch,
      status: result === "further_repair_required" || result === "failed"
        ? "verification_failed"
        : "returned_to_water_company",
      repairStatus: "further_repair_required",
      operationalStatus: input.operationalStatusAfter || report.operationalStatus || "out_of_service",
    };
  } else {
    patch.status = "verification_scheduled";
  }

  const next = await updateHydrantDamageReport(departmentId, reportId, patch, actor);
  await writeHydrantDamageAudit(departmentId, {
    action: passed ? "damage_report.verified" : "damage_report.verification_failed",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: { verificationId: id, result },
  });

  return { verification, report: next };
}

/**
 * Reopen a closed/verified report for further work.
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{ reason?: string }} [input]
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function reopenHydrantDamageReport(departmentId, reportId, input = {}, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  if (!["closed", "verified", "cancelled"].includes(report.status)) {
    throw new Error("Only closed or verified reports can be reopened.");
  }
  const next = await updateHydrantDamageReport(departmentId, reportId, {
    status: "reopened",
    verificationStatus: "reopened",
    closedAt: "",
    internalNotes: `${report.internalNotes || ""}\n[Reopened] ${input.reason || "Reopened for follow-up"}`.trim(),
    _reason: "reopened",
  }, actor);
  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.reopened",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    reason: input.reason || "",
  });
  return next;
}
