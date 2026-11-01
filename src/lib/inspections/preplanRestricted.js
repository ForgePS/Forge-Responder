/**
 * Restricted preplan answers (gate codes, utility shutoffs, hazmat).
 *
 * Every member can read a preplan revision, so restricted answers live in a
 * separate doc, departments/{d}/preplanRestricted/{revisionId}
 *   = { preplanId, revisionId, answers: { key: value }, updatedAt, updatedBy }
 * that only officers / editors can read. This file is the pure (firebase-free)
 * logic for splitting answers between the two, merging them back, and keeping
 * restricted values out of the narrative text stored on the revision.
 */

export const PREPLAN_RESTRICTED_COLLECTION = "preplanRestricted";

/**
 * Keys that are always restricted, whatever a template says. Firestore rules
 * refuse revision docs whose sectionAnswers contain any of these.
 */
export const DEFAULT_PREPLAN_SENSITIVE_KEYS = Object.freeze(["gatesCodes", "gas", "electric", "hazmat"]);

/** Narrative fields on a revision and the answers they are built from. */
export const PREPLAN_NARRATIVE_SOURCES = Object.freeze({
  accessPlan: ["primaryAccess", "secondaryAccess", "knoxBox"],
  waterSupply: ["nearestHydrants", "fdcLocation", "supplyNotes"],
  fireProtection: ["sprinkler", "standpipe", "alarm", "panelLocation"],
  utilities: ["gas", "electric", "water", "hvac"],
  hazards: ["construction", "hazmat", "occupancyNotes", "exposures"],
  tacticalPlan: ["initialActions", "staging", "evacuation", "specialOps"],
  dispatchSummary: ["dispatchSummary"],
});

export const PREPLAN_NARRATIVE_FIELDS = Object.freeze(Object.keys(PREPLAN_NARRATIVE_SOURCES));

/** Plain wording shown where a restricted value can't be shown. */
export const PREPLAN_RESTRICTED_LABEL = "Restricted — ask an officer";

/**
 * @param {{ key?: string, sensitive?: boolean }} field
 */
export function isPreplanFieldSensitive(field) {
  if (!field) return false;
  return Boolean(field.sensitive) || DEFAULT_PREPLAN_SENSITIVE_KEYS.includes(String(field.key || ""));
}

/**
 * Restricted keys for one or more templates (snapshots): the default list plus
 * every field a template marks `sensitive: true`.
 * @param {...({ sections?: Array<{ fields?: Array<{ key?: string, sensitive?: boolean }> }> }|null|undefined)} templates
 * @returns {Set<string>}
 */
export function preplanSensitiveKeys(...templates) {
  const keys = new Set(DEFAULT_PREPLAN_SENSITIVE_KEYS);
  for (const template of templates) {
    for (const section of template?.sections || []) {
      for (const field of section?.fields || []) {
        if (field?.key && field.sensitive) keys.add(String(field.key));
      }
    }
  }
  return keys;
}

function toKeySet(keys) {
  if (keys instanceof Set) return keys;
  if (Array.isArray(keys)) return new Set(keys);
  return preplanSensitiveKeys();
}

/**
 * Split answers into the part every member may read and the restricted part.
 * @param {Record<string, unknown>} answers
 * @param {Set<string>|string[]} [sensitiveKeys]
 */
export function splitPreplanAnswers(answers = {}, sensitiveKeys) {
  const keys = toKeySet(sensitiveKeys);
  const publicAnswers = {};
  const restrictedAnswers = {};
  for (const [key, value] of Object.entries(answers && typeof answers === "object" ? answers : {})) {
    if (keys.has(key)) restrictedAnswers[key] = value;
    else publicAnswers[key] = value;
  }
  return { publicAnswers, restrictedAnswers };
}

/**
 * @param {Record<string, unknown>} publicAnswers
 * @param {Record<string, unknown>} restrictedAnswers
 */
export function mergePreplanAnswers(publicAnswers = {}, restrictedAnswers = {}) {
  return { ...(publicAnswers || {}), ...(restrictedAnswers || {}) };
}

/** True when at least one restricted value is non-blank. */
export function hasRestrictedValues(answers = {}) {
  return Object.values(answers || {}).some((value) => String(value ?? "").trim() !== "");
}

/**
 * Narrative text built only from answers that aren't restricted.
 * @param {Record<string, unknown>} answers
 * @param {Set<string>|string[]} [sensitiveKeys] keys to leave out (pass [] for none)
 */
export function buildPreplanNarrative(answers = {}, sensitiveKeys) {
  const keys = toKeySet(sensitiveKeys);
  const a = answers || {};
  const out = {};
  for (const [field, sources] of Object.entries(PREPLAN_NARRATIVE_SOURCES)) {
    out[field] = sources
      .filter((key) => !keys.has(key))
      .map((key) => a[key])
      .filter((value) => value != null && String(value).trim() !== "")
      .map(String)
      .join("\n");
  }
  return out;
}

/** True when the text contains any non-blank restricted value. */
export function textContainsRestricted(text, restrictedAnswers = {}) {
  const body = String(text || "");
  if (!body) return false;
  return Object.values(restrictedAnswers || {}).some((value) => {
    const needle = String(value ?? "").trim();
    return needle !== "" && body.includes(needle);
  });
}

/**
 * Narrative fields for the stored (readable-by-all) revision: keep text that
 * was typed in, unless it contains a restricted value; otherwise build it from
 * non-restricted answers. `revision.sectionAnswers` must already be public.
 * @param {object} revision
 * @param {Set<string>|string[]} sensitiveKeys
 * @param {Record<string, unknown>} [restrictedAnswers] values to keep out of the text
 */
export function syncPreplanNarrative(revision = {}, sensitiveKeys, restrictedAnswers = {}) {
  const keys = toKeySet(sensitiveKeys);
  const built = buildPreplanNarrative(revision.sectionAnswers || {}, keys);
  const next = { ...revision };
  for (const field of PREPLAN_NARRATIVE_FIELDS) {
    const current = String(revision[field] || "");
    const keep = current && !textContainsRestricted(current, restrictedAnswers) ? current : "";
    next[field] = keep || built[field] || "";
  }
  return next;
}

/**
 * For a viewer allowed to see restricted answers: merge them back in, and
 * rebuild narrative fields that were derived from answers (so they include the
 * restricted values again). Narrative text someone typed is left alone.
 * @param {object} revision stored (public) revision
 * @param {Record<string, unknown>} restrictedAnswers
 * @param {Set<string>|string[]} sensitiveKeys
 */
export function mergeRestrictedIntoRevision(revision = {}, restrictedAnswers = {}, sensitiveKeys) {
  const keys = toKeySet(sensitiveKeys);
  const publicAnswers = revision.sectionAnswers || {};
  const fullAnswers = mergePreplanAnswers(publicAnswers, restrictedAnswers);
  const publicBuilt = buildPreplanNarrative(publicAnswers, keys);
  const fullBuilt = buildPreplanNarrative(fullAnswers, []);
  const next = { ...revision, sectionAnswers: fullAnswers };
  for (const field of PREPLAN_NARRATIVE_FIELDS) {
    const current = String(revision[field] || "");
    if (!current || current === publicBuilt[field]) next[field] = fullBuilt[field] || current;
  }
  return next;
}

/**
 * Turn a stored revision (which may still hold restricted answers inline, from
 * before the move) into what a viewer may see.
 * @param {object} revision normalized revision as stored
 * @param {{ allowed?: boolean, restrictedAnswers?: Record<string, unknown>|null, templates?: object[] }} options
 *   allowed: viewer may see restricted values; restrictedAnswers: the preplanRestricted doc's answers
 *   (null when it couldn't be read).
 */
export function presentPreplanRevision(revision = {}, options = {}) {
  const keys = preplanSensitiveKeys(revision.templateSnapshot, ...(options.templates || []));
  const { publicAnswers, restrictedAnswers: inline } = splitPreplanAnswers(revision.sectionAnswers, keys);
  const publicRevision = syncPreplanNarrative({ ...revision, sectionAnswers: publicAnswers }, keys, inline);
  if (!options.allowed) return { ...publicRevision, restrictedLoaded: false };
  // Before migration the values are still inline; a restricted doc wins over them.
  const loaded = options.restrictedAnswers != null;
  const restricted = { ...inline, ...(options.restrictedAnswers || {}) };
  // Use the stored narrative (not the scrubbed one) so derived text is recognised.
  const base = { ...revision, sectionAnswers: publicAnswers };
  for (const field of PREPLAN_NARRATIVE_FIELDS) {
    if (textContainsRestricted(revision[field], inline)) base[field] = publicRevision[field];
  }
  return { ...mergeRestrictedIntoRevision(base, restricted, keys), restrictedLoaded: loaded };
}

/**
 * Keep only restricted keys the user actually changed, so a save never blanks
 * values the viewer couldn't see.
 * @param {Record<string, unknown>} answers edited answers
 * @param {Record<string, unknown>} original answers as loaded
 * @param {Set<string>|string[]} sensitiveKeys
 */
export function changedAnswersForSave(answers = {}, original = {}, sensitiveKeys) {
  const keys = toKeySet(sensitiveKeys);
  const out = {};
  for (const [key, value] of Object.entries(answers || {})) {
    if (keys.has(key) && String(value ?? "") === String((original || {})[key] ?? "")) continue;
    out[key] = value;
  }
  return out;
}

/**
 * @param {{ preplanId: string, revisionId: string, answers: Record<string, unknown>, updatedBy?: string, updatedAt?: string }} input
 */
export function buildPreplanRestrictedRecord({ preplanId, revisionId, answers, updatedBy = "", updatedAt = "" }) {
  return {
    preplanId: String(preplanId || ""),
    revisionId: String(revisionId || ""),
    answers: Object.fromEntries(Object.entries(answers || {}).map(([key, value]) => [key, value == null ? "" : value])),
    updatedAt: updatedAt || new Date().toISOString(),
    updatedBy: String(updatedBy || ""),
  };
}
