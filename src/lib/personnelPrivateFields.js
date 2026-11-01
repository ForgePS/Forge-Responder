/**
 * Private personnel details (SSN, birth date, demographics, driver's license
 * number) live in departments/{d}/personnelPrivate/{personnelId}, never in the
 * personnel list every member downloads. This file is the pure (Firebase-free)
 * part: which keys are private, and how a record splits into a list part and a
 * private part. Used by the app, the list store and scripts/move-personnel-private.mjs.
 */

export const PERSONNEL_LIST_KEY = "hlfd-rms-personnel";
export const PERSONNEL_PRIVATE_COLLECTION = "personnelPrivate";

/** Keys that must never be written to the personnel list (firestore.rules refuses them). */
export const PERSONNEL_PRIVATE_KEYS = Object.freeze([
  "birthDate",
  "citizenship",
  "race",
  "ethnicity",
  "gender",
  "maritalStatus",
  "socialSecurityNumber",
  "driversLicenseNumber",
]);

const PRIVATE_KEY_SET = new Set(PERSONNEL_PRIVATE_KEYS);

export function isPersonnelPrivateKey(key) {
  return PRIVATE_KEY_SET.has(key);
}

/** True for the personnel list (the only list that holds private keys). */
export function listHasPrivateFields(listKey = "") {
  return listKey === PERSONNEL_LIST_KEY;
}

/** A stored value counts only when it says something (blank strings don't). */
export function hasPrivateValue(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function asText(value) {
  if (!hasPrivateValue(value)) return "";
  return typeof value === "string" ? value.trim() : String(value);
}

/**
 * Split one personnel record.
 * @returns {{ publicRecord: object, privateFields: object }} publicRecord has
 *   none of the private keys; privateFields holds only the ones with a value.
 */
export function splitPersonnelRecord(record = {}) {
  const publicRecord = {};
  const privateFields = {};
  Object.entries(record && typeof record === "object" ? record : {}).forEach(([key, value]) => {
    if (PRIVATE_KEY_SET.has(key)) {
      if (hasPrivateValue(value)) privateFields[key] = value;
    } else {
      publicRecord[key] = value;
    }
  });
  return { publicRecord, privateFields };
}

/** The record without any private keys (blank ones included). */
export function stripPersonnelPrivateKeys(record = {}) {
  return splitPersonnelRecord(record).publicRecord;
}

/** Only the private keys of a stored private doc (drops updatedAt etc.). */
export function pickPersonnelPrivateFields(doc = {}) {
  const picked = {};
  PERSONNEL_PRIVATE_KEYS.forEach((key) => {
    if (hasPrivateValue(doc?.[key])) picked[key] = doc[key];
  });
  return picked;
}

/**
 * Put private values back onto a record for display/editing. The private doc
 * wins; a value still inline on the list record (before the move script runs)
 * is used only where the doc has nothing. Every private key ends up present.
 */
export function mergePersonnelPrivate(record = {}, privateDoc = {}, { inlineFallback = true } = {}) {
  const merged = { ...(record || {}) };
  PERSONNEL_PRIVATE_KEYS.forEach((key) => {
    if (hasPrivateValue(privateDoc?.[key])) merged[key] = privateDoc[key];
    else if (inlineFallback && hasPrivateValue(record?.[key])) merged[key] = record[key];
    else merged[key] = "";
  });
  return merged;
}

/**
 * The private keys to write for an edited record: every key whose value
 * differs from what the private doc holds. Blank means "clear it" ("").
 * Values still inline on the list (not yet in the doc) count as changes, so
 * saving moves them.
 */
export function privateFieldsPatch(draft = {}, storedDoc = {}) {
  const patch = {};
  PERSONNEL_PRIVATE_KEYS.forEach((key) => {
    const next = asText(draft?.[key]);
    const current = asText(storedDoc?.[key]);
    if (next !== current) patch[key] = next;
  });
  return patch;
}

/** Firestore doc ids can't contain "/"; such ids can't have a private doc. */
export function personnelPrivateDocId(personnelId) {
  const id = String(personnelId ?? "").trim();
  if (!id || id.includes("/") || id === "." || id === ".." || /^__.*__$/.test(id)) return "";
  return id;
}

/**
 * Split a whole personnel list for writing.
 * @returns {{ items: object[], privateById: Record<string, object>, keptInline: string[] }}
 *   items carry no private keys; privateById maps personnel id -> private values
 *   to save; keptInline lists ids whose values had nowhere to go (no usable id),
 *   which are left on the item unchanged.
 */
export function splitPersonnelList(items = []) {
  const privateById = {};
  const keptInline = [];
  const next = (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const { publicRecord, privateFields } = splitPersonnelRecord(item);
    if (!Object.keys(privateFields).length) return publicRecord;
    const docId = personnelPrivateDocId(item.id);
    if (!docId) {
      keptInline.push(String(item.id ?? ""));
      return { ...publicRecord, ...privateFields };
    }
    privateById[docId] = { ...(privateById[docId] || {}), ...privateFields };
    return publicRecord;
  });
  return { items: next, privateById, keptInline };
}

/**
 * Fallback when private values couldn't be moved: drop blank private keys but
 * leave real values on the item so nothing is lost (the move script or the
 * next save by someone allowed moves them).
 */
export function stripBlankPrivateKeys(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return item;
    const { publicRecord, privateFields } = splitPersonnelRecord(item);
    return { ...publicRecord, ...privateFields };
  });
}

/** True when any item still carries a private key (blank or not). */
export function listHasPrivateKeys(items = []) {
  return (Array.isArray(items) ? items : []).some((item) => (
    item && typeof item === "object" && PERSONNEL_PRIVATE_KEYS.some((key) => key in item)
  ));
}
