/**
 * Turns a data key into a readable column label:
 * "inspectionDate" → "Inspection Date", "violation_count" → "Violation Count".
 * @param {unknown} key
 * @returns {string}
 */
export function labelFromKey(key) {
  return String(key ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
