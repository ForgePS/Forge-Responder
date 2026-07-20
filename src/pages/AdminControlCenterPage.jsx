import { useEffect, useState } from "react";
import { ChevronDown, Database, Flame, KeyRound, LayoutGrid, Settings, ShieldCheck, X } from "lucide-react";
import DataEditorPanel from "../components/DataEditorPanel.jsx";
import DepartmentConfigPanel from "../components/DepartmentConfigPanel.jsx";
import NerisFieldSettingsPanel from "../components/NerisFieldSettingsPanel.jsx";
import GoogleApisIntegrationPanel from "../components/digitalDashboard/GoogleApisIntegrationPanel.jsx";
import Active911IntegrationPanel from "../components/digitalDashboard/Active911IntegrationPanel.jsx";
import DamageFormJotformIntegrationPanel from "../components/digitalDashboard/DamageFormJotformIntegrationPanel.jsx";
import TrainingAcademiesPanel from "../components/academy/TrainingAcademiesPanel.jsx";
import RecordCollectionEditor from "../components/RecordCollectionEditor.jsx";
import RolePermissionsEditor from "../components/RolePermissionsEditor.jsx";
import SubscriptionExpiryBanner from "../components/SubscriptionExpiryBanner.jsx";
import UserPermissionsEditor from "../components/UserPermissionsEditor.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { listAuditLogs } from "../lib/auditService.js";
import { listRecords } from "../lib/firestoreService.js";
import { canManagePlatformSecrets, hasPermission } from "../lib/permissions.js";
import { ensureDefaultRoles } from "../lib/roleService.js";

function AdminSectionPill({ id, label, icon: Icon, isOpen, onToggle, children }) {
  return (
    <section className={`admin-section${isOpen ? " is-open" : ""}`}>
      <button
        type="button"
        className={`admin-section-pill${isOpen ? " is-open" : ""}`}
        aria-expanded={isOpen}
        aria-controls={`admin-section-${id}`}
        onClick={() => onToggle(id)}
      >
        <Icon size={14} aria-hidden="true" />
        <span>{label}</span>
        <ChevronDown size={14} className="admin-section-pill-chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="admin-section-body" id={`admin-section-${id}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

export default function AdminControlCenterPage({
  personnel = [],
  apparatus = [],
  onOpenPersonnelProfile,
  onOpenEmployeeProfile,
}) {
  const { departmentId, profile, settings } = useTenant();
  const { isCreator, membership, permissions } = useAuth();
  const canConfigureApiKeys = canManagePlatformSecrets(permissions, isCreator, membership);
  const canConfigureDamageForm = isCreator
    || hasPermission(permissions, "manageSystemSettings")
    || hasPermission(permissions, "accessAdminRms");
  const canConfigureNerisFields = canConfigureDamageForm;
  const canViewAcademyIntegrations = isCreator
    || hasPermission(permissions, "academyIntegrationsView");
  const canManageAcademyIntegrations = isCreator
    || hasPermission(permissions, "academyIntegrationsManage");
  const [openSections, setOpenSections] = useState(() => new Set());
  const [permissionsView, setPermissionsView] = useState("roles");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditFilter, setAuditFilter] = useState("All");
  const [stats, setStats] = useState({ users: 0, roles: 0, dropdowns: 0, notifications: 0 });

  function toggleSection(sectionId) {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  function isOpen(sectionId) {
    return openSections.has(sectionId);
  }

  async function reload() {
    setLoading(true);
    try {
      const [nextRoles, nextAudit, users, dropdowns, notifications] = await Promise.all([
        ensureDefaultRoles(departmentId),
        listAuditLogs(departmentId, { module: auditFilter }),
        listRecords(departmentId, "users"),
        listRecords(departmentId, "dropdowns"),
        listRecords(departmentId, "notifications")
      ]);
      setAuditLogs(nextAudit);
      setStats({
        users: users.length,
        roles: nextRoles.length,
        dropdowns: dropdowns.length,
        notifications: notifications.length
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, [departmentId, auditFilter]);

  return (
    <div className="module-page admin-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Settings size={22} /></span>
          <div>
            <h1>System Admin</h1>
            <p>Department settings, module data, users, roles, and permissions. Open a section below to manage it.</p>
          </div>
        </div>
      </section>

      {message && (
        <div className="success-banner">
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      )}

      <SubscriptionExpiryBanner
        subscription={settings?.subscription}
        departmentName={profile?.shortName || profile?.name}
      />

      <div className="admin-stats-strip">
        <span>{stats.users} users</span>
        <span>{stats.roles} roles</span>
        <span>{stats.dropdowns} dropdowns</span>
        <span>{stats.notifications} notifications</span>
      </div>

      <section className="admin-sections">
        <AdminSectionPill
          id="department"
          label="Department & Branding"
          icon={Settings}
          isOpen={isOpen("department")}
          onToggle={toggleSection}
        >
          <DepartmentConfigPanel onMessage={setMessage} apparatus={apparatus} />
        </AdminSectionPill>

        <AdminSectionPill
          id="neris-fields"
          label="NERIS Field Settings"
          icon={Flame}
          isOpen={isOpen("neris-fields")}
          onToggle={toggleSection}
        >
          <NerisFieldSettingsPanel onMessage={setMessage} canConfigure={canConfigureNerisFields} />
        </AdminSectionPill>

        <AdminSectionPill
          id="google-apis"
          label="Integrations & API Keys"
          icon={KeyRound}
          isOpen={isOpen("google-apis")}
          onToggle={toggleSection}
        >
          <div className="admin-integrations-stack">
            <GoogleApisIntegrationPanel
              departmentId={departmentId}
              canConfigure={canConfigureApiKeys}
              variant="admin"
            />
            <Active911IntegrationPanel
              departmentId={departmentId}
              canConfigure={canConfigureApiKeys}
              variant="admin"
            />
            <DamageFormJotformIntegrationPanel
              departmentId={departmentId}
              canConfigure={canConfigureDamageForm}
            />
            <TrainingAcademiesPanel
              departmentId={departmentId}
              canView={canViewAcademyIntegrations}
              canConfigure={canManageAcademyIntegrations}
            />
          </div>
        </AdminSectionPill>

        <AdminSectionPill
          id="modules"
          label="Module Data"
          icon={Database}
          isOpen={isOpen("modules")}
          onToggle={toggleSection}
        >
          <DataEditorPanel onMessage={setMessage} />
        </AdminSectionPill>

        <AdminSectionPill
          id="records"
          label="System Records"
          icon={LayoutGrid}
          isOpen={isOpen("records")}
          onToggle={toggleSection}
        >
          <RecordCollectionEditor
            onMessage={setMessage}
            personnel={personnel}
            onOpenPersonnelProfile={onOpenPersonnelProfile}
            onOpenEmployeeProfile={onOpenEmployeeProfile}
          />
        </AdminSectionPill>

        <AdminSectionPill
          id="permissions"
          label="Permissions"
          icon={ShieldCheck}
          isOpen={isOpen("permissions")}
          onToggle={toggleSection}
        >
          <section className="permissions-view-toolbar">
            <div className="segmented-control admin-filter-control">
              <button
                type="button"
                className={permissionsView === "roles" ? "active" : ""}
                onClick={() => setPermissionsView("roles")}
              >
                Roles
              </button>
              <button
                type="button"
                className={permissionsView === "users" ? "active" : ""}
                onClick={() => setPermissionsView("users")}
              >
                Users
              </button>
            </div>
          </section>
          {permissionsView === "roles" ? (
            <RolePermissionsEditor onMessage={setMessage} />
          ) : (
            <UserPermissionsEditor
              onMessage={setMessage}
              personnel={personnel}
              onOpenPersonnelProfile={onOpenPersonnelProfile}
              onOpenEmployeeProfile={onOpenEmployeeProfile}
            />
          )}
        </AdminSectionPill>

        <AdminSectionPill
          id="audit"
          label="Audit Logs"
          icon={ShieldCheck}
          isOpen={isOpen("audit")}
          onToggle={toggleSection}
        >
          {loading ? (
            <p className="auth-help">Loading audit logs…</p>
          ) : (
            <>
              <div className="admin-filter-bar">
                <div className="segmented-control admin-filter-control">
                  {["All", "Personnel", "Users", "Roles", "Dropdowns", "Data Editor", "System Admin", "Employee Portal"].map((item) => (
                    <button key={item} type="button" className={auditFilter === item ? "active" : ""} onClick={() => setAuditFilter(item)}>{item}</button>
                  ))}
                </div>
              </div>
              <div className="admin-audit-table">
                <div className="admin-audit-row admin-audit-head">
                  <span>When</span><span>Actor</span><span>Action</span><span>Module</span><span>Summary</span>
                </div>
                {auditLogs.map((log) => (
                  <div className="admin-audit-row" key={log.id}>
                    <span>{String(log.created_at || log.createdAt || "").slice(0, 19)}</span>
                    <span>{log.actorName}</span>
                    <span>{log.action}</span>
                    <span>{log.module}</span>
                    <span>{log.summary}</span>
                  </div>
                ))}
                {!auditLogs.length && <p className="empty-table">No audit logs yet.</p>}
              </div>
            </>
          )}
        </AdminSectionPill>
      </section>
    </div>
  );
}
