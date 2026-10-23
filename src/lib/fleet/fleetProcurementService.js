import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { saveFleetAsset } from "./fleetAssetService.js";
import {
  ASSET_INSURANCE_TYPES,
  BUILD_MILESTONE_TEMPLATES,
  BUILD_PROJECT_STATUSES,
  COMMISSIONING_CHECKLIST,
  GRANT_STATUSES,
  PROCUREMENT_PRIORITIES,
  PROCUREMENT_REQUEST_STATUSES,
  SPEC_STATUSES,
} from "./procurementDefaults.js";
import {
  FLEET_ASSET_INSURANCE_COLLECTION,
  FLEET_BUILD_PROJECTS_COLLECTION,
  FLEET_GRANTS_COLLECTION,
  FLEET_PROCUREMENT_REQUESTS_COLLECTION,
  FLEET_SPECIFICATIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function defaultMilestones() {
  return BUILD_MILESTONE_TEMPLATES.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    plannedDate: "",
    actualDate: "",
    status: "pending",
    owner: "",
    notes: "",
    delayReason: "",
  }));
}

function defaultCommissioningItems() {
  return COMMISSIONING_CHECKLIST.map((row) => ({
    id: row.id,
    label: row.label,
    completed: false,
    completedAt: "",
    completedBy: "",
    notes: "",
  }));
}

/** @param {object} raw @param {string} departmentId */
export function normalizeProcurementRequest(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    requestNumber: data.requestNumber || data.id || "",
    requestingUnit: data.requestingUnit || "",
    need: data.need || "",
    fleetClass: data.fleetClass || "",
    replacementAssetId: data.replacementAssetId || "",
    replacementFleetNumber: data.replacementFleetNumber || "",
    justification: data.justification || "",
    operationalGap: data.operationalGap || "",
    requiredCapabilities: data.requiredCapabilities || "",
    estimatedCost: Number(data.estimatedCost) || 0,
    fundingSource: data.fundingSource || "",
    grantId: data.grantId || "",
    priority: data.priority || "medium",
    status: data.status || "draft",
    approvalNotes: data.approvalNotes || "",
    approvedBy: data.approvedBy || "",
    approvedAt: data.approvedAt || "",
    targetDate: data.targetDate || "",
    specificationId: data.specificationId || "",
    buildProjectId: data.buildProjectId || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeSpecification(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    title: String(data.title || "Untitled specification").trim(),
    version: data.version || "1.0",
    requestId: data.requestId || "",
    fleetClass: data.fleetClass || "",
    requirements: data.requirements || "",
    alternates: data.alternates || "",
    exceptions: data.exceptions || "",
    evaluationCriteria: data.evaluationCriteria || "",
    committee: data.committee || "",
    vendorQuestions: data.vendorQuestions || "",
    addenda: data.addenda || "",
    awardVendor: data.awardVendor || "",
    awardPrice: Number(data.awardPrice) || 0,
    contractNumber: data.contractNumber || "",
    purchaseOrder: data.purchaseOrder || "",
    status: data.status || "draft",
    approvedBy: data.approvedBy || "",
    approvedAt: data.approvedAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeBuildProject(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const milestones = Array.isArray(data.milestones) && data.milestones.length
    ? data.milestones.map((row, index) => ({
      id: row.id || `ms-${index}`,
      name: row.name || `Milestone ${index + 1}`,
      sortOrder: Number(row.sortOrder) || index + 1,
      plannedDate: row.plannedDate || "",
      actualDate: row.actualDate || "",
      status: row.status || "pending",
      owner: row.owner || "",
      notes: row.notes || "",
      delayReason: row.delayReason || "",
    }))
    : defaultMilestones();
  const commissioning = Array.isArray(data.commissioning) && data.commissioning.length
    ? data.commissioning.map((row) => ({
      id: row.id || "",
      label: row.label || row.id || "",
      completed: Boolean(row.completed),
      completedAt: row.completedAt || "",
      completedBy: row.completedBy || "",
      notes: row.notes || "",
    }))
    : defaultCommissioningItems();
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    projectNumber: data.projectNumber || data.id || "",
    name: String(data.name || "Build project").trim(),
    requestId: data.requestId || "",
    specificationId: data.specificationId || "",
    manufacturer: data.manufacturer || "",
    dealer: data.dealer || "",
    contractDate: data.contractDate || "",
    scheduledDelivery: data.scheduledDelivery || "",
    actualDelivery: data.actualDelivery || "",
    chassisVin: data.chassisVin || "",
    fleetNumberDraft: data.fleetNumberDraft || "",
    fleetAssetId: data.fleetAssetId || "",
    status: data.status || "planned",
    milestones: milestones.sort((a, b) => a.sortOrder - b.sortOrder),
    commissioning,
    punchList: data.punchList || "",
    acceptanceNotes: data.acceptanceNotes || "",
    commissionedAt: data.commissionedAt || "",
    commissionedBy: data.commissionedBy || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeGrant(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled grant").trim(),
    agency: data.agency || "",
    grantNumber: data.grantNumber || "",
    amount: Number(data.amount) || 0,
    matchRequired: Number(data.matchRequired) || 0,
    status: data.status || "identified",
    appliedAt: data.appliedAt || "",
    awardedAt: data.awardedAt || "",
    expiresAt: data.expiresAt || "",
    linkedRequestIds: Array.isArray(data.linkedRequestIds) ? data.linkedRequestIds : [],
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeAssetInsurance(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    buildProjectId: data.buildProjectId || "",
    policyType: data.policyType || "physical_damage",
    carrier: data.carrier || "",
    policyNumber: data.policyNumber || "",
    effectiveDate: data.effectiveDate || "",
    expirationDate: data.expirationDate || "",
    premium: Number(data.premium) || 0,
    deductible: Number(data.deductible) || 0,
    coverageLimit: Number(data.coverageLimit) || 0,
    certificateOnFile: Boolean(data.certificateOnFile),
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

// ——— Requests ———

export async function listProcurementRequests(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_PROCUREMENT_REQUESTS_COLLECTION))
    .map((row) => normalizeProcurementRequest(row, departmentId));
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  if (filters.openOnly) {
    list = list.filter((row) => !["in_service", "rejected", "cancelled"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createProcurementRequest(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `FREQ-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeProcurementRequest({
    ...input,
    id,
    departmentId,
    requestNumber: input.requestNumber || id,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_PROCUREMENT_REQUESTS_COLLECTION, id, record);
  await writeFleetAuditLog(departmentId, {
    action: "procurement_request_create",
    recordId: id,
    summary: `Fleet request ${record.requestNumber}: ${record.need || record.fleetClass || "need"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateProcurementRequest(departmentId, requestId, patch = {}, audit = {}) {
  const existing = normalizeProcurementRequest(
    await getRecord(departmentId, FLEET_PROCUREMENT_REQUESTS_COLLECTION, requestId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Procurement request not found");
  const next = normalizeProcurementRequest({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  if (patch.status === "approved" && !next.approvedAt) {
    next.approvedAt = nowIso();
    next.approvedBy = audit.actorName || next.approvedBy || "User";
  }
  await updateRecord(departmentId, FLEET_PROCUREMENT_REQUESTS_COLLECTION, requestId, next);
  return next;
}

// ——— Specifications ———

export async function listSpecifications(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_SPECIFICATIONS_COLLECTION))
    .map((row) => normalizeSpecification(row, departmentId));
  if (filters.requestId) list = list.filter((row) => row.requestId === filters.requestId);
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createSpecification(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `SPEC-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeSpecification({
    ...input,
    id,
    departmentId,
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_SPECIFICATIONS_COLLECTION, id, record);

  if (record.requestId) {
    await updateProcurementRequest(departmentId, record.requestId, {
      specificationId: id,
      status: "under_review",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "specification_create",
    recordId: id,
    summary: `Specification ${record.title} v${record.version}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateSpecification(departmentId, specId, patch = {}, audit = {}) {
  const existing = normalizeSpecification(
    await getRecord(departmentId, FLEET_SPECIFICATIONS_COLLECTION, specId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Specification not found");
  const next = normalizeSpecification({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  if (patch.status === "approved" && !next.approvedAt) {
    next.approvedAt = nowIso();
    next.approvedBy = audit.actorName || next.approvedBy || "User";
  }
  await updateRecord(departmentId, FLEET_SPECIFICATIONS_COLLECTION, specId, next);
  return next;
}

// ——— Build projects ———

export async function listBuildProjects(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_BUILD_PROJECTS_COLLECTION))
    .map((row) => normalizeBuildProject(row, departmentId));
  if (filters.openOnly) {
    list = list.filter((row) => !["complete", "cancelled"].includes(row.status));
  }
  return list.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function createBuildProject(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `BUILD-${Date.now().toString(36).toUpperCase()}`;
  const record = normalizeBuildProject({
    ...input,
    id,
    departmentId,
    projectNumber: input.projectNumber || id,
    milestones: input.milestones || defaultMilestones(),
    commissioning: input.commissioning || defaultCommissioningItems(),
    createdAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, id, record);

  if (record.requestId) {
    await updateProcurementRequest(departmentId, record.requestId, {
      buildProjectId: id,
      status: "in_build",
    }, audit).catch(() => null);
  }
  if (record.specificationId) {
    await updateSpecification(departmentId, record.specificationId, {
      status: "awarded",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "build_project_create",
    recordId: id,
    summary: `Build project ${record.projectNumber}: ${record.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function updateBuildProject(departmentId, projectId, patch = {}, audit = {}) {
  const existing = normalizeBuildProject(
    await getRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, projectId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Build project not found");
  const next = normalizeBuildProject({
    ...existing,
    ...patch,
    id: existing.id,
    updatedAt: nowIso(),
  }, departmentId);
  await updateRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, projectId, next);
  return next;
}

export async function updateBuildMilestone(departmentId, projectId, milestoneId, patch = {}, audit = {}) {
  const existing = normalizeBuildProject(
    await getRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, projectId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Build project not found");
  const milestones = existing.milestones.map((row) => {
    if (row.id !== milestoneId) return row;
    const next = { ...row, ...patch };
    if (patch.status === "complete" && !next.actualDate) {
      next.actualDate = nowIso().slice(0, 10);
    }
    return next;
  });
  const delayed = milestones.some((row) => row.status === "delayed");
  const allDone = milestones.every((row) => ["complete", "skipped"].includes(row.status));
  let status = existing.status;
  if (delayed) status = "delayed";
  else if (allDone && existing.status !== "complete") status = "delivered";
  else if (existing.status === "planned") status = "in_production";

  return updateBuildProject(departmentId, projectId, { milestones, status }, audit);
}

export async function toggleCommissioningItem(departmentId, projectId, itemId, completed, audit = {}) {
  const existing = normalizeBuildProject(
    await getRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, projectId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Build project not found");
  const stamp = nowIso();
  const commissioning = existing.commissioning.map((row) => {
    if (row.id !== itemId) return row;
    return {
      ...row,
      completed: Boolean(completed),
      completedAt: completed ? stamp : "",
      completedBy: completed ? (audit.actorName || "User") : "",
    };
  });
  const allDone = commissioning.every((row) => row.completed);
  const patch = {
    commissioning,
    status: allDone ? "commissioning" : (existing.status === "delivered" ? "commissioning" : existing.status),
  };
  return updateBuildProject(departmentId, projectId, patch, audit);
}

/**
 * Mark build complete and optionally create a fleet asset.
 */
export async function completeCommissioning(departmentId, projectId, options = {}, audit = {}) {
  const existing = normalizeBuildProject(
    await getRecord(departmentId, FLEET_BUILD_PROJECTS_COLLECTION, projectId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Build project not found");
  const stamp = nowIso();
  let fleetAssetId = existing.fleetAssetId;

  if (options.createAsset && !fleetAssetId) {
    const asset = await saveFleetAsset(departmentId, {
      fleetNumber: options.fleetNumber || existing.fleetNumberDraft || existing.projectNumber,
      unitDesignation: options.fleetNumber || existing.fleetNumberDraft || existing.projectNumber,
      name: options.name || existing.name,
      type: options.type || "Apparatus",
      status: "in_service",
      vin: existing.chassisVin || "",
      manufacturer: existing.manufacturer || "",
      notes: `Commissioned from build ${existing.projectNumber}`,
    }, audit);
    fleetAssetId = asset.id;
  }

  const next = await updateBuildProject(departmentId, projectId, {
    status: "complete",
    fleetAssetId,
    commissionedAt: stamp,
    commissionedBy: audit.actorName || "User",
    actualDelivery: existing.actualDelivery || stamp.slice(0, 10),
  }, audit);

  if (existing.requestId) {
    await updateProcurementRequest(departmentId, existing.requestId, {
      status: "in_service",
    }, audit).catch(() => null);
  }

  await writeFleetAuditLog(departmentId, {
    action: "commissioning_complete",
    recordId: projectId,
    summary: `Commissioned ${next.projectNumber}${fleetAssetId ? ` → asset ${fleetAssetId}` : ""}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return next;
}

// ——— Grants ———

export async function listGrants(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_GRANTS_COLLECTION))
    .map((row) => normalizeGrant(row, departmentId))
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

export async function saveGrant(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `GRANT-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeGrant(await getRecord(departmentId, FLEET_GRANTS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeGrant({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_GRANTS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_GRANTS_COLLECTION, id, record);
  }
  await writeFleetAuditLog(departmentId, {
    action: existing?.id ? "grant_update" : "grant_create",
    recordId: id,
    summary: `${existing?.id ? "Updated" : "Created"} grant ${record.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

// ——— Asset insurance (procurement / lifecycle policies) ———

export async function listAssetInsurance(departmentId, filters = {}) {
  if (!departmentId) return [];
  let list = (await listRecords(departmentId, FLEET_ASSET_INSURANCE_COLLECTION))
    .map((row) => normalizeAssetInsurance(row, departmentId));
  if (filters.fleetAssetId) list = list.filter((row) => row.fleetAssetId === filters.fleetAssetId);
  if (filters.buildProjectId) list = list.filter((row) => row.buildProjectId === filters.buildProjectId);
  return list.sort((a, b) => String(b.expirationDate || b.updatedAt).localeCompare(String(a.expirationDate || a.updatedAt)));
}

export async function saveAssetInsurance(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `AINSR-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeAssetInsurance(await getRecord(departmentId, FLEET_ASSET_INSURANCE_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeAssetInsurance({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_ASSET_INSURANCE_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_ASSET_INSURANCE_COLLECTION, id, record);
  }
  await writeFleetAuditLog(departmentId, {
    action: existing?.id ? "asset_insurance_update" : "asset_insurance_create",
    recordId: id,
    summary: `Insurance ${record.policyNumber || record.carrier || id} for ${record.fleetNumber || "asset"}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

/**
 * @param {string} departmentId
 */
export async function buildProcurementBoard(departmentId) {
  const [requests, specs, builds, grants, insurance] = await Promise.all([
    listProcurementRequests(departmentId),
    listSpecifications(departmentId),
    listBuildProjects(departmentId),
    listGrants(departmentId),
    listAssetInsurance(departmentId),
  ]);

  const openBuilds = builds.filter((row) => !["complete", "cancelled"].includes(row.status));
  const commissioning = builds.filter((row) => ["delivered", "accepted", "commissioning"].includes(row.status));
  const expiringInsurance = insurance.filter((row) => {
    if (!row.expirationDate) return false;
    const days = (new Date(row.expirationDate).getTime() - Date.now()) / 86400000;
    return days >= 0 && days <= 90;
  });

  return {
    requests,
    specs,
    builds,
    grants,
    insurance,
    summary: {
      requests: requests.length,
      openRequests: requests.filter((row) => !["in_service", "rejected", "cancelled"].includes(row.status)).length,
      specs: specs.length,
      builds: builds.length,
      openBuilds: openBuilds.length,
      commissioning: commissioning.length,
      grants: grants.length,
      activeGrants: grants.filter((row) => ["awarded", "active"].includes(row.status)).length,
      insurance: insurance.length,
      expiringInsurance: expiringInsurance.length,
      pipelineValue: requests
        .filter((row) => !["rejected", "cancelled", "in_service"].includes(row.status))
        .reduce((sum, row) => sum + (Number(row.estimatedCost) || 0), 0),
    },
  };
}

export function getProcurementPriorities() {
  return [...PROCUREMENT_PRIORITIES];
}

export function getProcurementRequestStatuses() {
  return [...PROCUREMENT_REQUEST_STATUSES];
}

export function getSpecStatuses() {
  return [...SPEC_STATUSES];
}

export function getBuildProjectStatuses() {
  return [...BUILD_PROJECT_STATUSES];
}

export function getBuildMilestoneTemplates() {
  return [...BUILD_MILESTONE_TEMPLATES];
}

export function getCommissioningChecklist() {
  return [...COMMISSIONING_CHECKLIST];
}

export function getGrantStatuses() {
  return [...GRANT_STATUSES];
}

export function getAssetInsuranceTypes() {
  return [...ASSET_INSURANCE_TYPES];
}
