/**
 * Per-person document acknowledgements. Each document keeps
 * `acknowledgements: { [personKey]: { at, name, uid } }`, keyed by the person's
 * personnel ID (or sign-in ID when they have no personnel record).
 *
 * The old shared `acknowledgementStatus` ("Pending" / "Acknowledged") only says
 * whether the document needs acknowledging; it never means a person has.
 */
import { isObjectVisibleInActiveList } from "./objectLifecycle.js";

/** Whether people must acknowledge this document. */
export function requiresAcknowledgement(doc = {}) {
  if (doc.requiresAcknowledgement === "Yes" || doc.requiresAcknowledgement === true) return true;
  if (doc.requiresAcknowledgement === "No" || doc.requiresAcknowledgement === false) return false;
  return ["Pending", "Acknowledged"].includes(doc.acknowledgementStatus);
}

/** The keys that identify one person: personnel ID and sign-in ID. */
export function acknowledgementKeys({ personnelId = "", uid = "" } = {}) {
  return [personnelId, uid].map((key) => String(key || "").trim()).filter(Boolean);
}

export function hasAcknowledged(doc = {}, keys = []) {
  const entries = doc.acknowledgements && typeof doc.acknowledgements === "object" ? doc.acknowledgements : {};
  return keys.some((key) => entries[key] || Object.values(entries).some((entry) => entry?.uid && entry.uid === key));
}

/** Documents this person still has to acknowledge. Archived documents are skipped. */
export function pendingForPerson(documents = [], keys = []) {
  if (!keys.length) return [];
  return (Array.isArray(documents) ? documents : []).filter((doc) => (
    requiresAcknowledgement(doc)
    && isObjectVisibleInActiveList(doc)
    && !hasAcknowledged(doc, keys)
  ));
}

/** The document with this person's acknowledgement added. */
export function withAcknowledgement(doc = {}, { personnelId = "", uid = "", name = "" } = {}) {
  const key = acknowledgementKeys({ personnelId, uid })[0];
  if (!key) return doc;
  return {
    ...doc,
    acknowledgements: {
      ...(doc.acknowledgements || {}),
      [key]: { at: new Date().toISOString(), name: name || "", uid: uid || "" },
    },
  };
}

/** Who has acknowledged, newest first. */
export function acknowledgementList(doc = {}) {
  return Object.entries(doc.acknowledgements || {})
    .map(([key, entry]) => ({ key, name: entry?.name || key, at: entry?.at || "" }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** Label for the shared flag column: whether acknowledgement is required. */
export function acknowledgementLabel(doc = {}) {
  if (!requiresAcknowledgement(doc)) return "Not Required";
  const count = Object.keys(doc.acknowledgements || {}).length;
  return count ? `Required · ${count} acknowledged` : "Required";
}
