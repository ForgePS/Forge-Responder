/** Primary workflow tabs shown on inspection list/dashboard shells. */
export const INSPECTION_WORKFLOW_TABS = [
  { id: "dashboard", label: "Dashboard", navName: "Inspections Dashboard" },
  { id: "workQueue", label: "Work Queue", navName: "Work Queue" },
  { id: "allInspections", label: "All Inspections", navName: "All Inspections" },
  { id: "myInspections", label: "My Inspections", navName: "My Inspections" },
  { id: "violations", label: "Open Violations", navName: "Open Violations" },
];

/** Secondary prevention tools for specialty boards. */
export const PREVENTION_TOOL_TABS = [
  { id: "reports", label: "Reports", navName: "Inspection Reports" },
  { id: "fees", label: "Fees", navName: "Fees & Payments" },
  { id: "offline", label: "Offline", navName: "Offline & Sync" },
  { id: "automation", label: "Automation", navName: "Automation & Integrations" },
  { id: "hardening", label: "Import & Data Quality", navName: "Import & Data Quality" },
  { id: "config", label: "Config", navName: "Configuration Studio" },
];

export default function InspectionsModuleLayout({
  title,
  description,
  activeNavName,
  onNavigate,
  tabs = INSPECTION_WORKFLOW_TABS,
  actions = null,
  children,
} = {}) {
  return (
    <div className="inspections-module">
      <header className="inspections-module-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>

      {Array.isArray(tabs) && tabs.length > 0 && onNavigate ? (
        <nav className="inspections-subnav" aria-label="Inspections module">
          {tabs.map((tab) => (
            <button
              key={tab.id || tab.navName}
              type="button"
              className={`inspections-subnav-item${activeNavName === tab.navName ? " active" : ""}`}
              aria-current={activeNavName === tab.navName ? "page" : undefined}
              onClick={() => onNavigate(tab.navName)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="inspections-module-body">{children}</div>
    </div>
  );
}
