/**
 * FORGE Field settings for a department (departments/{id}/settings/fieldApp),
 * edited in the RMS under Admin → FORGE Field. Pure functions, unit tested.
 *
 * {
 *   appName, logoUrl, logoStoragePath,
 *   workflows: { [key]: { enabled: bool, roles: [roleId] (empty = everyone allowed), editRoles: [roleId] } },
 *   fields:    { [form]: { [field]: { mode: "default"|"show"|"hide"|"required", roles: { [roleId]: mode } } } },
 *   updatedAt, updatedBy
 * }
 */

export const FIELD_APP_SETTINGS_DOC = "fieldApp";

export const FIELD_WORKFLOWS = [
  { key: "truckCheck", label: "Truck check", hint: "Checklist items come from Fleet → Configuration Studio templates." },
  { key: "emsCheckoff", label: "EMS unit check-off", hint: "Item lists with counts and expirations (built below)." },
  { key: "supplyCheckoff", label: "Supply closet check-off", hint: "Station supply lists with par levels (built below)." },
  { key: "hydrants", label: "Hydrants", hint: "Inspections, flow tests, hydrant info and damage reports." },
  { key: "hoseTest", label: "Hose testing" },
  { key: "damageForm", label: "Damage form" },
  { key: "dailyLog", label: "Daily log" },
  { key: "incident", label: "Incident report" },
  { key: "inspections", label: "Inspections", hint: "Assigned fire/prevention inspections; checklist items come from inspection templates." },
  { key: "preFirePlans", label: "Pre-fire plans", hint: "Everyone allowed can view and send updates; 'Can create & edit' roles edit plans directly.", hasEditRoles: true },
];

/**
 * Form fields admins can show, hide or require. `fixed: true` fields are always
 * required (the record can't be saved without them) and aren't listed.
 */
export const FIELD_FORMS = [
  {
    key: "hydrantInspection",
    label: "Hydrant inspection",
    fields: [
      { key: "item:No Obstructions", label: "Item: No obstructions" },
      { key: "item:Operable (Turns Open/Closed)", label: "Item: Operable (turns open/closed)" },
      { key: "item:Caps Present", label: "Item: Caps present" },
      { key: "item:Threads in Good Condition", label: "Item: Threads in good condition" },
      { key: "item:Oil Nut Provided", label: "Item: Oil nut provided" },
      { key: "item:Barrel Drains Properly", label: "Item: Barrel drains properly" },
      { key: "item:Leaks (Valve / Caps / Barrel)", label: "Item: Leaks (valve / caps / barrel)" },
      { key: "item:Steamer Port / Pumper Outlet Good", label: "Item: Steamer port / pumper outlet" },
      { key: "item:Adequate Clearance (3 ft all sides)", label: "Item: Adequate clearance (3 ft)" },
      { key: "rowPhotos", label: "Photo on each item" },
      { key: "repairNeeded", label: "Repair needed on each item" },
      { key: "notes", label: "General notes" },
      { key: "photos", label: "Photos" },
    ],
  },
  {
    key: "flowTest",
    label: "Flow test",
    fields: [
      { key: "hydrantInfo", label: "Hydrant info (ID, district, GPS, provider, status)" },
      { key: "nfpaClass", label: "NFPA class override" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    key: "hydrantDamage",
    label: "Hydrant damage",
    fields: [
      { key: "hazards", label: "Hazards" },
      { key: "description", label: "Description" },
      { key: "immediateActions", label: "Actions taken" },
      { key: "photos", label: "Photos" },
    ],
  },
  {
    key: "hoseTest",
    label: "Hose test",
    fields: [
      { key: "apparatus", label: "Apparatus" },
      { key: "length", label: "Length" },
      { key: "pressure", label: "Test pressure" },
      { key: "notes", label: "Notes (always required on a fail)" },
    ],
  },
  {
    key: "damageForm",
    label: "Damage form",
    fields: [
      { key: "equipment", label: "Equipment" },
      { key: "photos", label: "Photos" },
      { key: "submittedBy", label: "Submitted by (editable)" },
    ],
  },
  {
    key: "dailyLog",
    label: "Daily log",
    fields: [
      { key: "crew", label: "Crew" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    key: "incident",
    label: "Incident report",
    fields: [
      { key: "cadNumber", label: "CAD / incident #" },
      { key: "disciplines", label: "Disciplines" },
      { key: "times", label: "Dispatch / on scene / cleared times" },
      { key: "units", label: "Units" },
      { key: "crew", label: "Crew" },
      { key: "patients", label: "Patients (EMS calls)" },
      { key: "narrative", label: "Narrative" },
    ],
  },
  {
    key: "checkoff",
    label: "EMS & supply check-offs",
    fields: [
      { key: "expirations", label: "Expiration dates" },
      { key: "notes", label: "Notes" },
    ],
  },
  {
    key: "inspection",
    label: "Inspections",
    fields: [
      { key: "photos", label: "Photos" },
      { key: "violations", label: "Record violations" },
      { key: "summary", label: "Summary" },
      { key: "internalNotes", label: "Internal notes" },
    ],
  },
  {
    key: "preFirePlan",
    label: "Pre-fire plans",
    fields: [
      { key: "access", label: "Access & Knox box" },
      { key: "water", label: "Water supply" },
      { key: "fireProtection", label: "Fire protection" },
      { key: "utilities", label: "Utilities" },
      { key: "hazards", label: "Hazards" },
      { key: "contacts", label: "Contacts" },
      { key: "tactical", label: "Tactical notes" },
      { key: "files", label: "Plan files & photos" },
    ],
  },
];

export const FIELD_MODES = ["show", "hide", "required"];
const RANK = { hide: 1, show: 2, required: 3 };

export function emptyFieldAppConfig() {
  return { appName: "", logoUrl: "", logoStoragePath: "", workflows: {}, fields: {} };
}

export function normalizeFieldAppConfig(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    ...emptyFieldAppConfig(),
    ...data,
    workflows: data.workflows && typeof data.workflows === "object" ? data.workflows : {},
    fields: data.fields && typeof data.fields === "object" ? data.fields : {},
  };
}

function intersects(a = [], b = []) {
  const set = new Set(a);
  return b.some((item) => set.has(item));
}

/** Is a workflow switched on for this person (base permissions are checked separately)? */
export function workflowAllowed(config, key, roleIds = [], { isCreator = false } = {}) {
  const entry = config?.workflows?.[key];
  if (!entry) return true;
  if (entry.enabled === false) return false;
  if (isCreator) return true;
  const roles = Array.isArray(entry.roles) ? entry.roles : [];
  return roles.length === 0 || intersects(roles, roleIds);
}

/** Roles listed as editors for a workflow (e.g. pre-fire plans). null when not set. */
export function workflowEditRoles(config, key) {
  const roles = config?.workflows?.[key]?.editRoles;
  return Array.isArray(roles) && roles.length ? roles : null;
}

/**
 * Resolve a form field to "show" | "hide" | "required" for a person.
 * Department setting first, then role overrides; with several roles the most
 * visible wins (required > show > hide).
 */
export function resolveFieldMode(config, form, field, roleIds = [], fallback = "show") {
  const entry = config?.fields?.[form]?.[field];
  let mode = entry?.mode && entry.mode !== "default" ? entry.mode : fallback;
  const overrides = (roleIds || [])
    .map((roleId) => entry?.roles?.[roleId])
    .filter((value) => value && value !== "default");
  if (overrides.length) {
    mode = overrides.reduce((best, value) => (RANK[value] > RANK[best] ? value : best), overrides[0]);
  }
  return RANK[mode] ? mode : fallback;
}

/** Field helpers for one form: show(key), required(key). */
export function formFieldRules(config, form, roleIds = []) {
  const cache = new Map();
  const mode = (field, fallback = "show") => {
    const cacheKey = `${field}|${fallback}`;
    if (!cache.has(cacheKey)) cache.set(cacheKey, resolveFieldMode(config, form, field, roleIds, fallback));
    return cache.get(cacheKey);
  };
  return {
    mode,
    show: (field, fallback) => mode(field, fallback) !== "hide",
    required: (field, fallback) => mode(field, fallback) === "required",
  };
}

/** Add "required" errors for configured-required fields that are empty. */
export function requiredFieldErrors(rules, checks = []) {
  const errors = {};
  for (const { field, errorKey = field, value, message = "Required." } of checks) {
    if (!rules.required(field)) continue;
    const empty = value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length);
    if (empty) errors[errorKey] = message;
  }
  return errors;
}

/** Set one field's mode for the department or for a role (returns a new config). */
export function setFieldMode(config, form, field, mode, roleId = "") {
  const next = normalizeFieldAppConfig(config);
  const formFields = { ...(next.fields[form] || {}) };
  const entry = { mode: "default", roles: {}, ...(formFields[field] || {}) };
  if (roleId) {
    const roles = { ...(entry.roles || {}) };
    if (!mode || mode === "default") delete roles[roleId];
    else roles[roleId] = mode;
    entry.roles = roles;
  } else {
    entry.mode = mode || "default";
  }
  formFields[field] = entry;
  return { ...next, fields: { ...next.fields, [form]: formFields } };
}

export function setWorkflow(config, key, patch) {
  const next = normalizeFieldAppConfig(config);
  return { ...next, workflows: { ...next.workflows, [key]: { enabled: true, roles: [], ...(next.workflows[key] || {}), ...patch } } };
}
