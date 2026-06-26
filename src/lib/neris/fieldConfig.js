/** @typedef {'dropdown' | 'freetext'} NerisInputMode */

/** @typedef {{ value: string, label: string }} NerisDropdownOption */

/**
 * @typedef {{
 *   inputMode: NerisInputMode,
 *   allowToggle?: boolean,
 *   customOptions?: NerisDropdownOption[],
 *   appendToSchema?: boolean,
 * }} NerisFieldConfigEntry
 */

export const NERIS_INPUT_MODES = {
  DROPDOWN: "dropdown",
  FREETEXT: "freetext",
};

/** @param {string} moduleId @param {string} fieldName */
export function buildFieldConfigKey(moduleId, fieldName) {
  return `${moduleId}.${fieldName}`;
}

/** @param {string} label */
export function slugifyOptionValue(label = "") {
  return String(label)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * @param {unknown} raw
 * @returns {NerisDropdownOption[]}
 */
export function normalizeCustomOptions(raw = []) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const result = /** @type {NerisDropdownOption[]} */ ([]);
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = String(/** @type {{ value?: string }} */ (item).value || "").trim();
    const label = String(/** @type {{ label?: string }} */ (item).label || value).trim();
    if (!value || !label) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push({ value, label });
  }
  return result;
}

/** @param {Record<string, unknown>} field */
export function getSchemaDefaultInputMode(field) {
  if (Array.isArray(field.options) && field.options.length > 0) {
    return NERIS_INPUT_MODES.DROPDOWN;
  }
  return NERIS_INPUT_MODES.FREETEXT;
}

/** @param {Record<string, unknown>} field */
export function isFieldInputModeConfigurable(field) {
  const inputType = String(field.inputType || "text");
  return !["boolean", "multiselect", "number", "datetime-local"].includes(inputType);
}

/**
 * @param {Record<string, Record<string, unknown>>} raw
 * @returns {Record<string, NerisFieldConfigEntry>}
 */
export function normalizeNerisFieldConfig(raw = {}) {
  const result = /** @type {Record<string, NerisFieldConfigEntry>} */ ({});
  for (const [key, value] of Object.entries(raw || {})) {
    if (!value || typeof value !== "object") continue;
    const inputMode = value.inputMode === NERIS_INPUT_MODES.FREETEXT
      ? NERIS_INPUT_MODES.FREETEXT
      : value.inputMode === NERIS_INPUT_MODES.DROPDOWN
        ? NERIS_INPUT_MODES.DROPDOWN
        : null;
    if (!inputMode) continue;

    /** @type {NerisFieldConfigEntry} */
    const entry = { inputMode };
    if (value.allowToggle === true) entry.allowToggle = true;

    const customOptions = normalizeCustomOptions(value.customOptions);
    if (customOptions.length) entry.customOptions = customOptions;
    if (value.appendToSchema === false) entry.appendToSchema = false;

    result[key] = entry;
  }
  return result;
}

/**
 * @param {Record<string, unknown>} field
 * @param {Record<string, NerisFieldConfigEntry>} fieldConfig
 * @param {NerisInputMode | null | undefined} officerOverride
 * @returns {NerisInputMode}
 */
export function resolveFieldInputMode(field, fieldConfig = {}, officerOverride = null) {
  if (!isFieldInputModeConfigurable(field)) {
    return getSchemaDefaultInputMode(field);
  }
  if (
    officerOverride === NERIS_INPUT_MODES.DROPDOWN
    || officerOverride === NERIS_INPUT_MODES.FREETEXT
  ) {
    return officerOverride;
  }
  const key = buildFieldConfigKey(String(field.moduleId || ""), String(field.name || ""));
  const admin = fieldConfig[key];
  if (admin?.inputMode) return admin.inputMode;
  return getSchemaDefaultInputMode(field);
}

/**
 * @param {Record<string, unknown>} field
 * @param {Record<string, NerisFieldConfigEntry>} fieldConfig
 */
export function fieldAllowsOfficerToggle(field, fieldConfig = {}) {
  if (!isFieldInputModeConfigurable(field)) return false;
  const key = buildFieldConfigKey(String(field.moduleId || ""), String(field.name || ""));
  return Boolean(fieldConfig[key]?.allowToggle);
}

/**
 * Resolve dropdown options from NERIS schema value set and admin custom options.
 * @param {Record<string, unknown>} field
 * @param {Record<string, NerisFieldConfigEntry>} fieldConfig
 * @returns {NerisDropdownOption[]}
 */
export function resolveFieldDropdownOptions(field, fieldConfig = {}) {
  const key = buildFieldConfigKey(String(field.moduleId || ""), String(field.name || ""));
  const admin = fieldConfig[key];
  const schemaOptions = normalizeCustomOptions(
    Array.isArray(field.options) ? field.options : [],
  );
  const customOptions = normalizeCustomOptions(admin?.customOptions);

  if (!customOptions.length) return schemaOptions;
  if (admin?.appendToSchema === false) return customOptions;

  const seen = new Set();
  const merged = /** @type {NerisDropdownOption[]} */ ([]);
  for (const opt of [...schemaOptions, ...customOptions]) {
    if (seen.has(opt.value)) continue;
    seen.add(opt.value);
    merged.push(opt);
  }
  return merged;
}
