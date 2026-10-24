import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { getInspectionRecord } from "./inspectionWorkflow.js";
import { listCodeSections, listLocalAmendments } from "./codeLibraryService.js";
import {
  VIOLATIONS_COLLECTION,
  VIOLATION_CATALOG_COLLECTION,
} from "./paths.js";
import {
  DEFAULT_VIOLATION_WORKFLOW_STATUSES,
  STARTER_VIOLATION_CATALOG,
} from "./violationDefaults.js";

function nowIso() {
  return new Date().toISOString();
}

function addDaysIso(days = 14) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export function normalizeViolationCatalogItem(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled violation").trim(),
    category: data.category || "General",
    codeSectionId: data.codeSectionId || "",
    codeCitation: data.codeCitation || "",
    localAmendmentId: data.localAmendmentId || "",
    inspectorDescription: data.inspectorDescription || "",
    publicDescription: data.publicDescription || "",
    correctiveAction: data.correctiveAction || "",
    severity: data.severity || "moderate",
    riskScore: Number(data.riskScore) || 0,
    standardCorrectionDays: Number.isFinite(Number(data.standardCorrectionDays))
      ? Number(data.standardCorrectionDays)
      : 14,
    immediateHazard: Boolean(data.immediateHazard),
    photoRequired: Boolean(data.photoRequired),
    reinspectionRequired: Boolean(data.reinspectionRequired),
    fee: Number(data.fee) || 0,
    dailyPenalty: Number(data.dailyPenalty) || 0,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    active: data.active !== false,
    version: Number(data.version) || 1,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export function normalizeViolationRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    address: data.address || "",
    catalogItemId: data.catalogItemId || "",
    catalogSnapshot: data.catalogSnapshot || null,
    codeSetId: data.codeSetId || "",
    codeSectionId: data.codeSectionId || "",
    codeCitation: data.codeCitation || "",
    codeSectionSnapshot: data.codeSectionSnapshot || null,
    publicationId: data.publicationId || "",
    edition: data.edition || "",
    sectionNumber: data.sectionNumber || "",
    sectionTitle: data.sectionTitle || "",
    citedText: data.citedText || "",
    codeNodeId: data.codeNodeId || "",
    adoptedProfileId: data.adoptedProfileId || "",
    amendmentIds: Array.isArray(data.amendmentIds) ? data.amendmentIds.map(String) : [],
    citedAt: data.citedAt || "",
    localAmendmentId: data.localAmendmentId || "",
    localAmendmentSnapshot: data.localAmendmentSnapshot || null,
    name: data.name || "",
    category: data.category || "",
    description: data.description || "",
    publicDescription: data.publicDescription || "",
    correctiveAction: data.correctiveAction || "",
    severity: data.severity || "moderate",
    immediateHazard: Boolean(data.immediateHazard),
    locationOnProperty: data.locationOnProperty || "",
    responsibleParty: data.responsibleParty || "",
    observedAt: data.observedAt || "",
    inspectorId: data.inspectorId || "",
    inspectorName: data.inspectorName || "",
    status: data.status || "open",
    dueAt: data.dueAt || "",
    extensionHistory: Array.isArray(data.extensionHistory) ? data.extensionHistory : [],
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    correctionEvidence: Array.isArray(data.correctionEvidence) ? data.correctionEvidence : [],
    closedAt: data.closedAt || "",
    closedBy: data.closedBy || "",
    closureNotes: data.closureNotes || "",
    fee: Number(data.fee) || 0,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

export async function listViolationCatalog(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, VIOLATION_CATALOG_COLLECTION);
  return rows
    .map((row) => normalizeViolationCatalogItem(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function listViolations(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, VIOLATIONS_COLLECTION);
  let list = rows.map((row) => normalizeViolationRecord(row, departmentId));
  if (filters.inspectionId) list = list.filter((row) => row.inspectionId === filters.inspectionId);
  if (filters.occupancyId) list = list.filter((row) => row.occupancyId === filters.occupancyId);
  if (filters.openOnly) {
    list = list.filter((row) => !["closed", "dismissed"].includes(String(row.status || "").toLowerCase()));
  }
  if (filters.status) {
    list = list.filter((row) => String(row.status).toLowerCase() === String(filters.status).toLowerCase());
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureViolationCatalogSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listViolationCatalog(departmentId);
  if (existing.length) return existing;

  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_VIOLATION_CATALOG) {
    const item = normalizeViolationCatalogItem({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, VIOLATION_CATALOG_COLLECTION, item.id, item);
    created.push(item);
  }

  await writeInspectionAuditLog(departmentId, {
    action: "seed",
    recordId: "violation-catalog",
    summary: `Seeded ${created.length} violation catalog items`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return created;
}

export async function saveViolationCatalogItem(departmentId, record = {}, audit = {}) {
  const normalized = normalizeViolationCatalogItem(record, departmentId);
  if (!normalized.id) normalized.id = `vc-${Date.now().toString(36)}`;
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  const exists = (await listViolationCatalog(departmentId)).some((row) => row.id === normalized.id);
  if (exists) {
    normalized.version = Number(normalized.version || 1) + 1;
    await updateRecord(departmentId, VIOLATION_CATALOG_COLLECTION, normalized.id, normalized);
  } else {
    await createRecord(departmentId, VIOLATION_CATALOG_COLLECTION, normalized.id, normalized);
  }
  await writeInspectionAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} violation catalog item ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Create a violation from catalog (and optional inspection context).
 * Snapshots catalog/code/amendment wording at issuance time.
 */
export async function createViolation(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  if (!input.catalogItemId && !input.name) throw new Error("Catalog item or name is required");
  if (input.id) {
    const existing = await getRecord(departmentId, VIOLATIONS_COLLECTION, input.id);
    if (existing) return normalizeViolationRecord(existing, departmentId);
  }

  const [catalog, sections, amendments] = await Promise.all([
    listViolationCatalog(departmentId),
    listCodeSections(departmentId),
    listLocalAmendments(departmentId),
  ]);

  const catalogItem = catalog.find((row) => row.id === input.catalogItemId) || null;
  const section = sections.find((row) => row.id === (input.codeSectionId || catalogItem?.codeSectionId)) || null;
  const amendment = amendments.find((row) => row.id === (input.localAmendmentId || catalogItem?.localAmendmentId || section?.localAmendmentId)) || null;

  let inspection = null;
  if (input.inspectionId) {
    inspection = await getInspectionRecord(departmentId, input.inspectionId);
  }

  const correctionDays = Number(input.standardCorrectionDays
    ?? catalogItem?.standardCorrectionDays
    ?? section?.defaultCorrectionDays
    ?? 14);
  const stamp = nowIso();
  // Field app violations bring their own id so a retried sync can't duplicate them.
  const id = input.id || `VIO-${Date.now().toString(36).toUpperCase()}`;

  const record = normalizeViolationRecord({
    id,
    departmentId,
    inspectionId: inspection?.id || input.inspectionId || "",
    inspectionNumber: inspection?.inspectionNumber || "",
    occupancyId: inspection?.occupancyId || input.occupancyId || "",
    occupancyName: inspection?.occupancyName || input.occupancyName || "",
    address: inspection?.address || input.address || "",
    catalogItemId: catalogItem?.id || "",
    catalogSnapshot: catalogItem ? {
      id: catalogItem.id,
      name: catalogItem.name,
      version: catalogItem.version,
      severity: catalogItem.severity,
      correctiveAction: catalogItem.correctiveAction,
      publicDescription: catalogItem.publicDescription,
    } : null,
    codeSetId: section?.codeSetId || "",
    codeSectionId: section?.id || catalogItem?.codeSectionId || "",
    codeCitation: input.codeCitation || catalogItem?.codeCitation || section?.section || input.sectionNumber || "",
    codeSectionSnapshot: section ? {
      id: section.id,
      section: section.section,
      title: section.title,
      summary: section.shortInspectorSummary,
    } : (input.codeNodeId || input.sectionNumber) ? {
      id: input.codeNodeId || "",
      section: input.sectionNumber || input.codeCitation || "",
      title: input.sectionTitle || "",
      summary: String(input.citedText || "").slice(0, 280),
    } : null,
    publicationId: input.publicationId || "",
    edition: input.edition || "",
    sectionNumber: input.sectionNumber || section?.section || "",
    sectionTitle: input.sectionTitle || section?.title || "",
    citedText: input.citedText || "",
    codeNodeId: input.codeNodeId || "",
    adoptedProfileId: input.adoptedProfileId || "",
    amendmentIds: Array.isArray(input.amendmentIds) ? input.amendmentIds : [],
    citedAt: input.citedAt || stamp,
    localAmendmentId: amendment?.id || "",
    localAmendmentSnapshot: amendment ? {
      id: amendment.id,
      title: amendment.title,
      summary: amendment.summary,
      ordinanceReference: amendment.ordinanceReference,
    } : null,
    name: input.name || catalogItem?.name || "Violation",
    category: input.category || catalogItem?.category || "",
    description: input.description || catalogItem?.inspectorDescription || section?.tenantDescription || "",
    publicDescription: input.publicDescription || catalogItem?.publicDescription || "",
    correctiveAction: input.correctiveAction || catalogItem?.correctiveAction || section?.defaultCorrectiveAction || "",
    severity: input.severity || catalogItem?.severity || section?.defaultSeverity || "moderate",
    immediateHazard: Boolean(input.immediateHazard ?? catalogItem?.immediateHazard),
    locationOnProperty: input.locationOnProperty || "",
    responsibleParty: input.responsibleParty || inspection?.occupancySnapshot?.primaryContactName || "",
    observedAt: input.observedAt || stamp,
    inspectorId: audit.actorUid || "",
    inspectorName: audit.actorName || "Inspector",
    status: "open",
    dueAt: input.dueAt || addDaysIso(correctionDays),
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    fee: Number(input.fee ?? catalogItem?.fee) || 0,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, VIOLATIONS_COLLECTION, id, record);

  if (inspection?.id) {
    const openCount = (await listViolations(departmentId, { inspectionId: inspection.id, openOnly: true })).length;
    await updateRecord(departmentId, "inspections", inspection.id, {
      openViolationCount: openCount,
      totalViolationCount: (Number(inspection.totalViolationCount) || 0) + 1,
      updatedAt: stamp,
    });
  }

  await writeInspectionAuditLog(departmentId, {
    action: "create",
    recordId: id,
    summary: `Issued violation ${record.name}${record.inspectionNumber ? ` on ${record.inspectionNumber}` : ""}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return record;
}

export async function extendViolationDeadline(departmentId, violationId, {
  dueAt,
  reason = "",
} = {}, audit = {}) {
  if (!dueAt) throw new Error("New due date is required");
  const existing = (await listViolations(departmentId)).find((row) => row.id === violationId);
  if (!existing) throw new Error("Violation not found");
  if (["closed", "dismissed"].includes(existing.status)) {
    throw new Error("Closed violations cannot be extended.");
  }

  const stamp = nowIso();
  const extensionHistory = [
    {
      at: stamp,
      previousDueAt: existing.dueAt,
      dueAt,
      reason,
      actorName: audit.actorName || "User",
    },
    ...(existing.extensionHistory || []),
  ];

  const next = normalizeViolationRecord({
    ...existing,
    dueAt,
    extensionHistory,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, VIOLATIONS_COLLECTION, violationId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "extend",
    recordId: violationId,
    summary: `Extended violation deadline to ${dueAt}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function addViolationEvidence(departmentId, violationId, evidenceItem = {}, audit = {}) {
  const existing = (await listViolations(departmentId)).find((row) => row.id === violationId);
  if (!existing) throw new Error("Violation not found");

  const stamp = nowIso();
  const item = {
    id: evidenceItem.id || `ev-${Date.now().toString(36)}`,
    type: evidenceItem.type || "note",
    label: evidenceItem.label || "Evidence",
    url: evidenceItem.url || "",
    notes: evidenceItem.notes || "",
    addedAt: stamp,
    addedBy: audit.actorName || "User",
  };
  const next = normalizeViolationRecord({
    ...existing,
    evidence: [item, ...(existing.evidence || [])],
    status: existing.status === "open" && evidenceItem.asCorrection
      ? "corrective_action_submitted"
      : existing.status,
    correctionEvidence: evidenceItem.asCorrection
      ? [item, ...(existing.correctionEvidence || [])]
      : existing.correctionEvidence,
    updatedAt: stamp,
  }, departmentId);

  await updateRecord(departmentId, VIOLATIONS_COLLECTION, violationId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "evidence",
    recordId: violationId,
    summary: `Added evidence to violation ${existing.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function closeViolation(departmentId, violationId, {
  status = "closed",
  closureNotes = "",
} = {}, audit = {}) {
  const allowed = ["closed", "dismissed"];
  if (!allowed.includes(status)) throw new Error("Invalid closure status");
  const existing = (await listViolations(departmentId)).find((row) => row.id === violationId);
  if (!existing) throw new Error("Violation not found");

  const stamp = nowIso();
  const next = normalizeViolationRecord({
    ...existing,
    status,
    closedAt: stamp,
    closedBy: audit.actorName || "User",
    closureNotes,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, VIOLATIONS_COLLECTION, violationId, next);

  if (existing.inspectionId) {
    const openCount = (await listViolations(departmentId, {
      inspectionId: existing.inspectionId,
      openOnly: true,
    })).length;
    await updateRecord(departmentId, "inspections", existing.inspectionId, {
      openViolationCount: openCount,
      updatedAt: stamp,
    });
  }

  await writeInspectionAuditLog(departmentId, {
    action: "close",
    recordId: violationId,
    summary: `${status === "dismissed" ? "Dismissed" : "Closed"} violation ${existing.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function escalateViolation(departmentId, violationId, audit = {}) {
  const existing = (await listViolations(departmentId)).find((row) => row.id === violationId);
  if (!existing) throw new Error("Violation not found");
  const next = normalizeViolationRecord({
    ...existing,
    status: "escalated",
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, VIOLATIONS_COLLECTION, violationId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "escalate",
    recordId: violationId,
    summary: `Escalated violation ${existing.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export function getDefaultViolationStatuses() {
  return [...DEFAULT_VIOLATION_WORKFLOW_STATUSES];
}
