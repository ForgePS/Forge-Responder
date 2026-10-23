import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { getInspectionRecord } from "./inspectionWorkflow.js";
import { listOccupancyRecords } from "./occupancyService.js";
import {
  enqueuePreplanOfflineMutation,
  savePreplanLocalDraft,
} from "./preplanOfflineQueue.js";
import {
  DEFAULT_VERIFICATION_CYCLE_DAYS,
  PREPLAN_OPERATIONAL_VALIDITY,
  PREPLAN_PRIORITIES,
  STARTER_PREPLAN_TEMPLATES,
  STARTER_SYMBOL_LIBRARY,
  VERIFICATION_CHECKLIST_ITEMS,
  resolvePreplanStatus,
} from "./preplanDefaults.js";
import {
  PREPLANS_COLLECTION,
  PREPLAN_BUILDINGS_COLLECTION,
  PREPLAN_DIAGRAMS_COLLECTION,
  PREPLAN_FILES_COLLECTION,
  PREPLAN_REVISIONS_COLLECTION,
  PREPLAN_SYMBOL_LIBRARIES_COLLECTION,
  PREPLAN_TEMPLATES_COLLECTION,
  PREPLAN_TEMPLATE_VERSIONS_COLLECTION,
  PREPLAN_VERIFICATIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "PP") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function addDaysIso(days = DEFAULT_VERIFICATION_CYCLE_DAYS) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function emptySectionAnswers(sections = []) {
  const answers = {};
  for (const section of sections) {
    for (const field of section.fields || []) {
      answers[field.key] = "";
    }
  }
  return answers;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePreplanTemplate(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled template").trim(),
    preplanTypeId: data.preplanTypeId || "commercial",
    occupancyTypeIds: Array.isArray(data.occupancyTypeIds)
      ? data.occupancyTypeIds.map(String)
      : (data.occupancyTypeId ? [String(data.occupancyTypeId)] : []),
    description: data.description || "",
    sections: Array.isArray(data.sections) ? data.sections : [],
    active: data.active !== false,
    version: Number(data.version) || 1,
    publishedVersion: Number(data.publishedVersion) || 0,
    publishedAt: data.publishedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePreplanRevision(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    preplanId: data.preplanId || "",
    revisionNumber: Number(data.revisionNumber) || 1,
    status: data.status || "draft",
    templateId: data.templateId || "",
    templateVersion: Number(data.templateVersion) || Number(data.templateSnapshot?.version) || 0,
    templateSnapshot: data.templateSnapshot || null,
    sectionAnswers: data.sectionAnswers && typeof data.sectionAnswers === "object"
      ? data.sectionAnswers
      : {},
    accessPlan: data.accessPlan || "",
    waterSupply: data.waterSupply || "",
    fireProtection: data.fireProtection || "",
    utilities: data.utilities || "",
    hazards: data.hazards || "",
    tacticalPlan: data.tacticalPlan || "",
    dispatchSummary: data.dispatchSummary || "",
    buildingProfile: data.buildingProfile || "",
    contactsSummary: data.contactsSummary || "",
    symbolChecklist: Array.isArray(data.symbolChecklist) ? data.symbolChecklist : [],
    sourceInspectionIds: Array.isArray(data.sourceInspectionIds) ? data.sourceInspectionIds : [],
    notes: data.notes || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
    reviewedBy: data.reviewedBy || "",
    reviewedByName: data.reviewedByName || "",
    approvedAt: data.approvedAt || "",
    publishedAt: data.publishedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePreplanRecord(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const operationalValidity = PREPLAN_OPERATIONAL_VALIDITY.includes(data.operationalValidity)
    ? data.operationalValidity
    : (data.operationalValidity || "current");
  const priorityRaw = String(data.priority || "normal");
  const priority = PREPLAN_PRIORITIES.includes(priorityRaw) ? priorityRaw : "normal";
  const currentRevisionNumber = Number(data.currentRevisionNumber) || Number(data.revision) || 0;

  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    preplanNumber: data.preplanNumber || data.id || "",
    preplanTypeId: data.preplanTypeId || "commercial",
    templateId: data.templateId || "",
    templateVersion: Number(data.templateVersion) || 0,
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    propertyId: data.propertyId || "",
    facilityName: data.facilityName || data.occupancyName || "",
    alternateName: data.alternateName || "",
    businessName: data.businessName || "",
    address: data.address || "",
    latitude: data.latitude != null && data.latitude !== "" ? Number(data.latitude) : null,
    longitude: data.longitude != null && data.longitude !== "" ? Number(data.longitude) : null,
    districtId: data.districtId || "",
    stationId: data.stationId || data.responsibleStation || "",
    responseAreaId: data.responseAreaId || "",
    status: resolvePreplanStatus(data.status),
    operationalValidity,
    riskLevel: data.riskLevel || "Moderate",
    priority,
    assignedPlannerId: data.assignedPlannerId || "",
    assignedPlannerName: data.assignedPlannerName || "",
    reviewerId: data.reviewerId || "",
    reviewerName: data.reviewerName || "",
    approverId: data.approverId || "",
    approverName: data.approverName || "",
    responsibleStation: data.responsibleStation || data.stationId || "",
    firstDueCompany: data.firstDueCompany || "",
    verificationCycleDays: Number.isFinite(Number(data.verificationCycleDays))
      ? Number(data.verificationCycleDays)
      : DEFAULT_VERIFICATION_CYCLE_DAYS,
    lastVerifiedAt: data.lastVerifiedAt || "",
    verificationDueAt: data.verificationDueAt || "",
    lastSiteVisitAt: data.lastSiteVisitAt || "",
    lastReviewedAt: data.lastReviewedAt || "",
    nextReviewDueAt: data.nextReviewDueAt || data.verificationDueAt || "",
    approvedAt: data.approvedAt || "",
    publishedAt: data.publishedAt || "",
    currentRevisionId: data.currentRevisionId || "",
    publishedRevisionId: data.publishedRevisionId || "",
    currentRevisionNumber,
    revision: currentRevisionNumber,
    publishedRevisionNumber: Number(data.publishedRevisionNumber) || 0,
    diagramStatus: data.diagramStatus || "none",
    publicationStatus: data.publicationStatus || "unpublished",
    sourceInspectionIds: Array.isArray(data.sourceInspectionIds) ? data.sourceInspectionIds.map(String) : [],
    hydrantIds: Array.isArray(data.hydrantIds) ? data.hydrantIds.map(String) : [],
    systemIds: Array.isArray(data.systemIds) ? data.systemIds.map(String) : [],
    buildingIds: Array.isArray(data.buildingIds) ? data.buildingIds.map(String) : [],
    missingCriticalFields: Array.isArray(data.missingCriticalFields) ? data.missingCriticalFields : [],
    riskScore: Number.isFinite(Number(data.riskScore)) ? Number(data.riskScore) : null,
    riskOverrideLevel: data.riskOverrideLevel || "",
    riskOverrideReason: data.riskOverrideReason || "",
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
export function normalizePreplanDiagram(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    preplanId: data.preplanId || "",
    revisionId: data.revisionId || "",
    name: data.name || "Site diagram",
    status: data.status || "draft",
    notes: data.notes || "",
    symbolsPlaced: Array.isArray(data.symbolsPlaced) ? data.symbolsPlaced : [],
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizePreplanVerification(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    preplanId: data.preplanId || "",
    revisionId: data.revisionId || "",
    checklist: Array.isArray(data.checklist) ? data.checklist : [],
    result: data.result || "pending",
    notes: data.notes || "",
    verifiedBy: data.verifiedBy || "",
    verifiedByName: data.verifiedByName || "",
    verifiedAt: data.verifiedAt || "",
    nextDueAt: data.nextDueAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

function computeMissingCritical(revision = {}, preplan = {}) {
  const missing = [];
  if (!preplan.occupancyId && !preplan.address) missing.push("location");
  if (!revision.dispatchSummary && !revision.sectionAnswers?.dispatchSummary) {
    missing.push("dispatchSummary");
  }
  if (!revision.accessPlan && !revision.sectionAnswers?.primaryAccess) {
    missing.push("access");
  }
  if (!revision.waterSupply && !revision.sectionAnswers?.nearestHydrants) {
    missing.push("water");
  }
  return missing;
}

function syncRevisionNarrative(revision) {
  const a = revision.sectionAnswers || {};
  return {
    ...revision,
    accessPlan: revision.accessPlan || [a.primaryAccess, a.secondaryAccess, a.knoxBox].filter(Boolean).join("\n"),
    waterSupply: revision.waterSupply || [a.nearestHydrants, a.fdcLocation, a.supplyNotes].filter(Boolean).join("\n"),
    fireProtection: revision.fireProtection
      || [a.sprinkler, a.standpipe, a.alarm, a.panelLocation].filter(Boolean).join("\n"),
    utilities: revision.utilities || [a.gas, a.electric, a.water, a.hvac].filter(Boolean).join("\n"),
    hazards: revision.hazards || [a.construction, a.hazmat, a.occupancyNotes, a.exposures].filter(Boolean).join("\n"),
    tacticalPlan: revision.tacticalPlan
      || [a.initialActions, a.staging, a.evacuation, a.specialOps].filter(Boolean).join("\n"),
    dispatchSummary: revision.dispatchSummary || a.dispatchSummary || "",
  };
}

export async function listPreplanTemplates(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_TEMPLATES_COLLECTION);
  return rows
    .map((row) => normalizePreplanTemplate(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensurePreplanConfigSeeded(departmentId, audit = {}) {
  if (!departmentId) return { templates: [], symbolLibrary: null };
  let templates = await listPreplanTemplates(departmentId);
  if (!templates.length) {
    const stamp = nowIso();
    for (const starter of STARTER_PREPLAN_TEMPLATES) {
      const item = normalizePreplanTemplate({
        ...starter,
        departmentId,
        createdAt: stamp,
        updatedAt: stamp,
      }, departmentId);
      await createRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, item.id, item);
      templates.push(item);
    }
    await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
      action: "seed",
      recordId: "preplan-templates",
      summary: `Seeded ${templates.length} preplan templates`,
      actorUid: audit.actorUid || "",
      actorName: audit.actorName || "",
    });
  }

  const libs = await listRecords(departmentId, PREPLAN_SYMBOL_LIBRARIES_COLLECTION);
  let symbolLibrary = libs[0]
    ? { id: libs[0].id, ...libs[0] }
    : null;
  if (!symbolLibrary) {
    const stamp = nowIso();
    symbolLibrary = {
      ...STARTER_SYMBOL_LIBRARY,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    };
    await createRecord(
      departmentId,
      PREPLAN_SYMBOL_LIBRARIES_COLLECTION,
      symbolLibrary.id,
      symbolLibrary
    );
  }

  return { templates, symbolLibrary };
}

export async function savePreplanTemplate(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || newId("PPT");
  const existing = payload.id
    ? normalizePreplanTemplate(await getRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, id) || {}, departmentId)
    : null;
  const stamp = nowIso();
  const record = normalizePreplanTemplate({
    ...(existing || {}),
    ...payload,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    version: (existing?.version || 0) + 1,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
    action: existing ? "update" : "create",
    recordId: id,
    summary: `Preplan template ${record.name}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function listPreplans(departmentId, filters = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLANS_COLLECTION);
  let list = rows.map((row) => normalizePreplanRecord(row, departmentId));

  if (filters.occupancyId) {
    list = list.filter((row) => row.occupancyId === filters.occupancyId);
  }
  if (filters.status) {
    list = list.filter((row) => String(row.status).toLowerCase() === String(filters.status).toLowerCase());
  }
  if (filters.queue === "work") {
    list = list.filter((row) => !["archived", "cancelled", "superseded"].includes(row.status));
  }
  if (filters.queue === "review") {
    list = list.filter((row) => ["ready_for_review", "returned_for_revision"].includes(row.status));
  }
  if (filters.queue === "verification") {
    list = list.filter((row) => ["verification_due", "verification_overdue", "operational", "published"].includes(row.status)
      || ["verification_due", "verification_overdue"].includes(row.operationalValidity));
  }
  if (filters.assignedPlannerId) {
    list = list.filter((row) => row.assignedPlannerId === filters.assignedPlannerId);
  }
  if (filters.openOnly) {
    list = list.filter((row) => !["archived", "cancelled"].includes(row.status));
  }

  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function getPreplan(departmentId, preplanId) {
  if (!departmentId || !preplanId) return null;
  const row = await getRecord(departmentId, PREPLANS_COLLECTION, preplanId);
  return row ? normalizePreplanRecord(row, departmentId) : null;
}

export async function listPreplanRevisions(departmentId, preplanId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_REVISIONS_COLLECTION);
  return rows
    .map((row) => normalizePreplanRevision(row, departmentId))
    .filter((row) => !preplanId || row.preplanId === preplanId)
    .sort((a, b) => Number(b.revisionNumber) - Number(a.revisionNumber));
}

export async function getPreplanRevision(departmentId, revisionId) {
  if (!departmentId || !revisionId) return null;
  const row = await getRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, revisionId);
  return row ? normalizePreplanRevision(row, departmentId) : null;
}

async function resolveOccupancy(departmentId, occupancyId) {
  if (!occupancyId) return null;
  const list = await listOccupancyRecords(departmentId);
  return list.find((row) => row.id === occupancyId) || null;
}

async function nextPreplanNumber(departmentId) {
  const existing = await listPreplans(departmentId);
  const year = new Date().getFullYear();
  const seq = existing.length + 1;
  return `PP-${year}-${String(seq).padStart(4, "0")}`;
}

/**
 * @param {string} departmentId
 * @param {object} payload
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function createPreplan(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const seeded = await ensurePreplanConfigSeeded(departmentId, audit);
  const templates = seeded.templates;
  const templateId = payload.templateId || templates[0]?.id || "";
  const template = templates.find((row) => row.id === templateId) || templates[0] || null;

  const occupancy = payload.occupancyId
    ? await resolveOccupancy(departmentId, payload.occupancyId)
    : null;

  const stamp = nowIso();
  const preplanId = payload.id || newId("PP");
  const revisionId = newId("PPR");
  const preplanNumber = payload.preplanNumber || await nextPreplanNumber(departmentId);

  const sectionAnswers = {
    ...emptySectionAnswers(template?.sections || []),
    ...(payload.sectionAnswers || {}),
  };

  const pinnedTemplateVersion = Number(template?.publishedVersion) || Number(template?.version) || 1;

  let revision = normalizePreplanRevision({
    id: revisionId,
    departmentId,
    preplanId,
    revisionNumber: 1,
    status: "draft",
    templateId: template?.id || "",
    templateVersion: pinnedTemplateVersion,
    templateSnapshot: template,
    sectionAnswers,
    accessPlan: payload.accessPlan || "",
    waterSupply: payload.waterSupply || "",
    fireProtection: payload.fireProtection || "",
    utilities: payload.utilities || "",
    hazards: payload.hazards || "",
    tacticalPlan: payload.tacticalPlan || "",
    dispatchSummary: payload.dispatchSummary || "",
    buildingProfile: payload.buildingProfile || "",
    contactsSummary: payload.contactsSummary
      || [occupancy?.primaryContactName, occupancy?.primaryContactPhone].filter(Boolean).join(" · "),
    symbolChecklist: (seeded.symbolLibrary?.symbols || []).map((sym) => ({
      symbolId: sym.id,
      label: sym.label,
      present: false,
      notes: "",
    })),
    sourceInspectionIds: payload.sourceInspectionIds || [],
    notes: payload.notes || "",
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  revision = syncRevisionNarrative(revision);

  const preplan = normalizePreplanRecord({
    id: preplanId,
    departmentId,
    preplanNumber,
    preplanTypeId: payload.preplanTypeId || template?.preplanTypeId || "commercial",
    templateId: template?.id || "",
    templateVersion: pinnedTemplateVersion,
    districtId: payload.districtId || "",
    stationId: payload.stationId || payload.responsibleStation || "",
    responseAreaId: payload.responseAreaId || "",
    hydrantIds: Array.isArray(payload.hydrantIds) ? payload.hydrantIds : [],
    systemIds: Array.isArray(payload.systemIds) ? payload.systemIds : [],
    buildingIds: Array.isArray(payload.buildingIds) ? payload.buildingIds : [],
    occupancyId: occupancy?.id || payload.occupancyId || "",
    occupancyName: occupancy?.name || payload.occupancyName || "",
    propertyId: occupancy?.propertyId || payload.propertyId || "",
    address: occupancy?.address || payload.address || "",
    status: payload.status || "draft",
    operationalValidity: "unavailable",
    riskLevel: payload.riskLevel || occupancy?.hazard || occupancy?.riskLevel || "Moderate",
    priority: payload.priority || "normal",
    assignedPlannerId: payload.assignedPlannerId || audit.actorUid || "",
    assignedPlannerName: payload.assignedPlannerName || audit.actorName || "",
    reviewerId: payload.reviewerId || "",
    reviewerName: payload.reviewerName || "",
    responsibleStation: payload.responsibleStation || "",
    firstDueCompany: payload.firstDueCompany || "",
    verificationCycleDays: payload.verificationCycleDays || DEFAULT_VERIFICATION_CYCLE_DAYS,
    verificationDueAt: "",
    currentRevisionId: revisionId,
    publishedRevisionId: "",
    currentRevisionNumber: 1,
    publishedRevisionNumber: 0,
    diagramStatus: "none",
    publicationStatus: "unpublished",
    sourceInspectionIds: payload.sourceInspectionIds || [],
    missingCriticalFields: computeMissingCritical(revision, {
      occupancyId: occupancy?.id,
      address: occupancy?.address || payload.address,
    }),
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  }, departmentId);

  try {
    await createRecord(departmentId, PREPLANS_COLLECTION, preplanId, preplan);
    await createRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, revisionId, revision);

    const diagramId = newId("PPD");
    const diagram = normalizePreplanDiagram({
      id: diagramId,
      departmentId,
      preplanId,
      revisionId,
      name: "Site / floor diagram checklist",
      status: "draft",
      symbolsPlaced: [],
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, PREPLAN_DIAGRAMS_COLLECTION, diagramId, diagram);
  } catch (error) {
    enqueuePreplanOfflineMutation(departmentId, {
      collection: PREPLANS_COLLECTION,
      recordId: preplanId,
      operation: "create",
      payload: { preplan, revision },
    });
    savePreplanLocalDraft(departmentId, preplanId, { preplan, revision });
    throw error;
  }

  await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
    action: "create",
    recordId: preplanId,
    summary: `Created preplan ${preplanNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { preplan, revision };
}

export async function createPreplanFromOccupancy(departmentId, occupancyId, payload = {}, audit = {}) {
  if (!occupancyId) throw new Error("Occupancy required.");
  const occupancy = await resolveOccupancy(departmentId, occupancyId);
  if (!occupancy) throw new Error("Occupancy not found.");
  return createPreplan(departmentId, {
    ...payload,
    occupancyId: occupancy.id,
    occupancyName: occupancy.name,
    address: occupancy.address,
    propertyId: occupancy.propertyId,
    riskLevel: occupancy.hazard || occupancy.riskLevel || payload.riskLevel,
  }, audit);
}

/**
 * Create or update a preplan linked to an inspection.
 */
export async function createOrUpdatePreplanFromInspection(departmentId, inspectionId, payload = {}, audit = {}) {
  if (!inspectionId) throw new Error("Inspection required.");
  const inspection = await getInspectionRecord(departmentId, inspectionId);
  if (!inspection) throw new Error("Inspection not found.");

  const existing = inspection.occupancyId
    ? (await listPreplans(departmentId, { occupancyId: inspection.occupancyId, openOnly: true }))[0]
    : null;

  if (existing) {
    const revision = await getPreplanRevision(departmentId, existing.currentRevisionId);
    const stamp = nowIso();
    const sourceIds = Array.from(new Set([
      ...(existing.sourceInspectionIds || []),
      ...(revision?.sourceInspectionIds || []),
      inspectionId,
    ]));

    const nextRevision = await updatePreplanRevision(departmentId, existing.currentRevisionId, {
      sourceInspectionIds: sourceIds,
      notes: [
        revision?.notes || "",
        `Updated from inspection ${inspection.inspectionNumber || inspectionId} (${stamp.slice(0, 10)}).`,
        payload.notes || "",
      ].filter(Boolean).join("\n"),
      sectionAnswers: {
        ...(revision?.sectionAnswers || {}),
        ...(payload.sectionAnswers || {}),
      },
      dispatchSummary: payload.dispatchSummary || revision?.dispatchSummary || "",
    }, audit);

    const nextPreplan = await updatePreplan(departmentId, existing.id, {
      sourceInspectionIds: sourceIds,
      status: existing.status === "operational" || existing.status === "published"
        ? "revision_in_progress"
        : existing.status,
    }, audit);

    return { preplan: nextPreplan, revision: nextRevision, created: false };
  }

  const created = await createPreplan(departmentId, {
    occupancyId: inspection.occupancyId,
    occupancyName: inspection.occupancyName,
    address: inspection.address,
    sourceInspectionIds: [inspectionId],
    riskLevel: payload.riskLevel,
    preplanTypeId: payload.preplanTypeId,
    templateId: payload.templateId,
    notes: `Created from inspection ${inspection.inspectionNumber || inspectionId}.`,
    ...payload,
  }, audit);

  return { ...created, created: true };
}

export async function updatePreplan(departmentId, preplanId, patch = {}, audit = {}) {
  if (!departmentId || !preplanId) throw new Error("Preplan required.");
  const existing = await getPreplan(departmentId, preplanId);
  if (!existing) throw new Error("Preplan not found.");
  const stamp = nowIso();
  const next = normalizePreplanRecord({
    ...existing,
    ...patch,
    id: preplanId,
    departmentId,
    updatedAt: stamp,
    version: (existing.version || 1) + 1,
  }, departmentId);

  try {
    await updateRecord(departmentId, PREPLANS_COLLECTION, preplanId, next);
  } catch (error) {
    enqueuePreplanOfflineMutation(departmentId, {
      collection: PREPLANS_COLLECTION,
      recordId: preplanId,
      operation: "update",
      payload: next,
      baseUpdatedAt: existing.updatedAt,
      baseVersion: existing.version,
    });
    throw error;
  }

  await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
    action: "update",
    recordId: preplanId,
    summary: `Updated preplan ${next.preplanNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function updatePreplanRevision(departmentId, revisionId, patch = {}, audit = {}) {
  if (!departmentId || !revisionId) throw new Error("Revision required.");
  const existing = await getPreplanRevision(departmentId, revisionId);
  if (!existing) throw new Error("Revision not found.");
  const stamp = nowIso();
  let next = normalizePreplanRevision({
    ...existing,
    ...patch,
    sectionAnswers: {
      ...(existing.sectionAnswers || {}),
      ...(patch.sectionAnswers || {}),
    },
    id: revisionId,
    departmentId,
    updatedAt: stamp,
  }, departmentId);
  next = syncRevisionNarrative(next);

  try {
    await updateRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, revisionId, next);
  } catch (error) {
    enqueuePreplanOfflineMutation(departmentId, {
      collection: PREPLAN_REVISIONS_COLLECTION,
      recordId: revisionId,
      operation: "update",
      payload: next,
      baseUpdatedAt: existing.updatedAt,
    });
    throw error;
  }

  const preplan = await getPreplan(departmentId, next.preplanId);
  if (preplan) {
    await updatePreplan(departmentId, preplan.id, {
      missingCriticalFields: computeMissingCritical(next, preplan),
    }, audit);
  }

  await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
    action: "update",
    recordId: revisionId,
    summary: `Updated preplan revision ${next.revisionNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return next;
}

export async function submitPreplanForReview(departmentId, preplanId, audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  await updatePreplanRevision(departmentId, preplan.currentRevisionId, { status: "in_review" }, audit);
  return updatePreplan(departmentId, preplanId, { status: "ready_for_review" }, audit);
}

export async function returnPreplanForRevision(departmentId, preplanId, notes = "", audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  const revision = await getPreplanRevision(departmentId, preplan.currentRevisionId);
  await updatePreplanRevision(departmentId, preplan.currentRevisionId, {
    status: "returned",
    notes: [revision?.notes || "", notes].filter(Boolean).join("\n"),
  }, audit);
  return updatePreplan(departmentId, preplanId, { status: "returned_for_revision" }, audit);
}

export async function approvePreplan(departmentId, preplanId, audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  const stamp = nowIso();
  await updatePreplanRevision(departmentId, preplan.currentRevisionId, {
    status: "approved",
    reviewedBy: audit.actorUid || "",
    reviewedByName: audit.actorName || "",
    approvedAt: stamp,
  }, audit);
  return updatePreplan(departmentId, preplanId, { status: "approved" }, audit);
}

/**
 * Publish current revision snapshot as the operational published revision.
 */
export async function publishPreplanRevision(departmentId, preplanId, audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  const revision = await getPreplanRevision(departmentId, preplan.currentRevisionId);
  if (!revision) throw new Error("Revision not found.");

  const stamp = nowIso();
  const published = await updatePreplanRevision(departmentId, revision.id, {
    status: "published",
    publishedAt: stamp,
    approvedAt: revision.approvedAt || stamp,
    reviewedBy: revision.reviewedBy || audit.actorUid || "",
    reviewedByName: revision.reviewedByName || audit.actorName || "",
  }, audit);

  const verificationDueAt = addDaysIso(preplan.verificationCycleDays || DEFAULT_VERIFICATION_CYCLE_DAYS);

  const next = await updatePreplan(departmentId, preplanId, {
    status: "operational",
    operationalValidity: "current",
    publicationStatus: "published",
    publishedRevisionId: published.id,
    publishedRevisionNumber: published.revisionNumber,
    lastVerifiedAt: stamp.slice(0, 10),
    verificationDueAt,
    missingCriticalFields: computeMissingCritical(published, preplan),
  }, audit);

  await writeInspectionAuditLog(departmentId, {
      module: "Preplans",
      recordType: "preplan",
    action: "publish",
    recordId: preplanId,
    summary: `Published preplan ${next.preplanNumber} revision ${published.revisionNumber}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });

  return { preplan: next, revision: published };
}

export async function startPreplanRevision(departmentId, preplanId, audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  const current = await getPreplanRevision(departmentId, preplan.currentRevisionId);
  const stamp = nowIso();
  const revisionNumber = (preplan.currentRevisionNumber || 0) + 1;
  const revisionId = newId("PPR");

  const seeded = await ensurePreplanConfigSeeded(departmentId, audit);
  const liveTemplate = seeded.templates.find((row) => row.id === (current?.templateId || preplan.templateId))
    || seeded.templates[0]
    || null;
  const pinnedTemplateVersion = Number(liveTemplate?.publishedVersion)
    || Number(current?.templateVersion)
    || Number(liveTemplate?.version)
    || 1;

  let revision = normalizePreplanRevision({
    ...(current || {}),
    id: revisionId,
    departmentId,
    preplanId,
    revisionNumber,
    status: "draft",
    templateId: liveTemplate?.id || current?.templateId || preplan.templateId || "",
    templateVersion: pinnedTemplateVersion,
    templateSnapshot: liveTemplate || current?.templateSnapshot || null,
    approvedAt: "",
    publishedAt: "",
    reviewedBy: "",
    reviewedByName: "",
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, PREPLAN_REVISIONS_COLLECTION, revisionId, revision);

  if (current?.id && current.status === "published") {
    await updatePreplanRevision(departmentId, current.id, { status: "superseded" }, audit);
  }

  const next = await updatePreplan(departmentId, preplanId, {
    status: "revision_in_progress",
    templateId: revision.templateId,
    templateVersion: pinnedTemplateVersion,
    currentRevisionId: revisionId,
    currentRevisionNumber: revisionNumber,
  }, audit);

  return { preplan: next, revision };
}

export async function recordPreplanVerification(departmentId, preplanId, payload = {}, audit = {}) {
  const preplan = await getPreplan(departmentId, preplanId);
  if (!preplan) throw new Error("Preplan not found.");
  const stamp = nowIso();
  const checklist = Array.isArray(payload.checklist) && payload.checklist.length
    ? payload.checklist
    : VERIFICATION_CHECKLIST_ITEMS.map((item) => ({
      id: item.id,
      label: item.label,
      checked: Boolean(payload.allChecked),
      notes: "",
    }));

  const id = newId("PPV");
  const nextDueAt = payload.nextDueAt
    || addDaysIso(preplan.verificationCycleDays || DEFAULT_VERIFICATION_CYCLE_DAYS);

  const verification = normalizePreplanVerification({
    id,
    departmentId,
    preplanId,
    revisionId: preplan.publishedRevisionId || preplan.currentRevisionId,
    checklist,
    result: payload.result || "verified",
    notes: payload.notes || "",
    verifiedBy: audit.actorUid || "",
    verifiedByName: audit.actorName || "",
    verifiedAt: stamp,
    nextDueAt,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);

  await createRecord(departmentId, PREPLAN_VERIFICATIONS_COLLECTION, id, verification);

  const next = await updatePreplan(departmentId, preplanId, {
    status: "operational",
    operationalValidity: "current",
    lastVerifiedAt: stamp.slice(0, 10),
    verificationDueAt: nextDueAt,
  }, audit);

  return { verification, preplan: next };
}

export async function listPreplanDiagrams(departmentId, preplanId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_DIAGRAMS_COLLECTION);
  return rows
    .map((row) => normalizePreplanDiagram(row, departmentId))
    .filter((row) => !preplanId || row.preplanId === preplanId);
}

export async function updatePreplanDiagram(departmentId, diagramId, patch = {}, audit = {}) {
  const existing = normalizePreplanDiagram(
    await getRecord(departmentId, PREPLAN_DIAGRAMS_COLLECTION, diagramId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Diagram not found.");
  const stamp = nowIso();
  const next = normalizePreplanDiagram({
    ...existing,
    ...patch,
    id: diagramId,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, PREPLAN_DIAGRAMS_COLLECTION, diagramId, next);
  if (next.preplanId) {
    await updatePreplan(departmentId, next.preplanId, {
      diagramStatus: next.status === "complete" ? "complete" : "in_progress",
    }, audit);
  }
  return next;
}

export function buildPreplanWorkQueueMetrics(preplans = []) {
  const list = Array.isArray(preplans) ? preplans : [];
  return {
    total: list.length,
    draft: list.filter((row) => ["draft", "field_survey_in_progress", "revision_in_progress"].includes(row.status)).length,
    review: list.filter((row) => row.status === "ready_for_review").length,
    verification: list.filter((row) => (
      ["verification_due", "verification_overdue"].includes(row.status)
      || ["verification_due", "verification_overdue"].includes(row.operationalValidity)
    )).length,
    operational: list.filter((row) => row.status === "operational" || row.publicationStatus === "published").length,
    highRisk: list.filter((row) => ["High", "Critical"].includes(row.riskLevel)).length,
  };
}

/**
 * Optional one-way import from classic list-shaped preplan rows.
 * @param {string} departmentId
 * @param {object[]} legacyRows
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function importLegacyPreplanListItems(departmentId, legacyRows = [], audit = {}) {
  if (!departmentId || !Array.isArray(legacyRows) || !legacyRows.length) return [];
  const existing = await listPreplans(departmentId);
  if (existing.length) return existing;

  const created = [];
  for (const row of legacyRows) {
    const result = await createPreplan(departmentId, {
      occupancyName: row.occupancy || row.occupancyName || "Imported occupancy",
      address: row.address || "",
      status: String(row.status || "draft").toLowerCase().includes("active") ? "operational" : "draft",
      hazards: row.hazards || "",
      accessPlan: row.access || "",
      waterSupply: row.waterSupply || "",
      notes: `Imported from classic list ${row.id || ""}`.trim(),
      sectionAnswers: {
        hazmat: row.hazards || "",
        primaryAccess: row.access || "",
        nearestHydrants: row.waterSupply || "",
      },
    }, audit);
    created.push(result.preplan);
  }
  return created;
}

/**
 * Publish an immutable template version snapshot.
 */
export async function publishPreplanTemplateVersion(departmentId, templateId, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  if (!templateId) throw new Error("Template id required.");
  const template = normalizePreplanTemplate(
    (await getRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, templateId)) || {},
    departmentId,
  );
  if (!template.id) throw new Error("Template not found.");
  const stamp = nowIso();
  const version = Number(template.version) || 1;
  const versionId = `${templateId}_v${version}`;
  const payload = {
    id: versionId,
    departmentId,
    templateId,
    version,
    name: template.name,
    preplanTypeId: template.preplanTypeId,
    sections: Array.isArray(template.sections) ? template.sections : [],
    snapshot: template,
    publishedAt: stamp,
    publishedBy: audit.actorUid || "",
    publishedByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  };
  await createRecord(departmentId, PREPLAN_TEMPLATE_VERSIONS_COLLECTION, versionId, payload);
  const next = {
    ...template,
    publishedVersion: version,
    version: version + 1,
    publishedAt: stamp,
    updatedAt: stamp,
  };
  await updateRecord(departmentId, PREPLAN_TEMPLATES_COLLECTION, templateId, next);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanTemplate",
    action: "publish",
    recordId: templateId,
    summary: `Published preplan template ${template.name} v${version}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return payload;
}

export async function listPreplanBuildings(departmentId, preplanId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_BUILDINGS_COLLECTION);
  return rows
    .filter((row) => !preplanId || row.preplanId === preplanId)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
}

export async function savePreplanBuilding(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || newId("PPB");
  const stamp = nowIso();
  const existing = payload.id
    ? (await getRecord(departmentId, PREPLAN_BUILDINGS_COLLECTION, id)) || null
    : null;
  const record = {
    ...(existing || {}),
    ...payload,
    id,
    departmentId,
    preplanId: payload.preplanId || existing?.preplanId || "",
    name: payload.name || existing?.name || "Building",
    sortOrder: Number(payload.sortOrder ?? existing?.sortOrder ?? 0),
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  };
  if (existing) await updateRecord(departmentId, PREPLAN_BUILDINGS_COLLECTION, id, record);
  else await createRecord(departmentId, PREPLAN_BUILDINGS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanBuilding",
    action: existing ? "update" : "create",
    recordId: id,
    summary: `Preplan building ${record.name}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}

export async function listPreplanFiles(departmentId, preplanId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_FILES_COLLECTION);
  return rows
    .filter((row) => !preplanId || row.preplanId === preplanId)
    .sort((a, b) => String(b.uploadedAt || b.createdAt || "").localeCompare(String(a.uploadedAt || a.createdAt || "")));
}

export async function registerPreplanFile(departmentId, payload = {}, audit = {}) {
  if (!departmentId) throw new Error("Department required.");
  const id = payload.id || newId("PPF");
  const stamp = nowIso();
  const record = {
    id,
    departmentId,
    preplanId: payload.preplanId || "",
    buildingId: payload.buildingId || "",
    category: payload.category || "other",
    fileName: payload.fileName || "",
    mimeType: payload.mimeType || "",
    fileSize: Number(payload.fileSize) || 0,
    storagePath: payload.storagePath || "",
    downloadUrl: payload.downloadUrl || "",
    description: payload.description || "",
    version: Number(payload.version) || 1,
    sensitive: Boolean(payload.sensitive),
    archived: Boolean(payload.archived),
    uploadedBy: audit.actorUid || payload.uploadedBy || "",
    uploadedAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  };
  await createRecord(departmentId, PREPLAN_FILES_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanFile",
    action: "upload",
    recordId: id,
    summary: `Registered preplan file ${record.fileName}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return record;
}
