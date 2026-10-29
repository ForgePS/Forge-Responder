import { useEffect, useState } from "react";
import { ChevronDown, Database, History, KeyRound, LayoutGrid, Settings, ShieldCheck, Wand2, X } from "lucide-react";
import DataEditorPanel from "../components/DataEditorPanel.jsx";
import DepartmentConfigPanel from "../components/DepartmentConfigPanel.jsx";
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
import AuditLogPanel from "../components/AuditLogPanel.jsx";
import { isPlatformScope } from "../lib/tenantPaths.js";
import { listRecords } from "../lib/firestoreService.js";
import { canManagePlatformSecrets, hasPermission } from "../lib/permissions.js";
import { ensureDefaultRoles } from "../lib/roleService.js";

function AdminSectionPill({ id, label, icon: Icon, isOpen, onToggle, children }) {
  return (
    <section id={id} className={`admin-section${isOpen ? " is-open" : ""}`}>
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
  const canViewAcademyIntegrations = isCreator
    || hasPermission(permissions, "academyIntegrationsView");
  const canManageAcademyIntegrations = isCreator
    || hasPermission(permissions, "academyIntegrationsManage");
  const [openSections, setOpenSections] = useState(() => new Set());
  const [permissionsView, setPermissionsView] = useState("roles");
  const [banner, setBanner] = useState({ text: "", tone: "success" });
  const message = banner.text;
  // Panels call onMessage(text) or onMessage(text, "error"); older failure messages are recognised by wording.
  function setMessage(text, tone) {
    const value = String(text || "");
    const isError = tone === "error" || (!tone && /^(failed|couldn't|could not|can't|cannot|save failed|unable)/i.test(value));
    setBanner({ text: value, tone: isError ? "error" : "success" });
  }
  const [stats, setStats] = useState(null);
  const inPlatformScope = isPlatformScope(departmentId);

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

  async function loadStats() {
    if (!departmentId || inPlatformScope) return;
    try {
      const [nextRoles, users] = await Promise.all([
        ensureDefaultRoles(departmentId),
        listRecords(departmentId, "users"),
      ]);
      const isStaff = (item) => item.isPlatformCreator || item.role === "creator" || (item.roleIds || []).includes("creator");
      setStats({
        users: users.filter((item) => isCreator || !isStaff(item)).length,
        roles: nextRoles.filter((role) => isCreator || role.id !== "creator").length,
      });
    } catch (error) {
      console.error("Failed to load admin stats", error);
      setStats(null);
    }
  }

  useEffect(() => {
    loadStats();
  }, [departmentId]);

  return (
    <div className="module-page admin-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Settings size={22} /></span>
          <div>
            <h1>System Admin</h1>
            <p>Your department's settings, people and their access, connected services, and activity. Open a section to manage it.</p>
          </div>
        </div>
        {inPlatformScope ? null : (
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.dispatchEvent(new CustomEvent("forge:open-setup-wizard"))}
          >
            <Wand2 size={14} /> Run setup wizard
          </button>
        )}
      </section>

      {message && (
        <div className={banner.tone === "error" ? "error-banner" : "success-banner"} role={banner.tone === "error" ? "alert" : "status"}>
          {message}
          <button type="button" onClick={() => setMessage("")}><X size={13} /></button>
        </div>
      )}

      <SubscriptionExpiryBanner
        subscription={settings?.subscription}
        departmentName={profile?.shortName || profile?.name}
      />

      {stats ? (
        <div className="admin-stats-strip">
          <span>{stats.users} {stats.users === 1 ? "person has" : "people have"} access</span>
          <span>{stats.roles} roles</span>
        </div>
      ) : null}

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
              canMigrateLegacy={isCreator}
            />
          </div>
        </AdminSectionPill>

        {isCreator ? (
          <AdminSectionPill
            id="modules"
            label="Module Data (FORGE staff)"
            icon={Database}
            isOpen={isOpen("modules")}
            onToggle={toggleSection}
          >
            <DataEditorPanel onMessage={setMessage} />
          </AdminSectionPill>
        ) : null}

        <AdminSectionPill
          id="records"
          label={isCreator ? "System Records" : "Dropdown Lists & Notifications"}
          icon={LayoutGrid}
          isOpen={isOpen("records")}
          onToggle={toggleSection}
        >
          <RecordCollectionEditor
            onMessage={setMessage}
            personnel={personnel}
            onOpenPersonnelProfile={onOpenPersonnelProfile}
            onOpenEmployeeProfile={onOpenEmployeeProfile}
            onInviteSomeone={() => {
              setPermissionsView("users");
              setOpenSections((current) => new Set([...current, "permissions"]));
              requestAnimationFrame(() => document.getElementById("permissions")?.scrollIntoView({ behavior: "smooth", block: "start" }));
            }}
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
          label="Activity Log"
          icon={History}
          isOpen={isOpen("audit")}
          onToggle={toggleSection}
        >
          <AuditLogPanel departmentId={departmentId} />
        </AdminSectionPill>
      </section>
    </div>
  );
}
