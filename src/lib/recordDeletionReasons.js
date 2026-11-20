/**
 * Why an administrator deleted an inspection or preplan. The server
 * (functions/lib/recordDeletion.js) keeps the same list and refuses anything else;
 * tests/unit/recordDeletion.test.mjs checks the two match.
 */
export const OTHER_DELETE_REASON = "Other (explain in notes)";

export const DELETE_REASONS = Object.freeze([
  "Created by mistake",
  "Duplicate record",
  "Entered for the wrong occupancy or address",
  "Test or training record",
  "Business closed or building demolished",
  "Replaced by a newer record",
  OTHER_DELETE_REASON,
]);

export const MAX_DELETE_NOTES = 1000;

/** What still needs filling in before deleting ("" when ready). */
export function deleteReasonProblem(reason, notes = "") {
  if (!DELETE_REASONS.includes(reason)) return "Choose why this is being deleted.";
  if (reason === OTHER_DELETE_REASON && String(notes || "").trim().length < 3) {
    return "Explain why in the notes when the reason is Other.";
  }
  return "";
}
