/**
 * Remarks and photos on a No/Fail answer in an inspection, for templates with
 * remarksOnFail (templates made from a digital form). They live in the
 * inspection's own answers under companion keys, so saving, offline sync and
 * the template snapshot all work unchanged:
 *
 *   answers[`${key}__remarks`]  string   required when answers[key] is No/Fail
 *   answers[`${key}__photos`]   photo[]  optional (the inspection photo field: attachments)
 */
export const NEGATIVE_ANSWERS = { yes_no: "No", pass_fail: "Fail", pass_fail_na: "Fail" };
export const REMARKS_SUFFIX = "__remarks";
export const PHOTOS_SUFFIX = "__photos";

export function isFailAnswer(field, value) {
  return Boolean(NEGATIVE_ANSWERS[field?.type]) && value === NEGATIVE_ANSWERS[field.type];
}

/** The extra inputs shown under a No/Fail answer (rendered with ChecklistFieldInput). */
export function failDetailFields(field) {
  const answer = NEGATIVE_ANSWERS[field.type] || "No";
  return {
    remarks: {
      id: `${field.id || field.key}${REMARKS_SUFFIX}`,
      key: `${field.key}${REMARKS_SUFFIX}`,
      type: "long_text",
      label: `Remarks for ${answer}`,
      placeholder: "What's wrong, and what was done about it?",
      required: true,
      options: [],
    },
    photos: {
      id: `${field.id || field.key}${PHOTOS_SUFFIX}`,
      key: `${field.key}${PHOTOS_SUFFIX}`,
      type: "photo",
      label: field.label,
      required: false,
      options: [],
    },
  };
}

/** No/Fail items still missing remarks: [{ key, label }] (key is the remarks key). */
export function findMissingFailRemarks(templateSnapshot, answers = {}) {
  if (!templateSnapshot?.remarksOnFail) return [];
  const missing = [];
  for (const section of templateSnapshot.sections || []) {
    for (const field of section.fields || []) {
      if (!isFailAnswer(field, answers[field.key])) continue;
      const key = `${field.key}${REMARKS_SUFFIX}`;
      if (!String(answers[key] || "").trim()) missing.push({ key, label: `Remarks for "${field.label}"` });
    }
  }
  return missing;
}
