import { useDropdowns } from "../context/DropdownContext.jsx";

export default function ManagedSelect({ dropdownId, value, onChange, disabled = false, className = "" }) {
  const { getOptions } = useDropdowns();
  const options = getOptions(dropdownId, value);

  return (
    <select className={className} value={value || ""} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      {!value && <option value="">Select...</option>}
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}
