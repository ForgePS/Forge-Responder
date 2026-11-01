/**
 * Decide whether closing a damage report should offer to put the hydrant back
 * in service. Pure (no Firebase) so it can be unit tested.
 *
 * We only offer it when the hydrant is out of service *because of this report*:
 *  - the report has just been closed (a passed verification with return to service),
 *  - the report recorded the hydrant as out of service / unavailable,
 *  - the hydrant record is still marked out of service, and
 *  - no other open damage report for the same hydrant has it out of service.
 */
import { isOutOfServiceHydrant } from "../hydrantCompletionStats.js";

export const DAMAGE_OOS_STATUSES = ["out_of_service", "temporarily_unavailable", "missing"];
const CLOSED_REPORT_STATUSES = ["closed", "cancelled", "verified"];

export function hydrantMatchesDamageReport(hydrant = {}, report = {}) {
  const id = String(report.hydrantId || "").trim();
  if (!id || !hydrant) return false;
  return [hydrant.location_id, hydrant.hydrant_id, hydrant.id]
    .some((value) => value != null && String(value).trim() === id);
}

/**
 * @param {object} args
 * @param {object} args.reportBefore  report as it was before verification
 * @param {object} args.reportAfter   report returned by the verification
 * @param {object|null} args.hydrant  current hydrant record (or null if unknown)
 * @param {object[]} [args.allReports] every damage report in the department
 */
export function shouldOfferReturnToService({ reportBefore, reportAfter, hydrant, allReports = [] } = {}) {
  if (!reportBefore || !reportAfter || !hydrant) return false;
  if (reportAfter.status !== "closed") return false;
  if (!DAMAGE_OOS_STATUSES.includes(reportBefore.operationalStatus)) return false;
  if (!hydrantMatchesDamageReport(hydrant, reportAfter)) return false;
  if (!isOutOfServiceHydrant(hydrant)) return false;
  const otherOpenOos = allReports.some((row) => (
    row
    && row.id !== reportAfter.id
    && row.hydrantId === reportAfter.hydrantId
    && !CLOSED_REPORT_STATUSES.includes(row.status)
    && DAMAGE_OOS_STATUSES.includes(row.operationalStatus)
  ));
  return !otherOpenOos;
}
