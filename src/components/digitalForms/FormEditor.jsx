import { useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import FormFillView from "./FormFillView.jsx";
import {
  DIGITAL_FORM_FIELD_TYPES, DISPLAY_FIELD_TYPES, OPTION_FIELD_TYPES, draftEdits, parseOptions,
} from "../../lib/digitalForms/formDraft.js";

function OptionsEditor({ options, onChange }) {
  // Keep the raw text while typing so blank lines and edits aren't swallowed.
  const [textValue, setTextValue] = useState(() => (options || []).join("\n"));
  return (
    <label className="df-options">
      <span>Choices (one per line)</span>
      <textarea
        rows={Math.min(8, Math.max(3, (options || []).length + 1))}
        value={textValue}
        onChange={(e) => {
          setTextValue(e.target.value);
          onChange(parseOptions(e.target.value));
        }}
      />
    </label>
  );
}

function FieldRow({ field, onChange, onRemove, onMove, canMoveUp, canMoveDown }) {
  const display = DISPLAY_FIELD_TYPES.has(field.type);
  return (
    <div className="df-field-row">
      <div className="df-field-main">
        <label>
          <span>{display ? "Text" : "Label"}</span>
          <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} aria-label="Field label" />
        </label>
        <label>
          <span>Type</span>
          <select value={field.type} onChange={(e) => onChange({ type: e.target.value })} aria-label="Field type">
            {DIGITAL_FORM_FIELD_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        {!display ? (
          <label className="df-required">
            <input type="checkbox" checked={Boolean(field.required)} onChange={(e) => onChange({ required: e.target.checked })} />
            Required
          </label>
        ) : null}
      </div>
      <label className="df-help">
        <span>Help text</span>
        <input value={field.helpText || ""} onChange={(e) => onChange({ helpText: e.target.value })} placeholder="Optional instructions under the field" />
      </label>
      {OPTION_FIELD_TYPES.has(field.type) ? (
        <OptionsEditor key={field.id} options={field.options} onChange={(options) => onChange({ options })} />
      ) : null}
      <div className="df-row-actions">
        <button type="button" className="icon-button" title="Move up" aria-label="Move field up" disabled={!canMoveUp} onClick={() => onMove(-1)}><ArrowUp size={14} /></button>
        <button type="button" className="icon-button" title="Move down" aria-label="Move field down" disabled={!canMoveDown} onClick={() => onMove(1)}><ArrowDown size={14} /></button>
        <button type="button" className="icon-button danger" title="Remove field" aria-label="Remove field" onClick={onRemove}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

/**
 * Review / edit a digital form definition. `value` is the draft, `onChange`
 * receives the next draft. Has a Preview that shows the form as members see it.
 */
export default function FormEditor({ value, onChange, problems = [], warnings = [], signerName = "" }) {
  const [mode, setMode] = useState("edit");
  const [previewAnswers, setPreviewAnswers] = useState({});
  const draft = value || { name: "", description: "", sections: [] };
  const sections = draft.sections || [];
  const lastSection = sections.length - 1;

  return (
    <div className="df-editor">
      <div className="segmented-control" role="tablist" aria-label="Review mode">
        <button type="button" role="tab" aria-selected={mode === "edit"} className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><Pencil size={14} /> Edit</button>
        <button type="button" role="tab" aria-selected={mode === "preview"} className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><Eye size={14} /> Preview</button>
      </div>

      {warnings.length ? (
        <div className="df-note" role="note">
          <strong>Check these parts against the original:</strong>
          <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      ) : null}
      {problems.length ? (
        <div className="checklist-missing-alert" role="alert">
          <strong>Fix before publishing:</strong>
          <ul>{problems.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      ) : null}

      {mode === "preview" ? (
        <div className="df-preview">
          <h3>{draft.name}</h3>
          <FormFillView
            definition={draft}
            answers={previewAnswers}
            signerName={signerName}
            onChange={(key, next) => setPreviewAnswers((prev) => ({ ...prev, [key]: next }))}
          />
          <small className="occupancy-muted">Preview only. Answers here aren't saved.</small>
        </div>
      ) : (
        <>
          <div className="df-form-meta">
            <label>
              <span>Form name</span>
              <input value={draft.name || ""} onChange={(e) => onChange(draftEdits.setForm(draft, { name: e.target.value }))} />
            </label>
            <label>
              <span>Description</span>
              <textarea rows={2} value={draft.description || ""} onChange={(e) => onChange(draftEdits.setForm(draft, { description: e.target.value }))} />
            </label>
          </div>

          {sections.map((section, si) => (
            <div key={section.id} className="template-section-card df-section">
              <div className="df-section-head">
                <input
                  className="df-section-title"
                  value={section.title}
                  aria-label="Section title"
                  onChange={(e) => onChange(draftEdits.setSection(draft, si, { title: e.target.value }))}
                />
                <button type="button" className="icon-button" aria-label="Move section up" disabled={si === 0} onClick={() => onChange(draftEdits.moveSection(draft, si, -1))}><ArrowUp size={14} /></button>
                <button type="button" className="icon-button" aria-label="Move section down" disabled={si === lastSection} onClick={() => onChange(draftEdits.moveSection(draft, si, 1))}><ArrowDown size={14} /></button>
                <button type="button" className="icon-button danger" aria-label="Remove section" onClick={() => {
                  if (!section.fields.length || window.confirm(`Remove "${section.title}" and its ${section.fields.length} field(s)?`)) {
                    onChange(draftEdits.removeSection(draft, si));
                  }
                }}><Trash2 size={14} /></button>
              </div>
              {section.fields.map((field, fi) => (
                <FieldRow
                  key={field.id}
                  field={field}
                  canMoveUp={si > 0 || fi > 0}
                  canMoveDown={si < lastSection || fi < section.fields.length - 1}
                  onChange={(patch) => onChange(draftEdits.setField(draft, si, fi, patch))}
                  onRemove={() => onChange(draftEdits.removeField(draft, si, fi))}
                  onMove={(delta) => onChange(draftEdits.moveField(draft, si, fi, delta))}
                />
              ))}
              <button type="button" className="secondary-button" onClick={() => onChange(draftEdits.addField(draft, si))}><Plus size={14} /> Add field</button>
            </div>
          ))}
          <button type="button" className="secondary-button" onClick={() => onChange(draftEdits.addSection(draft))}><Plus size={14} /> Add section</button>
        </>
      )}
    </div>
  );
}
