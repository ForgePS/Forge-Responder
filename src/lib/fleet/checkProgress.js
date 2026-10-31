// Progress and completeness for an apparatus check, shared by the check screen and
// completeFleetCheck (so a check can't be finished with required items blank).

const NON_ANSWER_TYPES = ["heading", "instruction"];

export function answerableFields(sections = []) {
  return (sections || []).flatMap((section) => (section.fields || [])
    .filter((field) => !NON_ANSWER_TYPES.includes(field.type))
    .map((field) => ({ ...field, sectionId: section.id, sectionTitle: section.title })));
}

export function isAnswered(value) {
  return !(value === undefined || value === null || String(value).trim() === "");
}

/** { answered, total, percent } across every answerable item. */
export function checkProgress(sections = [], answers = {}) {
  const fields = answerableFields(sections);
  const answered = fields.filter((field) => isAnswered(answers?.[field.key])).length;
  const total = fields.length;
  return { answered, total, percent: total ? Math.round((answered / total) * 100) : 0 };
}

const FAIL_VALUES = ["fail", "no"];

/** Required items left blank, and failed items whose required note is missing. */
export function checkProblems(sections = [], answers = {}, failNotes = {}) {
  const missing = [];
  const missingNotes = [];
  for (const field of answerableFields(sections)) {
    const value = answers?.[field.key];
    if (field.required && !isAnswered(value)) missing.push(field);
    if (field.noteRequiredOnFail && FAIL_VALUES.includes(String(value || "").toLowerCase())
      && !String(failNotes?.[field.key] || "").trim()) {
      missingNotes.push(field);
    }
  }
  return { missing, missingNotes };
}

/** Pass-type options for an item, or null when it isn't a pass/fail style item. */
export function choiceOptions(field = {}) {
  if (field.type === "yes_no") return ["Yes", "No"];
  if (field.type === "pass_fail_na") return ["Pass", "Fail", "N/A"];
  if (field.type === "pass_fail") return ["Pass", "Fail"];
  return null;
}

/** The "everything's fine" answer for an item ("Pass" or "Yes"), if it has one. */
export function passAnswer(field = {}) {
  const options = choiceOptions(field);
  if (!options) return null;
  return options[0];
}

const READINESS_LABELS = {
  available: "In service",
  available_restricted: "In service with restrictions",
  out_of_service: "Out of service",
};

export function readinessLabel(value = "") {
  return READINESS_LABELS[value] || String(value || "").replace(/_/g, " ");
}
