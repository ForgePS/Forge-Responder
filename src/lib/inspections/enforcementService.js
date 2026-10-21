import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import {
  createInspection,
  getInspectionRecord,
} from "./inspectionWorkflow.js";
import { listInspectionTypes } from "./inspectionConfigService.js";
import {
  escalateViolation,
  listViolations,
  normalizeViolationRecord,
} from "./violationService.js";
import {
  DEFAULT_REINSPECTION_FEE,
  STARTER_ENFORCEMENT_SETTINGS,
} from "./enforcementDefaults.js";
import {
  INSPECTION_APPEALS_COLLECTION,
  INSPECTION_CITATIONS_COLLECTION,
  INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION,
  INSPECTION_ENFORCEMENT_ORDERS_COLLECTION,
  INSPECTION_REINSPECTIONS_COLLECTION,
  INSPECTIONS_COLLECTION,
  VIOLATIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "ENF") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

async function nextNumber(departmentId, collectionName, prefix) {
  const rows = await listRecords(departmentId, collectionName);
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(rows.length + 1).padStart(4, "0")}`;
}

export function normalizeReinspectionRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reinspectionNumber: data.reinspectionNumber || data.id || "",
    originalInspectionId: data.originalInspectionId || "",
    originalInspectionNumber: data.originalInspectionNumber || "",
    newInspectionId: data.newInspectionId || "",
    newInspectionNumber: data.newInspectionNumber || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    attemptNumber: Number(data.attemptNumber) || 1,
    status: data.status || "scheduled",
    scheduledAt: data.scheduledAt || "",
    completedAt: data.completedAt || "",
    noAccessAt: data.noAccessAt || "",
    noAccessNotes: data.noAccessNotes || "",
    carriedForwardViolationIds: Array.isArray(data.carriedForwardViolationIds)
      ? data.carriedForwardViolationIds
      : [],
    feeAmount: Number(data.feeAmount) || DEFAULT_REINSPECTION_FEE,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeEnforcementOrder(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    orderNumber: data.orderNumber || data.id || "",
    orderTypeId: data.orderTypeId || "fire_watch",
    title: data.title || "",
    status: data.status || "draft",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    violationId: data.violationId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    effectiveAt: data.effectiveAt || "",
    expiresAt: data.expiresAt || "",
    liftedAt: data.liftedAt || "",
    requirements: data.requirements || "",
    internalNotes: data.internalNotes || "",
    issuedBy: data.issuedBy || "",
    issuedByName: data.issuedByName || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export function normalizeCitation(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    citationNumber: data.citationNumber || data.id || "",
    status: data.status || "draft",
    inspectionId: data.inspectionId || "",
    violationId: data.violationId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    codeCitation: data.codeCitation || "",
    description: data.description || "",
    fineAmount: Number(data.fineAmount) || 0,
    dueAt: data.dueAt || "",
    servedAt: data.servedAt || "",
    issuedAt: data.issuedAt || "",
    issuedBy: data.issuedBy || "",
    issuedByName: data.issuedByName || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export function normalizeAppeal(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    appealNumber: data.appealNumber || data.id || "",
    status: data.status || "filed",
    citationId: data.citationId || "",
    citationNumber: data.citationNumber || "",
    orderId: data.orderId || "",
    orderNumber: data.orderNumber || "",
    inspectionId: data.inspectionId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    appellantName: data.appellantName || "",
    grounds: data.grounds || "",
    hearingAt: data.hearingAt || "",
    hearingLocation: data.hearingLocation || "",
    decision: data.decision || "",
    decisionNotes: data.decisionNotes || "",
    decidedAt: data.decidedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeCorrectionSubmission(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    status: data.status || "submitted",
    violationId: data.violationId || "",
    inspectionId: data.inspectionId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    submittedByName: data.submittedByName || "",
    submittedByRole: data.submittedByRole || "responsible_party",
    explanation: data.explanation || "",
    evidenceNotes: data.evidenceNotes || "",
    extensionRequested: Boolean(data.extensionRequested),
    reinspectionRequested: Boolean(data.reinspectionRequested),
    reviewNotes: data.reviewNotes || "",
    reviewedBy: data.reviewedBy || "",
    reviewedByName: data.reviewedByName || "",
    reviewedAt: data.reviewedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export async function listReinspections(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_REINSPECTIONS_COLLECTION);
  let list = rows.map((row) => normalizeReinspectionRecord(row, departmentId));
  if (filters.originalInspectionId) {
    list = list.filter((row) => row.originalInspectionId === filters.originalInspectionId);
  }
  if (filters.occupancyId) list = list.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.openOnly) {
    list = list.filter((row) => !["completed", "cancelled"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function listEnforcementOrders(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_ENFORCEMENT_ORDERS_COLLECTION);
  let list = rows.map((row) => normalizeEnforcementOrder(row, departmentId));
  if (filters.inspectionId) list = list.filter((row) => row.inspectionId === filters.inspectionId);
  if (filters.violationId) list = list.filter((row) => row.violationId === filters.violationId);
  if (filters.activeOnly) {
    list = list.filter((row) => ["issued", "active"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function listCitations(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_CITATIONS_COLLECTION);
  let list = rows.map((row) => normalizeCitation(row, departmentId));
  if (filters.violationId) list = list.filter((row) => row.violationId === filters.violationId);
  if (filters.inspectionId) list = list.filter((row) => row.inspectionId === filters.inspectionId);
  if (filters.openOnly) {
    list = list.filter((row) => !["paid", "dismissed", "void"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function listAppeals(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_APPEALS_COLLECTION);
  let list = rows.map((row) => normalizeAppeal(row, departmentId));
  if (filters.openOnly) {
    list = list.filter((row) => !["closed", "withdrawn", "upheld", "overturned", "modified"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function listCorrectionSubmissions(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION);
  let list = rows.map((row) => normalizeCorrectionSubmission(row, departmentId));
  if (filters.violationId) list = list.filter((row) => row.violationId === filters.violationId);
  if (filters.openOnly) {
    list = list.filter((row) => ["submitted", "under_review", "more_info_requested"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

/**
 * Schedule a reinspection from an original inspection — creates a linked inspection
 * and carries forward open violation IDs.
 */
export async function scheduleReinspection(departmentId, originalInspectionId, payload = {}, audit = {}) {
  if (!originalInspectionId) throw new Error("Original inspection required.");
  const original = await getInspectionRecord(departmentId, originalInspectionId);
  if (!original) throw new Error("Inspection not found.");

  const types = await listInspectionTypes(departmentId);
  const reinspectionType = types.find((row) => /reinspect/i.test(row.id) || /reinspect/i.test(row.name))
    || types.find((row) => row.id === payload.inspectionTypeId)
    || types[0];
  if (!reinspectionType) throw new Error("No inspection type available for reinspection.");

  const openViolations = await listViolations(departmentId, {
    inspectionId: originalInspectionId,
    openOnly: true,
  });

  const existingAttempts = await listReinspections(departmentId, { originalInspectionId });
  const attemptNumber = existingAttempts.length + 1;

  const scheduledAt = payload.scheduledAt || "";
  const newInspection = await createInspection(departmentId, {
    occupancyId: original.occupancyId,
    inspectionTypeId: reinspectionType.id,
    scheduledStart: scheduledAt,
    priority: payload.priority || original.priority || "high",
    assignedInspectorIds: payload.assignedInspectorIds || original.assignedInspectorIds,
    assignedInspectorNames: payload.assignedInspectorNames || original.assignedInspectorNames,
    internalNotes: [
      `Reinspection of ${original.inspectionNumber} (attempt ${attemptNumber}).`,
      openViolations.length ? `Carrying forward ${openViolations.length} open violation(s).` : "",
      payload.notes || "",
    ].filter(Boolean).join(" "),
  }, audit);

  // Mark source linkage on the new inspection record
  await updateRecord(departmentId, INSPECTIONS_COLLECTION, newInspection.id, {
    ...newInspection,
    parentInspectionId: original.id,
    parentInspectionNumber: original.inspectionNumber,
    isReinspection: true,
    reinspectionAttempt: attemptNumber,
    updatedAt: nowIso(),
  });

  for (const violation of openViolations) {
    const next = normalizeViolationRecord({
      ...violation,
      status: "reinspection_scheduled",
      updatedAt: nowIso(),
    }, departmentId);
    await updateRecord(departmentId, VIOLATIONS_COLLECTION, violation.id, next);
  }

  const stamp = nowIso();
  const id = newId("REI");
  const reinspectionNumber = await nextNumber(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, "REI");
  const record = normalizeReinspectionRecord({
    id,
    departmentId,
    reinspectionNumber,
    originalInspectionId: original.id,
    originalInspectionNumber: original.inspectionNumber,
    newInspectionId: newInspection.id,
    newInspectionNumber: newInspection.inspectionNumber,
    occupancyId: original.occupancyId,
    occupancyName: original.occupancyName,
    address: original.address,
    attemptNumber,
    status: scheduledAt ? "scheduled" : "scheduled",
    scheduledAt,
    carriedForwardViolationIds: openViolations.map((row) => row.id),
    feeAmount: Number.isFinite(Number(payload.feeAmount))
      ? Number(payload.feeAmount)
      : STARTER_ENFORCEMENT_SETTINGS.defaultReinspectionFee,
    notes: payload.notes || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "reinspection",
    recordId: id,
    summary: `Scheduled reinspection ${reinspectionNumber} from ${original.inspectionNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { reinspection: record, inspection: { ...newInspection, parentInspectionId: original.id } };
}

export async function markReinspectionNoAccess(departmentId, reinspectionId, notes = "", audit = {}) {
  const existing = normalizeReinspectionRecord(
    await getRecord(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, reinspectionId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Reinspection not found.");
  const stamp = nowIso();
  const next = normalizeReinspectionRecord({
    ...existing,
    status: "no_access",
    noAccessAt: stamp,
    noAccessNotes: notes,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, reinspectionId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "reinspection_no_access",
    recordId: reinspectionId,
    summary: `No access on ${next.reinspectionNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function completeReinspectionAttempt(departmentId, reinspectionId, audit = {}) {
  const existing = normalizeReinspectionRecord(
    await getRecord(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, reinspectionId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Reinspection not found.");
  const stamp = nowIso();
  const next = normalizeReinspectionRecord({
    ...existing,
    status: "completed",
    completedAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_REINSPECTIONS_COLLECTION, reinspectionId, next);
  return next;
}

export async function createEnforcementOrder(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const stamp = nowIso();
  const id = newId("ORD");
  const orderNumber = await nextNumber(
    departmentId,
    INSPECTION_ENFORCEMENT_ORDERS_COLLECTION,
    STARTER_ENFORCEMENT_SETTINGS.orderNumberPrefix
  );
  const record = normalizeEnforcementOrder({
    id,
    departmentId,
    orderNumber,
    orderTypeId: payload.orderTypeId || "fire_watch",
    title: payload.title || "",
    status: payload.status || "draft",
    inspectionId: payload.inspectionId || "",
    inspectionNumber: payload.inspectionNumber || "",
    violationId: payload.violationId || "",
    occupancyId: payload.occupancyId || "",
    occupancyName: payload.occupancyName || "",
    address: payload.address || "",
    effectiveAt: payload.effectiveAt || stamp.slice(0, 10),
    expiresAt: payload.expiresAt || "",
    requirements: payload.requirements || "",
    internalNotes: payload.internalNotes || "",
    issuedBy: audit.actorUid || "",
    issuedByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, INSPECTION_ENFORCEMENT_ORDERS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Created enforcement order ${orderNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function updateEnforcementOrder(departmentId, orderId, patch = {}, audit = {}) {
  const existing = normalizeEnforcementOrder(
    await getRecord(departmentId, INSPECTION_ENFORCEMENT_ORDERS_COLLECTION, orderId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Order not found.");
  const stamp = nowIso();
  const next = normalizeEnforcementOrder({
    ...existing,
    ...patch,
    id: orderId,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_ENFORCEMENT_ORDERS_COLLECTION, orderId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "update",
    recordId: orderId,
    summary: `Updated order ${next.orderNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function issueEnforcementOrder(departmentId, orderId, audit = {}) {
  return updateEnforcementOrder(departmentId, orderId, {
    status: "active",
    effectiveAt: nowIso().slice(0, 10),
  }, audit);
}

export async function liftEnforcementOrder(departmentId, orderId, audit = {}) {
  return updateEnforcementOrder(departmentId, orderId, {
    status: "lifted",
    liftedAt: nowIso(),
  }, audit);
}

export async function createCitation(departmentId, payload = {}, audit = {}) {
  const stamp = nowIso();
  const id = newId("CIT");
  const citationNumber = await nextNumber(
    departmentId,
    INSPECTION_CITATIONS_COLLECTION,
    STARTER_ENFORCEMENT_SETTINGS.citationNumberPrefix
  );
  const record = normalizeCitation({
    id,
    departmentId,
    citationNumber,
    status: payload.status || "draft",
    inspectionId: payload.inspectionId || "",
    violationId: payload.violationId || "",
    occupancyId: payload.occupancyId || "",
    occupancyName: payload.occupancyName || "",
    address: payload.address || "",
    codeCitation: payload.codeCitation || "",
    description: payload.description || "",
    fineAmount: payload.fineAmount || 0,
    dueAt: payload.dueAt || "",
    notes: payload.notes || "",
    issuedBy: audit.actorUid || "",
    issuedByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, INSPECTION_CITATIONS_COLLECTION, id, record);

  if (payload.violationId) {
    try {
      await escalateViolation(departmentId, payload.violationId, audit);
    } catch {
      // non-blocking
    }
  }

  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Created citation ${citationNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function updateCitation(departmentId, citationId, patch = {}, audit = {}) {
  const existing = normalizeCitation(
    await getRecord(departmentId, INSPECTION_CITATIONS_COLLECTION, citationId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Citation not found.");
  const stamp = nowIso();
  const next = normalizeCitation({
    ...existing,
    ...patch,
    id: citationId,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_CITATIONS_COLLECTION, citationId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "update",
    recordId: citationId,
    summary: `Updated citation ${next.citationNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function issueCitation(departmentId, citationId, audit = {}) {
  return updateCitation(departmentId, citationId, {
    status: "issued",
    issuedAt: nowIso(),
  }, audit);
}

export async function createAppeal(departmentId, payload = {}, audit = {}) {
  const stamp = nowIso();
  const id = newId("APL");
  const appealNumber = await nextNumber(
    departmentId,
    INSPECTION_APPEALS_COLLECTION,
    STARTER_ENFORCEMENT_SETTINGS.appealNumberPrefix
  );
  const record = normalizeAppeal({
    id,
    departmentId,
    appealNumber,
    status: "filed",
    citationId: payload.citationId || "",
    citationNumber: payload.citationNumber || "",
    orderId: payload.orderId || "",
    orderNumber: payload.orderNumber || "",
    inspectionId: payload.inspectionId || "",
    occupancyId: payload.occupancyId || "",
    occupancyName: payload.occupancyName || "",
    address: payload.address || "",
    appellantName: payload.appellantName || "",
    grounds: payload.grounds || "",
    hearingAt: payload.hearingAt || "",
    hearingLocation: payload.hearingLocation || "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);
  await createRecord(departmentId, INSPECTION_APPEALS_COLLECTION, id, record);

  if (payload.citationId) {
    try {
      await updateCitation(departmentId, payload.citationId, { status: "appealed" }, audit);
    } catch {
      // non-blocking
    }
  }

  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Filed appeal ${appealNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function updateAppeal(departmentId, appealId, patch = {}, audit = {}) {
  const existing = normalizeAppeal(
    await getRecord(departmentId, INSPECTION_APPEALS_COLLECTION, appealId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Appeal not found.");
  const stamp = nowIso();
  const next = normalizeAppeal({
    ...existing,
    ...patch,
    id: appealId,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_APPEALS_COLLECTION, appealId, next);
  return next;
}

export async function decideAppeal(departmentId, appealId, decision, notes = "", audit = {}) {
  const stamp = nowIso();
  return updateAppeal(departmentId, appealId, {
    status: decision,
    decision,
    decisionNotes: notes,
    decidedAt: stamp,
  }, audit);
}

/**
 * Staff-mediated correction submission (public portal deferred).
 */
export async function submitCorrection(departmentId, payload = {}, audit = {}) {
  if (!payload.violationId) throw new Error("Violation required.");
  const violations = await listViolations(departmentId, {});
  const violation = violations.find((row) => row.id === payload.violationId);
  if (!violation) throw new Error("Violation not found.");

  const stamp = nowIso();
  const id = newId("COR");
  const record = normalizeCorrectionSubmission({
    id,
    departmentId,
    status: "submitted",
    violationId: violation.id,
    inspectionId: violation.inspectionId || "",
    occupancyId: violation.occupancyId || "",
    occupancyName: violation.occupancyName || "",
    address: violation.address || "",
    submittedByName: payload.submittedByName || audit.actorName || "",
    submittedByRole: payload.submittedByRole || "responsible_party",
    explanation: payload.explanation || "",
    evidenceNotes: payload.evidenceNotes || "",
    extensionRequested: Boolean(payload.extensionRequested),
    reinspectionRequested: Boolean(payload.reinspectionRequested),
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION, id, record);

  const nextViolation = normalizeViolationRecord({
    ...violation,
    status: "corrective_action_submitted",
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, VIOLATIONS_COLLECTION, violation.id, nextViolation);

  await writeInspectionAuditLog(departmentId, {
    action: "correction_submit",
    recordId: id,
    summary: `Correction submitted for violation ${violation.name || violation.id}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { submission: record, violation: nextViolation };
}

export async function reviewCorrection(departmentId, submissionId, payload = {}, audit = {}) {
  const existing = normalizeCorrectionSubmission(
    await getRecord(departmentId, INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION, submissionId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Correction submission not found.");

  const stamp = nowIso();
  const status = payload.status || "under_review";
  const next = normalizeCorrectionSubmission({
    ...existing,
    status,
    reviewNotes: payload.reviewNotes || existing.reviewNotes,
    reviewedBy: audit.actorUid || "",
    reviewedByName: audit.actorName || "",
    reviewedAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_CORRECTION_SUBMISSIONS_COLLECTION, submissionId, next);

  if (existing.violationId && (status === "accepted" || status === "rejected" || status === "more_info_requested")) {
    const violations = await listViolations(departmentId, {});
    const violation = violations.find((row) => row.id === existing.violationId);
    if (violation) {
      let violationStatus = violation.status;
      if (status === "accepted" && STARTER_ENFORCEMENT_SETTINGS.allowRemoteCloseOnAcceptedEvidence) {
        violationStatus = "closed";
      } else if (status === "rejected" || status === "more_info_requested") {
        violationStatus = "open";
      } else if (status === "reinspection_requested") {
        violationStatus = "reinspection_scheduled";
      }
      const patched = normalizeViolationRecord({
        ...violation,
        status: violationStatus,
        closedAt: violationStatus === "closed" ? stamp : violation.closedAt,
        closedBy: violationStatus === "closed" ? audit.actorName || "" : violation.closedBy,
        closureNotes: status === "accepted"
          ? (payload.reviewNotes || "Closed on accepted correction evidence.")
          : violation.closureNotes,
        updatedAt: stamp,
      }, departmentId);
      await updateRecord(departmentId, VIOLATIONS_COLLECTION, violation.id, patched);
    }
  }

  return next;
}

export function buildEnforcementBoardMetrics({
  reinspections = [],
  orders = [],
  citations = [],
  appeals = [],
  corrections = [],
} = {}) {
  return {
    reinspectionsOpen: reinspections.filter((row) => !["completed", "cancelled"].includes(row.status)).length,
    ordersActive: orders.filter((row) => ["issued", "active"].includes(row.status)).length,
    citationsOpen: citations.filter((row) => !["paid", "dismissed", "void"].includes(row.status)).length,
    appealsOpen: appeals.filter((row) => !["closed", "withdrawn", "upheld", "overturned", "modified"].includes(row.status)).length,
    correctionsPending: corrections.filter((row) => ["submitted", "under_review", "more_info_requested"].includes(row.status)).length,
  };
}

export async function loadEnforcementBoard(departmentId) {
  if (!departmentId) {
    return {
      reinspections: [],
      orders: [],
      citations: [],
      appeals: [],
      corrections: [],
      metrics: buildEnforcementBoardMetrics(),
    };
  }
  const [reinspections, orders, citations, appeals, corrections] = await Promise.all([
    listReinspections(departmentId),
    listEnforcementOrders(departmentId),
    listCitations(departmentId),
    listAppeals(departmentId),
    listCorrectionSubmissions(departmentId),
  ]);
  return {
    reinspections: reinspections,
    orders,
    citations,
    appeals,
    corrections,
    metrics: buildEnforcementBoardMetrics({
      reinspections: reinspections,
      orders,
      citations,
      appeals,
      corrections,
    }),
  };
}
