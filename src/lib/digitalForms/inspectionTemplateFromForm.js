/**
 * Use a published digital form as an inspection template.
 *
 * Digital forms and inspection templates share the section/field shape
 * (functions/lib/digitalForms/schema.js), so the form's published version is
 * copied into inspectionTemplates, published as an immutable version, and set as
 * the default template of an inspection type. New inspections of that type then
 * snapshot it (inspectionWorkflow.createInspection).
 *
 * Like every inspection, a Yes/No or Pass/Fail item answered No/Fail asks for
 * remarks and photos, stored in the inspection's answers under companion keys
 * (see inspectionFailDetails.js). The template is also marked remarksOnFail.
 *
 * Running it again for the same form publishes the form's current version as the
 * next version of the same template, so revising a form can be pushed to inspections.
 */
import {
  listInspectionTemplates,
  listInspectionTypes,
  publishInspectionTemplate,
  saveInspectionTemplate,
  saveInspectionType,
} from "../inspections/inspectionConfigService.js";
import { templateFromDefinition } from "./inspectionTemplateMapping.js";
import { isUntouchedStarterTemplate } from "../inspections/platformDefaultForm.js";

export { templateFromDefinition };

/**
 * Publish `form` (a formTemplates row) as the default template of an inspection
 * type: an existing one (typeId) or a new one named newTypeName.
 * Needs manageInspectionConfig (the Firestore rules check it).
 * @returns {Promise<{ type: object, template: object, version: object, updated: boolean }>}
 */
export async function applyFormToInspections(departmentId, { form, definition, typeId = "", newTypeName = "" }, audit = {}) {
  if (!departmentId || !form?.id || !definition) throw new Error("Choose a published form.");
  const [types, templates] = await Promise.all([listInspectionTypes(departmentId), listInspectionTemplates(departmentId)]);

  let type = typeId ? types.find((row) => row.id === typeId) : null;
  if (typeId && !type) throw new Error("That inspection type wasn't found.");
  if (!type) {
    const name = String(newTypeName || definition.name || "").trim();
    if (!name) throw new Error("Name the new inspection type.");
    type = await saveInspectionType(departmentId, {
      name,
      category: "Fire Inspection",
      description: definition.description || "",
      lifecycleStatus: "published",
    }, { ...audit, isNew: true });
  }

  const existing = templates.find((row) => row.sourceDigitalFormId === form.id && row.inspectionTypeId === type.id);
  const next = templateFromDefinition(definition, { formId: form.id, inspectionTypeId: type.id });
  const saved = await saveInspectionTemplate(
    departmentId,
    existing ? { ...existing, ...next } : next,
    { ...audit, isNew: !existing },
  );
  const { template, version } = await publishInspectionTemplate(departmentId, saved, {
    ...audit,
    changeSummary: `From digital form "${definition.name}" (version ${form.currentVersion || 1})`,
  });

  if (type.defaultTemplateId !== template.id) {
    type = await saveInspectionType(departmentId, { ...type, defaultTemplateId: template.id }, audit);
  }
  return { type, template, version, updated: Boolean(existing) };
}

async function applyToTypes(departmentId, pick, { form, definition }, audit) {
  const [types, templates] = await Promise.all([listInspectionTypes(departmentId), listInspectionTemplates(departmentId)]);
  const targets = types.filter((type) => type.lifecycleStatus !== "archived" && pick(type, templates));
  const names = [];
  for (const type of targets) {
    await applyFormToInspections(departmentId, { form, definition, typeId: type.id }, audit);
    names.push(type.name);
  }
  return names;
}

/**
 * Use the department's copy of the platform default form for every starter
 * inspection type still on the default. Returns the type names.
 */
export function applyFormToStarterTypes(departmentId, { form, definition }, audit = {}) {
  return applyToTypes(departmentId, (type, templates) => {
    const current = templates.find((row) => row.id === type.defaultTemplateId);
    return isUntouchedStarterTemplate(current);
  }, { form, definition }, audit);
}

/**
 * After a form is revised, publish the new version to every inspection type
 * whose checklist comes from it. Returns the type names.
 */
export function refreshInspectionsFromForm(departmentId, { form, definition }, audit = {}) {
  return applyToTypes(departmentId, (type, templates) => templates.some(
    (row) => row.id === type.defaultTemplateId && row.sourceDigitalFormId === form.id,
  ), { form, definition }, audit);
}
