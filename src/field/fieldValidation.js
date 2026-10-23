/**
 * Checks run before a field record can be saved (pure, unit tested).
 * Each returns { field: message } for every problem; empty object = OK.
 */

const blank = (value) => value === undefined || value === null || String(value).trim() === "";

export function isFailAnswer(value) {
  return ["fail", "no", "failed", "noncompliant"].includes(String(value || "").trim().toLowerCase());
}

/** Fields a crew must answer in a checklist (headings/instructions excluded). */
export function checklistFields(template) {
  return (template?.sections || []).flatMap((section) => (section.fields || [])
    .filter((field) => !["heading", "instruction"].includes(field.type))
    .map((field) => ({ ...field, sectionId: section.id, sectionTitle: section.title || section.name || "" })));
}

export function validateTruckCheck({ template, answers = {}, failNotes = {} }) {
  const errors = {};
  if (!template) {
    errors.template = "Pick a checklist.";
    return errors;
  }
  for (const field of checklistFields(template)) {
    const answer = answers[field.key];
    const required = Boolean(field.required);
    if (required && blank(answer)) {
      errors[field.key] = "Answer this item.";
      continue;
    }
    if (["meter_reading", "fuel_level"].includes(field.type) && !blank(answer)) {
      const number = Number(answer);
      if (!Number.isFinite(number) || number < 0) errors[field.key] = "Enter a number.";
      if (field.type === "fuel_level" && number > 100) errors[field.key] = "Fuel level is 0–100%.";
    }
    if (isFailAnswer(answer) && (field.noteRequiredOnFail || field.failAction === "oos") && blank(failNotes[field.key])) {
      errors[`${field.key}:note`] = "Describe the problem.";
    }
  }
  return errors;
}

export function validateHoseTest(data = {}) {
  const errors = {};
  if (blank(data.testDate)) errors.testDate = "Pick the test date.";
  if (blank(data.shift)) errors.shift = "Pick the shift.";
  if (!Array.isArray(data.hoseIds) || !data.hoseIds.length) errors.hoseIds = "Add at least one hose.";
  if (blank(data.result)) errors.result = "Pick Pass or Fail.";
  if (blank(data.testedBy)) errors.testedBy = "Who tested it?";
  if (data.result === "Failed" && blank(data.notes)) errors.notes = "Describe why it failed.";
  return errors;
}

export function validateHydrantInspection(data = {}) {
  const errors = {};
  if (!data.hydrant) errors.hydrant = "Pick a hydrant.";
  if (blank(data.date)) errors.date = "Pick the date.";
  if (blank(data.shift)) errors.shift = "Pick the shift.";
  if (blank(data.testedBy)) errors.testedBy = "Who inspected it?";
  (data.checklist || []).forEach((row, index) => {
    if (blank(row.result)) errors[`row${index}`] = "Answer this item.";
    if (row.result === "No" && blank(row.notes)) errors[`row${index}:note`] = "Describe the problem.";
  });
  return errors;
}

export function calculateFlowGpm(dischargeSize, pitotPsi) {
  const diameter = Number(dischargeSize);
  const pitot = Number(pitotPsi);
  if (!Number.isFinite(diameter) || !Number.isFinite(pitot) || pitot <= 0) return "";
  return Math.round(29.83 * 0.9 * diameter ** 2 * Math.sqrt(pitot));
}

export function validateFlowTest(data = {}) {
  const errors = {};
  if (!data.hydrant) errors.hydrant = "Pick a hydrant.";
  if (blank(data.date)) errors.date = "Pick the date.";
  if (blank(data.shift)) errors.shift = "Pick the shift.";
  if (blank(data.testedBy)) errors.testedBy = "Who ran the test?";
  const psi = (key, label, max = 250) => {
    const value = Number(data[key]);
    if (blank(data[key])) errors[key] = `Enter ${label}.`;
    else if (!Number.isFinite(value) || value <= 0 || value > max) errors[key] = `${label} looks wrong (1–${max} psi).`;
  };
  psi("staticPsi", "static pressure");
  psi("residualPsi", "residual pressure");
  psi("pitotPsi", "pitot pressure", 150);
  if (!errors.staticPsi && !errors.residualPsi && Number(data.residualPsi) > Number(data.staticPsi)) {
    errors.residualPsi = "Residual can't be higher than static.";
  }
  return errors;
}

export function validateHydrantDamage(data = {}) {
  const errors = {};
  if (!data.hydrant) errors.hydrant = "Pick the damaged hydrant.";
  if (!Array.isArray(data.categoryIds) || !data.categoryIds.length) errors.categoryIds = "Pick what's damaged.";
  if (blank(data.severity)) errors.severity = "Pick how bad it is.";
  if (blank(data.operationalStatus)) errors.operationalStatus = "Can it still be used?";
  return errors;
}

export function validateDamageForm(data = {}) {
  const errors = {};
  if (blank(data.date)) errors.date = "Pick the date of the damage.";
  if (blank(data.location)) errors.location = "Pick the station or unit.";
  if (blank(data.description)) errors.description = "Describe what is damaged.";
  return errors;
}

export function validateDailyLog(data = {}) {
  const errors = {};
  if (blank(data.date)) errors.date = "Pick the date.";
  if (blank(data.shift)) errors.shift = "Pick the shift.";
  if (blank(data.apparatus)) errors.apparatus = "Pick the unit.";
  if (blank(data.notes) && !(data.crew || []).length) errors.notes = "Add crew or notes.";
  return errors;
}

export function validateIncident(data = {}) {
  const errors = {};
  if (blank(data.incidentDate)) errors.incidentDate = "Pick the incident date.";
  if (blank(data.incidentAddress)) errors.incidentAddress = "Enter the address or location.";
  if (blank(data.incidentTypeSummary)) errors.incidentTypeSummary = "Pick the incident type.";
  const cad = data.workspace?.cad || {};
  if (cad.dispatchTime && cad.arrivalTime && cad.arrivalTime < cad.dispatchTime) errors.arrivalTime = "Arrival is before dispatch.";
  if (cad.arrivalTime && cad.clearTime && cad.clearTime < cad.arrivalTime) errors.clearTime = "Clear is before arrival.";
  const patients = data.workspace?.ems?.patientCount;
  if (!blank(patients) && (!Number.isInteger(Number(patients)) || Number(patients) < 0)) errors.patientCount = "Whole number.";
  return errors;
}

/** Local calendar date (YYYY-MM-DD) — not UTC, so late-night entries get the right day. */
export function localDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local date-time for <input type="datetime-local"> (YYYY-MM-DDTHH:mm). */
export function localDateTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${localDate(date)}T${h}:${min}`;
}
