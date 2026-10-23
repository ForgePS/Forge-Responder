import {
  createRecord,
  deleteRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import {
  buildStarterTemplateDraft,
  CONFIG_LIFECYCLE_STATUSES,
  STARTER_INSPECTION_TYPES,
} from "./configDefaults.js";
import {
  INSPECTION_TEMPLATES_COLLECTION,
  INSPECTION_TEMPLATE_VERSIONS_COLLECTION,
  INSPECTION_TYPES_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeInspectionType(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const lifecycle = CONFIG_LIFECYCLE_STATUSES.includes(data.lifecycleStatus)
    ? data.lifecycleStatus
    : "draft";
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled type").trim() || "Untitled type",
    category: String(data.category || "General").trim() || "General",
    description: String(data.description || "").trim(),
    color: data.color || "#2563eb",
    icon: data.icon || "clipboard-check",
    frequency: data.frequency || "As needed",
    durationMinutes: Number.isFinite(Number(data.durationMinutes))
      ? Number(data.durationMinutes)
      : 60,
    defaultTemplateId: data.defaultTemplateId || "",
    requiredApprovals: Boolean(data.requiredApprovals),
    publicRequestEligible: Boolean(data.publicRequestEligible),
    portalVisible: Boolean(data.portalVisible),
    feeAmount: Number.isFinite(Number(data.feeAmount)) ? Number(data.feeAmount) : 0,
    lifecycleStatus: lifecycle,
    version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
    effectiveAt: data.effectiveAt || "",
    expiresAt: data.expiresAt || "",
    changeSummary: data.changeSummary || "",
    disabled: Boolean(data.disabled),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    publishedBy: data.publishedBy || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeInspectionTemplate(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const sections = Array.isArray(data.sections)
    ? data.sections.map((section, sectionIndex) => normalizeTemplateSection(section, sectionIndex))
    : [];
  const lifecycle = CONFIG_LIFECYCLE_STATUSES.includes(data.lifecycleStatus)
    ? data.lifecycleStatus
    : "draft";
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled template").trim() || "Untitled template",
    description: String(data.description || "").trim(),
    inspectionTypeId: data.inspectionTypeId || "",
    lifecycleStatus: lifecycle,
    currentVersion: Number.isFinite(Number(data.currentVersion)) ? Number(data.currentVersion) : 0,
    publishedVersionId: data.publishedVersionId || "",
    draftVersionId: data.draftVersionId || "",
    sections,
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    publishedBy: data.publishedBy || "",
    changeSummary: data.changeSummary || "",
  };
}

function normalizeTemplateSection(section = {}, sectionIndex = 0) {
  const fields = Array.isArray(section.fields)
    ? section.fields.map((field, fieldIndex) => normalizeTemplateField(field, fieldIndex))
    : [];
  return {
    id: section.id || `sec-${sectionIndex + 1}`,
    title: String(section.title || `Section ${sectionIndex + 1}`).trim(),
    sortOrder: Number.isFinite(Number(section.sortOrder)) ? Number(section.sortOrder) : sectionIndex,
    fields,
  };
}

function normalizeTemplateField(field = {}, fieldIndex = 0) {
  return {
    id: field.id || `fld-${fieldIndex + 1}`,
    key: String(field.key || `field_${fieldIndex + 1}`).trim() || `field_${fieldIndex + 1}`,
    type: field.type || "short_text",
    label: String(field.label || "Untitled field").trim() || "Untitled field",
    helpText: String(field.helpText || ""),
    placeholder: String(field.placeholder || ""),
    required: Boolean(field.required),
    readOnly: Boolean(field.readOnly),
    options: Array.isArray(field.options) ? field.options.map(String) : [],
    autoCreateViolation: Boolean(field.autoCreateViolation),
    severity: field.severity || "",
    sortOrder: Number.isFinite(Number(field.sortOrder)) ? Number(field.sortOrder) : fieldIndex,
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeTemplateVersion(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    templateId: data.templateId || "",
    version: Number.isFinite(Number(data.version)) ? Number(data.version) : 1,
    lifecycleStatus: data.lifecycleStatus || "published",
    changeSummary: data.changeSummary || "",
    snapshot: data.snapshot && typeof data.snapshot === "object" ? data.snapshot : {},
    publishedAt: data.publishedAt || "",
    publishedBy: data.publishedBy || "",
    createdAt: data.createdAt || "",
  };
}

export async function listInspectionTypes(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_TYPES_COLLECTION);
  return rows
    .map((row) => normalizeInspectionType(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function listInspectionTemplates(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_TEMPLATES_COLLECTION);
  return rows
    .map((row) => normalizeInspectionTemplate(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function listTemplateVersions(departmentId, templateId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, INSPECTION_TEMPLATE_VERSIONS_COLLECTION);
  return rows
    .map((row) => normalizeTemplateVersion(row, departmentId))
    .filter((row) => !templateId || row.templateId === templateId)
    .sort((a, b) => Number(b.version) - Number(a.version));
}

/**
 * Seed starter types + draft templates when none exist.
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureInspectionConfigSeeded(departmentId, audit = {}) {
  if (!departmentId) return { types: [], templates: [] };

  const existingTypes = await listInspectionTypes(departmentId);
  const existingTemplates = await listInspectionTemplates(departmentId);
  if (existingTypes.length) {
    return { types: existingTypes, templates: existingTemplates };
  }

  const types = [];
  const templates = [];
  const stamp = nowIso();

  for (const starter of STARTER_INSPECTION_TYPES) {
    const typeId = starter.id;
    const templateId = `tpl-${typeId}`;
    const typeRecord = normalizeInspectionType({
      ...starter,
      id: typeId,
      departmentId,
      defaultTemplateId: templateId,
      lifecycleStatus: "published",
      version: 1,
      effectiveAt: stamp,
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: audit.actorName || "System",
      publishedBy: audit.actorName || "System",
      changeSummary: "Starter configuration pack",
    }, departmentId);

    const templateDraft = buildStarterTemplateDraft(typeId, starter.name);
    const templateRecord = normalizeInspectionTemplate({
      ...templateDraft,
      id: templateId,
      departmentId,
      lifecycleStatus: "draft",
      currentVersion: 0,
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: audit.actorName || "System",
    }, departmentId);

    await createRecord(departmentId, INSPECTION_TYPES_COLLECTION, typeId, typeRecord);
    await createRecord(departmentId, INSPECTION_TEMPLATES_COLLECTION, templateId, templateRecord);
    types.push(typeRecord);
    templates.push(templateRecord);
  }

  try {
    await writeInspectionAuditLog(departmentId, {
      action: "seed",
      recordId: "inspection-config",
      summary: `Seeded ${types.length} inspection types and templates`,
      actorUid: audit.actorUid || "system",
      actorName: audit.actorName || "System",
      after: { typeIds: types.map((row) => row.id) },
    });
  } catch (error) {
    console.warn("Inspection config seed audit failed", error);
  }

  return { types, templates };
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string, isNew?: boolean }} [audit]
 */
export async function saveInspectionType(departmentId, record = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const normalized = normalizeInspectionType(record, departmentId);
  if (!normalized.id) normalized.id = newId("type");
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (audit.isNew) {
    await createRecord(departmentId, INSPECTION_TYPES_COLLECTION, normalized.id, normalized);
  } else {
    await updateRecord(departmentId, INSPECTION_TYPES_COLLECTION, normalized.id, normalized);
  }
  await writeInspectionAuditLog(departmentId, {
    action: audit.isNew ? "create" : "update",
    recordId: normalized.id,
    summary: `${audit.isNew ? "Created" : "Updated"} inspection type ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string, isNew?: boolean }} [audit]
 */
export async function saveInspectionTemplate(departmentId, record = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const normalized = normalizeInspectionTemplate(record, departmentId);
  if (!normalized.id) normalized.id = newId("tpl");
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  // Editing always keeps a mutable draft until publish.
  if (normalized.lifecycleStatus === "published") {
    normalized.lifecycleStatus = "draft";
  }
  if (audit.isNew) {
    await createRecord(departmentId, INSPECTION_TEMPLATES_COLLECTION, normalized.id, normalized);
  } else {
    await updateRecord(departmentId, INSPECTION_TEMPLATES_COLLECTION, normalized.id, normalized);
  }
  await writeInspectionAuditLog(departmentId, {
    action: audit.isNew ? "create" : "update",
    recordId: normalized.id,
    summary: `${audit.isNew ? "Created" : "Updated"} inspection template ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalized;
}

/**
 * Publish template: write immutable version snapshot, bump version, mark published.
 * Prior published versions remain in inspectionTemplateVersions.
 * @param {string} departmentId
 * @param {object} template
 * @param {{ changeSummary?: string, actorUid?: string, actorName?: string }} [options]
 */
export async function publishInspectionTemplate(departmentId, template = {}, options = {}) {
  if (!departmentId) throw new Error("departmentId is required");
  const current = normalizeInspectionTemplate(template, departmentId);
  if (!current.id) throw new Error("template id is required");

  const nextVersion = Number(current.currentVersion || 0) + 1;
  const versionId = `${current.id}-v${nextVersion}`;
  const stamp = nowIso();
  const snapshot = {
    name: current.name,
    description: current.description,
    inspectionTypeId: current.inspectionTypeId,
    sections: current.sections,
  };

  const versionRecord = normalizeTemplateVersion({
    id: versionId,
    departmentId,
    templateId: current.id,
    version: nextVersion,
    lifecycleStatus: "published",
    changeSummary: options.changeSummary || `Published version ${nextVersion}`,
    snapshot,
    publishedAt: stamp,
    publishedBy: options.actorName || "User",
    createdAt: stamp,
  }, departmentId);

  await createRecord(departmentId, INSPECTION_TEMPLATE_VERSIONS_COLLECTION, versionId, versionRecord);

  const published = {
    ...current,
    lifecycleStatus: "published",
    currentVersion: nextVersion,
    publishedVersionId: versionId,
    draftVersionId: "",
    changeSummary: options.changeSummary || `Published version ${nextVersion}`,
    publishedBy: options.actorName || "User",
    updatedAt: stamp,
  };

  await updateRecord(departmentId, INSPECTION_TEMPLATES_COLLECTION, current.id, published);

  await writeInspectionAuditLog(departmentId, {
    action: "publish",
    recordId: current.id,
    summary: `Published template ${current.name} as v${nextVersion}`,
    actorUid: options.actorUid || "system",
    actorName: options.actorName || "System",
    after: { versionId, version: nextVersion },
  }).catch(() => null);

  return { template: normalizeInspectionTemplate(published, departmentId), version: versionRecord };
}

/**
 * Clone a published version into a new draft template edit (restore-as-new-version pattern).
 * @param {string} departmentId
 * @param {object} version
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function restoreTemplateVersionAsDraft(departmentId, version = {}, audit = {}) {
  if (!departmentId || !version?.templateId || !version?.snapshot) {
    throw new Error("Valid template version is required");
  }
  const existing = await listInspectionTemplates(departmentId);
  const current = existing.find((row) => row.id === version.templateId);
  if (!current) throw new Error("Template not found for version restore");

  const restored = normalizeInspectionTemplate({
    ...current,
    ...version.snapshot,
    id: current.id,
    lifecycleStatus: "draft",
    changeSummary: `Restored from v${version.version}`,
    updatedAt: nowIso(),
  }, departmentId);

  await updateRecord(departmentId, INSPECTION_TEMPLATES_COLLECTION, restored.id, restored);
  await writeInspectionAuditLog(departmentId, {
    action: "restore",
    recordId: restored.id,
    summary: `Restored template draft from v${version.version}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return restored;
}

export async function archiveInspectionType(departmentId, typeId, audit = {}) {
  const types = await listInspectionTypes(departmentId);
  const current = types.find((row) => row.id === typeId);
  if (!current) return null;
  const archived = {
    ...current,
    lifecycleStatus: "archived",
    disabled: true,
    updatedAt: nowIso(),
  };
  await updateRecord(departmentId, INSPECTION_TYPES_COLLECTION, typeId, archived);
  await writeInspectionAuditLog(departmentId, {
    action: "archive",
    recordId: typeId,
    summary: `Archived inspection type ${current.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return normalizeInspectionType(archived, departmentId);
}

export async function deleteInspectionType(departmentId, typeId, audit = {}) {
  await deleteRecord(departmentId, INSPECTION_TYPES_COLLECTION, typeId);
  await writeInspectionAuditLog(departmentId, {
    action: "delete",
    recordId: typeId,
    summary: `Deleted inspection type ${typeId}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return true;
}
