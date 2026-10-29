import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Database, History, KeyRound, LayoutGrid, Settings, Users, Wand2, X } from "lucide-react";
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

function AdminSectionPill({ id, label, description = "", icon: Icon, isOpen, onToggle, children }) {
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
      {description && !isOpen ? <p className="admin-section-description">{description}</p> : null}
      {isOpen ? (
        <div className="admin-section-body" id={`admin-section-${id}`}>
          {children}
        </div>
      ) : null}
    </section>
  );
}

// Department-config tabs, split between the "Department" and "Scheduling & Pay" sections.
const DEPARTMENT_TABS = ["branding", "stations", "modules", "subscription", "academy"];
const SCHEDULING_TABS = ["shift-rotation", "portal-rules", "pay-rules", "scheduling-apparatus", "crew-slots"];

const SECTION_LABELS = {
  department: "Department",
  scheduling: "Scheduling & Pay",
  people: "People & Access",
  integrations: "Connected Services",
  modules: "Module Data",
  records: "Dropdown Lists",
  audit: "Activity Log",
};

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
  // One section open at a time; sections report unsaved edits so we can warn before closing them.
  const [openSection, setOpenSection] = useState("");
  const dirtySectionsRef = useRef({});
  const [permissionsView, setPermissionsView] = useState("users");
  const markDirty = useCallback((sectionId, dirty) => {
    dirtySectionsRef.current = { ...dirtySectionsRef.current, [sectionId]: Boolean(dirty) };
  }, []);
  const dirtyHandlers = useMemo(() => Object.fromEntries(
    Object.keys(SECTION_LABELS).map((id) => [id, (dirty) => markDirty(id, dirty)])
  ), [markDirty]);

  useEffect(() => {
    function warnBeforeLeaving(event) {
      if (!Object.values(dirtySectionsRef.current).some(Boolean)) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);
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

  function confirmLeave(sectionId) {
    if (!sectionId || !dirtySectionsRef.current[sectionId]) return true;
    const ok = window.confirm(`You have unsaved changes in ${SECTION_LABELS[sectionId] || "this section"}. Leave without saving?`);
    if (ok) markDirty(sectionId, false);
    return ok;
  }

  function openOnly(sectionId) {
    if (sectionId === openSection) return;
    if (!confirmLeave(openSection)) return;
    setOpenSection(sectionId);
    requestAnimationFrame(() => document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleSection(sectionId) {
    if (sectionId === openSection) {
      if (confirmLeave(sectionId)) setOpenSection("");
      return;
    }
    openOnly(sectionId);
  }

  function isOpen(sectionId) {
    return openSection === sectionId;
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
          label="Department"
          description="Name, logo, contact details, stations, and your plan."
          icon={Settings}
          isOpen={isOpen("department")}
          onToggle={toggleSection}
        >
          <DepartmentConfigPanel
            onMessage={setMessage}
            apparatus={apparatus}
            sectionIds={DEPARTMENT_TABS}
            onDirtyChange={dirtyHandlers.department}
          />
        </AdminSectionPill>

        <AdminSectionPill
          id="people"
          label="People & Access"
          description="Invite people, choose their roles, and decide what each role can do."
          icon={Users}
          isOpen={isOpen("people")}
          onToggle={toggleSection}
        >
          <section className="permissions-view-toolbar">
            <div className="segmented-control admin-filter-control">
              <button
                type="button"
                className={permissionsView === "users" ? "active" : ""}
                onClick={() => setPermissionsView("users")}
              >
                People
              </button>
              <button
                type="button"
                className={permissionsView === "roles" ? "active" : ""}
                onClick={() => setPermissionsView("roles")}
              >
                Roles
              </button>
            </div>
          </section>
          {permissionsView === "roles" ? (
            <RolePermissionsEditor onMessage={setMessage} onDirtyChange={dirtyHandlers.people} />
          ) : (
            <UserPermissionsEditor
              onMessage={setMessage}
              personnel={personnel}
              onOpenPersonnelProfile={onOpenPersonnelProfile}
              onOpenEmployeeProfile={onOpenEmployeeProfile}
              onDirtyChange={dirtyHandlers.people}
            />
          )}
        </AdminSectionPill>

        <AdminSectionPill
          id="scheduling"
          label="Scheduling & Pay"
          description="Shift rotation, roster units, crew positions, pay periods, overtime, and portal rules."
          icon={CalendarDays}
          isOpen={isOpen("scheduling")}
          onToggle={toggleSection}
        >
          <DepartmentConfigPanel
            onMessage={setMessage}
            apparatus={apparatus}
            sectionIds={SCHEDULING_TABS}
            onDirtyChange={dirtyHandlers.scheduling}
          />
        </AdminSectionPill>

        <AdminSectionPill
          id="integrations"
          label="Connected Services"
          description="Google Maps, Active911, the JotForm damage form, and FORGE Academy."
          icon={KeyRound}
          isOpen={isOpen("integrations")}
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

        <AdminSectionPill
          id="records"
          label={isCreator ? "System Records" : "Dropdown Lists"}
          description="The choices offered in dropdowns across the app, like incident types and ranks."
          icon={LayoutGrid}
          isOpen={isOpen("records")}
          onToggle={toggleSection}
        >
          <RecordCollectionEditor
            onMessage={setMessage}
            personnel={personnel}
            onOpenPersonnelProfile={onOpenPersonnelProfile}
            onOpenEmployeeProfile={onOpenEmployeeProfile}
            onDirtyChange={dirtyHandlers.records}
            onInviteSomeone={() => {
              setPermissionsView("users");
              openOnly("people");
            }}
          />
        </AdminSectionPill>

        <AdminSectionPill
          id="audit"
          label="Activity Log"
          description="Who changed what, and when."
          icon={History}
          isOpen={isOpen("audit")}
          onToggle={toggleSection}
        >
          <AuditLogPanel departmentId={departmentId} />
        </AdminSectionPill>

        {isCreator ? (
          <AdminSectionPill
            id="modules"
            label="Module Data (FORGE staff)"
            description="Raw records for every module. Staff only."
            icon={Database}
            isOpen={isOpen("modules")}
            onToggle={toggleSection}
          >
            <DataEditorPanel onMessage={setMessage} onDirtyChange={dirtyHandlers.modules} />
          </AdminSectionPill>
        ) : null}
      </section>
    </div>
  );
}
