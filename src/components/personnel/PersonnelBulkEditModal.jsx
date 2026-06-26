import { useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { useDropdowns } from "../../context/DropdownContext.jsx";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";
import {
  BULK_EDIT_FIELDS,
  BULK_EDIT_UNCHANGED,
  createEmptyBulkEditPatch,
  getBulkEditDropdownId,
  hasBulkEditChanges,
  summarizeBulkEditPatch,
} from "../../lib/personnelBulkEdit.js";

function BulkEditModalShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card personnel-import-modal personnel-bulk-edit-modal" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <strong>{title}</strong>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

function BulkEditField({ label, dropdownId, value, onChange }) {
  const { getOptions } = useDropdowns();
  const options = getOptions(dropdownId, value);

  return (
    <label className="personnel-bulk-edit-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value={BULK_EDIT_UNCHANGED}>— No change —</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

export default function PersonnelBulkEditModal({
  open = false,
  onClose,
  selectedRecords = [],
  onApply,
}) {
  const [patch, setPatch] = useState(createEmptyBulkEditPatch);

  useEffect(() => {
    if (open) setPatch(createEmptyBulkEditPatch());
  }, [open]);

  const previewNames = useMemo(
    () => selectedRecords.slice(0, 6).map((person) => getPersonDisplayName(person)),
    [selectedRecords]
  );
  const changeSummary = useMemo(() => summarizeBulkEditPatch(patch), [patch]);

  if (!open) return null;

  function updateField(key, value) {
    setPatch((current) => ({ ...current, [key]: value }));
  }

  function handleApply() {
    if (!hasBulkEditChanges(patch)) return;
    onApply?.(patch);
  }

  return (
    <BulkEditModalShell title={`Bulk Edit · ${selectedRecords.length} selected`} onClose={onClose}>
      <p className="auth-help">
        Update assignment fields for all selected personnel. Leave a field on &quot;No change&quot; to keep existing values.
      </p>

      {previewNames.length ? (
        <div className="personnel-bulk-edit-selected">
          <strong>Selected</strong>
          <span>
            {previewNames.join(", ")}
            {selectedRecords.length > previewNames.length
              ? ` and ${selectedRecords.length - previewNames.length} more`
              : ""}
          </span>
        </div>
      ) : null}

      <div className="personnel-bulk-edit-grid workflow-form">
        {BULK_EDIT_FIELDS.map((field) => (
          <BulkEditField
            key={field.key}
            label={field.label}
            dropdownId={getBulkEditDropdownId(field.key)}
            value={patch[field.key] || BULK_EDIT_UNCHANGED}
            onChange={(value) => updateField(field.key, value)}
          />
        ))}
      </div>

      {changeSummary.length ? (
        <div className="personnel-bulk-edit-summary">
          <strong>Will update</strong>
          <ul>
            {changeSummary.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      ) : (
        <p className="auth-help">Choose at least one field to update.</p>
      )}

      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
        <button
          type="button"
          className="primary-button"
          onClick={handleApply}
          disabled={!hasBulkEditChanges(patch)}
        >
          <Check size={14} /> Apply to {selectedRecords.length} personnel
        </button>
      </div>
    </BulkEditModalShell>
  );
}
