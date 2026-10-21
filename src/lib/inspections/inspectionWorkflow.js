import { createRecord, getRecord, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { listInspectionRecords } from "./inspectionRecords.js";
import { loadInspectionSettings } from "./inspectionSettings.js";
import {
  listInspectionTemplates,
  listInspectionTypes,
  listTemplateVersions,
} from "./inspectionConfigService.js";
import { listOccupancyRecords } from "./occupancyService.js";
import { INSPECTIONS_COLLECTION } from "./paths.js";

const OPEN_STATUSES = new Set([
  "draft",
  "scheduled",
  "in_progress",
  "awaiting_approval",
  "overdue",
]);

const RESULT_OPTIONS = [
  "Passed",
  "Passed with conditions",
  "Failed",
  "Incomplete",
  "Unable to inspect",
  "No access",
  "Business closed",
  "Cancelled",
  "Reinspection required",
  "Immediate action required",
];

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "INS") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeInspectionWorkflowRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    inspectionNumber: data.inspectionNumber || data.id || "",
    inspectionTypeId: data.inspectionTypeId || "",
    inspectionTypeSnapshot: data.inspectionTypeSnapshot || null,
    templateId: data.templateId || "",
    templateVersionId: data.templateVersionId || "",
    templateSnapshot: data.templateSnapshot || null,
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    occupancySnapshot: data.occupancySnapshot || null,
    status: data.status || "draft",
    workflowStage: data.workflowStage || data.status || "draft",
    priority: data.priority || "normal",
    riskLevel: data.riskLevel || "",
    assignedInspectorIds: Array.isArray(data.assignedInspectorIds) ? data.assignedInspectorIds.filter(Boolean) : [],
    assignedInspectorNames: Array.isArray(data.assignedInspectorNames) ? data.assignedInspectorNames : [],
    supervisorId: data.supervisorId || "",
    scheduledStart: data.scheduledStart || "",
    scheduledEnd: data.scheduledEnd || "",
    dueAt: data.dueAt || data.scheduledStart || "",
    startedAt: data.startedAt || "",
    completedAt: data.completedAt || "",
    approvedAt: data.approvedAt || "",
    result: data.result || "",
    summary: data.summary || "",
    internalNotes: data.internalNotes || "",
    answers: data.answers && typeof data.answers === "object" ? data.answers : {},
    openViolationCount: Number(data.openViolationCount) || 0,
    totalViolationCount: Number(data.totalViolationCount) || 0,
    reinspectionRequired: Boolean(data.reinspectionRequired),
    nextReinspectionAt: data.nextReinspectionAt || "",
    feeTotal: Number(data.feeTotal) || 0,
    balanceDue: Number(data.balanceDue) || 0,
    recordVersion: Number(data.recordVersion) || 1,
    lockedAt: data.lockedAt || "",
    historicalSnapshot: data.historicalSnapshot || null,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    updatedBy: data.updatedBy || "",
    completedBy: data.completedBy || "",
    approvedBy: data.approvedBy || "",
  };
}

export function getInspectionResultOptions() {
  return [...RESULT_OPTIONS];
}

/**
 * @param {string} departmentId
 * @param {import("./types.js").InspectionSettings} [settings]
 */
export async function allocateInspectionNumber(departmentId, settings = null) {
  const resolved = settings || await loadInspectionSettings(departmentId);
  const prefix = resolved?.numbering?.prefix || "INS";
  const separator = resolved?.numbering?.separator ?? "-";
  const padding = Number(resolved?.numbering?.sequencePadding) || 4;
  const year = new Date().getFullYear();
  const existing = await listInspectionRecords(departmentId, { max: 1000 });
  const sequence = existing.length + 1;
  const padded = String(sequence).padStart(padding, "0");
  return `${prefix}${separator}${year}${separator}${padded}`;
}

function buildEmptyAnswers(templateSnapshot) {
  const answers = {};
  const sections = Array.isArray(templateSnapshot?.sections) ? templateSnapshot.sections : [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (field?.key) answers[field.key] = "";
    }
  }
  return answers;
}

function countFailedAnswers(answers = {}, templateSnapshot = null) {
  const failValues = new Set(["fail", "failed", "noncompliant", "no"]);
  let count = 0;
  const sections = Array.isArray(templateSnapshot?.sections) ? templateSnapshot.sections : [];
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (!field?.autoCreateViolation) continue;
      const value = String(answers[field.key] || "").toLowerCase();
      if (failValues.has(value)) count += 1;
    }
  }
  return count;
}

function assertEditable(record) {
  if (record.lockedAt || record.status === "archived") {
    throw new Error("This inspection is locked and cannot be edited.");
  }
}

/**
 * @param {string} departmentId
 * @param {object} input
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createInspection(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  if (!input.occupancyId) throw new Error("Occupancy is required");
  if (!input.inspectionTypeId) throw new Error("Inspection type is required");

  const [settings, types, templates, occupancies] = await Promise.all([
    loadInspectionSettings(departmentId),
    listInspectionTypes(departmentId),
    listInspectionTemplates(departmentId),
    listOccupancyRecords(departmentId),
  ]);

  const inspectionType = types.find((row) => row.id === input.inspectionTypeId);
  if (!inspectionType) throw new Error("Inspection type not found");

  const occupancy = occupancies.find((row) => row.id === input.occupancyId);
  if (!occupancy) throw new Error("Occupancy not found");

  let template = templates.find((row) => row.id === (input.templateId || inspectionType.defaultTemplateId));
  if (!template) {
    template = templates.find((row) => row.inspectionTypeId === inspectionType.id) || null;
  }

  let templateSnapshot = null;
  let templateVersionId = "";
  if (template?.publishedVersionId) {
    const versions = await listTemplateVersions(departmentId, template.id);
    const published = versions.find((row) => row.id === template.publishedVersionId) || versions[0];
    if (published?.snapshot) {
      templateSnapshot = published.snapshot;
      templateVersionId = published.id;
    }
  }
  if (!templateSnapshot && template) {
    templateSnapshot = {
      name: template.name,
      description: template.description,
      inspectionTypeId: template.inspectionTypeId,
      sections: template.sections,
    };
  }

  const stamp = nowIso();
  const id = newId("INS");
  const inspectionNumber = await allocateInspectionNumber(departmentId, settings);
  const assignees = Array.isArray(input.assignedInspectorIds)
    ? input.assignedInspectorIds.filter(Boolean)
    : (input.assignedInspectorId ? [input.assignedInspectorId] : []);

  const record = normalizeInspectionWorkflowRecord({
    id,
    departmentId,
    inspectionNumber,
    inspectionTypeId: inspectionType.id,
    inspectionTypeSnapshot: {
      id: inspectionType.id,
      label: inspectionType.name,
      version: inspectionType.version || 1,
      category: inspectionType.category,
      publishedAt: stamp,
    },
    templateId: template?.id || "",
    templateVersionId,
    templateSnapshot,
    occupancyId: occupancy.id,
    occupancyName: occupancy.name,
    address: occupancy.address || "",
    occupancySnapshot: {
      id: occupancy.id,
      name: occupancy.name,
      address: occupancy.address,
      occupancyType: occupancy.occupancyType || occupancy.type,
      hazard: occupancy.hazard || occupancy.riskLevel,
      primaryContactName: occupancy.primaryContactName,
      primaryContactPhone: occupancy.primaryContactPhone,
    },
    status: input.scheduledStart ? "scheduled" : "draft",
    workflowStage: input.scheduledStart ? "scheduled" : "draft",
    priority: input.priority || "normal",
    riskLevel: occupancy.hazard || occupancy.riskLevel || "",
    assignedInspectorIds: assignees,
    assignedInspectorNames: Array.isArray(input.assignedInspectorNames) ? input.assignedInspectorNames : [],
    scheduledStart: input.scheduledStart || "",
    scheduledEnd: input.scheduledEnd || "",
    dueAt: input.dueAt || input.scheduledStart || "",
    answers: buildEmptyAnswers(templateSnapshot),
    feeTotal: Number(inspectionType.feeAmount) || 0,
    balanceDue: Number(inspectionType.feeAmount) || 0,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorName || "User",
    updatedBy: audit.actorName || "User",
    internalNotes: input.internalNotes || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTIONS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Created inspection ${inspectionNumber} for ${occupancy.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

export async function getInspectionRecord(departmentId, inspectionId) {
  if (!departmentId || !inspectionId) return null;
  const row = await getRecord(departmentId, INSPECTIONS_COLLECTION, inspectionId);
  return row ? normalizeInspectionWorkflowRecord(row, departmentId) : null;
}

async function saveInspectionPatch(departmentId, inspectionId, patch, audit = {}, summary = "Updated inspection") {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  assertEditable(existing);

  const next = normalizeInspectionWorkflowRecord({
    ...existing,
    ...patch,
    id: existing.id,
    departmentId,
    updatedAt: nowIso(),
    updatedBy: audit.actorName || existing.updatedBy || "User",
    recordVersion: Number(existing.recordVersion || 1) + 1,
  }, departmentId);

  await updateRecord(departmentId, INSPECTIONS_COLLECTION, inspectionId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "update",
    recordId: inspectionId,
    summary,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
    after: { status: next.status, workflowStage: next.workflowStage },
  }).catch(() => null);

  return next;
}

export async function assignInspection(departmentId, inspectionId, {
  assignedInspectorIds = [],
  assignedInspectorNames = [],
} = {}, audit = {}) {
  return saveInspectionPatch(departmentId, inspectionId, {
    assignedInspectorIds,
    assignedInspectorNames,
  }, audit, "Assigned inspectors");
}

export async function scheduleInspection(departmentId, inspectionId, {
  scheduledStart = "",
  scheduledEnd = "",
  dueAt = "",
} = {}, audit = {}) {
  const status = scheduledStart ? "scheduled" : "draft";
  return saveInspectionPatch(departmentId, inspectionId, {
    scheduledStart,
    scheduledEnd,
    dueAt: dueAt || scheduledStart,
    status,
    workflowStage: status,
  }, audit, "Scheduled inspection");
}

export async function startInspection(departmentId, inspectionId, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  assertEditable(existing);
  if (existing.status === "completed") throw new Error("Completed inspections cannot be started again. Reopen first.");

  return saveInspectionPatch(departmentId, inspectionId, {
    status: "in_progress",
    workflowStage: "in_progress",
    startedAt: existing.startedAt || nowIso(),
  }, audit, "Started inspection");
}

export async function saveInspectionDraft(departmentId, inspectionId, {
  answers = {},
  summary = "",
  internalNotes = "",
  result = "",
  reinspectionRequired = false,
  nextReinspectionAt = "",
} = {}, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  assertEditable(existing);
  if (!OPEN_STATUSES.has(existing.status) && existing.status !== "awaiting_approval") {
    throw new Error("Only open inspections can be saved as drafts.");
  }

  const mergedAnswers = { ...(existing.answers || {}), ...answers };
  const failCount = countFailedAnswers(mergedAnswers, existing.templateSnapshot);

  return saveInspectionPatch(departmentId, inspectionId, {
    answers: mergedAnswers,
    summary: summary !== undefined ? summary : existing.summary,
    internalNotes: internalNotes !== undefined ? internalNotes : existing.internalNotes,
    result: result !== undefined ? result : existing.result,
    reinspectionRequired,
    nextReinspectionAt,
    openViolationCount: failCount,
    totalViolationCount: Math.max(Number(existing.totalViolationCount) || 0, failCount),
    status: existing.status === "draft" || existing.status === "scheduled" ? "in_progress" : existing.status,
    workflowStage: existing.status === "draft" || existing.status === "scheduled" ? "in_progress" : existing.workflowStage,
    startedAt: existing.startedAt || nowIso(),
  }, audit, "Saved inspection draft");
}

export async function completeInspection(departmentId, inspectionId, {
  answers = {},
  summary = "",
  result = "Passed",
  reinspectionRequired = false,
  nextReinspectionAt = "",
  requireApproval = false,
} = {}, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  assertEditable(existing);

  const mergedAnswers = { ...(existing.answers || {}), ...answers };
  const failCount = countFailedAnswers(mergedAnswers, existing.templateSnapshot);
  const stamp = nowIso();
  const nextStatus = requireApproval ? "awaiting_approval" : "completed";

  const historicalSnapshot = {
    capturedAt: stamp,
    inspectionTypeSnapshot: existing.inspectionTypeSnapshot,
    templateSnapshot: existing.templateSnapshot,
    occupancySnapshot: existing.occupancySnapshot,
    answers: mergedAnswers,
    result,
    summary,
  };

  return saveInspectionPatch(departmentId, inspectionId, {
    answers: mergedAnswers,
    summary,
    result,
    reinspectionRequired: reinspectionRequired || /reinspection/i.test(result),
    nextReinspectionAt,
    openViolationCount: failCount,
    totalViolationCount: Math.max(Number(existing.totalViolationCount) || 0, failCount),
    status: nextStatus,
    workflowStage: nextStatus,
    completedAt: stamp,
    completedBy: audit.actorName || "User",
    historicalSnapshot,
    lockedAt: requireApproval ? "" : stamp,
  }, audit, requireApproval ? "Completed inspection (awaiting approval)" : "Completed inspection");
}

export async function approveInspection(departmentId, inspectionId, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  if (existing.status !== "awaiting_approval" && existing.status !== "completed") {
    throw new Error("Only completed or awaiting-approval inspections can be approved.");
  }
  const stamp = nowIso();
  const next = normalizeInspectionWorkflowRecord({
    ...existing,
    status: "completed",
    workflowStage: "completed",
    approvedAt: stamp,
    approvedBy: audit.actorName || "User",
    lockedAt: stamp,
    updatedAt: stamp,
    updatedBy: audit.actorName || "User",
    recordVersion: Number(existing.recordVersion || 1) + 1,
  }, departmentId);
  await updateRecord(departmentId, INSPECTIONS_COLLECTION, inspectionId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "approve",
    recordId: inspectionId,
    summary: `Approved inspection ${existing.inspectionNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function reopenInspection(departmentId, inspectionId, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  if (existing.status === "archived") throw new Error("Archived inspections cannot be reopened.");

  const next = normalizeInspectionWorkflowRecord({
    ...existing,
    status: "in_progress",
    workflowStage: "in_progress",
    lockedAt: "",
    approvedAt: "",
    completedAt: "",
    updatedAt: nowIso(),
    updatedBy: audit.actorName || "User",
    recordVersion: Number(existing.recordVersion || 1) + 1,
  }, departmentId);
  await updateRecord(departmentId, INSPECTIONS_COLLECTION, inspectionId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "reopen",
    recordId: inspectionId,
    summary: `Reopened inspection ${existing.inspectionNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function archiveInspection(departmentId, inspectionId, audit = {}) {
  const existing = await getInspectionRecord(departmentId, inspectionId);
  if (!existing) throw new Error("Inspection not found");
  const next = normalizeInspectionWorkflowRecord({
    ...existing,
    status: "archived",
    workflowStage: "archived",
    lockedAt: existing.lockedAt || nowIso(),
    updatedAt: nowIso(),
    updatedBy: audit.actorName || "User",
    recordVersion: Number(existing.recordVersion || 1) + 1,
  }, departmentId);
  await updateRecord(departmentId, INSPECTIONS_COLLECTION, inspectionId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "archive",
    recordId: inspectionId,
    summary: `Archived inspection ${existing.inspectionNumber}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}
