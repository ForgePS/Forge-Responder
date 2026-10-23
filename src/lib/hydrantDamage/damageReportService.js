import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeHydrantDamageAudit } from "./audit.js";
import {
  DAMAGE_EMAIL_STATUSES,
  DAMAGE_OPERATIONAL_STATUSES,
  DAMAGE_QUEUE_VIEWS,
  DAMAGE_REPAIR_STATUSES,
  DAMAGE_REPORT_STATUSES,
  DAMAGE_SEVERITIES,
  STARTER_DAMAGE_CATEGORIES,
  labelForDamageStatus,
  labelForSeverity,
} from "./defaults.js";
import { HYDRANT_DAMAGE_REPORTS_COLLECTION } from "./paths.js";
import { enqueueOwnershipReview, resolveOwnershipForHydrant } from "./waterDistrictService.js";
import { getRecordLatLng } from "./geo.js";
import { getSlaSnapshot } from "./slaHelpers.js";
import { isOutOfServiceHydrant } from "../hydrantCompletionStats.js";

function nowIso() {
  return new Date().toISOString();
}

function newReportId() {
  return `HDR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function newReportNumber() {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  return `HDR-${y}${m}${d}-${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeDamageReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const status = data.status || "draft";
  const severity = data.severity || "moderate";
  const operationalStatus = data.operationalStatus || "unknown";
  const emailStatus = data.emailStatus || "not_sent";
  const repairStatus = data.repairStatus || "not_reviewed";
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reportNumber: data.reportNumber || data.id || "",
    hydrantId: data.hydrantId || "",
    hydrantLabel: data.hydrantLabel || "",
    hydrantAddress: data.hydrantAddress || "",
    waterCompanyId: data.waterCompanyId || "",
    waterCompanyName: data.waterCompanyName || "",
    waterDistrictId: data.waterDistrictId || "",
    waterDistrictName: data.waterDistrictName || "",
    ownershipCandidates: Array.isArray(data.ownershipCandidates) ? data.ownershipCandidates : [],
    ownershipReason: data.ownershipReason || "",
    assignmentSource: data.assignmentSource || "",
    assignmentConfidence: Number(data.assignmentConfidence) || 0,
    status,
    statusLabel: labelForDamageStatus(status),
    emailStatus,
    emailStatusLabel: DAMAGE_EMAIL_STATUSES.find((row) => row.id === emailStatus)?.label || emailStatus,
    repairStatus,
    repairStatusLabel: DAMAGE_REPAIR_STATUSES.find((row) => row.id === repairStatus)?.label || repairStatus,
    verificationStatus: data.verificationStatus || "not_started",
    severity,
    severityLabel: labelForSeverity(severity),
    operationalStatus,
    operationalStatusLabel: DAMAGE_OPERATIONAL_STATUSES.find((row) => row.id === operationalStatus)?.label || operationalStatus,
    damageCategoryIds: Array.isArray(data.damageCategoryIds) ? data.damageCategoryIds : [],
    discoveredAt: data.discoveredAt || "",
    discoveredBy: data.discoveredBy || "",
    sourceType: data.sourceType || "manual",
    sourceRecordId: data.sourceRecordId || "",
    description: String(data.description || "").trim(),
    suspectedCause: String(data.suspectedCause || "").trim(),
    immediateActions: String(data.immediateActions || "").trim(),
    leaking: Boolean(data.leaking),
    roadwayHazard: Boolean(data.roadwayHazard),
    publicSafetyHazard: Boolean(data.publicSafetyHazard),
    dispatchNotificationRequired: Boolean(data.dispatchNotificationRequired),
    alternativeWaterSupplyRequired: Boolean(data.alternativeWaterSupplyRequired),
    recipientSnapshot: Array.isArray(data.recipientSnapshot) ? data.recipientSnapshot : [],
    wizardStep: Number(data.wizardStep) || 1,
    internalNotes: String(data.internalNotes || "").trim(),
    utilityFacingNotes: String(data.utilityFacingNotes || "").trim(),
    sentAt: data.sentAt || "",
    sentBy: data.sentBy || "",
    providerMessageId: data.providerMessageId || "",
    acknowledgmentDueAt: data.acknowledgmentDueAt || "",
    acknowledgedAt: data.acknowledgedAt || "",
    utilityWorkOrderNumber: data.utilityWorkOrderNumber || "",
    repairTargetAt: data.repairTargetAt || "",
    repairCompletedAt: data.repairCompletedAt || "",
    verificationDueAt: data.verificationDueAt || "",
    verifiedAt: data.verifiedAt || "",
    verifiedBy: data.verifiedBy || "",
    closedAt: data.closedAt || "",
    acknowledgmentPortalUrl: data.acknowledgmentPortalUrl || "",
    acknowledgmentTokenExpiresAt: data.acknowledgmentTokenExpiresAt || "",
    slaPaused: Boolean(data.slaPaused),
    slaPauseReason: String(data.slaPauseReason || "").trim(),
    escalationHistory: Array.isArray(data.escalationHistory) ? data.escalationHistory : [],
    lastEscalatedAt: data.lastEscalatedAt || "",
    assignedUserIds: Array.isArray(data.assignedUserIds) ? data.assignedUserIds : [],
    attachmentIds: Array.isArray(data.attachmentIds) ? data.attachmentIds : [],
    recordVersion: Number(data.recordVersion) || 1,
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
    updatedAt: data.updatedAt || "",
    updatedBy: data.updatedBy || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listHydrantDamageReports(departmentId) {
  const rows = await listRecords(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION);
  return rows
    .map((row) => normalizeDamageReport(row, departmentId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 */
export async function getHydrantDamageReport(departmentId, reportId) {
  if (!reportId) return null;
  const row = await getRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId);
  return row ? normalizeDamageReport(row, departmentId) : null;
}

/**
 * @param {object[]} reports
 * @param {string} queueId
 */
export function filterDamageReportsByQueue(reports = [], queueId = "all") {
  const view = DAMAGE_QUEUE_VIEWS.find((row) => row.id === queueId) || DAMAGE_QUEUE_VIEWS.find((row) => row.id === "all");
  if (!view || view.id === "all") return reports;
  if (view.id === "overdue") {
    return reports.filter((row) => getSlaSnapshot(row).overdue);
  }
  if (!view.statuses?.length) return reports;
  return reports.filter((row) => view.statuses.includes(row.status));
}

/**
 * @param {string} departmentId
 * @param {{
 *   hydrant?: object,
 *   sourceType?: string,
 *   sourceRecordId?: string,
 *   description?: string,
 *   severity?: string,
 *   operationalStatus?: string,
 *   damageCategoryIds?: string[],
 * }} input
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function createHydrantDamageReport(departmentId, input = {}, actor = {}) {
  const hydrant = input.hydrant || {};
  // Field reports bring their own id so a retried sync can't create a duplicate.
  if (input.id) {
    const existing = await getHydrantDamageReport(departmentId, input.id);
    if (existing) return existing;
  }
  const resolution = await resolveOwnershipForHydrant(departmentId, hydrant);
  const ownershipNeeded = !resolution.company || resolution.requiresConfirmation;
  const id = input.id || newReportId();
  const reportNumber = input.reportNumber || newReportNumber();
  const severity = input.severity || "moderate";
  const severityMeta = DAMAGE_SEVERITIES.find((row) => row.id === severity);
  const company = resolution.company;
  const district = resolution.district;
  const acknowledgmentDueAt = company?.acknowledgmentSlaMinutes
    ? new Date(Date.now() + company.acknowledgmentSlaMinutes * 60_000).toISOString()
    : "";
  const repairTargetAt = company?.normalRepairSlaHours
    ? new Date(Date.now() + company.normalRepairSlaHours * 3_600_000).toISOString()
    : "";

  const recipients = [];
  if (company?.damageReportEmail) {
    recipients.push({
      email: company.damageReportEmail,
      name: company.legalName,
      role: "damage_report",
      required: true,
    });
  }
  if (severityMeta && severityMeta.rank >= 4 && company?.emergencyEmail) {
    recipients.push({
      email: company.emergencyEmail,
      name: `${company.legalName} (Emergency)`,
      role: "emergency",
      required: true,
    });
  }

  const coords = getRecordLatLng(hydrant);
  const draft = normalizeDamageReport({
    id,
    reportNumber,
    hydrantId: hydrant.location_id || hydrant.hydrant_id || hydrant.id || "",
    hydrantLabel: hydrant.location_id || hydrant.hydrant_id || hydrant.id || "Unknown hydrant",
    hydrantAddress: hydrant.address || hydrant.full_address || "",
    waterCompanyId: company?.id || "",
    waterCompanyName: company?.legalName || hydrant.provider || hydrant.water_assoc || "",
    waterDistrictId: district?.id || "",
    waterDistrictName: district?.name || "",
    ownershipCandidates: resolution.candidates || [],
    ownershipReason: resolution.reason || "",
    assignmentSource: resolution.source,
    assignmentConfidence: resolution.confidence,
    status: ownershipNeeded ? "ownership_review_required" : "draft",
    emailStatus: "not_sent",
    repairStatus: "not_reviewed",
    severity,
    operationalStatus: input.operationalStatus
      || (isOutOfServiceHydrant(hydrant) ? "out_of_service" : "unknown"),
    damageCategoryIds: input.damageCategoryIds || [],
    discoveredAt: input.discoveredAt || nowIso(),
    discoveredBy: actor.actorName || "User",
    sourceType: input.sourceType || "manual",
    sourceRecordId: input.sourceRecordId || "",
    description: input.description || "",
    ...(input.details && typeof input.details === "object" ? input.details : {}),
    recipientSnapshot: recipients,
    wizardStep: 1,
    acknowledgmentDueAt,
    repairTargetAt,
    createdAt: nowIso(),
    createdBy: actor.actorUid || "system",
    updatedBy: actor.actorUid || "system",
  }, departmentId);

  await createRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, id, draft);
  if (ownershipNeeded) {
    await enqueueOwnershipReview(departmentId, {
      hydrantId: draft.hydrantId,
      hydrantLabel: draft.hydrantLabel,
      hydrantAddress: draft.hydrantAddress,
      latitude: coords?.lat ?? null,
      longitude: coords?.lng ?? null,
      reportId: id,
      reason: resolution.reason || resolution.source || "unknown",
      candidates: resolution.candidates || [],
    }, actor);
  }
  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.created",
    entityType: "hydrantDamageReport",
    entityId: id,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    after: draft,
  });
  return draft;
}

/**
 * @param {string} departmentId
 * @param {string} reportId
 * @param {object} patch
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function updateHydrantDamageReport(departmentId, reportId, patch = {}, actor = {}) {
  const previous = await getHydrantDamageReport(departmentId, reportId);
  if (!previous) throw new Error("Damage report not found.");
  if (["sent", "awaiting_acknowledgment", "closed", "verified"].includes(previous.status)
    && patch.status === undefined
    && Object.keys(patch).some((key) => ![
      "internalNotes",
      "utilityFacingNotes",
      "wizardStep",
      "repairStatus",
      "verificationStatus",
      "utilityWorkOrderNumber",
      "escalationHistory",
      "lastEscalatedAt",
      "slaPaused",
      "slaPauseReason",
      "verificationDueAt",
      "verifiedAt",
      "verifiedBy",
      "closedAt",
      "acknowledgedAt",
      "repairCompletedAt",
      "repairTargetAt",
      "operationalStatus",
      "_reason",
    ].includes(key))) {
    // Allow limited edits after send; structural edits blocked until reopen/resend phases.
  }
  const next = normalizeDamageReport({
    ...previous,
    ...patch,
    id: reportId,
    recordVersion: previous.recordVersion + 1,
    updatedBy: actor.actorUid || "system",
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, HYDRANT_DAMAGE_REPORTS_COLLECTION, reportId, next);
  await writeHydrantDamageAudit(departmentId, {
    action: "damage_report.updated",
    entityType: "hydrantDamageReport",
    entityId: reportId,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
    before: previous,
    after: next,
    reason: patch._reason || "",
  });
  return next;
}

/**
 * Mark report ready to send. Actual email send uses sendHydrantDamageReport (Cloud Function).
 * @param {string} departmentId
 * @param {string} reportId
 * @param {{ actorUid?: string, actorName?: string }} [actor]
 */
export async function markDamageReportReadyToSend(departmentId, reportId, actor = {}) {
  const report = await getHydrantDamageReport(departmentId, reportId);
  if (!report) throw new Error("Damage report not found.");
  if (report.status === "ownership_review_required") {
    throw new Error("Confirm water company ownership before sending.");
  }
  if (!report.waterCompanyId && !report.recipientSnapshot?.length) {
    throw new Error("Assign a water company or recipients before sending.");
  }
  if (!report.description?.trim()) {
    throw new Error("Add a damage description before sending.");
  }
  return updateHydrantDamageReport(departmentId, reportId, {
    status: "ready_to_send",
    wizardStep: 8,
  }, actor);
}

export function getDamageCategoryOptions() {
  return STARTER_DAMAGE_CATEGORIES;
}

export function getDamageSeverityOptions() {
  return DAMAGE_SEVERITIES;
}

export function getDamageOperationalStatusOptions() {
  return DAMAGE_OPERATIONAL_STATUSES;
}

export function getDamageReportStatusOptions() {
  return DAMAGE_REPORT_STATUSES;
}

export function getDamageQueueViews() {
  return DAMAGE_QUEUE_VIEWS;
}
