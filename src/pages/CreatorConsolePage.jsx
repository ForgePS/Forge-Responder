import { useEffect, useRef, useState } from "react";
import { Building2, CirclePlus, CalendarRange, Layers, Mail, Settings } from "lucide-react";
import CreateDepartmentPanel from "../components/CreateDepartmentPanel.jsx";
import DepartmentBranchesPanel from "../components/DepartmentBranchesPanel.jsx";
import CreatorWorkspaceHero from "../components/CreatorWorkspaceHero.jsx";
import PlatformSubscriptionsPanel from "../components/PlatformSubscriptionsPanel.jsx";
import InternalEmailBoard from "../components/InternalEmailBoard.jsx";
import DepartmentModulesPanel from "../components/DepartmentModulesPanel.jsx";
import PlatformConfigPanel from "../components/PlatformConfigPanel.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { readStoredWorkspaceId, writeStoredWorkspaceId } from "../lib/creatorConsoleWorkspace.js";
import {
  listPlatformDepartments,
  loadDepartmentProfile,
  loadDepartmentSettings,
  pruneGhostDepartmentBranches
} from "../lib/platformService.js";
import { PLATFORM_SCOPE_ID, isPlatformScope } from "../lib/tenantPaths.js";
import { resolveDepartmentBranchState } from "../lib/departmentBranchUtils.js";
import { normalizeSubscription } from "../lib/subscriptionUtils.js";

function workspaceCardSubtitle(department = {}) {
  return `Portal · /${department.id || ""}`;
}

function Panel({ title, icon: Icon, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header><div><Icon size={15} /><strong>{title}</strong></div></header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

const PLATFORM_TABS = [
  ["platform", "Platform Settings", Settings],
  ["modules", "Department Modules", Layers],
  ["departments", "Departments", Building2],
  ["subscriptions", "Subscriptions", CalendarRange],
  ["internalEmail", "Messages", Mail]
];

export default function CreatorConsolePage() {
  const { user, membership, isCreator } = useAuth();
  const { departmentId, setDepartmentId, platformConfig, profile, refreshDepartment } = useTenant();
  const [workspaceId, setWorkspaceId] = useState(readStoredWorkspaceId);
  const [tab, setTab] = useState(() => (
    isPlatformScope(readStoredWorkspaceId()) ? "platform" : "modules"
  ));
  const [departments, setDepartments] = useState([]);
  const [message, setMessage] = useState("");
  const [highlightCreate, setHighlightCreate] = useState(false);
  const workspaceChangeSourceRef = useRef("init");
  const createPanelRef = useRef(null);

  const inPlatformWorkspace = isPlatformScope(workspaceId);

  async function reload() {
    try {
      if (isCreator) {
        await pruneGhostDepartmentBranches();
      }

      const items = await listPlatformDepartments();

      const enriched = await Promise.all(items.map(async (department) => {
        const [settings, profile] = await Promise.all([
          loadDepartmentSettings(department.id),
          loadDepartmentProfile(department.id),
        ]);
        const subscription = normalizeSubscription(settings.subscription || department.subscription || {});
        return {
          ...department,
          address: profile.address || department.address || "",
          stateId: resolveDepartmentBranchState(department, profile),
          subscription: subscription.expirationDate ? subscription : null,
        };
      }));
      setDepartments(enriched);
    } catch (error) {
      console.error("Failed to load platform departments", error);
      const items = await listPlatformDepartments();
      setDepartments(items);
    }
  }

  useEffect(() => {
    reload();
  }, [isCreator]);

  useEffect(() => {
    if (inPlatformWorkspace && tab === "internalEmail") {
      setTab("departments");
    }
  }, [inPlatformWorkspace, tab]);

  useEffect(() => {
    if (workspaceChangeSourceRef.current === "local") {
      workspaceChangeSourceRef.current = "idle";
      return;
    }
    if (departmentId === workspaceId) return;
    setWorkspaceId(departmentId);
    setTab(isPlatformScope(departmentId) ? "platform" : "modules");
  }, [departmentId, workspaceId]);

  function selectWorkspace(nextWorkspaceId) {
    workspaceChangeSourceRef.current = "local";
    setWorkspaceId(nextWorkspaceId);
    writeStoredWorkspaceId(nextWorkspaceId);
    setDepartmentId(nextWorkspaceId);
    setTab(isPlatformScope(nextWorkspaceId) ? "platform" : "modules");
    setHighlightCreate(false);
  }

  function openCreateDepartment() {
    setTab("departments");
    setHighlightCreate(true);
    requestAnimationFrame(() => {
      createPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  async function handleDepartmentCreated(id) {
    await reload();
    await refreshDepartment();
    selectWorkspace(id);
    setTab("modules");
  }

  function openDepartment(id) {
    selectWorkspace(id);
    setMessage(`Switched to ${departments.find((item) => item.id === id)?.name || id}`);
  }

  function openDepartmentSubscriptions() {
    selectWorkspace(PLATFORM_SCOPE_ID);
    setTab("subscriptions");
    setMessage("Open Subscriptions to manage plans, billing status, and renewals.");
  }

  function openPlatformWorkspace() {
    selectWorkspace(PLATFORM_SCOPE_ID);
    setMessage("Switched to FORGE platform workspace");
  }

  const platformTitle = platformConfig?.platformTitle || "FORGE RMS";
  const activeDepartment = departments.find((item) => item.id === workspaceId);
  const activeLabel = inPlatformWorkspace
    ? platformTitle
    : (activeDepartment?.shortName || activeDepartment?.name || workspaceId);
  const visibleTabs = (inPlatformWorkspace
    ? PLATFORM_TABS.filter(([id]) => id !== "internalEmail")
    : PLATFORM_TABS.filter(([id]) => !["platform", "subscriptions"].includes(id))
  ).filter(([id]) => isCreator || id !== "subscriptions");

  return (
    <div className="module-page platform-admin-page">
      <CreatorWorkspaceHero
        workspaceId={workspaceId}
        departments={departments}
        platformConfig={platformConfig}
        profile={profile}
      />

      {!inPlatformWorkspace && (
        <div className="platform-scope-banner">
          <strong>You are editing a department branch.</strong>
          <span>Switch to the main FORGE platform workspace to change company-wide branding, create new departments, or edit the module catalog.</span>
          <button className="primary-button" type="button" onClick={openPlatformWorkspace}>
            Open FORGE platform workspace
          </button>
        </div>
      )}

      {inPlatformWorkspace && (
        <div className="platform-scope-banner platform-create-banner">
          <strong>Add agency branches from the FORGE platform workspace.</strong>
          <span>Each department gets its own portal URL, profile, module controls, and messages board.</span>
          <button className="primary-button" type="button" onClick={openCreateDepartment}>
            <CirclePlus size={14} /> Create new department platform
          </button>
        </div>
      )}

      <section className="platform-workspace-grid">
        <button
          type="button"
          className={`platform-workspace-card ${inPlatformWorkspace ? "active" : ""}`}
          onClick={openPlatformWorkspace}
        >
          <span className="platform-workspace-kind">Main platform</span>
          <strong>{platformTitle}</strong>
          <span>{platformConfig?.name || "FORGE PUBLIC SAFETY"}</span>
          {inPlatformWorkspace && <em>Active workspace</em>}
        </button>
        {departments.map((department) => (
          <button
            key={department.id}
            type="button"
            className={`platform-workspace-card ${department.id === workspaceId && !inPlatformWorkspace ? "active" : ""}`}
            onClick={() => openDepartment(department.id)}
          >
            <span className="platform-workspace-kind">Department branch</span>
            <strong>{department.shortName || department.name || department.id}</strong>
            <span>{workspaceCardSubtitle(department)}</span>
            {department.id === workspaceId && !inPlatformWorkspace && <em>Active workspace</em>}
          </button>
        ))}
        <button
          type="button"
          className={`platform-workspace-card platform-workspace-card-new ${highlightCreate ? "active" : ""}`}
          onClick={openCreateDepartment}
        >
          <span className="platform-workspace-kind">Provision</span>
          <strong>+ New department</strong>
          <span>Create another agency platform</span>
        </button>
      </section>

      {message && (
        <div className="success-banner">
          {message}
          <button type="button" className="text-button" onClick={() => setMessage("")}>Dismiss</button>
        </div>
      )}

      <section className="training-summary">
        <div className="fleet-stat stat-info"><strong>{departments.length}</strong><span>Department Branches</span></div>
        <div className="fleet-stat stat-success"><strong>{activeLabel}</strong><span>Active Workspace</span></div>
        <div className="fleet-stat stat-info"><strong>{platformConfig?.availableModules?.length || 0}</strong><span>Platform Modules</span></div>
      </section>

      <section className="cert-toolbar admin-tab-toolbar">
        <div className="segmented-control admin-tab-bar platform-admin-tabs">
          {visibleTabs.map(([id, label]) => (
            <button key={id} type="button" className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </section>

      {tab === "platform" && (
        <Panel title="Platform Settings" icon={Settings}>
          <PlatformConfigPanel onMessage={setMessage} />
        </Panel>
      )}

      {tab === "modules" && (
        <Panel title="Department Module Controls" icon={Layers}>
          <DepartmentModulesPanel onMessage={setMessage} onOpenDepartment={openDepartment} />
        </Panel>
      )}

      {tab === "departments" && (
        <section className="platform-departments-workspace">
          <div ref={createPanelRef} className={highlightCreate ? "create-department-highlight" : ""}>
            <Panel title="Create Department Platform" icon={CirclePlus}>
              <CreateDepartmentPanel
                user={user}
                departments={departments}
                onCreated={handleDepartmentCreated}
                onMessage={setMessage}
              />
            </Panel>
          </div>

          <Panel title="Department Branches" icon={Building2} className="platform-departments-branches-panel">
            <DepartmentBranchesPanel
              departments={departments}
              workspaceId={workspaceId}
              inPlatformWorkspace={inPlatformWorkspace}
              isCreator={isCreator}
              onReload={reload}
              onOpenDepartment={openDepartment}
              onManageSubscriptions={() => setTab("subscriptions")}
              onSetSubscriptionDates={openDepartmentSubscriptions}
            />
          </Panel>
        </section>
      )}

      {tab === "subscriptions" && inPlatformWorkspace && isCreator && (
        <Panel title="Department Subscriptions" icon={CalendarRange}>
          <PlatformSubscriptionsPanel onMessage={setMessage} onOpenDepartment={openDepartment} />
        </Panel>
      )}

      {tab === "internalEmail" && !inPlatformWorkspace && (
        <Panel title="Department Messages" icon={Mail}>
          <p className="auth-help">
            Preview the inbox for <strong>{activeLabel}</strong>. Personnel use this inside the department portal under
            Communications → Messages. Enable or disable the module under <strong>Department Modules</strong>.
          </p>
          <InternalEmailBoard compact onMessage={setMessage} />
        </Panel>
      )}

      <p className="auth-help platform-admin-hint">
        Signed in as {membership?.displayName || user?.email}. Use the workspace cards, top-bar selector, or <strong>Departments</strong> tab to add and manage agency platforms.
      </p>
    </div>
  );
}
