import { Truck } from "lucide-react";

const DEFAULT_TABS = [
  { id: "dashboard", label: "Dashboard", navName: "Fleet Dashboard" },
  { id: "readiness", label: "Readiness Board", navName: "Readiness Board" },
  { id: "defects", label: "Fleet Defects", navName: "Fleet Defects" },
  { id: "workOrders", label: "Work Orders", navName: "Fleet Work Orders" },
  { id: "pm", label: "PM Forecast", navName: "PM Forecast" },
  { id: "tests", label: "Fleet Tests", navName: "Fleet Tests" },
  { id: "fuel", label: "Fuel & Energy", navName: "Fuel & Energy" },
  { id: "components", label: "Components & Warranty", navName: "Components & Warranty" },
  { id: "operations", label: "Fleet Operations", navName: "Fleet Operations" },
  { id: "risk", label: "Accident & Risk", navName: "Accident & Risk" },
  { id: "procurement", label: "Fleet Procurement", navName: "Fleet Procurement" },
  { id: "cost", label: "Cost & Replacement", navName: "Cost & Replacement" },
  { id: "reporting", label: "Reporting & Automation", navName: "Reporting & Automation" },
  { id: "vendorPortal", label: "Vendor Portal", navName: "Vendor Portal" },
  { id: "assets", label: "All Fleet Assets", navName: "All Fleet Assets" },
  { id: "hardening", label: "Fleet Hardening", navName: "Fleet Hardening" },
  { id: "config", label: "Configuration", navName: "Fleet Configuration Studio" },
];

export default function FleetModuleLayout({
  title,
  description,
  activeNavName,
  onNavigate,
  tabs = DEFAULT_TABS,
  actions = null,
  children,
} = {}) {
  return (
    <div className="fleet-module inspections-module">
      <a className="fleet-skip-link" href="#fleet-module-main">Skip to fleet content</a>
      <header className="inspections-module-header">
        <div>
          <h2 id="fleet-module-title">{title}</h2>
          {description ? <p id="fleet-module-desc">{description}</p> : null}
        </div>
        {actions}
      </header>

      {Array.isArray(tabs) && tabs.length > 0 && onNavigate ? (
        <nav className="inspections-subnav" aria-label="Fleet module" aria-describedby="fleet-module-title">
          {tabs.map((tab) => {
            const isActive = activeNavName === tab.navName;
            return (
              <button
                key={tab.id || tab.navName}
                type="button"
                className={`inspections-subnav-item${isActive ? " active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                onClick={() => onNavigate(tab.navName)}
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      ) : null}

      <div id="fleet-module-main" className="inspections-module-body" tabIndex={-1} role="main" aria-labelledby="fleet-module-title">
        {children}
      </div>
    </div>
  );
}

export function FleetEmptyState({
  title = "No fleet assets yet",
  description = "Import from the classic Apparatus list or add a fleet asset.",
  icon: Icon = Truck,
} = {}) {
  return (
    <div className="inspections-empty-state" role="status">
      <Icon size={28} aria-hidden />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function FleetPermissionGate({
  allowed = false,
  loading = false,
  title = "Access denied",
  description = "You do not have permission to view this fleet area.",
  children,
} = {}) {
  if (loading) {
    return (
      <div className="inspections-loading-state" role="status" aria-live="polite">
        <p>Loading fleet module...</p>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="inspections-denied-state" role="alert">
        <Truck size={22} aria-hidden />
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    );
  }

  return children;
}

const TONE_BY_STATUS = {
  in_service: "success",
  out_of_service: "critical",
  reserve: "warning",
  restricted: "warning",
  decommissioned: "neutral",
  available: "success",
  available_restricted: "warning",
  in_shop: "warning",
  maintenance_due: "warning",
  submitted: "warning",
  under_review: "info",
  accepted: "info",
  closed: "success",
  reopened: "critical",
  observation: "neutral",
  low: "info",
  moderate: "warning",
  high: "critical",
  critical: "critical",
  immediate_oos: "critical",
  pass: "success",
  warn: "warning",
  fail: "critical",
  manual: "info",
  queued: "warning",
  open: "warning",
  resolved: "success",
};

function formatStatusLabel(status = "") {
  return String(status || "unknown")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function FleetStatusBadge({ status = "", tone } = {}) {
  const key = String(status || "").toLowerCase();
  const resolvedTone = tone || TONE_BY_STATUS[key] || "neutral";
  const label = formatStatusLabel(status);
  return (
    <span
      className={`badge badge-${resolvedTone}`}
      title={label}
      aria-label={`Status: ${label}`}
    >
      <span className="fleet-status-text">{label}</span>
    </span>
  );
}
