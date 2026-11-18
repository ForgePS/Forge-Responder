/**
 * The Result choices an inspector picks when completing an inspection (RMS and
 * FORGE FIELD). Each department can edit the list in Configuration Studio →
 * Module settings (inspectionSettings/main.inspectionResults); an empty list
 * means the defaults below.
 */
export const DEFAULT_INSPECTION_RESULTS = [
  "Passed",
  "Passed with conditions",
  "Failed",
  "Reinspection required",
  "Immediate action required",
  "Incomplete",
  "Unable to inspect",
  "No access",
  "Business closed",
  "Cancelled",
];

export const MAX_INSPECTION_RESULTS = 30;
const MAX_RESULT_CHARS = 60;

/** A clean list: trimmed, no blanks or repeats, capped. [] when nothing usable. */
export function cleanInspectionResults(list) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const value = String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_RESULT_CHARS);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
    if (out.length >= MAX_INSPECTION_RESULTS) break;
  }
  return out;
}

/** The department's Result choices (defaults when none are set). */
export function inspectionResultOptions(settings) {
  const list = cleanInspectionResults(settings?.inspectionResults);
  return list.length ? list : [...DEFAULT_INSPECTION_RESULTS];
}

/** Colour hint for a result button: ok (passed), bad (failed/immediate), warn (anything else). */
export function inspectionResultTone(value) {
  const text = String(value || "").toLowerCase();
  if (/fail|immediate|hazard|unsafe|violation/.test(text)) return "bad";
  if (/^pass(ed)?$|^compliant$|^approved$/.test(text)) return "ok";
  return "warn";
}

/** Whether choosing this result should tick "Reinspection required". */
export function resultNeedsReinspection(value) {
  return /reinspect|fail/i.test(String(value || ""));
}
