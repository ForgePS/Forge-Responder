import { useDropdowns } from "../context/DropdownContext.jsx";

export default function ManagedSelect({ dropdownId, value, onChange, disabled = false, className = "managed-select" }) {
  const { getOptions } = useDropdowns();
  const options = getOptions(dropdownId, value);
  const safeValue = value ?? "";

  return (
    <select
      className={className}
      value={options.includes(safeValue) || safeValue ? safeValue : ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    >
      {!safeValue && <option value="">Select...</option>}
      {safeValue && !options.includes(safeValue) && <option value={safeValue}>{safeValue}</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}
