import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { buildStarterDailyCheckTemplate } from "./checklistDefaults.js";
import {
  FLEET_CHECKLIST_TEMPLATES_COLLECTION,
  FLEET_CHECKLIST_TEMPLATE_VERSIONS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function normalizeField(field = {}, index = 0) {
  return {
    id: field.id || `field-${index + 1}`,
    key: field.key || `field_${index + 1}`,
    label: field.label || `Field ${index + 1}`,
    type: field.type || "pass_fail",
    helpText: field.helpText || "",
    required: Boolean(field.required),
    meterType: field.meterType || "",
    failAction: field.failAction || "continue",
    noteRequiredOnFail: Boolean(field.noteRequiredOnFail),
    photoRequiredOnFail: Boolean(field.photoRequiredOnFail),
  };
}

function normalizeSection(section = {}, index = 0) {
  return {
    id: section.id || `section-${index + 1}`,
    title: section.title || `Section ${index + 1}`,
    fields: Array.isArray(section.fields)
      ? section.fields.map((field, fieldIndex) => normalizeField(field, fieldIndex))
      : [],
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeChecklistTemplate(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled checklist").trim(),
    checkType: data.checkType || "daily",
    description: data.description || "",
    lifecycleStatus: data.lifecycleStatus || "draft",
    currentVersion: Number(data.currentVersion) || 0,
    publishedVersionId: data.publishedVersionId || "",
    sections: Array.isArray(data.sections)
      ? data.sections.map((section, index) => normalizeSection(section, index))
      : [],
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    publishedBy: data.publishedBy || "",
    changeSummary: data.changeSummary || "",
  };
}

/**
 * @param {object} raw
 * @param {string} departmentId
 */
export function normalizeChecklistTemplateVersion(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    templateId: data.templateId || "",
    version: Number(data.version) || 1,
    name: data.name || "",
    checkType: data.checkType || "daily",
    sections: Array.isArray(data.sections)
      ? data.sections.map((section, index) => normalizeSection(section, index))
      : [],
    publishedAt: data.publishedAt || "",
    publishedBy: data.publishedBy || "",
    changeSummary: data.changeSummary || "",
    createdAt: data.createdAt || "",
  };
}

/**
 * @param {string} departmentId
 */
export async function listChecklistTemplates(departmentId) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION);
  return rows
    .map((row) => normalizeChecklistTemplate(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * @param {string} departmentId
 * @param {string} [templateId]
 */
export async function listChecklistTemplateVersions(departmentId, templateId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, FLEET_CHECKLIST_TEMPLATE_VERSIONS_COLLECTION);
  return rows
    .map((row) => normalizeChecklistTemplateVersion(row, departmentId))
    .filter((row) => !templateId || row.templateId === templateId)
    .sort((a, b) => Number(b.version) - Number(a.version));
}

/**
 * @param {string} departmentId
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function ensureChecklistTemplatesSeeded(departmentId, audit = {}) {
  if (!departmentId) return [];
  const existing = await listChecklistTemplates(departmentId);
  if (existing.length) return existing;

  const starter = normalizeChecklistTemplate({
    ...buildStarterDailyCheckTemplate(),
    departmentId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }, departmentId);
  await createRecord(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION, starter.id, starter);

  // Auto-publish v1 so checks can start immediately.
  const published = await publishChecklistTemplate(departmentId, starter, {
    ...audit,
    changeSummary: "Initial starter publish",
  });

  await writeFleetAuditLog(departmentId, {
    action: "seed",
    recordId: starter.id,
    summary: "Seeded starter daily apparatus checklist",
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return [published.template];
}

/**
 * @param {string} departmentId
 * @param {object} record
 * @param {{ actorUid?: string, actorName?: string }} [audit]
 */
export async function saveChecklistTemplate(departmentId, record = {}, audit = {}) {
  const normalized = normalizeChecklistTemplate(record, departmentId);
  if (!normalized.id) normalized.id = newId("tpl");
  const stamp = nowIso();
  normalized.updatedAt = stamp;
  if (!normalized.createdAt) normalized.createdAt = stamp;
  if (normalized.lifecycleStatus === "published") {
    // Saving draft content keeps published version; mark draft edits.
    normalized.lifecycleStatus = normalized.currentVersion > 0 ? "published" : "draft";
  }

  const exists = (await listChecklistTemplates(departmentId)).some((row) => row.id === normalized.id);
  if (exists) {
    await updateRecord(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION, normalized.id, normalized);
  } else {
    await createRecord(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION, normalized.id, normalized);
  }

  await writeFleetAuditLog(departmentId, {
    action: exists ? "update" : "create",
    recordId: normalized.id,
    summary: `${exists ? "Updated" : "Created"} checklist template ${normalized.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return normalized;
}

/**
 * Publish immutable snapshot. Historical checks keep their templateSnapshot.
 * @param {string} departmentId
 * @param {object} template
 * @param {{ actorUid?: string, actorName?: string, changeSummary?: string }} [audit]
 */
export async function publishChecklistTemplate(departmentId, template = {}, audit = {}) {
  const draft = normalizeChecklistTemplate(template, departmentId);
  const nextVersion = Number(draft.currentVersion || 0) + 1;
  const versionId = `${draft.id}-v${nextVersion}`;
  const stamp = nowIso();
  const version = normalizeChecklistTemplateVersion({
    id: versionId,
    departmentId,
    templateId: draft.id,
    version: nextVersion,
    name: draft.name,
    checkType: draft.checkType,
    sections: draft.sections,
    publishedAt: stamp,
    publishedBy: audit.actorName || "User",
    changeSummary: audit.changeSummary || draft.changeSummary || `Published v${nextVersion}`,
    createdAt: stamp,
  }, departmentId);

  await createRecord(departmentId, FLEET_CHECKLIST_TEMPLATE_VERSIONS_COLLECTION, versionId, version);

  const published = normalizeChecklistTemplate({
    ...draft,
    currentVersion: nextVersion,
    publishedVersionId: versionId,
    lifecycleStatus: "published",
    publishedBy: audit.actorName || "User",
    changeSummary: version.changeSummary,
    updatedAt: stamp,
  }, departmentId);

  await updateRecord(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION, published.id, published)
    .catch(async () => {
      await createRecord(departmentId, FLEET_CHECKLIST_TEMPLATES_COLLECTION, published.id, published);
    });

  await writeFleetAuditLog(departmentId, {
    action: "publish",
    recordId: published.id,
    summary: `Published checklist ${published.name} v${nextVersion}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return { template: published, version };
}

/**
 * Latest published version for a template, or null.
 * @param {string} departmentId
 * @param {string} templateId
 */
export async function getPublishedChecklistSnapshot(departmentId, templateId) {
  const templates = await listChecklistTemplates(departmentId);
  const template = templates.find((row) => row.id === templateId);
  if (!template?.publishedVersionId) {
    if (template?.sections?.length) {
      return {
        templateId: template.id,
        version: template.currentVersion || 0,
        name: template.name,
        checkType: template.checkType,
        sections: template.sections,
      };
    }
    return null;
  }
  const versions = await listChecklistTemplateVersions(departmentId, templateId);
  const version = versions.find((row) => row.id === template.publishedVersionId) || versions[0];
  if (!version) return null;
  return {
    templateId: template.id,
    versionId: version.id,
    version: version.version,
    name: version.name || template.name,
    checkType: version.checkType || template.checkType,
    sections: version.sections,
  };
}
