// Pure helpers for adding certification records (no Firebase here, so they can be unit tested).
import { daysUntil, parseLooseDate } from "./liveDates.js";

const DEFAULT_CATEGORIES = ["Fire", "EMS"];

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

/** Names to offer in the "Person" picker: the roster first, then anyone already on a certification. */
export function certificationPersonOptions(personnel = [], records = []) {
  const fromRoster = (Array.isArray(personnel) ? personnel : [])
    .filter((person) => person && !person.deletedAt && String(person.status || "").toLowerCase() !== "deleted")
    .map((person) => person.name || [person.firstName, person.lastName].filter(Boolean).join(" "));
  const fromRecords = (Array.isArray(records) ? records : []).map((record) => record?.person);
  return uniqueSorted([...fromRoster, ...fromRecords]);
}

/** Certification types already in use (e.g. Paramedic, Firefighter II). */
export function certificationTypeOptions(records = []) {
  return uniqueSorted((Array.isArray(records) ? records : []).map((record) => record?.type));
}

/** Categories: Fire and EMS plus any others already in use. */
export function certificationCategoryOptions(records = []) {
  const used = (Array.isArray(records) ? records : []).map((record) => record?.category);
  const extra = uniqueSorted(used).filter((category) => !DEFAULT_CATEGORIES.includes(category));
  return [...DEFAULT_CATEGORIES, ...extra];
}

/** An id that can't collide with any existing record, even when two are added in the same millisecond. */
export function newCertificationId(records = [], now = Date.now(), random = Math.random) {
  const taken = new Set((Array.isArray(records) ? records : []).map((record) => record?.id));
  let id = "";
  do {
    id = `CERT-${now.toString(36).toUpperCase()}-${Math.floor(random() * 36 ** 4).toString(36).toUpperCase().padStart(4, "0")}`;
  } while (taken.has(id));
  return id;
}

/** "Sep 10, 2027" or "2027-09-10" → "2027-09-10" for an <input type="date">; "" when unreadable. */
export function toDateInputValue(value) {
  const date = parseLooseDate(value);
  if (!date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Problems with an "add certification" draft, in plain words. Empty when it can be saved. */
export function validateCertificationDraft(draft = {}) {
  const problems = [];
  if (!String(draft.person || "").trim()) problems.push("Choose who holds this certification.");
  if (!String(draft.type || "").trim()) problems.push("Enter the certification type.");
  if (!String(draft.category || "").trim()) problems.push("Choose a category.");
  if (!draft.expires || !parseLooseDate(draft.expires)) problems.push("Enter the expiration date.");
  if (draft.issue && !parseLooseDate(draft.issue)) problems.push("The issue date isn't a valid date.");
  if (draft.issue && draft.expires && parseLooseDate(draft.issue) && parseLooseDate(draft.expires)
    && parseLooseDate(draft.issue) > parseLooseDate(draft.expires)) {
    problems.push("The issue date is after the expiration date.");
  }
  return problems;
}

/** The record to store for a new certification. Days/status are recomputed live from `expires` on display. */
export function buildCertificationRecord(draft = {}, { id, personnelId = "", document = null, now = new Date() } = {}) {
  const days = daysUntil(draft.expires, now);
  return {
    id,
    person: String(draft.person || "").trim(),
    ...(personnelId ? { personnelId } : {}),
    type: String(draft.type || "").trim(),
    category: String(draft.category || "").trim(),
    issue: draft.issue || "",
    expires: draft.expires || "",
    days: days ?? "",
    renewal: "Not Started",
    status: days !== null && days < 0 ? "Expired" : days !== null && days <= 30 ? "Due Soon" : "Active",
    document: document?.name || "",
    documentUrl: document?.downloadUrl || "",
    documentStoragePath: document?.storagePath || "",
    createdAt: now.toISOString(),
  };
}
