import DropdownOptionsEditor from "./DropdownOptionsEditor.jsx";
import ManagedSelect from "./ManagedSelect.jsx";
import AdminTextInput from "./AdminTextInput.jsx";
import PersonnelLinkField from "./PersonnelLinkField.jsx";
import {
  formatColumnLabel,
  formatReadonlyDate,
  getFieldType,
  getManagedDropdownId,
  getSelectOptions
} from "../lib/adminFieldSchema.js";
import { cellToString } from "../lib/adminCellUtils.js";
import { formatPersonnelDateForInput } from "../lib/personnelDates.js";
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
  personnel = [],
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
  disabled = false,
  showLabel = false
}) {
  const fieldType = getFieldType(column, value, context);
  const label = formatColumnLabel(column, context.collectionName);

  function wrapControl(control) {
    if (!showLabel) return control;
    return (
      <div className="admin-field">
        <span>{label}</span>
        {control}
      </div>
    );
  }

  function stopSpaceBubble(event) {
    event.stopPropagation();
  }

  if (fieldType === "permissions-link") {
    return wrapControl(
      <p className="auth-help admin-field-note">
        Manage in the <strong>Permissions</strong> tab (Roles or Users).
      </p>
    );
  }

  if (fieldType === "personnel-link") {
    return wrapControl(
      <PersonnelLinkField
        value={cellToString(value)}
        onChange={onChange}
        personnel={personnel}
        disabled={disabled}
        onOpenPersonnelProfile={onOpenPersonnelProfile}
        onOpenEmployeeProfile={onOpenEmployeeProfile}
      />
    );
  }

  if (fieldType === "readonly-datetime") {
    return wrapControl(
      <span className="admin-readonly-value">{formatReadonlyDate(value)}</span>
    );
  }

  if (fieldType === "date") {
    return wrapControl(
      <AdminTextInput
        type="date"
        value={formatPersonnelDateForInput(cellToString(value))}
        disabled={disabled}
        onChange={onChange}
        onKeyDown={stopSpaceBubble}
      />
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

  if (fieldType === "managed-dropdown") {
    const dropdownId = getManagedDropdownId(column, context.collectionName);
    return wrapControl(
      <ManagedSelect
        dropdownId={dropdownId}
        value={cellToString(value)}
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

  if (fieldType === "role-select" && roles.length) {
    const current = cellToString(value);
    return wrapControl(
      <select
        value={current}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select role...</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>{role.name || role.id}</option>
        ))}
        {current && !roles.some((role) => role.id === current) && (
          <option value={current}>{current}</option>
        )}
      </select>
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
        onKeyDown={stopSpaceBubble}
      />
    );
  }

  if (fieldType === "identifier") {
    const key = String(column).toLowerCase();
    const lockPersistedId = key === "id" && Boolean(context.originalId);
    const lockPersistedUid = key === "uid" && Boolean(context.originalUid);
    const lockIdentifier = context.collectionName !== "dropdowns" && (lockPersistedId || lockPersistedUid);

    return wrapControl(
      <AdminTextInput
        value={cellToString(value)}
        disabled={disabled || lockIdentifier}
        onChange={onChange}
        onKeyDown={stopSpaceBubble}
      />
    );
  }

  return wrapControl(
    <AdminTextInput
      type={fieldType === "email" ? "email" : "text"}
      value={cellToString(value)}
      disabled={disabled}
      onChange={onChange}
      onKeyDown={stopSpaceBubble}
    />
  );
}
