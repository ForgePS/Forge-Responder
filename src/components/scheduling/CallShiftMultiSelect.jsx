import { useEffect, useRef, useState } from "react";
import "../../theme/call-shift-rules.css";

export default function CallShiftMultiSelect({
  options = [],
  value = [],
  onChange,
  disabled = false,
  placeholder = "Select items",
  className = "",
}) {
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const selected = Array.isArray(value) ? value : [];
  const allSelected = options.length > 0 && options.every((option) => selected.includes(option));

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function toggleOption(option) {
    if (disabled) return;
    onChange?.(
      selected.includes(option)
        ? selected.filter((entry) => entry !== option)
        : [...selected, option]
    );
  }

  function toggleAll() {
    if (disabled) return;
    onChange?.(allSelected ? [] : [...options]);
  }

  return (
    <div
      ref={rootRef}
      className={`call-shift-qualifier-select${open ? " is-open" : ""}${disabled ? " is-disabled" : ""}${className ? ` ${className}` : ""}`}
    >
      <button
        type="button"
        className="call-shift-qualifier-trigger"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {selected.length ? `${selected.length} item${selected.length === 1 ? "" : "s"}` : placeholder}
      </button>
      {open ? (
        <div className="call-shift-qualifier-menu" role="listbox" aria-multiselectable="true">
          <label className={`call-shift-qualifier-option is-select-all${allSelected ? " is-selected" : ""}`}>
            <input type="checkbox" checked={allSelected} disabled={disabled} onChange={toggleAll} />
            <span>Select All</span>
          </label>
          {options.map((option) => {
            const isSelected = selected.includes(option);
            return (
              <label
                key={option}
                className={`call-shift-qualifier-option${isSelected ? " is-selected" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggleOption(option)}
                />
                <span>{option}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
