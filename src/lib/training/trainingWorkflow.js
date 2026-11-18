/**
 * Training record workflow.
 *
 *   draft ──submit──▶ submitted ──approve──▶ approved ──lock──▶ locked
 *     ▲                  │
 *     └──── return ──────┘   (returned: the author fixes and resubmits)
 *
 * Approved and locked records are never edited in place. A correction is an
 * amendment: the changed fields with their old and new values, a reason, who and
 * when, appended to a permanent history. Only approvers can amend an approved
 * record; nobody can amend a locked one.
 */

export const RECORD_STATUSES = {
  draft: { label: "Draft", tone: "neutral" },
  submitted: { label: "Submitted", tone: "info" },
  returned: { label: "Returned for correction", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  locked: { label: "Locked", tone: "success" },
};

/** action -> { from: allowed statuses, to: new status, needs: "author" | "approver" } */
export const TRANSITIONS = {
  submit: { from: ["draft", "returned"], to: "submitted", needs: "author" },
  return: { from: ["submitted"], to: "returned", needs: "approver", reasonRequired: true },
  approve: { from: ["submitted"], to: "approved", needs: "approver" },
  lock: { from: ["approved"], to: "locked", needs: "approver" },
  reopen: { from: ["approved"], to: "returned", needs: "approver", reasonRequired: true },
};

export function statusLabel(status) {
  return RECORD_STATUSES[status]?.label || "Draft";
}

export function statusTone(status) {
  return RECORD_STATUSES[status]?.tone || "neutral";
}

/** The author (or an editor) may change the content only while it is a draft or was returned. */
export function isEditable(record = {}) {
  return ["draft", "returned", undefined, ""].includes(record.status);
}

export function isFinal(record = {}) {
  return record.status === "approved" || record.status === "locked";
}

/**
 * Can `actor` perform `action` on `record`?
 * actor: { uid, canEdit, canApprove }
 * Returns { ok, reason }.
 */
export function canTransition(record = {}, action, actor = {}) {
  const t = TRANSITIONS[action];
  if (!t) return { ok: false, reason: "Unknown action." };
  const status = record.status || "draft";
  if (!t.from.includes(status)) return { ok: false, reason: `A ${statusLabel(status).toLowerCase()} record can't be ${action === "submit" ? "submitted" : action + "ed"}.` };
  if (t.needs === "approver" && !actor.canApprove) return { ok: false, reason: "Only training approvers can do this." };
  if (t.needs === "author" && !(actor.canEdit || actor.uid === record.createdBy)) return { ok: false, reason: "You can't submit this record." };
  // Separation of duties: nobody approves their own record.
  if (action === "approve" && actor.uid && actor.uid === record.submittedBy) {
    return { ok: false, reason: "Someone other than the submitter must approve this record." };
  }
  return { ok: true, reason: "" };
}

/**
 * Validate a record before it is submitted. Returns a list of problems (empty = OK).
 * Drafts may be saved incomplete; submission requires the essentials.
 */
/**
 * Live-fire documentation. These are the department's own checklist items, not
 * text from any standard; map them to the edition your department has adopted.
 * A live-fire record can't be submitted until every item is confirmed and the
 * key roles are named (a hard stop, always on).
 */
export const LIVE_FIRE_CHECKS = [
  ["structureInspected", "Burn building / prop inspected and found fit for use"],
  ["fuelDocumented", "Fuel type and load documented"],
  ["waterSupply", "Primary and backup water supply established and flowed"],
  ["ricAssigned", "Rapid intervention crew assigned and in place"],
  ["emsStandby", "EMS standby on scene"],
  ["ppeChecked", "PPE and SCBA checked for every participant"],
  ["walkthrough", "Participants completed a walkthrough of the structure / prop"],
  ["briefing", "Pre-burn safety briefing held (evacuation signal, emergency plan)"],
  ["accountability", "Personnel accountability system in use"],
  ["communications", "Communications plan and channels confirmed"],
  ["rehab", "Rehabilitation area established"],
  ["postBurn", "Post-burn inspection and debrief completed"],
];
export const LIVE_FIRE_ROLES = [["instructorInCharge", "Instructor-in-charge"], ["safetyOfficer", "Safety officer"], ["ignitionOfficer", "Ignition officer"]];

export function isLiveFire(record = {}) {
  return record.type === "Live fire" || record.deliveryMethod === "Live fire";
}

export function liveFireProblems(record = {}) {
  if (!isLiveFire(record)) return [];
  const lf = record.liveFire || {};
  const problems = [];
  for (const [key, label] of LIVE_FIRE_ROLES) if (!String(lf[key] || "").trim()) problems.push(`Live fire: name the ${label.toLowerCase()}.`);
  if (lf.safetyOfficer && lf.ignitionOfficer && String(lf.safetyOfficer).trim().toLowerCase() === String(lf.ignitionOfficer).trim().toLowerCase()) {
    problems.push("Live fire: the safety officer can't also be the ignition officer.");
  }
  const open = LIVE_FIRE_CHECKS.filter(([key]) => !lf.checks?.[key]);
  if (open.length) problems.push(`Live fire: confirm ${open.length} safety checklist item${open.length === 1 ? "" : "s"}.`);
  return problems;
}

export function submissionProblems(record = {}, { requireEvidence = false } = {}) {
  const problems = [];
  if (!String(record.title || "").trim()) problems.push("Enter the training topic.");
  if (!record.date) problems.push("Choose the training date.");
  if (!(Number(record.instructionalHours ?? record.durationHours) > 0)) problems.push("Enter how long the training ran.");
  const participants = Array.isArray(record.participants) ? record.participants : [];
  if (!participants.length) problems.push("Add at least one participant.");
  const unmarked = participants.filter((p) => !p.attendance);
  if (unmarked.length) problems.push(`Mark attendance for ${unmarked.length} participant${unmarked.length === 1 ? "" : "s"}.`);
  if (participants.length && !participants.some((p) => p.attendance === "present" || p.attendance === "partial")) {
    problems.push("Nobody is marked present.");
  }
  if (record.date && record.date > new Date(Date.now() + 86400000).toISOString().slice(0, 10)) {
    problems.push("Training can't be recorded for a future date.");
  }
  if (requireEvidence && !(Array.isArray(record.evidence) && record.evidence.length)) {
    problems.push("Attach supporting documentation (sign-in sheet, photo, or certificate).");
  }
  problems.push(...liveFireProblems(record));
  return problems;
}

/** Fields an amendment may touch, with labels for the history view. */
export const AMENDABLE_FIELDS = {
  title: "Topic",
  description: "Description",
  discipline: "Discipline",
  date: "Date",
  startTime: "Start time",
  endTime: "End time",
  breakMinutes: "Break (minutes)",
  durationHours: "Duration (hours)",
  location: "Location",
  stationId: "Station",
  shift: "Shift",
  unit: "Unit",
  notes: "Notes",
  participants: "Participants",
  instructors: "Instructors",
  evidence: "Supporting documents",
};

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** The changed fields between two versions of a record, as [{ field, label, from, to }]. */
export function diffForAmendment(before = {}, after = {}) {
  return Object.keys(AMENDABLE_FIELDS)
    .filter((field) => !same(before[field], after[field]))
    .map((field) => ({ field, label: AMENDABLE_FIELDS[field], from: before[field] ?? null, to: after[field] ?? null }));
}

export function canAmend(record = {}, actor = {}) {
  if (record.status === "locked") return { ok: false, reason: "Locked records can't be amended." };
  if (record.status !== "approved") return { ok: false, reason: "Only approved records are amended; edit drafts directly." };
  if (!actor.canApprove) return { ok: false, reason: "Only training approvers can amend an approved record." };
  return { ok: true, reason: "" };
}
