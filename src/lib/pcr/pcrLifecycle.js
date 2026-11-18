/**
 * Where a patient care report stands, and what changed in an amendment (pure; unit tested).
 *
 * Three separate questions, never folded into one label:
 *   - report:     Draft → Posted (locked). Unlocked for amendment → re-posted = Amended. Posted with server NEMSIS
 *                 errors = Needs review.
 *   - qa:         Not reviewed → Returned to the crew / Reviewed (QA reviewers; reviewPcrs).
 *   - submission: state submission. No state connection exists yet, so every report says so; nothing here ever
 *                 claims a report was submitted or accepted.
 *
 * Amendments: unlocking keeps the posted version as an immutable revision (pcrs/{id}/revisions); re-posting writes
 * the element-level changes (from → to), with the reason and who made them. Each posted version gets a SHA-256 of its
 * NEMSIS content (postedHash) so later changes can be detected.
 */

export const QA_STATUSES = Object.freeze({
  none: { label: "Not reviewed", tone: "muted" },
  returned: { label: "Returned to crew", tone: "warn" },
  reviewed: { label: "QA reviewed", tone: "good" },
});

/** Overdue: a draft older than this. Departments can change it later; 24 hours is a common policy. */
export const OVERDUE_HOURS = 24;

/** @returns {{ id, label, tone, detail }} for the report itself. */
export function reportStatus(report = {}, { now = new Date() } = {}) {
  const posted = report.status === "posted";
  if (!posted) {
    if (report.qa?.status === "returned") return { id: "returned", label: "Returned for correction", tone: "warn", detail: report.qa.note || "" };
    if (report.amendment?.open) return { id: "amending", label: "Amendment in progress", tone: "warn", detail: report.amendment.reason || "" };
    const started = Date.parse(report.createdAt || report.updatedAt || "");
    if (Number.isFinite(started) && now.getTime() - started > OVERDUE_HOURS * 3600_000) return { id: "overdue", label: "Overdue draft", tone: "bad", detail: `Started more than ${OVERDUE_HOURS} hours ago` };
    return { id: "draft", label: "Draft", tone: "muted", detail: "" };
  }
  if (report.nemsisCheck && report.nemsisCheck.ok === false) return { id: "needs-review", label: "Needs review", tone: "bad", detail: "The server NEMSIS check found errors" };
  if (Number(report.amendments) > 0) return { id: "amended", label: "Amended", tone: "good", detail: `${report.amendments} amendment${report.amendments === 1 ? "" : "s"}` };
  return { id: "posted", label: "Posted", tone: "good", detail: "" };
}

export function qaStatus(report = {}) {
  const id = report.qa?.status && QA_STATUSES[report.qa.status] ? report.qa.status : "none";
  return { id, ...QA_STATUSES[id] };
}

/** Honest submission state: there is no state connection yet. */
export function submissionStatus(report = {}, stateConnection = null) {
  if (!stateConnection?.operational) return { id: "not-configured", label: "Not submitted", tone: "muted", detail: "No state submission connection is set up" };
  if (report.status !== "posted") return { id: "not-ready", label: "Not submitted", tone: "muted", detail: "Post the report first" };
  return { id: "pending", label: "Not submitted", tone: "muted", detail: "" };
}

// ---------------------------------------------------------------------------------------------------------------
// Amendment changes
// ---------------------------------------------------------------------------------------------------------------

const ELEMENT = /^e[A-Za-z]+\.\d{2,3}$/;

/** Every leaf in a NEMSIS document, path → JSON text. Paths are dotted keys with [n] for array entries. */
export function flattenLeaves(value, path = "", out = new Map()) {
  if (Array.isArray(value)) {
    value.forEach((entry, i) => flattenLeaves(entry, `${path}[${i}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value);
    // A leaf stored as { value, NV, PN, attrs } (schema.js readLeaf) is one value, not a group.
    if (keys.length && keys.every((k) => k === "value" || k === "NV" || k === "PN" || k === "attrs")) {
      out.set(path, canonicalJson(value));
      return out;
    }
    for (const key of keys) flattenLeaves(value[key], path ? `${path}.${key}` : key, out);
    return out;
  }
  if (value !== undefined && value !== null && value !== "") out.set(path, JSON.stringify(value));
  return out;
}

/** The NEMSIS element a leaf path belongs to ("eVitals.VitalGroup[1].eVitals.06" → "eVitals.06"). */
export function elementOfPath(path) {
  const parts = String(path).replace(/\[\d+\]/g, "").split(".");
  for (let i = parts.length - 1; i > 0; i -= 1) {
    const el = `${parts[i - 1]}.${parts[i]}`;
    if (ELEMENT.test(el)) return el;
  }
  return "";
}

/**
 * Element-level changes between two versions of a report: [{ path, element, from, to }] (from/to are the stored
 * leaf as JSON text, "" when absent). Signature images are compared, not copied, to keep amendment records small.
 */
export function diffPcr(before, after) {
  const a = flattenLeaves(before || {});
  const b = flattenLeaves(after || {});
  const paths = [...new Set([...a.keys(), ...b.keys()])].sort();
  const changes = [];
  for (const path of paths) {
    const from = a.get(path) ?? "";
    const to = b.get(path) ?? "";
    if (from === to) continue;
    const element = elementOfPath(path);
    const big = (s) => s.length > 400;
    changes.push({ path, element, from: big(from) ? "[file changed]" : from, to: big(to) ? "[file changed]" : to });
  }
  return changes;
}

/** Stable JSON (sorted keys) so the same content always hashes the same. */
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** SHA-256 hex of the NEMSIS content (Web Crypto; browsers and Node 20+). */
export async function contentHash(nemsis) {
  const bytes = new TextEncoder().encode(canonicalJson(nemsis || {}));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Does a posted report still match the hash taken when it was posted? null when there's no hash to compare. */
export async function verifyPosted(report) {
  if (!report?.postedHash) return null;
  return (await contentHash(report.nemsis || {})) === report.postedHash;
}

/** A leaf's JSON text as words for the amendment view. */
export function leafWords(json, label = (code) => code) {
  if (!json) return "—";
  if (json === "[file changed]") return json;
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object") {
      if (v.NV) return `Not recorded (${v.NV})`;
      if (v.PN) return `Pertinent negative (${v.PN})`;
      return label(String(v.value ?? ""));
    }
    return label(String(v));
  } catch {
    return json;
  }
}
