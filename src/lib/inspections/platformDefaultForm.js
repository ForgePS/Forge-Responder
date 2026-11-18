/**
 * The platform's default inspection form (pure helpers, no Firebase).
 *
 * A platform creator picks one published digital form (Digital Forms → Manage →
 * "Make platform default") and its checklist is stored in
 * platformConfig/defaultInspectionForm. Every department's starter inspection
 * templates (tpl-<starter type id>, see STARTER_INSPECTION_TYPES) use it until
 * the department changes the template: edits it, publishes it, or points the
 * type at its own form. Templates a department has changed are never touched.
 */
import { buildStarterTemplateDraft, STARTER_INSPECTION_TYPES } from "./configDefaults.js";
import { templateFromDefinition } from "../digitalForms/inspectionTemplateMapping.js";

export const PLATFORM_DEFAULT_FORM_DOC = "defaultInspectionForm";

const STARTER_NAMES = new Map(STARTER_INSPECTION_TYPES.map((row) => [row.id, row.name]));

const clean = (value) => String(value ?? "").trim();

/** A short fingerprint of a template's name, description and questions, to tell whether a department changed it. */
export function templateSignature(template = {}) {
  const text = JSON.stringify([
    clean(template.name),
    clean(template.description),
    (template.sections || []).map((section) => [
      clean(section.title),
      (section.fields || []).map((f) => [clean(f.key), f.type || "short_text", clean(f.label), Boolean(f.required), (f.options || []).map(String).join("|")]),
    ]),
  ]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.length}-${hash.toString(36)}`;
}

/** The stored default, cleaned; null when none is set or it has no questions. */
export function normalizePlatformDefaultForm(raw) {
  if (!raw || typeof raw !== "object" || !raw.version) return null;
  const sections = Array.isArray(raw.sections) ? raw.sections.filter((s) => Array.isArray(s?.fields) && s.fields.length) : [];
  if (!sections.length) return null;
  return {
    version: String(raw.version),
    name: String(raw.name || "Inspection form"),
    description: String(raw.description || ""),
    sections,
    sourceDepartmentId: raw.sourceDepartmentId || "",
    sourceFormId: raw.sourceFormId || "",
    sourceFormVersion: Number(raw.sourceFormVersion) || 0,
    setAt: raw.setAt || "",
    setBy: raw.setBy || "",
  };
}

/** The document to store when a creator makes `form` (its published `definition`) the default. */
export function platformDefaultFormRecord({ departmentId, form, definition }, { actorName = "", now = new Date().toISOString() } = {}) {
  const template = templateFromDefinition(definition, { formId: form?.id || "" });
  return {
    version: `${departmentId}:${form?.id || ""}:v${form?.currentVersion || 1}:${now}`,
    name: definition?.name || form?.name || "Inspection form",
    description: definition?.description || "",
    sections: template.sections,
    sourceDepartmentId: departmentId || "",
    sourceFormId: form?.id || "",
    sourceFormVersion: Number(form?.currentVersion) || 1,
    setAt: now,
    setBy: actorName,
  };
}

/**
 * The template fields a starter type gets from the default:
 * the default's questions under "<starter type name> form", with a fingerprint
 * so a later change by the department can be told apart.
 */
export function starterTemplateFromDefault(defaultForm, typeId) {
  const fields = {
    name: `${STARTER_NAMES.get(typeId) || "Inspection"} form`,
    description: `Default form: ${defaultForm.name}.`,
    sections: defaultForm.sections,
    remarksOnFail: true,
    starterFormVersion: defaultForm.version,
  };
  return { ...fields, starterFormSignature: templateSignature(fields) };
}

/**
 * Whether the department has left this starter template as the platform made it:
 * a starter id, never published, not from one of its own forms, and the same name,
 * description and questions it was seeded (or last refreshed from the default) with.
 */
export function isUntouchedStarterTemplate(template) {
  const typeId = template?.inspectionTypeId;
  if (!template?.id || !STARTER_NAMES.has(typeId) || template.id !== `tpl-${typeId}`) return false;
  if (template.publishedVersionId || Number(template.currentVersion) > 0 || template.sourceDigitalFormId) return false;
  const expected = template.starterFormVersion
    ? template.starterFormSignature
    : templateSignature(buildStarterTemplateDraft(typeId, STARTER_NAMES.get(typeId)));
  return Boolean(expected) && templateSignature(template) === expected;
}

/** Whether an untouched starter template should be refreshed to this default. */
export function starterTemplateNeedsDefault(template, defaultForm) {
  return Boolean(defaultForm) && isUntouchedStarterTemplate(template) && template.starterFormVersion !== defaultForm.version;
}

/** The checklist a new inspection snapshots from an untouched starter template when a default is set. */
export function defaultFormSnapshotFor(template, defaultForm) {
  if (!defaultForm || !isUntouchedStarterTemplate(template)) return null;
  const fields = starterTemplateFromDefault(defaultForm, template.inspectionTypeId);
  return {
    name: fields.name,
    description: fields.description,
    inspectionTypeId: template.inspectionTypeId,
    remarksOnFail: true,
    sections: fields.sections,
  };
}
