/**
 * Pure mapping from a digital form definition to an inspection template
 * (no Firebase, so unit tests can load it). Used by inspectionTemplateFromForm.js.
 */
/** The inspection template (sections and settings) made from a form's published definition. */
export function templateFromDefinition(definition = {}, { formId = "", inspectionTypeId = "" } = {}) {
  const sections = (definition.sections || []).map((section, sectionIndex) => ({
    id: section.id || `sec-${sectionIndex + 1}`,
    title: section.title || `Section ${sectionIndex + 1}`,
    sortOrder: sectionIndex,
    fields: (section.fields || []).map((field, fieldIndex) => ({
      id: field.id || `fld-${fieldIndex + 1}`,
      key: field.key,
      type: field.type,
      label: field.label,
      helpText: field.helpText || "",
      placeholder: field.placeholder || "",
      required: Boolean(field.required),
      options: Array.isArray(field.options) ? [...field.options] : [],
      sortOrder: fieldIndex,
    })),
  }));
  return {
    name: definition.name || "Untitled template",
    description: definition.description || "",
    inspectionTypeId,
    sections,
    remarksOnFail: true,
    sourceDigitalFormId: formId,
  };
}
