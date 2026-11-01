import { ADMIN_PERMISSION_GROUPS, formatPermissionLabel } from "../data/adminRegistry.js";

export default function PermissionGroupGrid({
  draft = {},
  disabled = false,
  showPlatform = false,
  filter = "",
  onToggle,
  onSetGroup
}) {
  const term = String(filter || "").trim().toLowerCase();
  const groups = ADMIN_PERMISSION_GROUPS
    .filter((group) => showPlatform || group.label !== "Platform")
    .map((group) => ({
      ...group,
      keys: term && !group.label.toLowerCase().includes(term)
        ? group.keys.filter((key) => formatPermissionLabel(key).toLowerCase().includes(term))
        : group.keys,
    }))
    .filter((group) => group.keys.length);
  if (!groups.length) return <p className="auth-help">No permissions match "{filter}".</p>;
  return groups.map((group) => (
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
