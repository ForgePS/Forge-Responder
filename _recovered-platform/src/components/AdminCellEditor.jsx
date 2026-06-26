import DropdownOptionsEditor from "./DropdownOptionsEditor.jsx";
import {
  formatColumnLabel,
  formatReadonlyDate,
  getFieldType,
  getSelectOptions
} from "../lib/adminFieldSchema.js";
import { cellToString } from "../lib/adminCellUtils.js";
import { normalizeRoleIds } from "../lib/permissions.js";

function parseRoleIds(value) {
  return normalizeRoleIds({ roleIds: value, role: "" });
}

export default function AdminCellEditor({
  column,
  value,
  onChange,
  context = {},
  roles = [],
  disabled = false,
  showLabel = false
}) {
  const fieldType = getFieldType(column, value, context);
  const label = formatColumnLabel(column);

  function wrapControl(control) {
    if (!showLabel) return control;
    return (
      <label className="admin-field">
        <span>{label}</span>
        {control}
      </label>
    );
  }

  if (fieldType === "permissions-link") {
    return wrapControl(
      <p className="auth-help admin-field-note">
        Manage in the <strong>Permissions</strong> tab (Roles or Users).
      </p>
    );
  }

  if (fieldType === "readonly-datetime") {
    return wrapControl(
      <span className="admin-readonly-value">{formatReadonlyDate(value)}</span>
    );
  }

  if (fieldType === "boolean") {
    return wrapControl(
      <label className="permission-toggle permission-check admin-boolean-field">
        <input
          type="checkbox"
          checked={Boolean(value)}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>{value ? "Yes" : "No"}</span>
      </label>
    );
  }

  if (fieldType === "dropdown-options") {
    return wrapControl(
      <DropdownOptionsEditor
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "role-multi") {
    const selected = parseRoleIds(value);
    return wrapControl(
      <div className="admin-role-multi">
        {roles.filter((role) => role.id !== "creator").map((role) => (
          <label className="permission-toggle permission-check" key={role.id}>
            <input
              type="checkbox"
              checked={selected.includes(role.id)}
              disabled={disabled}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, role.id]
                  : selected.filter((id) => id !== role.id);
                onChange(next);
              }}
            />
            <span>{role.name || role.id}</span>
          </label>
        ))}
      </div>
    );
  }

  if (fieldType.endsWith("-select")) {
    const options = getSelectOptions(fieldType);
    const current = cellToString(value);
    return wrapControl(
      <select
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select...</option>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
        {current && !options.includes(current) && (
          <option value={current}>{current}</option>
        )}
      </select>
    );
  }

  if (fieldType === "textarea") {
    return wrapControl(
      <textarea
        rows={3}
        value={cellToString(value)}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  if (fieldType === "identifier") {
    return wrapControl(
      <input
        value={cellToString(value)}
        disabled={disabled || (context.collectionName !== "dropdowns" && Boolean(value))}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return wrapControl(
    <input
      type={fieldType === "email" ? "email" : "text"}
      value={cellToString(value)}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
