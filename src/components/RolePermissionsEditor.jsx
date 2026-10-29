import { useEffect, useMemo, useState } from "react";
import { Check, CirclePlus, Trash2 } from "lucide-react";
import CreateRoleModal from "./CreateRoleModal.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import PermissionGroupGrid from "./PermissionGroupGrid.jsx";
import { CREATOR_PERMISSIONS } from "../data/creatorPermissions.js";
import { writeAuditLog } from "../lib/auditService.js";
import { isLockedAdminPermission, saveErrorMessage, withLockedAdminPermissions } from "../lib/adminGuards.js";
import { listRecords, updateRecord } from "../lib/firestoreService.js";
import {
  createDepartmentRole,
  deleteDepartmentRole,
  ensureDefaultRoles,
  isBuiltinRole,
  sortDepartmentRoles,
} from "../lib/roleService.js";

function clonePermissions(permissions = {}) {
  return Object.fromEntries(
    Object.entries(permissions).map(([key, value]) => [key, Boolean(value)])
  );
}

function buildPermissionDraft(role) {
  if (role.id === "creator") {
    return { ...CREATOR_PERMISSIONS };
  }
  return clonePermissions(role.permissions || {});
}

function buildRoleMeta(roles = []) {
  return Object.fromEntries(
    roles.map((role) => [role.id, {
      name: role.name || role.id,
      description: role.description || "",
    }])
  );
}

export default function RolePermissionsEditor({ onMessage }) {
  const { departmentId } = useTenant();
  const { user, membership, isCreator } = useAuth();
  const [roles, setRoles] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [roleMeta, setRoleMeta] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingRoleId, setSavingRoleId] = useState("");
  const [savingAll, setSavingAll] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState("");

  const roleMap = useMemo(
    () => Object.fromEntries(roles.map((role) => [role.id, role])),
    [roles]
  );

  async function loadRoles() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const nextRoles = await ensureDefaultRoles(departmentId);
      setRoles(nextRoles);
      setDrafts(Object.fromEntries(nextRoles.map((role) => [role.id, buildPermissionDraft(role)])));
      setRoleMeta(buildRoleMeta(nextRoles));
    } catch (error) {
      console.error("Failed to load roles", error);
      onMessage?.("Failed to load roles");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoles();
  }, [departmentId]);

  function togglePermission(roleId, permissionKey) {
    if (roleId === "creator") return;
    if (isLockedAdminPermission(roleId, permissionKey)) {
      onMessage?.("Fire Chief and IT Admin always keep user and system-settings access, so nobody gets locked out of System Admin.", "error");
      return;
    }
    setDrafts((current) => ({
      ...current,
      [roleId]: {
        ...current[roleId],
        [permissionKey]: !current[roleId]?.[permissionKey],
      },
    }));
  }

  function setGroupPermissions(roleId, keys, enabled) {
    if (roleId === "creator") return;
    setDrafts((current) => {
      const next = { ...current[roleId] };
      for (const key of keys) {
        if (isLockedAdminPermission(roleId, key)) continue;
        next[key] = enabled;
      }
      return { ...current, [roleId]: next };
    });
  }

  function updateRoleMetaField(roleId, field, value) {
    setRoleMeta((current) => ({
      ...current,
      [roleId]: {
        ...current[roleId],
        [field]: value,
      },
    }));
  }

  async function saveRole(roleId) {
    if (!departmentId || !roleId) return;
    setSavingRoleId(roleId);
    try {
      const role = roleMap[roleId];
      const permissions = roleId === "creator"
        ? { ...CREATOR_PERMISSIONS }
        : withLockedAdminPermissions(roleId, clonePermissions(drafts[roleId]));
      const meta = roleMeta[roleId] || {};

      await updateRecord(departmentId, "roles", roleId, {
        name: String(meta.name || role?.name || roleId).trim() || roleId,
        description: String(meta.description || role?.description || "").trim(),
        permissions,
      });

      await writeAuditLog(departmentId, {
        action: "update",
        module: "Roles",
        summary: `Updated permissions for ${meta.name || role?.name || roleId}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });

      const updatedRole = {
        ...role,
        name: String(meta.name || role?.name || roleId).trim() || roleId,
        description: String(meta.description || role?.description || "").trim(),
        permissions,
      };
      setRoles((current) => sortDepartmentRoles(current.map((item) => (
        item.id === roleId ? updatedRole : item
      ))));
      setDrafts((current) => ({ ...current, [roleId]: buildPermissionDraft({ id: roleId, permissions }) }));
      setRoleMeta((current) => ({
        ...current,
        [roleId]: {
          name: updatedRole.name,
          description: updatedRole.description || "",
        },
      }));
      onMessage?.(`Saved permissions for ${updatedRole.name}`);
    } catch (error) {
      console.error("Failed to save role permissions", error);
      onMessage?.(saveErrorMessage(error), "error");
    } finally {
      setSavingRoleId("");
    }
  }

  async function saveAllRoles() {
    if (!departmentId || !roles.length) return;
    setSavingAll(true);
    try {
      const savedRoles = [];
      for (const role of roles.filter((item) => isCreator || item.id !== "creator")) {
        const permissions = role.id === "creator"
          ? { ...CREATOR_PERMISSIONS }
          : withLockedAdminPermissions(role.id, clonePermissions(drafts[role.id]));
        const meta = roleMeta[role.id] || {};
        const payload = {
          name: String(meta.name || role.name || role.id).trim() || role.id,
          description: String(meta.description || role.description || "").trim(),
          permissions,
        };
        await updateRecord(departmentId, "roles", role.id, payload);
        savedRoles.push({ ...role, ...payload });
      }

      await writeAuditLog(departmentId, {
        action: "update",
        module: "Roles",
        summary: `Updated permissions for ${savedRoles.length} roles`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });

      const sorted = sortDepartmentRoles(savedRoles);
      setRoles(sorted);
      setDrafts(Object.fromEntries(sorted.map((role) => [role.id, buildPermissionDraft(role)])));
      setRoleMeta(buildRoleMeta(sorted));
      onMessage?.(`Saved permissions for ${savedRoles.length} roles`);
    } catch (error) {
      console.error("Failed to save all role permissions", error);
      onMessage?.(saveErrorMessage(error), "error");
    } finally {
      setSavingAll(false);
    }
  }

  async function handleCreateRole(payload) {
    if (!departmentId) return;
    setCreatingRole(true);
    try {
      const role = await createDepartmentRole(departmentId, payload);
      await writeAuditLog(departmentId, {
        action: "create",
        module: "Roles",
        summary: `Created custom role ${role.name}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      setRoles((current) => sortDepartmentRoles([...current, role]));
      setDrafts((current) => ({ ...current, [role.id]: buildPermissionDraft(role) }));
      setRoleMeta((current) => ({
        ...current,
        [role.id]: { name: role.name, description: role.description || "" },
      }));
      setShowCreateModal(false);
      onMessage?.(`Created role ${role.name}`);
    } catch (error) {
      console.error("Failed to create role", error);
      onMessage?.(error.message || "Failed to create role");
    } finally {
      setCreatingRole(false);
    }
  }

  async function handleDeleteRole(roleId) {
    if (!departmentId || !roleId || isBuiltinRole(roleId)) return;
    const role = roleMap[roleId];
    const label = roleMeta[roleId]?.name || role?.name || roleId;
    if (!window.confirm(`Delete the "${label}" role? This cannot be undone.`)) return;

    setDeletingRoleId(roleId);
    try {
      await deleteDepartmentRole(departmentId, roleId);
      await writeAuditLog(departmentId, {
        action: "delete",
        module: "Roles",
        summary: `Deleted custom role ${label}`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      setRoles((current) => current.filter((item) => item.id !== roleId));
      setDrafts((current) => {
        const next = { ...current };
        delete next[roleId];
        return next;
      });
      setRoleMeta((current) => {
        const next = { ...current };
        delete next[roleId];
        return next;
      });
      onMessage?.(`Deleted role ${label}`);
    } catch (error) {
      console.error("Failed to delete role", error);
      onMessage?.(error.message || "Failed to delete role");
    } finally {
      setDeletingRoleId("");
    }
  }

  if (loading) {
    return <p className="auth-help">Loading role permissions...</p>;
  }

  return (
    <section className="role-permissions-editor">
      <div className="role-permissions-toolbar">
        <p className="auth-help">
          Built-in roles are always available. Create custom roles for ranks like Captain or Training Officer, then assign them to users.
        </p>
        <div className="role-permissions-toolbar-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={() => setShowCreateModal(true)}
            disabled={savingAll || Boolean(savingRoleId) || creatingRole}
          >
            <CirclePlus size={14} /> Create role
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={saveAllRoles}
            disabled={savingAll || Boolean(savingRoleId) || creatingRole}
          >
            <Check size={14} /> {savingAll ? "Saving all roles..." : "Save all roles"}
          </button>
        </div>
      </div>

      <div className="role-permissions-list">
        {roles.filter((role) => isCreator || role.id !== "creator").map((role) => {
          const isCreatorRole = role.id === "creator";
          const isCustomRole = !isBuiltinRole(role.id);
          const draft = drafts[role.id] || {};
          const meta = roleMeta[role.id] || { name: role.name, description: role.description || "" };

          return (
            <article className={`role-permissions-card${isCustomRole ? " role-permissions-card-custom" : ""}`} key={role.id}>
              <header className="role-permissions-header">
                <div className="role-permissions-title-block">
                  {isCustomRole ? (
                    <>
                      <label className="role-meta-field">
                        <span>Role name</span>
                        <input
                          value={meta.name}
                          onChange={(event) => updateRoleMetaField(role.id, "name", event.target.value)}
                        />
                      </label>
                      <label className="role-meta-field">
                        <span>Description</span>
                        <input
                          value={meta.description}
                          onChange={(event) => updateRoleMetaField(role.id, "description", event.target.value)}
                          placeholder="Optional description"
                        />
                      </label>
                      <span className="role-id-chip">{role.id}</span>
                    </>
                  ) : (
                    <>
                      <strong>{role.name || role.id}</strong>
                      <span>{role.description || role.id}</span>
                    </>
                  )}
                </div>
                <div className="role-permissions-header-actions">
                  {isCustomRole && (
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => handleDeleteRole(role.id)}
                      disabled={savingAll || savingRoleId === role.id || deletingRoleId === role.id}
                    >
                      <Trash2 size={14} />
                      {deletingRoleId === role.id ? "Deleting..." : "Delete"}
                    </button>
                  )}
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => saveRole(role.id)}
                    disabled={savingAll || savingRoleId === role.id || deletingRoleId === role.id}
                  >
                    <Check size={14} />
                    {savingRoleId === role.id ? "Saving..." : "Save role"}
                  </button>
                </div>
              </header>

              {isCreatorRole && (
                <p className="auth-help role-permissions-note">
                  Creator permissions are locked to full platform access.
                </p>
              )}

              <PermissionGroupGrid
                draft={draft}
                disabled={isCreatorRole}
                showPlatform={isCreator}
                onToggle={(permissionKey) => togglePermission(role.id, permissionKey)}
                onSetGroup={(keys, enabled) => setGroupPermissions(role.id, keys, enabled)}
              />
            </article>
          );
        })}
      </div>

      {showCreateModal && (
        <CreateRoleModal
          roles={roles}
          creating={creatingRole}
          onClose={() => !creatingRole && setShowCreateModal(false)}
          onCreate={handleCreateRole}
        />
      )}
    </section>
  );
}
