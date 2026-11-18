/**
 * Department customization of the patient care report form (pure; unit tested).
 *
 * Stored in departments/{id}/settings/emsForm, edited by admins on the RMS Patient Care Reports page, and applied
 * in the RMS editor and in FORGE FIELD:
 *
 *   {
 *     sections: { [sectionId]: { hidden } },
 *     fields: { [element]: { hidden, label, help, required, options, pinned, choices, defaultValue } },
 *     aiNarrative: boolean,
 *   }
 *
 *   - label / help: the department's wording (the NEMSIS name stays visible next to it)
 *   - options: the codes to offer for a NEMSIS code list, in that order (empty = every code)
 *   - pinned: codes listed first
 *   - choices: a department drop-down for a free-text field (e.g. destination names); typing anything else still works
 *   - required: the department wants it filled before posting (fields outside repeating groups)
 *   - defaultValue: filled in on new reports
 *   - hidden: left off the form. NEMSIS Mandatory and Required fields are always shown, so a report stays postable.
 *   - aiNarrative: the AI narrative writer is switched on (it sends de-identified clinical details to an AI service)
 */
import { PCR_SECTIONS, fieldPath, getLeaf, sectionLayout, setLeaf } from "../nemsis/pcrModel.js";
import { isEmptyLeaf } from "../nemsis/schema.js";

export const EMS_FORM_DOC = "emsForm";

const SECTION_IDS = new Set(PCR_SECTIONS.map((s) => s.id));
const ELEMENT = /^e[A-Za-z]+\.\d{2,3}$/;
const LIMITS = { label: 80, help: 300, defaultValue: 255, choice: 120, code: 40, choices: 200, options: 3000 };

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const list = (value, max, each) => (Array.isArray(value) ? [...new Set(value.map((v) => text(v, each)).filter(Boolean))].slice(0, max) : []);

/** NEMSIS Mandatory and Required fields can't be hidden. */
export const mustShow = (field) => field.usage === "Mandatory" || field.usage === "Required";

export function normalizePcrForm(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const sections = {};
  for (const [id, cfg] of Object.entries(data.sections || {})) {
    if (SECTION_IDS.has(id) && cfg?.hidden === true) sections[id] = { hidden: true };
  }
  const fields = {};
  for (const [el, cfg] of Object.entries(data.fields || {})) {
    if (!ELEMENT.test(el) || !cfg || typeof cfg !== "object") continue;
    const out = {};
    if (cfg.hidden === true) out.hidden = true;
    if (cfg.required === true) out.required = true;
    const label = text(cfg.label, LIMITS.label);
    if (label) out.label = label;
    const help = text(cfg.help, LIMITS.help);
    if (help) out.help = help;
    const defaultValue = text(cfg.defaultValue, LIMITS.defaultValue);
    if (defaultValue) out.defaultValue = defaultValue;
    const options = list(cfg.options, LIMITS.options, LIMITS.code);
    if (options.length) out.options = options;
    const pinned = list(cfg.pinned, 50, LIMITS.code);
    if (pinned.length) out.pinned = pinned;
    const choices = list(cfg.choices, LIMITS.choices, LIMITS.choice);
    if (choices.length) out.choices = choices;
    if (Object.keys(out).length) fields[el] = out;
  }
  return { sections, fields, aiNarrative: data.aiNarrative === true };
}

const indexCache = new WeakMap();

/**
 * Every field on the form: Map element → { field, sectionId, inRepeat, groups } (groups: labels of the groups on the
 * way, for the settings screen). Cached per schema.
 */
export function formFieldIndex(schema) {
  if (indexCache.has(schema)) return indexCache.get(schema);
  const index = new Map();
  for (const section of PCR_SECTIONS) {
    const walk = (items, inRepeat, groups) => items.forEach((item) => {
      if (item.type === "field") index.set(item.field.el, { field: item.field, sectionId: section.id, inRepeat, groups });
      else walk(item.children, inRepeat || item.repeating, [...groups, item.label]);
    });
    walk(sectionLayout(schema, section.id), false, []);
  }
  indexCache.set(schema, index);
  return index;
}

/** Can the department hide this section? Not when it holds a NEMSIS Mandatory or Required field. */
export function sectionCanHide(schema, sectionId) {
  for (const entry of formFieldIndex(schema).values()) {
    if (entry.sectionId === sectionId && mustShow(entry.field)) return false;
  }
  return true;
}

export function visibleSections(schema, form) {
  return PCR_SECTIONS.filter((s) => !(form?.sections?.[s.id]?.hidden && sectionCanHide(schema, s.id)));
}

/**
 * A field descriptor (pcrModel fieldInput) with the department's wording and lists:
 * label, nemsisLabel, help, options (allowed codes, pinned first), choices, departmentRequired, defaultValue.
 */
export function customizeField(field, cfg, { inRepeat = false } = {}) {
  const c = cfg || {};
  let options = field.options;
  if (options && c.options?.length) {
    const byCode = new Map(options.map((o) => [o.code, o]));
    options = c.options.map((code) => byCode.get(code)).filter(Boolean);
    if (!options.length) options = field.options;
  }
  if (options && c.pinned?.length) {
    const pinned = c.pinned.filter((code) => options.some((o) => o.code === code));
    options = [...pinned.map((code) => ({ ...options.find((o) => o.code === code), pinned: true })), ...options.filter((o) => !pinned.includes(o.code))];
  }
  const textKind = field.kind === "text" || field.kind === "textarea";
  return {
    ...field,
    nemsisLabel: field.label,
    label: c.label || field.label,
    help: c.help || "",
    options,
    choices: textKind && !field.repeating ? c.choices || [] : [],
    departmentRequired: Boolean(c.required) && !inRepeat,
    defaultValue: c.defaultValue || "",
    hidden: Boolean(c.hidden) && !mustShow(field),
  };
}

/**
 * A section layout (pcrModel sectionLayout) with hidden fields removed and fields customized. Department-required
 * fields are shown by default (essential).
 */
export function customizeLayout(layout, form, inRepeat = false) {
  const fields = form?.fields || {};
  return layout.flatMap((item) => {
    if (item.type === "field") {
      const field = customizeField(item.field, fields[item.field.el], { inRepeat });
      if (field.hidden) return [];
      return [{ ...item, field, essential: item.essential || field.departmentRequired }];
    }
    const children = customizeLayout(item.children, form, inRepeat || item.repeating);
    if (!children.length) return [];
    return [{ ...item, children, essential: children.some((c) => c.essential) }];
  });
}

const blankLeaf = (leaf) => leaf === undefined || leaf === null || (Array.isArray(leaf) ? leaf.length === 0 : isEmptyLeaf(leaf));

/** Fields the department requires that are still blank, as blocking issues (same shape as postCheck issues). */
export function departmentIssues(schema, nemsis, form) {
  const index = formFieldIndex(schema);
  const issues = [];
  for (const [el, cfg] of Object.entries(form?.fields || {})) {
    const entry = index.get(el);
    if (!cfg.required || !entry || entry.inRepeat) continue;
    if (form.sections?.[entry.sectionId]?.hidden && sectionCanHide(schema, entry.sectionId)) continue;
    if (cfg.hidden && !mustShow(entry.field)) continue;
    if (!blankLeaf(getLeaf(schema, nemsis, el))) continue;
    issues.push({
      path: fieldPath(schema, el),
      element: el,
      code: "department-required",
      severity: "error",
      blocking: true,
      message: `${cfg.label || entry.field.label} is required by your department.`,
    });
  }
  return issues;
}

/** postCheck(...) plus the department's required fields. */
export function withDepartmentIssues(check, schema, nemsis, form) {
  const extra = departmentIssues(schema, nemsis, form);
  if (!extra.length) return check;
  return { ...check, ok: false, blocking: [...check.blocking, ...extra], issues: [...(check.issues || []), ...extra] };
}

/** Fill the department's default values into a new report (blank fields outside repeating groups only). */
export function applyFormDefaults(schema, nemsis, form) {
  const index = formFieldIndex(schema);
  let pcr = nemsis || {};
  for (const [el, cfg] of Object.entries(form?.fields || {})) {
    const entry = index.get(el);
    if (!cfg.defaultValue || !entry || entry.inRepeat || !blankLeaf(getLeaf(schema, pcr, el))) continue;
    const { field } = entry;
    let value = cfg.defaultValue;
    if (field.kind === "multiselect" || (field.repeating && field.options)) value = value.split(",").map((v) => v.trim()).filter(Boolean);
    if (field.options) {
      const codes = new Set(field.options.map((o) => o.code));
      if (Array.isArray(value) ? value.some((v) => !codes.has(v)) : !codes.has(value)) continue;
    }
    pcr = setLeaf(schema, pcr, el, value);
  }
  return pcr;
}

/**
 * Set one field's settings while editing (empty values remove that setting). Text is kept as typed (spaces, blank
 * lines); normalizePcrForm cleans it when the form is saved.
 */
export function setFieldSetting(form, el, patch) {
  const current = { ...(form.fields?.[el] || {}), ...patch };
  for (const [key, value] of Object.entries(current)) {
    if (value === undefined || value === "" || value === false || (Array.isArray(value) && !value.length)) delete current[key];
  }
  const fields = { ...(form.fields || {}) };
  if (Object.keys(current).length) fields[el] = current;
  else delete fields[el];
  return { ...form, fields };
}
