/**
 * How each inspection checklist field type is answered and checked.
 * Firebase-free so it can be shared by the screen, the workflow and unit tests.
 *
 * Answer shapes stored in inspection.answers[field.key]:
 * - choice types (pass/fail, yes/no, select, dropdown): string
 * - multi_select: string[]
 * - checkbox: boolean
 * - number: string (as typed, so "" means unanswered)
 * - date: "YYYY-MM-DD"
 * - photo: [{ id, fileName, downloadUrl }]
 * - signature: { name, signedAt } (typed name, not a drawn signature)
 * - code_citation / violation / text: string
 */

export const DISPLAY_ONLY_FIELD_TYPES = new Set(["heading", "instruction"]);

const FIXED_CHOICES = {
  yes_no: ["Yes", "No"],
  pass_fail: ["Pass", "Fail"],
  pass_fail_na: ["Pass", "Fail", "N/A"],
  compliant: ["Compliant", "Noncompliant", "Not observed"],
};

/** Which input the screen should draw for a field type. */
export function getChecklistInputKind(type) {
  const value = String(type || "short_text");
  if (DISPLAY_ONLY_FIELD_TYPES.has(value)) return "display";
  if (FIXED_CHOICES[value]) return "choice";
  if (value === "single_select" || value === "dropdown") return "select";
  if (value === "multi_select") return "multi_select";
  if (value === "checkbox") return "checkbox";
  if (value === "long_text") return "long_text";
  if (value === "number") return "number";
  if (value === "date") return "date";
  if (value === "photo") return "photo";
  if (value === "signature") return "signature";
  if (value === "code_citation") return "code_citation";
  return "text";
}

/** Options for choice and select fields (configured options win for select types). */
export function getChecklistFieldOptions(field = {}) {
  const type = String(field.type || "");
  if (FIXED_CHOICES[type]) return [...FIXED_CHOICES[type]];
  const configured = Array.isArray(field.options) ? field.options : [];
  return configured
    .map((option) => (option && typeof option === "object" ? String(option.label ?? option.value ?? "") : String(option ?? "")))
    .map((option) => option.trim())
    .filter(Boolean);
}

/** True when a field has a real answer (false/empty/blank never counts). */
export function isChecklistAnswerFilled(field = {}, value) {
  const kind = getChecklistInputKind(field.type);
  if (kind === "display") return true;
  if (value == null) return false;
  if (kind === "checkbox") return value === true;
  if (kind === "photo" || kind === "multi_select") return Array.isArray(value) && value.length > 0;
  if (kind === "signature") {
    return Boolean(value && typeof value === "object" && String(value.name || "").trim() && value.signedAt);
  }
  if (kind === "number") return String(value).trim() !== "" && Number.isFinite(Number(value));
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return String(value).trim() !== "";
}

/**
 * Required fields with no answer, in form order.
 * @returns {{ key: string, label: string, sectionTitle: string }[]}
 */
export function findMissingRequiredFields(templateSnapshot, answers = {}) {
  const sections = Array.isArray(templateSnapshot?.sections) ? templateSnapshot.sections : [];
  const missing = [];
  for (const section of sections) {
    for (const field of section?.fields || []) {
      if (!field?.required || !field.key) continue;
      if (getChecklistInputKind(field.type) === "display") continue;
      if (!isChecklistAnswerFilled(field, answers?.[field.key])) {
        missing.push({
          key: field.key,
          label: String(field.label || field.key),
          sectionTitle: String(section.title || ""),
        });
      }
    }
  }
  return missing;
}

export function formatMissingFieldsMessage(missing = []) {
  if (!missing.length) return "";
  const names = missing.map((item) => (item.sectionTitle ? `${item.label} (${item.sectionTitle})` : item.label));
  const list = names.length > 6 ? `${names.slice(0, 6).join(", ")} and ${names.length - 6} more` : names.join(", ");
  return `Answer the required ${missing.length === 1 ? "item" : "items"} before completing: ${list}.`;
}
