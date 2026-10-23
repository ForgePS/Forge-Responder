import { useMemo } from "react";
import NerisSearchableSelect from "./NerisSearchableSelect.jsx";
import {
  NERIS_INPUT_MODES,
  resolveFieldDropdownOptions,
} from "../../lib/neris/fieldConfig.js";

/**
 * @param {{
 *   field: Record<string, unknown>,
 *   value: unknown,
 *   onChange: (value: unknown) => void,
 *   disabled?: boolean,
 *   autoPopulated?: boolean,
 *   onOverride?: (reason: string) => void,
 *   inputMode?: 'dropdown' | 'freetext',
 *   allowToggle?: boolean,
 *   officerOverrideMode?: 'dropdown' | 'freetext' | null,
 *   onOfficerOverrideChange?: (mode: 'dropdown' | 'freetext' | null) => void,
 *   fieldConfig?: Record<string, { inputMode?: string, allowToggle?: boolean, customOptions?: Array<{ value: string, label: string }>, appendToSchema?: boolean }>,
 * }} props
 */
export default function NerisFieldInput({
  field,
  value,
  onChange,
  disabled = false,
  autoPopulated = false,
  onOverride,
  inputMode = NERIS_INPUT_MODES.FREETEXT,
  allowToggle = false,
  officerOverrideMode = null,
  onOfficerOverrideChange,
  fieldConfig = {},
}) {
  const commonProps = {
    disabled,
    id: field.name,
    name: field.name,
  };

  const effectiveMode = officerOverrideMode || inputMode;
  const dropdownOptions = useMemo(
    () => resolveFieldDropdownOptions(field, fieldConfig),
    [field, fieldConfig],
  );
  const useDropdown = effectiveMode === NERIS_INPUT_MODES.DROPDOWN && dropdownOptions.length > 0;

  const label = (
    <span className="neris-field-label">
      {field.label}
      {field.nerisCore ? <span className="neris-required">*</span> : null}
      {autoPopulated ? <span className="neris-auto-badge" title="Auto-populated">Auto</span> : null}
      {allowToggle && !disabled && onOfficerOverrideChange ? (
        <button
          type="button"
          className="neris-input-mode-toggle"
          title={effectiveMode === NERIS_INPUT_MODES.DROPDOWN ? "Switch to free text" : "Switch to dropdown"}
          onClick={() => {
            const next = effectiveMode === NERIS_INPUT_MODES.DROPDOWN
              ? NERIS_INPUT_MODES.FREETEXT
              : NERIS_INPUT_MODES.DROPDOWN;
            onOfficerOverrideChange(next);
          }}
        >
          {effectiveMode === NERIS_INPUT_MODES.DROPDOWN ? "Type" : "List"}
        </button>
      ) : null}
    </span>
  );

  if (field.inputType === "boolean") {
    return (
      <label className="neris-checkbox-field">
        <input
          type="checkbox"
          checked={value === true || value === "True" || value === "true"}
          onChange={(event) => {
            const next = event.target.checked ? "True" : "False";
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(next);
          }}
          {...commonProps}
        />
        {label}
      </label>
    );
  }

  if (field.inputType === "multiselect" && field.options.length > 0) {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    return (
      <label className="neris-field">
        {label}
        <select
          multiple
          value={selected}
          onChange={(event) => {
            const next = Array.from(event.target.selectedOptions).map((o) => o.value);
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(next);
          }}
          {...commonProps}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>{option.label || option.value}</option>
          ))}
        </select>
        <small>Hold Ctrl/Cmd to select multiple values.</small>
      </label>
    );
  }

  if (useDropdown) {
    return (
      <label className="neris-field">
        {label}
        <NerisSearchableSelect
          picklistId={field.valueSetName || field.name}
          value={Array.isArray(value) ? value[0] || "" : value || ""}
          options={dropdownOptions}
          disabled={disabled}
          onChange={(next) => {
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(next);
          }}
        />
      </label>
    );
  }

  if (field.inputType === "number") {
    return (
      <label className="neris-field">
        {label}
        <input
          type="number"
          step={String(field.type).toLowerCase().includes("float") ? "0.01" : "1"}
          value={value ?? ""}
          onChange={(event) => {
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(event.target.value);
          }}
          {...commonProps}
        />
      </label>
    );
  }

  const isLongText = String(field.name).includes("narrative");

  return (
    <label className={`neris-field ${isLongText ? "neris-field-wide" : ""}`}>
      {label}
      {isLongText ? (
        <textarea
          rows={4}
          value={value ?? ""}
          onChange={(event) => {
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(event.target.value);
          }}
          {...commonProps}
        />
      ) : (
        <input
          type={field.inputType === "datetime-local" ? "datetime-local" : "text"}
          value={value ?? ""}
          onChange={(event) => {
            if (autoPopulated && onOverride) onOverride("User changed auto-populated value");
            onChange(event.target.value);
          }}
          {...commonProps}
        />
      )}
      {field.definition ? <small>{field.definition}</small> : null}
    </label>
  );
}
