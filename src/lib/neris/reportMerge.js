/**
 * Editing and merging NERIS reports, shared by the RMS and FORGE FIELD (pure, unit tested).
 */

/**
 * Apply an editor change the way the RMS does: a Draft becomes In Progress on
 * its first edit, and the completion figure is kept current.
 */
export function applyReportChange(report, patch, checklistProgress) {
  const next = {
    ...report,
    ...patch,
    ...(patch.workspace ? { workspace: { ...(report.workspace || {}), ...patch.workspace } } : {}),
    status: patch.status || (report.status === "Draft" || !report.status ? "In Progress" : report.status),
    updatedAt: new Date().toISOString(),
  };
  if (checklistProgress) next.completionPercentage = checklistProgress(next).percent;
  return next;
}

/** Paths merged field-by-field when a FORGE FIELD edit meets the server copy. */
const TOP_LEVEL_PATHS = [
  "incidentDate", "incidentAddress", "incidentTypeSummary", "disciplines", "status", "reviewStage", "locked",
  "submittedAt", "submissionMethod", "cadSnapshot", "cadImportAudit",
];
// Combined after the merge instead (they change on every edit): see combineIncidentBookkeeping.
const COMBINED_WORKSPACE_KEYS = new Set(["auditLog"]);

export function incidentMergePaths(...reports) {
  const workspaceKeys = new Set();
  const moduleKeys = new Set();
  reports.filter(Boolean).forEach((report) => {
    Object.keys(report.workspace || {}).forEach((key) => workspaceKeys.add(key));
    Object.keys(report.modules || {}).forEach((key) => moduleKeys.add(key));
  });
  // Module fields merge one by one so two people can work different questions.
  const moduleFieldPaths = [];
  moduleKeys.forEach((moduleId) => {
    const fields = new Set();
    reports.filter(Boolean).forEach((report) => Object.keys(report.modules?.[moduleId] || {}).forEach((field) => fields.add(field)));
    fields.forEach((field) => moduleFieldPaths.push(`modules.${moduleId}.${field}`));
  });
  return [
    ...TOP_LEVEL_PATHS,
    ...[...workspaceKeys].filter((key) => !COMBINED_WORKSPACE_KEYS.has(key)).map((key) => `workspace.${key}`),
    ...moduleFieldPaths,
  ];
}

/** Keep both sides' change log and auto-fill notes after a merge. */
export function combineIncidentBookkeeping(merged, mine = {}, server = {}) {
  const logOf = (report) => (Array.isArray(report?.workspace?.auditLog) ? report.workspace.auditLog : []);
  const seen = new Set();
  const auditLog = [...logOf(server), ...logOf(mine)].filter((entry) => {
    const key = JSON.stringify(entry);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return {
    ...merged,
    autoPopulateSources: { ...(server?.autoPopulateSources || {}), ...(mine?.autoPopulateSources || {}) },
    workspace: { ...(merged.workspace || {}), auditLog },
  };
}
