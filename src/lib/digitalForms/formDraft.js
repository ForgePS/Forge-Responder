/**
 * Editing helpers for a digital form definition (the same section/field shape
 * as inspection templates). Firebase-free so unit tests can load it. The
 * server re-cleans and re-checks everything (functions/lib/digitalForms/schema.js).
 */

export const DIGITAL_FORM_FIELD_TYPES = [
  { id: "short_text", label: "Short text" },
  { id: "long_text", label: "Long text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "checkbox", label: "Checkbox" },
  { id: "single_select", label: "Choose one" },
  { id: "dropdown", label: "Dropdown" },
  { id: "multi_select", label: "Choose any" },
  { id: "yes_no", label: "Yes / No" },
  { id: "pass_fail", label: "Pass / Fail" },
  { id: "pass_fail_na", label: "Pass / Fail / N/A" },
  { id: "signature", label: "Signature (typed name)" },
  { id: "heading", label: "Heading (no answer)" },
  { id: "instruction", label: "Instructions (no answer)" },
];

export const OPTION_FIELD_TYPES = new Set(["single_select", "dropdown", "multi_select"]);
export const DISPLAY_FIELD_TYPES = new Set(["heading", "instruction"]);

let counter = 0;
const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(counter += 1).toString(36)}`;

export function newField(type = "short_text") {
  return { id: newId("fld"), key: "", type, label: "New field", helpText: "", placeholder: "", required: false, options: [] };
}

export function newSection(index = 0) {
  return { id: newId("sec"), title: `Section ${index + 1}`, fields: [newField()] };
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function move(list, from, to) {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Immutable edits used by the review editor. */
export const draftEdits = {
  setForm: (draft, patch) => ({ ...draft, ...patch }),
  setSection: (draft, si, patch) => {
    const next = clone(draft);
    Object.assign(next.sections[si], patch);
    return next;
  },
  addSection: (draft) => ({ ...draft, sections: [...(draft.sections || []), newSection((draft.sections || []).length)] }),
  removeSection: (draft, si) => ({ ...draft, sections: draft.sections.filter((_, i) => i !== si) }),
  moveSection: (draft, si, delta) => ({ ...draft, sections: move(draft.sections, si, si + delta) }),
  setField: (draft, si, fi, patch) => {
    const next = clone(draft);
    const field = next.sections[si].fields[fi];
    Object.assign(field, patch);
    if (!OPTION_FIELD_TYPES.has(field.type)) field.options = [];
    if (DISPLAY_FIELD_TYPES.has(field.type)) field.required = false;
    return next;
  },
  addField: (draft, si, type) => {
    const next = clone(draft);
    next.sections[si].fields.push(newField(type));
    return next;
  },
  removeField: (draft, si, fi) => {
    const next = clone(draft);
    next.sections[si].fields.splice(fi, 1);
    return next;
  },
  /** Move a field up/down, crossing into the neighbouring section at the edges. */
  moveField: (draft, si, fi, delta) => {
    const next = clone(draft);
    const fields = next.sections[si].fields;
    const target = fi + delta;
    if (target >= 0 && target < fields.length) {
      next.sections[si].fields = move(fields, fi, target);
      return next;
    }
    const otherIndex = si + delta;
    if (otherIndex < 0 || otherIndex >= next.sections.length) return draft;
    const [field] = fields.splice(fi, 1);
    if (delta < 0) next.sections[otherIndex].fields.push(field);
    else next.sections[otherIndex].fields.unshift(field);
    return next;
  },
};

/** Options typed one per line -> list. */
export function parseOptions(textValue) {
  const seen = new Set();
  return String(textValue || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !seen.has(line.toLowerCase()) && seen.add(line.toLowerCase()));
}

/** Quick checks shown while reviewing (the server's list is the one that counts). */
export function reviewProblems(draft) {
  const problems = [];
  if (!String(draft?.name || "").trim() || draft.name === "Untitled form") problems.push("Give the form a name.");
  const fields = (draft?.sections || []).flatMap((s) => s.fields || []);
  if (!fields.some((f) => !DISPLAY_FIELD_TYPES.has(f.type))) problems.push("Add at least one field members can fill in.");
  for (const field of fields) {
    if (!String(field.label || "").trim() && !DISPLAY_FIELD_TYPES.has(field.type)) problems.push("Every field needs a label.");
    if (OPTION_FIELD_TYPES.has(field.type) && (field.options || []).length < 2) problems.push(`"${field.label}" needs at least two choices.`);
  }
  return [...new Set(problems)];
}

export function answerableCount(definition) {
  return (definition?.sections || []).reduce((n, s) => n + (s.fields || []).filter((f) => !DISPLAY_FIELD_TYPES.has(f.type)).length, 0);
}

/** Platform records a form can be linked to (matches functions/lib/digitalForms/schema.js LINK_TYPES). */
export const LINK_TYPE_OPTIONS = [
  { id: "", label: "Nothing (not linked)" },
  { id: "apparatus", label: "Apparatus" },
  { id: "occupancy", label: "Occupancy" },
  { id: "station", label: "Station" },
  { id: "personnel", label: "Personnel (a member)" },
];
export const LINK_TYPE_LABELS = { apparatus: "Apparatus", occupancy: "Occupancy", station: "Station", personnel: "Member" };

/** The answer that opens remarks and photos, per field type. */
export const NEGATIVE_ANSWERS = { yes_no: "No", pass_fail: "Fail", pass_fail_na: "Fail" };
export const MAX_PHOTOS_PER_FIELD = 6;

export function isNegativeAnswer(field, value) {
  return Boolean(NEGATIVE_ANSWERS[field?.type]) && value === NEGATIVE_ANSWERS[field.type];
}

/** Fields answered No/Fail that still need remarks: [{ key, label }]. */
export function missingRemarks(definition, answers = {}, details = {}) {
  const missing = [];
  for (const section of definition?.sections || []) {
    for (const field of section.fields || []) {
      if (isNegativeAnswer(field, answers[field.key]) && !String(details[field.key]?.remarks || "").trim()) {
        missing.push({ key: field.key, label: field.label });
      }
    }
  }
  return missing;
}

/** Remarks and photos to send: only for fields currently answered No/Fail. */
export function detailsToSubmit(definition, answers = {}, details = {}) {
  const out = {};
  for (const section of definition?.sections || []) {
    for (const field of section.fields || []) {
      if (!isNegativeAnswer(field, answers[field.key])) continue;
      const entry = details[field.key] || {};
      out[field.key] = {
        remarks: String(entry.remarks || ""),
        photos: (entry.photos || []).map((photo) => photo.path).filter(Boolean),
      };
    }
  }
  return out;
}

export const IMPORT_STATUS_LABELS = {
  awaiting_upload: "Uploading",
  converting: "Converting",
  review: "Needs review",
  failed: "Conversion failed",
  published: "Published",
  discarded: "Discarded",
};
