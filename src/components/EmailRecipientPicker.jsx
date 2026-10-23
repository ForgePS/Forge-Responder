import { useMemo, useState } from "react";
import { X } from "lucide-react";

function groupOptionsBySection(options = []) {
  const sections = new Map();
  for (const option of options) {
    const section = option.section || "Recipients";
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section).push(option);
  }
  return [...sections.entries()];
}

export default function EmailRecipientPicker({
  value = [],
  onChange,
  options = [],
  disabled = false,
}) {
  const [pickerValue, setPickerValue] = useState("");
  const selected = Array.isArray(value) ? value : [];
  const optionsByToken = useMemo(
    () => Object.fromEntries(options.map((option) => [option.token, option])),
    [options]
  );
  const sectionGroups = useMemo(() => groupOptionsBySection(options), [options]);
  const availableOptions = options.filter((option) => !selected.includes(option.token));

  function addRecipient(token) {
    if (!token || selected.includes(token)) return;
    onChange?.([...selected, token]);
    setPickerValue("");
  }

  function removeRecipient(token) {
    onChange?.(selected.filter((item) => item !== token));
  }

  return (
    <div className="email-recipient-picker">
      <label className="wide-field">
        <span>To</span>
        <select
          value={pickerValue}
          disabled={disabled || !availableOptions.length}
          onChange={(event) => addRecipient(event.target.value)}
        >
          <option value="">Add group or individual...</option>
          {sectionGroups.map(([section, sectionOptions]) => {
            const choices = sectionOptions.filter((option) => !selected.includes(option.token));
            if (!choices.length) return null;
            return (
              <optgroup key={section} label={section}>
                {choices.map((option) => (
                  <option key={option.token} value={option.token}>{option.label}</option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      <div className="email-recipient-selected">
        {selected.map((token) => (
          <button
            key={token}
            type="button"
            className="email-recipient-chip"
            disabled={disabled}
            onClick={() => removeRecipient(token)}
          >
            <span>{optionsByToken[token]?.label || token}</span>
            {!disabled && <X size={12} />}
          </button>
        ))}
        {!selected.length && (
          <span className="auth-help">Choose one or more groups or individuals.</span>
        )}
      </div>
    </div>
  );
}
