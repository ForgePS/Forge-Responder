/**
 * Desktop patient care report editing helpers (no React), used by PcrEditor and PcrFields.
 */
import { fieldPath, postCheck } from "../nemsis/pcrModel.js";
import { withDepartmentIssues } from "./pcrForm.js";
import { setPath, threeWayMerge } from "../../field/fieldMerge.js";

/** What has to be fixed before posting: NEMSIS, department requirements, and an AI narrative nobody has confirmed. */
export function postIssues(schema, form, nemsis, aiNarrative) {
  let result = withDepartmentIssues(postCheck(schema, nemsis), schema, nemsis, form);
  if (aiNarrative?.generated && !aiNarrative?.reviewedAt) {
    const issue = { path: fieldPath(schema, "eNarrative.01"), element: "eNarrative.01", code: "ai-review", severity: "error", blocking: true, message: "Read the AI-written narrative and confirm it's accurate." };
    result = { ...result, ok: false, blocking: [...result.blocking, issue], issues: [...result.issues, issue] };
  }
  return result;
}

/**
 * After a save: the stored copy, with anything typed while the save was running put back on top.
 * sent = what the save sent, current = the screen now, saved = what was stored (may include other devices' sections).
 */
export function rebaseEdits(sent, current, saved, paths) {
  const { merged, conflicts } = threeWayMerge(sent, current, saved, paths);
  // A section typed in here and changed elsewhere during the save: keep the typing; the next save checks it again.
  return conflicts.reduce((next, c) => setPath(next, c.path, c.mine), merged);
}

/** Fields behind "More fields", at any depth: an essential group (e.g. a vital set) can hold optional fields. */
export function countHidden(items) {
  return items.reduce((n, item) => n + (!item.essential ? 1 : item.children ? countHidden(item.children) : 0), 0);
}
