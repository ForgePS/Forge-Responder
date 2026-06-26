import { defaultDropdowns } from "../data/defaultDropdowns.js";

const US_STATE_OPTIONS = (defaultDropdowns.find((dropdown) => dropdown.id === "usStates")?.options || [])
  .filter((option) => option.active !== false)
  .sort((left, right) => (left.sortOrder || 0) - (right.sortOrder || 0))
  .map((option) => ({
    code: String(option.id || "").toUpperCase(),
    label: option.label,
  }));

export default function DepartmentStateSelect({
  value = "",
  onChange,
  className = "managed-select",
  disabled = false,
}) {
  const safeValue = String(value || "").toUpperCase();

  return (
    <select
      className={className}
      value={safeValue}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value.toUpperCase())}
    >
      <option value="">Select state...</option>
      {safeValue && !US_STATE_OPTIONS.some((option) => option.code === safeValue) && (
        <option value={safeValue}>{safeValue}</option>
      )}
      {US_STATE_OPTIONS.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code} — {option.label}
        </option>
      ))}
    </select>
  );
}
