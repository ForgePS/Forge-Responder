import { checklistProgress, reportChecklist } from "./reportModel.js";

/** @typedef {{ id: string, severity: 'error' | 'warning', section: string, field?: string, message: string, blocking: boolean }} NerisValidationIssue */

/**
 * What still needs attention on a report, in plain English (see reportModel.js).
 * @param {Record<string, unknown>} report
 * @returns {NerisValidationIssue[]}
 */
export function validateNerisReport(report = {}) {
  return reportChecklist(report)
    .filter((item) => !item.done)
    .map((item) => ({
      id: item.id,
      severity: item.required ? "error" : "warning",
      section: item.step,
      field: item.id,
      message: item.problem ? item.label : `${item.label} is missing`,
      blocking: item.required,
    }));
}

/** Percent of required items that are done. */
export function computeCompletionPercentage(report = {}) {
  return checklistProgress(report).percent;
}

/** @param {NerisValidationIssue[]} issues */
export function countBlockingErrors(issues = []) {
  return issues.filter((i) => i.blocking && i.severity === "error").length;
}
