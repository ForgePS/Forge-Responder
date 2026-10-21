import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { getInspectionRecord } from "./inspectionWorkflow.js";
import { listViolations } from "./violationService.js";
import {
  STARTER_DOCUMENT_TEMPLATES,
} from "./noticeDefaults.js";
import { printNoticeRecord } from "./noticePrint.js";
import {
  INSPECTION_CERTIFICATES_COLLECTION,
  INSPECTION_DOCUMENT_TEMPLATES_COLLECTION,
  INSPECTION_NOTICES_COLLECTION,
  INSPECTION_NOTICE_DELIVERIES_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "NTC") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeDocumentTemplate(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    documentTypeId: data.documentTypeId || "inspection_report",
    name: String(data.name || "Untitled template").trim(),
    letterheadTitle: data.letterheadTitle || "Fire Prevention Bureau",
    letterheadSubtitle: data.letterheadSubtitle || "",
    introText: data.introText || "",
    bodySections: Array.isArray(data.bodySections) ? data.bodySections : [],
    closingText: data.closingText || "",
    footerText: data.footerText || "",
    isCertificate: Boolean(data.isCertificate),
    active: data.active !== false,
    version: Number(data.version) || 1,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeInspectionNotice(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    noticeNumber: data.noticeNumber || data.id || "",
    documentTypeId: data.documentTypeId || "inspection_report",
    templateId: data.templateId || "",
    templateSnapshot: data.templateSnapshot || null,
    title: data.title || "",
    status: data.status || "draft",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    violationId: data.violationId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    recipientName: data.recipientName || "",
    recipientEmail: data.recipientEmail || "",
    recipientPhone: data.recipientPhone || "",
    inspectorName: data.inspectorName || "",
    summary: data.summary || "",
    correctiveAction: data.correctiveAction || "",
    dueAt: data.dueAt || "",
    issuedAt: data.issuedAt || "",
    violationsSnapshot: Array.isArray(data.violationsSnapshot) ? data.violationsSnapshot : [],
    mergeValues: data.mergeValues && typeof data.mergeValues === "object" ? data.mergeValues : {},
    certificateId: data.certificateId || "",
    lastDeliveryId: data.lastDeliveryId || "",
    lastDeliveryStatus: data.lastDeliveryStatus || "",
    lastDeliveryChannel: data.lastDeliveryChannel || "",
    version: Number(data.version) || 1,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeInspectionCertificate(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    certificateNumber: data.certificateNumber || data.id || "",
    noticeId: data.noticeId || "",
    documentTypeId: data.documentTypeId || "certificate_of_inspection",
    title: data.title || "Certificate",
    status: data.status || "issued",
    inspectionId: data.inspectionId || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    issuedAt: data.issuedAt || "",
    issuedBy: data.issuedBy || "",
    issuedByName: data.issuedByName || "",
    summary: data.summary || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeNoticeDelivery(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    noticeId: data.noticeId || "",
    channel: data.channel || "print",
    status: data.status || "draft",
    recipientName: data.recipientName || "",
    recipientAddress: data.recipientAddress || "",
    recipientEmail: data.recipientEmail || "",
    recipientPhone: data.recipientPhone || "",
    provider: data.provider || "",
    messageId: data.messageId || "",
    trackingNumber: data.trackingNumber || "",
    resultNotes: data.resultNotes || "",
    sentAt: data.sentAt || "",
    openedAt: data.openedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export async function listDocumentTemplates(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION);
  return rows
    .map((row) => normalizeDocumentTemplate(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureDocumentTemplatesSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  let templates = await listDocumentTemplates(departmentId);
  if (templates.length) return templates;

  const stamp = nowIso();
  for (const starter of STARTER_DOCUMENT_TEMPLATES) {
    const item = normalizeDocumentTemplate({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION, item.id, item);
    templates.push(item);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "seed",
    recordId: "inspection-document-templates",
    summary: `Seeded ${templates.length} document templates`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return templates;
}

export async function saveDocumentTemplate(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || newId("IDT");
  const existing = payload.id
    ? normalizeDocumentTemplate(
      await getRecord(departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION, id) || {},
      departmentId
    )
    : null;
  const stamp = nowIso();
  const record = normalizeDocumentTemplate({
    ...(existing || {}),
    ...payload,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    version: (existing?.version || 0) + 1,
  }, departmentId);

  if (existing?.id) {
    await updateRecord(departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_DOCUMENT_TEMPLATES_COLLECTION, id, record);
  }

  await writeInspectionAuditLog(departmentId, {
    action: existing ? "update" : "create",
    recordId: id,
    summary: `Document template ${record.name}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function listInspectionNotices(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_NOTICES_COLLECTION);
  let list = rows.map((row) => normalizeInspectionNotice(row, departmentId));
  if (filters.inspectionId) list = list.filter((row) => row.inspectionId === filters.inspectionId);
  if (filters.violationId) list = list.filter((row) => row.violationId === filters.violationId);
  if (filters.occupancyId) list = list.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.status) {
    list = list.filter((row) => String(row.status).toLowerCase() === String(filters.status).toLowerCase());
  }
  if (filters.openOnly) {
    list = list.filter((row) => !["void", "superseded"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function getInspectionNotice(departmentId, noticeId) {
  if (!departmentId || !noticeId) return null;
  const row = await getRecord(departmentId, INSPECTION_NOTICES_COLLECTION, noticeId);
  return row ? normalizeInspectionNotice(row, departmentId) : null;
}

export async function listInspectionCertificates(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_CERTIFICATES_COLLECTION);
  let list = rows.map((row) => normalizeInspectionCertificate(row, departmentId));
  if (filters.noticeId) list = list.filter((row) => row.noticeId === filters.noticeId);
  if (filters.inspectionId) list = list.filter((row) => row.inspectionId === filters.inspectionId);
  return list.sort((a, b) => String(b.issuedAt || b.createdAt).localeCompare(String(a.issuedAt || a.createdAt)));
}

export async function listNoticeDeliveries(departmentId, noticeId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_NOTICE_DELIVERIES_COLLECTION);
  return rows
    .map((row) => normalizeNoticeDelivery(row, departmentId))
    .filter((row) => !noticeId || row.noticeId === noticeId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function nextNoticeNumber(departmentId) {
  const existing = await listInspectionNotices(departmentId);
  const year = new Date().getFullYear();
  return `NTC-${year}-${String(existing.length + 1).padStart(4, "0")}`;
}

async function nextCertificateNumber(departmentId) {
  const existing = await listInspectionCertificates(departmentId);
  const year = new Date().getFullYear();
  return `CRT-${year}-${String(existing.length + 1).padStart(4, "0")}`;
}

function snapshotViolations(rows = []) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name || "",
    codeCitation: row.codeCitation || "",
    severity: row.severity || "",
    status: row.status || "",
    description: row.description || "",
    correctiveAction: row.correctiveAction || "",
    dueAt: row.dueAt || "",
  }));
}

/**
 * @param {string} departmentId
 * @param {object} payload
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createInspectionNotice(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const templates = await ensureDocumentTemplatesSeeded(departmentId, audit);
  const templateId = payload.templateId || templates[0]?.id || "";
  const template = templates.find((row) => row.id === templateId) || templates[0] || null;
  if (!template) throw new Error("No document template available.");

  const stamp = nowIso();
  const id = payload.id || newId("NTC");
  const noticeNumber = payload.noticeNumber || await nextNoticeNumber(departmentId);

  const record = normalizeInspectionNotice({
    id,
    departmentId,
    noticeNumber,
    documentTypeId: payload.documentTypeId || template.documentTypeId,
    templateId: template.id,
    templateSnapshot: template,
    title: payload.title || template.name,
    status: payload.status || "draft",
    inspectionId: payload.inspectionId || "",
    inspectionNumber: payload.inspectionNumber || "",
    violationId: payload.violationId || "",
    occupancyId: payload.occupancyId || "",
    occupancyName: payload.occupancyName || "",
    address: payload.address || "",
    recipientName: payload.recipientName || "",
    recipientEmail: payload.recipientEmail || "",
    recipientPhone: payload.recipientPhone || "",
    inspectorName: payload.inspectorName || audit.actorName || "",
    summary: payload.summary || "",
    correctiveAction: payload.correctiveAction || "",
    dueAt: payload.dueAt || "",
    issuedAt: "",
    violationsSnapshot: Array.isArray(payload.violationsSnapshot) ? payload.violationsSnapshot : [],
    mergeValues: payload.mergeValues || {},
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_NOTICES_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Created notice ${noticeNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function updateInspectionNotice(departmentId, noticeId, patch = {}, audit = {}) {
  const existing = await getInspectionNotice(departmentId, noticeId);
  if (!existing) throw new Error("Notice not found.");
  const stamp = nowIso();
  const next = normalizeInspectionNotice({
    ...existing,
    ...patch,
    id: noticeId,
    departmentId,
    updatedAt: stamp,
    version: (existing.version || 1) + 1,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_NOTICES_COLLECTION, noticeId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "update",
    recordId: noticeId,
    summary: `Updated notice ${next.noticeNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function generateNoticeFromInspection(departmentId, inspectionId, payload = {}, audit = {}) {
  if (!inspectionId) throw new Error("Inspection required.");
  const inspection = await getInspectionRecord(departmentId, inspectionId);
  if (!inspection) throw new Error("Inspection not found.");

  const templates = await ensureDocumentTemplatesSeeded(departmentId, audit);
  const preferredType = payload.documentTypeId || "inspection_report";
  const template = templates.find((row) => row.id === payload.templateId)
    || templates.find((row) => row.documentTypeId === preferredType)
    || templates[0];

  const violations = await listViolations(departmentId, { inspectionId });
  return createInspectionNotice(departmentId, {
    templateId: template?.id,
    documentTypeId: template?.documentTypeId || preferredType,
    inspectionId: inspection.id,
    inspectionNumber: inspection.inspectionNumber || "",
    occupancyId: inspection.occupancyId || "",
    occupancyName: inspection.occupancyName || "",
    address: inspection.address || "",
    inspectorName: inspection.assignedInspectorNames?.[0] || audit.actorName || "",
    summary: payload.summary || inspection.summary || inspection.result || "",
    recipientName: payload.recipientName || "",
    violationsSnapshot: snapshotViolations(violations),
    ...payload,
  }, audit);
}

export async function generateNoticeFromViolation(departmentId, violationId, payload = {}, audit = {}) {
  if (!violationId) throw new Error("Violation required.");
  const violations = await listViolations(departmentId, {});
  const violation = violations.find((row) => row.id === violationId);
  if (!violation) throw new Error("Violation not found.");

  const templates = await ensureDocumentTemplatesSeeded(departmentId, audit);
  const preferredType = payload.documentTypeId || "notice_of_violation";
  const template = templates.find((row) => row.id === payload.templateId)
    || templates.find((row) => row.documentTypeId === preferredType)
    || templates[0];

  let related = [violation];
  if (violation.inspectionId) {
    const all = await listViolations(departmentId, { inspectionId: violation.inspectionId, openOnly: true });
    if (all.length) related = all;
  }

  return createInspectionNotice(departmentId, {
    templateId: template?.id,
    documentTypeId: template?.documentTypeId || preferredType,
    inspectionId: violation.inspectionId || "",
    inspectionNumber: violation.inspectionNumber || "",
    violationId: violation.id,
    occupancyId: violation.occupancyId || "",
    occupancyName: violation.occupancyName || "",
    address: violation.address || "",
    inspectorName: violation.inspectorName || audit.actorName || "",
    summary: payload.summary || violation.description || violation.name || "",
    correctiveAction: payload.correctiveAction || violation.correctiveAction || "",
    dueAt: payload.dueAt || violation.dueAt || "",
    recipientName: payload.recipientName || violation.responsibleParty || "",
    violationsSnapshot: snapshotViolations(related),
    ...payload,
  }, audit);
}

export async function issueInspectionNotice(departmentId, noticeId, audit = {}) {
  const stamp = nowIso();
  return updateInspectionNotice(departmentId, noticeId, {
    status: "issued",
    issuedAt: stamp,
  }, audit);
}

/**
 * Issue a certificate record from a notice (typically certificate templates).
 */
export async function issueCertificateFromNotice(departmentId, noticeId, audit = {}) {
  const notice = await getInspectionNotice(departmentId, noticeId);
  if (!notice) throw new Error("Notice not found.");

  const stamp = nowIso();
  const id = newId("CRT");
  const certificateNumber = await nextCertificateNumber(departmentId);
  const certificate = normalizeInspectionCertificate({
    id,
    departmentId,
    certificateNumber,
    noticeId: notice.id,
    documentTypeId: notice.documentTypeId?.includes("compliance")
      ? "certificate_of_compliance"
      : (notice.documentTypeId || "certificate_of_inspection"),
    title: notice.title || "Certificate",
    status: "issued",
    inspectionId: notice.inspectionId || "",
    occupancyId: notice.occupancyId || "",
    occupancyName: notice.occupancyName || "",
    address: notice.address || "",
    issuedAt: stamp,
    issuedBy: audit.actorUid || "",
    issuedByName: audit.actorName || "",
    summary: notice.summary || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, INSPECTION_CERTIFICATES_COLLECTION, id, certificate);

  let nextNotice = notice;
  if (notice.status === "draft" || notice.status === "ready") {
    nextNotice = await issueInspectionNotice(departmentId, noticeId, audit);
  }
  nextNotice = await updateInspectionNotice(departmentId, noticeId, {
    certificateId: id,
    status: nextNotice.status === "draft" ? "issued" : nextNotice.status,
  }, audit);

  await writeInspectionAuditLog(departmentId, {
    action: "issue",
    recordId: id,
    summary: `Issued certificate ${certificateNumber} from ${notice.noticeNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { certificate, notice: nextNotice };
}

/**
 * Record a delivery attempt. Outbound email/SMS are stubbed as sent_stub.
 */
export async function recordNoticeDelivery(departmentId, noticeId, payload = {}, audit = {}) {
  const notice = await getInspectionNotice(departmentId, noticeId);
  if (!notice) throw new Error("Notice not found.");

  const channel = payload.channel || "print";
  let status = payload.status || "";
  if (!status) {
    if (channel === "print") status = "printed";
    else if (channel === "in_person") status = "in_person";
    else if (channel === "email" || channel === "sms") status = "sent_stub";
    else status = "queued";
  }

  const stamp = nowIso();
  const id = newId("DLV");
  const delivery = normalizeNoticeDelivery({
    id,
    departmentId,
    noticeId,
    channel,
    status,
    recipientName: payload.recipientName || notice.recipientName || "",
    recipientAddress: payload.recipientAddress || notice.address || "",
    recipientEmail: payload.recipientEmail || notice.recipientEmail || "",
    recipientPhone: payload.recipientPhone || notice.recipientPhone || "",
    provider: payload.provider || (status === "sent_stub" ? "stub" : ""),
    messageId: payload.messageId || "",
    trackingNumber: payload.trackingNumber || "",
    resultNotes: payload.resultNotes
      || (status === "sent_stub"
        ? "Outbound provider not wired — delivery recorded as stub."
        : ""),
    sentAt: ["sent_stub", "printed", "in_person"].includes(status) ? stamp : "",
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  await createRecord(departmentId, INSPECTION_NOTICE_DELIVERIES_COLLECTION, id, delivery);

  const nextNotice = await updateInspectionNotice(departmentId, noticeId, {
    lastDeliveryId: id,
    lastDeliveryStatus: status,
    lastDeliveryChannel: channel,
    status: ["printed", "in_person", "sent_stub"].includes(status) ? "delivered" : notice.status,
    issuedAt: notice.issuedAt || stamp,
  }, audit);

  if (channel === "print" && payload.openPrint !== false) {
    printNoticeRecord(nextNotice, { departmentName: payload.departmentName });
  }

  return { delivery, notice: nextNotice };
}

export function buildNoticeQueueMetrics(notices = [], certificates = []) {
  const list = Array.isArray(notices) ? notices : [];
  const certs = Array.isArray(certificates) ? certificates : [];
  return {
    total: list.length,
    draft: list.filter((row) => row.status === "draft").length,
    issued: list.filter((row) => ["issued", "delivered"].includes(row.status)).length,
    delivered: list.filter((row) => row.status === "delivered").length,
    certificates: certs.length,
  };
}
