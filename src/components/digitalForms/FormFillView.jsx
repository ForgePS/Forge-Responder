import ChecklistFieldInput from "../inspections/ChecklistFieldInput.jsx";
import { DISPLAY_FIELD_TYPES } from "../../lib/digitalForms/formDraft.js";

/**
 * Draws a digital form for filling in (or previewing), section by section,
 * with the same field inputs as inspection checklists.
 */
export default function FormFillView({ definition, answers = {}, onChange, editable = true, missingKeys = new Set(), signerName = "" }) {
  const sections = definition?.sections || [];
  if (!sections.length) return <p className="occupancy-muted">This form has no fields yet.</p>;
  return (
    <div className="df-fill">
      {definition.description ? <p className="occupancy-muted">{definition.description}</p> : null}
      {sections.map((section) => (
        <div key={section.id} className="template-section-card">
          <strong>{section.title}</strong>
          <div className="template-fields">
            {(section.fields || []).map((field) => {
              if (DISPLAY_FIELD_TYPES.has(field.type)) {
                return (
                  <div key={field.id || field.key} className={`config-field df-display df-${field.type}`}>
                    <span>{field.label}</span>
                    {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                  </div>
                );
              }
              const missing = missingKeys.has(field.key);
              return (
                <div key={field.id || field.key} className={`config-field${missing ? " checklist-field-missing" : ""}`} data-checklist-key={field.key}>
                  <span>
                    {field.label}
                    {field.required ? " *" : ""}
                    {missing ? " (required)" : ""}
                  </span>
                  <ChecklistFieldInput
                    field={field}
                    value={answers[field.key]}
                    editable={editable}
                    invalid={missing}
                    signerName={signerName}
                    onChange={(next) => onChange?.(field.key, next)}
                  />
                  {field.helpText ? <small className="occupancy-muted">{field.helpText}</small> : null}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
