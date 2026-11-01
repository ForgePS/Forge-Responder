export const NERIS_REPORT_STATUSES = [
  "Draft",
  "In Progress",
  "Needs Review",
  "Returned",
  "Approved",
  "Ready for Submission",
  "Submitted",
];

export const REVIEW_STAGES = [
  { id: "author", label: "Report Author", role: "firefighter" },
  { id: "company_officer", label: "Company Officer", role: "officer" },
  { id: "battalion_chief", label: "Battalion Chief", role: "chief" },
  { id: "admin", label: "RMS Administrator", role: "admin" },
  { id: "submission", label: "Final Submission", role: "admin" },
];

/**
 * @param {Record<string, unknown>} report
 * @param {{ reviewerName?: string, reviewerRole?: string, action: 'submit' | 'approve' | 'return', comments?: string }} payload
 */
export function applyReviewAction(report, payload) {
  const approvals = [...(report.workspace?.approvals || [])];
  const entry = {
    id: `APR-${Date.now()}`,
    reviewerName: payload.reviewerName || "Reviewer",
    reviewerRole: payload.reviewerRole || "officer",
    action: payload.action,
    comments: payload.comments || "",
    timestamp: new Date().toISOString(),
  };
  approvals.push(entry);

  const auditLog = [...(report.workspace?.auditLog || [])];
  auditLog.push({ action: `review_${payload.action}`, ...entry });

  let status = report.status || "Draft";
  let locked = report.locked || false;

  if (payload.action === "submit") status = "Needs Review";
  if (payload.action === "approve") {
    const stageIdx = REVIEW_STAGES.findIndex((s) => s.id === report.reviewStage);
    const nextStage = REVIEW_STAGES[stageIdx + 1];
    if (nextStage?.id === "submission") {
      status = "Ready for Submission";
    } else if (nextStage) {
      status = "Needs Review";
    } else {
      status = "Approved";
      locked = true;
    }
  }
  if (payload.action === "return") {
    status = "Returned";
    locked = false;
  }

  return {
    ...report,
    status,
    locked,
    // Sending for review hands it to the company officer; returning hands it back to the author.
    reviewStage: payload.action === "approve"
      ? (REVIEW_STAGES[REVIEW_STAGES.findIndex((s) => s.id === report.reviewStage) + 1]?.id || "submission")
      : payload.action === "submit" ? "company_officer"
        : payload.action === "return" ? "author"
          : report.reviewStage || "author",
    workspace: {
      ...(report.workspace || {}),
      approvals,
      auditLog,
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * @param {Record<string, unknown>} report
 * @param {string} reason
 * @param {string} actorName
 */
export function adminUnlockReport(report, reason, actorName = "Administrator") {
  const auditLog = [...(report.workspace?.auditLog || [])];
  auditLog.push({
    action: "admin_unlock",
    reason,
    actorName,
    timestamp: new Date().toISOString(),
  });
  return {
    ...report,
    locked: false,
    status: "In Progress",
    workspace: { ...(report.workspace || {}), auditLog },
    updatedAt: new Date().toISOString(),
  };
}

/** @param {string} status */
export function statusTone(status = "Draft") {
  const text = String(status).toLowerCase();
  if (/approved|ready|submitted/.test(text)) return "success";
  if (/returned|needs review/.test(text)) return "warning";
  if (/draft/.test(text)) return "neutral";
  return "info";
}

/** @param {string} status */
export function statusLabel(status = "Draft") {
  return status;
}
