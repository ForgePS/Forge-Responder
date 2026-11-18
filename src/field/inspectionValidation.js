/** Checks a FORGE FIELD inspection before it is saved or completed (kept free of JSX so tests can load it). */
import { failDetailFields, isFailAnswer } from "../lib/inspections/inspectionFailDetails.js";
import { MAX_REPORT_RECIPIENTS, parseRecipients } from "../lib/inspections/inspectionEmailRecipients.js";

export function inspectionFields(template) {
  return (template?.sections || []).flatMap((section) => (section.fields || []).map((field) => ({ ...field, sectionId: section.id })));
}

export function validateInspectionForm(data, rules) {
  const errors = {};
  if (data.finish) {
    for (const field of inspectionFields(data.inspection?.templateSnapshot)) {
      if (["heading", "instruction", "photo", "signature"].includes(field.type)) continue;
      const value = data.answers?.[field.key];
      if (field.required && (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length))) {
        errors[`a:${field.key}`] = "Answer this item.";
      }
      const remarksKey = failDetailFields(field).remarks.key;
      if (isFailAnswer(field, value) && !String(data.answers?.[remarksKey] || "").trim()) {
        errors[`a:${remarksKey}`] = `Add remarks for "${field.label}".`;
      }
    }
    if (!data.result) errors.result = "Pick the result.";
    if (/reinspection/i.test(data.result || "") && !data.nextReinspectionAt) errors.nextReinspectionAt = "Pick the reinspection date.";
    if (rules?.required("summary") && !String(data.summary || "").trim()) errors.summary = "Add a summary.";
  }
  if (data.finish && data.emailReport?.send) {
    const { recipients, invalid } = parseRecipients(data.emailReport.to);
    if (invalid.length) errors.emailTo = `Check this email address: ${invalid[0]}`;
    else if (!recipients.length) errors.emailTo = "Add the email address to send the report to.";
    else if (recipients.length > MAX_REPORT_RECIPIENTS) errors.emailTo = `Send to ${MAX_REPORT_RECIPIENTS} addresses or fewer.`;
  }
  (data.violations || []).forEach((violation, index) => {
    if (!String(violation.name || "").trim()) errors[`v:${index}`] = "Name the violation.";
  });
  return errors;
}
