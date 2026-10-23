import { ADMIN_PERMISSION_GROUPS, formatPermissionLabel } from "../data/adminRegistry.js";

export default function PermissionGroupGrid({
  draft = {},
  disabled = false,
  onToggle,
  onSetGroup
}) {
  return ADMIN_PERMISSION_GROUPS.map((group) => (
    <section className="role-permissions-group" key={group.label}>
      <div className="role-permissions-group-head">
        <strong>{group.label}</strong>
        {!disabled && onSetGroup && (
          <div className="role-permissions-group-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => onSetGroup(group.keys, true)}
            >
              Select all
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onSetGroup(group.keys, false)}
            >
              Clear
            </button>
          </div>
        )}
      </div>
      <div className="permission-grid role-permission-grid compact-permission-grid">
        {group.keys.map((permissionKey) => (
          <label className="permission-toggle permission-check" key={permissionKey}>
            <input
              type="checkbox"
              checked={Boolean(draft[permissionKey])}
              disabled={disabled}
              onChange={() => onToggle?.(permissionKey)}
            />
            <span>{formatPermissionLabel(permissionKey)}</span>
          </label>
        ))}
      </div>
    </section>
  ));
}
