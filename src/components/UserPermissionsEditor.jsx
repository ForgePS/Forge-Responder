import { useEffect, useMemo, useState } from "react";
import { buildDepartmentGatewayUrl } from "../lib/gatewayRouting.js";
import { Check, RotateCcw, UserMinus } from "lucide-react";
import PermissionGroupGrid from "./PermissionGroupGrid.jsx";
import PersonnelLinkField from "./PersonnelLinkField.jsx";
import DepartmentInvitesPanel from "./DepartmentInvitesPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { isPlatformBootstrapEmail } from "../lib/platformBootstrap.js";
import { writeAuditLog } from "../lib/auditService.js";
import { deleteRecord, listRecords, updateRecord } from "../lib/firestoreService.js";
import { ensureDefaultRoles, loadRolesMap } from "../lib/roleService.js";
import {
  buildUserPermissionOverrides,
  getEffectiveUserPermissions,
  getRoleBasedPermissions
} from "../lib/userPermissions.js";
import { normalizeRoleIds } from "../lib/permissions.js";
import { isAdminMembershipRoles, saveErrorMessage } from "../lib/adminGuards.js";

function buildUserDraft(userRecord = {}, rolesById = {}) {
  const roleIds = normalizeRoleIds(userRecord);
  const membership = { ...userRecord, roleIds };
  return {
    roleIds,
    personnelId: String(userRecord.personnelId || "").trim(),
    permissions: getEffectiveUserPermissions(membership, rolesById)
  };
}

export default function UserPermissionsEditor({
  onMessage,
  personnel = [],
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
}) {
  const { departmentId } = useTenant();
  const { user: authUser, membership: authMembership, patchMembership } = useAuth();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [rolesById, setRolesById] = useState({});
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draft, setDraft] = useState({ roleIds: [], personnelId: "", permissions: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  const isCreatorUser = Boolean(
    selectedUser?.isPlatformCreator ||
    selectedUser?.role === "creator" ||
    draft.roleIds.includes("creator")
  );

  const isSelf = selectedUserId && (selectedUserId === authUser?.uid || selectedUser?.uid === authUser?.uid);

  async function loadData() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextRoles, nextUsers, nextRolesMap] = await Promise.all([
        ensureDefaultRoles(departmentId),
        listRecords(departmentId, "users"),
        loadRolesMap(departmentId)
      ]);
      const sortedUsers = [...nextUsers].sort((a, b) =>
        String(a.displayName || a.email || a.id).localeCompare(String(b.displayName || b.email || b.id))
      );
      setRoles(nextRoles.filter((role) => role.id !== "creator"));
      setRolesById(nextRolesMap);
      setUsers(sortedUsers);
      if (!selectedUserId && sortedUsers.length) {
        setSelectedUserId(sortedUsers[0].id);
        setDraft(buildUserDraft(sortedUsers[0], nextRolesMap));
      } else if (selectedUserId) {
        const current = sortedUsers.find((item) => item.id === selectedUserId);
        if (current) setDraft(buildUserDraft(current, nextRolesMap));
      }
    } catch (error) {
      console.error("Failed to load users for permissions", error);
      onMessage?.("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [departmentId]);

  function selectUser(userId) {
    const record = users.find((item) => item.id === userId);
    if (!record) return;
    setSelectedUserId(userId);
    setDraft(buildUserDraft(record, rolesById));
  }

  function toggleRole(roleId) {
    if (isCreatorUser && roleId !== "creator") return;
    setDraft((current) => {
      const hasRole = current.roleIds.includes(roleId);
      const nextRoleIds = hasRole
        ? current.roleIds.filter((id) => id !== roleId)
        : [...current.roleIds, roleId];
      const membership = { ...selectedUser, roleIds: nextRoleIds };
      const rolePerms = getRoleBasedPermissions(membership, rolesById);
      const overrides = buildUserPermissionOverrides(
        getRoleBasedPermissions({ ...selectedUser, roleIds: current.roleIds }, rolesById),
        current.permissions
      );
      const nextMembership = { ...membership, permissions: overrides };
      return {
        ...current,
        roleIds: nextRoleIds,
        permissions: getEffectiveUserPermissions(nextMembership, rolesById)
      };
    });
  }

  function togglePermission(permissionKey) {
    if (isCreatorUser) return;
    setDraft((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [permissionKey]: !current.permissions[permissionKey]
      }
    }));
  }

  function setGroupPermissions(keys, enabled) {
    if (isCreatorUser) return;
    setDraft((current) => {
      const nextPermissions = { ...current.permissions };
      for (const key of keys) {
        nextPermissions[key] = enabled;
      }
      return { ...current, permissions: nextPermissions };
    });
  }

  function resetToRoleDefaults() {
    if (!selectedUser) return;
    const membership = { ...selectedUser, roleIds: draft.roleIds, permissions: {} };
    setDraft((current) => ({
      ...current,
      roleIds: draft.roleIds,
      permissions: getRoleBasedPermissions(membership, rolesById)
    }));
  }

  async function saveUserPermissions() {
    if (!departmentId || !selectedUser) return;
    setSaving(true);
    try {
      const membership = { ...selectedUser, roleIds: draft.roleIds };
      let roleIds = [...draft.roleIds];
      let permissions = buildUserPermissionOverrides(
        getRoleBasedPermissions(membership, rolesById),
        draft.permissions
      );

      if (isSelf && !(authMembership?.isPlatformCreator || authMembership?.role === "creator")) {
        permissions = {};
        if (!roleIds.length) roleIds = ["fireChief"];
        if (isAdminMembershipRoles(authMembership) && !isAdminMembershipRoles({ roleIds })) {
          onMessage?.("You can't remove your own administrator role. Ask another administrator to change it.", "error");
          return;
        }
      }

      if (isSelf && (authMembership?.isPlatformCreator || authMembership?.role === "creator" || isPlatformBootstrapEmail(authUser?.email))) {
        roleIds = ["creator"];
        permissions = {};
      }

      const primaryRole = roleIds.includes("creator")
        ? "creator"
        : roleIds.includes("fireChief")
          ? "department_admin"
          : roleIds[0] || selectedUser.role || "firefighter";

      await updateRecord(departmentId, "users", selectedUser.id, {
        uid: selectedUser.uid || selectedUser.id,
        email: selectedUser.email || "",
        displayName: selectedUser.displayName || "",
        status: isSelf ? "active" : (selectedUser.status || "active"),
        roleIds,
        role: primaryRole,
        permissions,
        personnelId: draft.personnelId || "",
        isPlatformCreator: roleIds.includes("creator") ? true : selectedUser.isPlatformCreator || false
      });

      await writeAuditLog(departmentId, {
        action: "update",
        module: "Users",
        summary: `Updated permissions for ${selectedUser.displayName || selectedUser.email || selectedUser.id}`,
        actorUid: authUser?.uid,
        actorName: authMembership?.displayName || authUser?.email
      });

      const updatedUser = {
        ...selectedUser,
        roleIds,
        role: primaryRole,
        permissions,
        personnelId: draft.personnelId || "",
        status: isSelf ? "active" : (selectedUser.status || "active")
      };
      setUsers((current) => current.map((item) => (item.id === selectedUser.id ? updatedUser : item)));
      setDraft(buildUserDraft(updatedUser, rolesById));
      if (isSelf) {
        patchMembership({ personnelId: draft.personnelId || "" });
      }
      onMessage?.(`Saved permissions for ${selectedUser.displayName || selectedUser.email}`);
    } catch (error) {
      console.error("Failed to save user permissions", error);
      onMessage?.(saveErrorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelectedUser() {
    if (!departmentId || !selectedUser || isSelf || isCreatorUser) return;
    const name = selectedUser.displayName || selectedUser.email || selectedUser.id;
    const confirmed = window.confirm(
      `Remove ${name} from this department?\n\nThey will no longer be able to sign in to this department. Their personnel record and past reports are kept. You can invite them again later.`
    );
    if (!confirmed) return;
    setRemoving(true);
    try {
      await deleteRecord(departmentId, "users", selectedUser.id);
      try {
        await writeAuditLog(departmentId, {
          action: "delete",
          module: "Users",
          recordId: selectedUser.id,
          summary: `Removed ${name}${selectedUser.email && selectedUser.email !== name ? ` (${selectedUser.email})` : ""} from the department`,
          actorUid: authUser?.uid,
          actorName: authMembership?.displayName || authUser?.email
        });
      } catch (auditError) {
        console.warn("Failed to write audit log for user removal", auditError);
      }
      const remaining = users.filter((item) => item.id !== selectedUser.id);
      setUsers(remaining);
      if (remaining.length) {
        setSelectedUserId(remaining[0].id);
        setDraft(buildUserDraft(remaining[0], rolesById));
      } else {
        setSelectedUserId("");
        setDraft({ roleIds: [], personnelId: "", permissions: {} });
      }
      onMessage?.(`Removed ${name} from the department.`);
    } catch (error) {
      console.error("Failed to remove user from department", error);
      onMessage?.(
        error?.code === "permission-denied"
          ? `You don't have permission to remove ${name}. Only department admins can remove people.`
          : `Couldn't remove ${name}. Please try again.`
      );
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return <p className="auth-help">Loading users...</p>;
  }

  const invitesPanel = (
    <DepartmentInvitesPanel departmentId={departmentId} roles={roles} onMessage={onMessage} />
  );

  if (!users.length) {
    return (
      <section className="user-permissions-editor">
        {invitesPanel}
        <p className="auth-help">No users yet. Invite someone above.</p>
      </section>
    );
  }

  return (
    <section className="user-permissions-editor">
      {invitesPanel}
      <div className="user-permissions-toolbar">
        <label>
          <span>Select user</span>
          <select value={selectedUserId} onChange={(event) => selectUser(event.target.value)}>
            {users.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName || item.email || item.id}
                {item.email ? ` (${item.email})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="user-permissions-actions">
          <button className="secondary-button" type="button" onClick={resetToRoleDefaults} disabled={isCreatorUser || saving}>
            <RotateCcw size={14} /> Reset to role defaults
          </button>
          {selectedUser && !isSelf && !isCreatorUser && (
            <button
              className="secondary-button danger-button"
              type="button"
              onClick={removeSelectedUser}
              disabled={saving || removing}
            >
              <UserMinus size={14} /> {removing ? "Removing..." : "Remove from department"}
            </button>
          )}
          <button className="primary-button" type="button" onClick={saveUserPermissions} disabled={saving || removing || !selectedUser}>
            <Check size={14} /> {saving ? "Saving..." : "Save user"}
          </button>
        </div>
      </div>

      {selectedUser && (
        <article className="role-permissions-card user-permissions-card">
          <header className="role-permissions-header">
            <div>
              <strong>{selectedUser.displayName || selectedUser.email || selectedUser.id}</strong>
              <span>{selectedUser.email || selectedUser.id}</span>
              {departmentId && (
                <span className="auth-help">
                  Department portal: <code>{buildDepartmentGatewayUrl(departmentId)}</code>
                </span>
              )}
            </div>
          </header>

          <section className="user-personnel-link">
            <strong>Personnel profile link</strong>
            <p className="auth-help">
              Link this login to a personnel record so the Employee Portal shows the correct member profile.
            </p>
            <PersonnelLinkField
              value={draft.personnelId}
              onChange={(nextPersonnelId) => setDraft((current) => ({
                ...current,
                personnelId: nextPersonnelId,
              }))}
              personnel={personnel}
              onOpenPersonnelProfile={onOpenPersonnelProfile}
              onOpenEmployeeProfile={onOpenEmployeeProfile}
            />
          </section>

          <section className="user-role-picker">
            <strong>Assigned roles</strong>
            <p className="auth-help">Base access from roles; override individual items below.</p>
            <div className="user-role-grid compact-role-grid">
              {roles.map((role) => (
                <label className="permission-toggle permission-check" key={role.id}>
                  <input
                    type="checkbox"
                    checked={draft.roleIds.includes(role.id)}
                    disabled={isCreatorUser}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span>{role.name || role.id}</span>
                </label>
              ))}
            </div>
          </section>

          {isCreatorUser && (
            <p className="auth-help role-permissions-note">
              Creator accounts always have full platform access.
            </p>
          )}

          <PermissionGroupGrid
            draft={isCreatorUser ? CREATOR_PERMISSIONS : draft.permissions}
            disabled={isCreatorUser}
            onToggle={togglePermission}
            onSetGroup={setGroupPermissions}
          />
        </article>
      )}
    </section>
  );
}
