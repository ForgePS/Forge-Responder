import { AlertTriangle } from "lucide-react";

export const HYDRANT_DAMAGE_TABS = [
  { id: "all", label: "All Reports", navName: "Damage Reports" },
  { id: "open", label: "Open", navName: "Open Damage Reports" },
  { id: "awaiting", label: "Awaiting Utility", navName: "Awaiting Water Company" },
  { id: "repairs", label: "Repairs", navName: "Repairs in Progress" },
  { id: "verification", label: "Verification", navName: "Ready for Verification" },
  { id: "overdue", label: "Overdue", navName: "Overdue Repairs" },
  { id: "closed", label: "Closed", navName: "Closed Reports" },
  { id: "directory", label: "Water Companies", navName: "Water Company Directory" },
  { id: "districts", label: "Water Districts", navName: "Water Districts" },
  { id: "analytics", label: "Analytics & Bulk", navName: "Damage Analytics" },
];

export default function HydrantDamageModuleLayout({
  title,
  description,
  activeNavName,
  onNavigate,
  tabs = HYDRANT_DAMAGE_TABS,
  actions = null,
  children,
} = {}) {
  return (
    <div className="inspections-module hydrant-damage-module">
      <header className="inspections-module-header">
        <div>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </header>

      {Array.isArray(tabs) && tabs.length > 0 && onNavigate ? (
        <nav className="inspections-subnav" aria-label="Hydrant damage module">
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

export function HydrantDamagePermissionGate({
  allowed = false,
  title = "Access denied",
  description = "You do not have permission to view hydrant damage reports.",
  children,
} = {}) {
  if (!allowed) {
    return (
      <div className="inspections-denied-state" role="alert">
        <AlertTriangle size={22} aria-hidden />
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    );
  }
  return children;
}

export function HydrantDamageStatusBadge({ status = "", label = "" } = {}) {
  const text = label || String(status || "unknown").replace(/_/g, " ");
  const key = String(status || "").toLowerCase();
  let tone = "neutral";
  if (/critical|failed|overdue|hazard|out_of_service|bounced|rejected/.test(key)) tone = "critical";
  else if (/awaiting|scheduled|parts|review|deferred|ready|draft|moderate|major/.test(key)) tone = "warning";
  else if (/sent|delivered|accepted|acknowledged|verified|closed|completed|in_service|minor/.test(key)) tone = "success";
  else if (/queued|submitted|info/.test(key)) tone = "info";
  return <span className={`badge badge-${tone}`}>{text}</span>;
}
