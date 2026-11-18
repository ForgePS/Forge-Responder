/**
 * Digital Forms: the form definition and answer rules, shared by conversion,
 * review, publish and submit. Pure (no Firebase) so unit tests can load it.
 *
 * A definition uses the same section/field shape as inspection templates
 * (src/lib/inspections/inspectionConfigService.js normalizeInspectionTemplate),
 * so the app renders it with ChecklistFieldInput and checks answers with
 * src/lib/inspections/checklistFields.js:
 *
 *   { name, description, linkType,
 *     sections: [{ id, title, sortOrder,
 *       fields: [{ id, key, type, label, helpText, placeholder, required, options, sortOrder }] }] }
 *
 * Answers are stored as answers[field.key], with the same shapes as inspections:
 * text/number as strings, date "YYYY-MM-DD", checkbox boolean, choices string,
 * multi_select string[], signature { name, signedAt } (a typed name).
 *
 * linkType ("" or one of LINK_TYPES) asks members to pick the record the
 * submission is about (an apparatus, occupancy, station or member).
 *
 * A Yes/No or Pass/Fail answer of No/Fail opens remarks (required) and photos
 * (optional): details[field.key] = { remarks, photos: [storage path] }.
 */

/** Field types a converted paper form may use (a subset of TEMPLATE_FIELD_TYPES). */
const FIELD_TYPES = [
  "heading", "instruction",
  "short_text", "long_text", "number", "date", "checkbox",
  "single_select", "dropdown", "multi_select",
  "yes_no", "pass_fail", "pass_fail_na",
  "signature",
];
const DISPLAY_TYPES = new Set(["heading", "instruction"]);
const OPTION_TYPES = new Set(["single_select", "dropdown", "multi_select"]);
/** Records a form can be linked to. */
const LINK_TYPES = ["apparatus", "occupancy", "station", "personnel"];
/** The answer that opens remarks and photos, per field type. */
const NEGATIVE_ANSWERS = { yes_no: "No", pass_fail: "Fail", pass_fail_na: "Fail" };
const FIXED_CHOICES = {
  yes_no: ["Yes", "No"],
  pass_fail: ["Pass", "Fail"],
  pass_fail_na: ["Pass", "Fail", "N/A"],
};
// Words a model (or a person) might use for a type, mapped to ours.
const TYPE_ALIASES = {
  text: "short_text", string: "short_text", textbox: "short_text", short: "short_text",
  textarea: "long_text", paragraph: "long_text", multiline: "long_text", notes: "long_text",
  integer: "number", decimal: "number", numeric: "number", currency: "number",
  datetime: "date", time: "short_text",
  boolean: "checkbox", check: "checkbox", tickbox: "checkbox",
  select: "single_select", radio: "single_select", choice: "single_select",
  multiselect: "multi_select", checkboxes: "multi_select",
  yesno: "yes_no", passfail: "pass_fail",
  section: "heading", title: "heading", label: "instruction", text_block: "instruction",
};

const LIMITS = Object.freeze({
  nameChars: 160,
  descriptionChars: 2000,
  sections: 40,
  fieldsPerSection: 120,
  fields: 400,
  labelChars: 300,
  helpChars: 1000,
  placeholderChars: 200,
  options: 60,
  optionChars: 200,
  shortTextChars: 2000,
  longTextChars: 20000,
  signatureNameChars: 200,
  remarksChars: 4000,
  photosPerField: 6,
  photosPerSubmission: 40,
});

const clean = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const cleanMultiline = (value, max) => String(value ?? "").replace(/\r\n/g, "\n").trim().slice(0, max);

function normalizeType(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (FIELD_TYPES.includes(raw)) return raw;
  const alias = TYPE_ALIASES[raw] || TYPE_ALIASES[raw.replace(/_/g, "")];
  return alias || "short_text";
}

/** A stable answer key from a label: lower_snake_case, letters and digits only. */
function keyFromLabel(label, fallback) {
  const key = String(label || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return /^[a-z]/.test(key) ? key : fallback;
}

function cleanKey(value) {
  const key = String(value || "").trim().replace(/[^A-Za-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
  return /^[A-Za-z]/.test(key) ? key : "";
}

function cleanOptions(options) {
  if (!Array.isArray(options)) return [];
  const seen = new Set();
  const out = [];
  for (const option of options) {
    const label = clean(option && typeof option === "object" ? option.label ?? option.value : option, LIMITS.optionChars);
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
    if (out.length >= LIMITS.options) break;
  }
  return out;
}

/**
 * Clean any definition (from the model, or edited in review) into the stored
 * shape. Never throws; problems that block publishing come from validateDefinition.
 * Keys are kept when valid and unique, otherwise made from the label.
 */
function normalizeDefinition(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const usedKeys = new Set();
  const usedIds = new Set();
  let fieldCount = 0;
  const uniqueId = (wanted, prefix, n) => {
    let id = cleanKey(wanted) || `${prefix}_${n}`;
    while (usedIds.has(id)) id = `${id}_${n}`;
    usedIds.add(id);
    return id;
  };

  const rawSections = Array.isArray(data.sections) ? data.sections.slice(0, LIMITS.sections) : [];
  const sections = rawSections.map((section, sectionIndex) => {
    const s = section && typeof section === "object" ? section : {};
    const rawFields = Array.isArray(s.fields) ? s.fields.slice(0, LIMITS.fieldsPerSection) : [];
    const fields = [];
    for (const field of rawFields) {
      if (fieldCount >= LIMITS.fields) break;
      const f = field && typeof field === "object" ? field : {};
      const type = normalizeType(f.type);
      const label = clean(f.label, LIMITS.labelChars);
      if (!label && !DISPLAY_TYPES.has(type)) continue;
      fieldCount += 1;
      let key = cleanKey(f.key) || keyFromLabel(label, `field_${fieldCount}`);
      if (usedKeys.has(key)) {
        let n = 2;
        while (usedKeys.has(`${key}_${n}`)) n += 1;
        key = `${key}_${n}`;
      }
      usedKeys.add(key);
      fields.push({
        id: uniqueId(f.id, "fld", fieldCount),
        key,
        type,
        label: label || (type === "heading" ? "Heading" : "Instructions"),
        helpText: cleanMultiline(f.helpText, LIMITS.helpChars),
        placeholder: clean(f.placeholder, LIMITS.placeholderChars),
        required: DISPLAY_TYPES.has(type) ? false : Boolean(f.required),
        options: OPTION_TYPES.has(type) ? cleanOptions(f.options) : [],
        sortOrder: fields.length,
      });
    }
    return {
      id: uniqueId(s.id, "sec", sectionIndex + 1),
      title: clean(s.title, LIMITS.labelChars) || `Section ${sectionIndex + 1}`,
      sortOrder: sectionIndex,
      fields,
    };
  });

  return {
    name: clean(data.name, LIMITS.nameChars) || "Untitled form",
    description: cleanMultiline(data.description, LIMITS.descriptionChars),
    linkType: normalizeLinkType(data.linkType),
    sections,
  };
}

function normalizeLinkType(value) {
  const type = String(value || "").trim().toLowerCase();
  return LINK_TYPES.includes(type) ? type : "";
}

/** True when this answer should open remarks and photos. */
function isNegativeAnswer(field, value) {
  return Boolean(NEGATIVE_ANSWERS[field?.type]) && value === NEGATIVE_ANSWERS[field.type];
}

/** Problems that stop a definition from being published (empty list = OK). */
function validateDefinition(definition) {
  const problems = [];
  const sections = Array.isArray(definition?.sections) ? definition.sections : [];
  if (!clean(definition?.name, LIMITS.nameChars) || definition.name === "Untitled form") {
    problems.push("Give the form a name.");
  }
  const answerable = sections.flatMap((s) => s.fields || []).filter((f) => !DISPLAY_TYPES.has(f.type));
  if (!answerable.length) problems.push("Add at least one field members can fill in.");
  for (const section of sections) {
    for (const field of section.fields || []) {
      if (OPTION_TYPES.has(field.type) && (field.options || []).length < 2) {
        problems.push(`"${field.label}" needs at least two choices.`);
      }
    }
  }
  return problems;
}

/** Choices a member may pick for a field (fixed for yes/no and pass/fail). */
function fieldOptions(field) {
  return FIXED_CHOICES[field.type] ? [...FIXED_CHOICES[field.type]] : (field.options || []);
}

function isFilled(field, value) {
  if (DISPLAY_TYPES.has(field.type)) return true;
  if (value == null) return false;
  if (field.type === "checkbox") return value === true;
  if (field.type === "multi_select") return Array.isArray(value) && value.length > 0;
  if (field.type === "signature") return Boolean(value && typeof value === "object" && String(value.name || "").trim() && value.signedAt);
  if (field.type === "number") return String(value).trim() !== "" && Number.isFinite(Number(value));
  return String(value).trim() !== "";
}

/**
 * Check and clean a member's answers against a published definition.
 * Unknown keys are dropped. Returns { answers, problems } where problems name
 * fields that are invalid or required and empty (in form order).
 */
function cleanAnswers(definition, rawAnswers = {}, { now = new Date().toISOString(), details: rawDetails = {}, isPhotoPath = () => false } = {}) {
  const input = rawAnswers && typeof rawAnswers === "object" && !Array.isArray(rawAnswers) ? rawAnswers : {};
  const detailInput = rawDetails && typeof rawDetails === "object" && !Array.isArray(rawDetails) ? rawDetails : {};
  const answers = {};
  const details = {};
  const problems = [];
  let photoCount = 0;
  for (const section of definition?.sections || []) {
    for (const field of section.fields || []) {
      if (DISPLAY_TYPES.has(field.type)) continue;
      const value = input[field.key];
      let cleaned;
      let invalid = false;
      if (value === undefined || value === null || value === "") {
        cleaned = undefined;
      } else if (field.type === "checkbox") {
        if (typeof value === "boolean") cleaned = value; else invalid = true;
      } else if (field.type === "number") {
        const text = String(value).trim();
        if (text === "" ) cleaned = undefined;
        else if (Number.isFinite(Number(text)) && text.length <= 40) cleaned = text;
        else invalid = true;
      } else if (field.type === "date") {
        const text = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`))) cleaned = text; else invalid = true;
      } else if (field.type === "multi_select") {
        const options = fieldOptions(field);
        if (Array.isArray(value) && value.every((v) => options.includes(String(v)))) cleaned = [...new Set(value.map(String))];
        else invalid = true;
      } else if (OPTION_TYPES.has(field.type) || FIXED_CHOICES[field.type]) {
        if (typeof value === "string" && fieldOptions(field).includes(value)) cleaned = value; else invalid = true;
      } else if (field.type === "signature") {
        const name = value && typeof value === "object" ? clean(value.name, LIMITS.signatureNameChars) : "";
        if (name) cleaned = { name, signedAt: now }; else invalid = true;
      } else if (field.type === "long_text") {
        if (typeof value === "string") cleaned = cleanMultiline(value, LIMITS.longTextChars) || undefined; else invalid = true;
      } else if (typeof value === "string" || typeof value === "number") {
        cleaned = cleanMultiline(String(value), LIMITS.shortTextChars) || undefined;
      } else {
        invalid = true;
      }
      if (invalid) {
        problems.push(`"${field.label}" has an answer that doesn't fit the field.`);
        continue;
      }
      if (cleaned !== undefined) answers[field.key] = cleaned;
      if (field.required && !isFilled(field, cleaned)) problems.push(`"${field.label}" is required.`);
      // Remarks and photos are kept only for a No/Fail answer, and remarks are then required.
      if (isNegativeAnswer(field, cleaned)) {
        const raw = detailInput[field.key] && typeof detailInput[field.key] === "object" ? detailInput[field.key] : {};
        const remarks = typeof raw.remarks === "string" ? cleanMultiline(raw.remarks, LIMITS.remarksChars) : "";
        const rawPhotos = Array.isArray(raw.photos) ? raw.photos : [];
        const photos = [...new Set(rawPhotos.map((p) => String(p || "")))];
        if (photos.length > LIMITS.photosPerField) {
          problems.push(`"${field.label}" has more than ${LIMITS.photosPerField} photos.`);
        } else if (photos.some((p) => !isPhotoPath(p))) {
          problems.push(`A photo on "${field.label}" couldn't be found. Remove it and add it again.`);
        }
        photoCount += photos.length;
        if (!remarks) problems.push(`Add remarks for "${field.label}".`);
        details[field.key] = { remarks, photos };
      }
    }
  }
  if (photoCount > LIMITS.photosPerSubmission) problems.push(`A form can have at most ${LIMITS.photosPerSubmission} photos.`);
  return { answers, details, problems };
}

function countFields(definition) {
  return (definition?.sections || []).reduce((n, s) => n + (s.fields || []).filter((f) => !DISPLAY_TYPES.has(f.type)).length, 0);
}

module.exports = {
  FIELD_TYPES,
  LINK_TYPES,
  LIMITS,
  NEGATIVE_ANSWERS,
  cleanAnswers,
  countFields,
  fieldOptions,
  isNegativeAnswer,
  normalizeLinkType,
  normalizeDefinition,
  normalizeType,
  validateDefinition,
};
