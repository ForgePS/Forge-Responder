/**
 * Operational alerts (pure model) and the emergency response view model.
 *
 * Alerts are current conditions (an impaired riser, a blocked access road). They
 * are kept apart from the approved floor plan geometry, which is historical: an
 * alert never edits a published plan, and an unverified report is never shown
 * as a verified fact.
 */
import { dateKeyOf, localDateKey } from "./localDate.js";

export const ALERT_CATEGORIES = Object.freeze([
  { id: "fps_impairment", label: "Fire protection impairment" },
  { id: "sprinkler", label: "Sprinkler deficiency" },
  { id: "standpipe", label: "Standpipe deficiency" },
  { id: "fire_alarm", label: "Fire alarm deficiency" },
  { id: "access", label: "Access restriction" },
  { id: "structural", label: "Structural concern" },
  { id: "hazmat", label: "Hazardous materials condition" },
  { id: "utility", label: "Utility concern" },
  { id: "other", label: "Other operational hazard" },
]);

export const ALERT_SEVERITIES = Object.freeze(["critical", "high", "moderate", "low"]);
/** reported = someone said so; verified = an approver confirmed it; rejected = not a real condition. */
export const ALERT_VERIFICATION = Object.freeze(["reported", "verified", "rejected"]);
export const ALERT_RESOLUTION = Object.freeze(["active", "resolved"]);
export const ALERT_SOURCES = Object.freeze(["inspection", "field_survey", "fps_impairment", "manual"]);

const SEVERITY_RANK = { critical: 0, high: 1, moderate: 2, low: 3 };

function text(value, max = 2000) {
  return String(value ?? "").slice(0, max);
}

export function normalizeAlert(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: text(data.id, 80),
    preplanId: text(data.preplanId, 80),
    occupancyId: text(data.occupancyId, 80),
    buildingId: text(data.buildingId, 80),
    floorId: text(data.floorId, 80),
    objectId: text(data.objectId, 80),
    inspectionId: text(data.inspectionId, 80),
    violationId: text(data.violationId, 80),
    systemId: text(data.systemId, 80),
    category: ALERT_CATEGORIES.some((row) => row.id === data.category) ? data.category : "other",
    severity: ALERT_SEVERITIES.includes(data.severity) ? data.severity : "moderate",
    description: text(data.description),
    source: ALERT_SOURCES.includes(data.source) ? data.source : "manual",
    verificationStatus: ALERT_VERIFICATION.includes(data.verificationStatus) ? data.verificationStatus : "reported",
    resolutionStatus: ALERT_RESOLUTION.includes(data.resolutionStatus) ? data.resolutionStatus : "active",
    effectiveAt: text(data.effectiveAt, 40),
    lastVerifiedAt: text(data.lastVerifiedAt, 40),
    reviewBy: text(data.reviewBy, 40),
    createdBy: text(data.createdBy, 80),
    createdByName: text(data.createdByName, 120),
    reviewedBy: text(data.reviewedBy, 80),
    reviewedByName: text(data.reviewedByName, 120),
    resolvedAt: text(data.resolvedAt, 40),
    history: Array.isArray(data.history) ? data.history.slice(-50) : [],
    createdAt: text(data.createdAt, 40),
    updatedAt: text(data.updatedAt, 40),
  };
}

export function alertCategoryLabel(id) {
  return ALERT_CATEGORIES.find((row) => row.id === id)?.label || "Other operational hazard";
}

/** An active fire protection impairment shown as a current alert (the FPS record stays authoritative). */
export function alertFromImpairment(impairment, system = {}) {
  return normalizeAlert({
    id: `fps-${impairment.id}`,
    occupancyId: impairment.occupancyId || system.occupancyId,
    systemId: impairment.systemId,
    category: "fps_impairment",
    severity: impairment.fireWatchRequired ? "critical" : "high",
    description: [system.name || system.systemTypeId || "Fire protection system", "impaired", impairment.reason ? `— ${impairment.reason}` : ""]
      .filter(Boolean).join(" "),
    source: "fps_impairment",
    // An impairment record is an official department record, not a field report.
    verificationStatus: "verified",
    resolutionStatus: "active",
    effectiveAt: impairment.startedAt || impairment.createdAt,
    lastVerifiedAt: impairment.updatedAt || impairment.startedAt,
    reviewBy: impairment.expectedRestoreAt || "",
  });
}

const dateOnly = dateKeyOf;

/**
 * Split alerts for display. Rejected and resolved alerts are left out; an
 * alert whose review date has passed is still shown but flagged as stale.
 * @returns {{verified:object[], reported:object[]}}
 */
export function groupAlertsForResponse(alerts = [], now = new Date()) {
  const today = localDateKey(now);
  const live = alerts
    .map(normalizeAlert)
    .filter((row) => row.resolutionStatus === "active" && row.verificationStatus !== "rejected")
    .map((row) => ({ ...row, stale: Boolean(row.reviewBy) && dateOnly(row.reviewBy) < today }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || String(b.effectiveAt).localeCompare(String(a.effectiveAt)));
  return {
    verified: live.filter((row) => row.verificationStatus === "verified"),
    reported: live.filter((row) => row.verificationStatus === "reported"),
  };
}

/** One history line for an alert change (kept on the alert, capped at 50). */
export function alertHistoryEntry(action, actor = {}, note = "") {
  return { action, at: new Date().toISOString(), by: actor.actorUid || "", byName: actor.actorName || "", note: text(note, 500) };
}

// ---------------------------------------------------------------- response view

// The revision the preplan names as published stays the operational plan while a
// new revision is drafted, reviewed or approved. Starting a revision marks the old
// one "superseded" (preplanService.startPreplanRevision) before the new one is
// published, so both statuses count here; publishing moves publishedRevisionId.
export const LIVE_REVISION_STATUSES = new Set(["published", "superseded"]);
const RETIRED_PREPLAN_STATUSES = new Set(["archived", "cancelled"]);

/**
 * Decide what the response view may show. It only ever shows the published
 * revision; a draft, even an AI-converted one, is never substituted.
 *
 * @param {{preplan?:object|null, publishedRevision?:object|null, now?:Date}} input
 * @returns {{state:"published"|"none"|"unavailable", reason:string, stale:boolean, staleReason:string, verifiedOn:string, dueOn:string}}
 */
export function resolveResponsePlan({ preplan = null, publishedRevision = null, now = new Date() } = {}) {
  const base = { stale: false, staleReason: "", verifiedOn: "", dueOn: "" };
  if (!preplan) return { ...base, state: "none", reason: "No preplan exists for this property." };
  // Only the status means "withdrawn": every new, never-published preplan also starts
  // with operationalValidity "unavailable".
  if (preplan.status === "temporarily_unavailable") {
    return { ...base, state: "unavailable", reason: "This preplan was withdrawn from operational use. Use size-up and command judgment." };
  }
  if (!preplan.publishedRevisionId || !publishedRevision || publishedRevision.id !== preplan.publishedRevisionId
    || !LIVE_REVISION_STATUSES.has(publishedRevision.status) || RETIRED_PREPLAN_STATUSES.has(preplan.status)) {
    return {
      ...base,
      state: "none",
      reason: preplan.currentRevisionId
        ? "No approved preplan yet. A draft exists but has not been approved, so it is not shown here."
        : "No approved preplan yet.",
    };
  }
  const today = localDateKey(now);
  const dueOn = dateOnly(preplan.verificationDueAt);
  const verifiedOn = dateOnly(preplan.lastVerifiedAt || publishedRevision.publishedAt);
  const overdue = Boolean(dueOn) && dueOn < today;
  return {
    state: "published",
    reason: "",
    stale: overdue,
    staleReason: overdue ? `Field verification was due ${dueOn}. Information may be out of date.` : "",
    verifiedOn,
    dueOn,
  };
}

/** Hydrant summary for responders; flags anything not in service or not tested in `staleYears`. */
export function summarizeHydrant(hydrant = {}, now = new Date(), staleYears = 2) {
  const lastTested = String(hydrant.last_checked || hydrant.lastTestDate || "").slice(0, 10);
  const tested = lastTested ? new Date(lastTested) : null;
  const ageYears = tested && !Number.isNaN(tested.getTime()) ? (now - tested) / (365.25 * 86400000) : null;
  const status = String(hydrant.status || "").trim();
  const inService = !status || /in service|active/i.test(status);
  const warnings = [];
  if (!inService) warnings.push(`Status: ${status}`);
  if (ageYears == null) warnings.push("No flow test on record");
  else if (ageYears > staleYears) warnings.push(`Last tested ${lastTested}`);
  return {
    id: String(hydrant.id || hydrant.hydrant_id || ""),
    label: String(hydrant.official_hydrant_id || hydrant.hydrant_id || hydrant.id || "Hydrant"),
    address: String(hydrant.address || ""),
    flowGpm: hydrant.flow_gpm != null && hydrant.flow_gpm !== "" ? Number(hydrant.flow_gpm) : null,
    staticPsi: hydrant.static_psi != null && hydrant.static_psi !== "" ? Number(hydrant.static_psi) : null,
    residualPsi: hydrant.residual_psi != null && hydrant.residual_psi !== "" ? Number(hydrant.residual_psi) : null,
    nfpaClass: String(hydrant.nfpa_class || hydrant.flow_result || ""),
    lastTested,
    inService,
    warnings,
  };
}
