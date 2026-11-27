/**
 * Department rules for automatic preplan review tasks. The server applies them
 * (functions/lib/preplanReviewTasks.js); this file reads and saves them for the
 * Config Studio. The rules themselves are in reviewRulesModel.js.
 */
import { getRecord, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import { DEFAULT_REVIEW_RULES, normalizeReviewRules, parseRuleList, SEVERITY_OPTIONS } from "./reviewRulesModel.js";

export const PREPLAN_SETTINGS_COLLECTION = "preplanSettings";
const RULES_ID = "reviewRules";

export { DEFAULT_REVIEW_RULES, normalizeReviewRules, parseRuleList, SEVERITY_OPTIONS };

export async function getReviewRules(departmentId) {
  const stored = await getRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, RULES_ID).catch(() => null);
  return { rules: normalizeReviewRules(stored), saved: Boolean(stored), updatedAt: stored?.updatedAt || "", updatedByName: stored?.updatedByName || "" };
}

export async function saveReviewRules(departmentId, rules, actor = {}) {
  const next = normalizeReviewRules(rules);
  await updateRecord(departmentId, PREPLAN_SETTINGS_COLLECTION, RULES_ID, {
    ...next,
    updatedBy: actor.actorUid || "",
    updatedByName: actor.actorName || "",
  });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanSettings",
    action: "update",
    recordId: RULES_ID,
    summary: "Automatic preplan review rules updated",
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return next;
}
