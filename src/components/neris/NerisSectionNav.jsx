import { CheckCircle2, AlertCircle, Circle, MinusCircle } from "lucide-react";
import { aggregateSidebarStatus } from "../../lib/neris/sections.js";

/**
 * @param {{
 *   sidebarItems: Array<Record<string, unknown>>,
 *   activeSidebarId: string,
 *   onSelect: (id: string) => void,
 *   sectionStatus: Record<string, 'complete' | 'warning' | 'error' | 'na'>,
 *   collapsed?: boolean,
 *   mobileOpen?: boolean,
 *   onToggleMobile?: () => void,
 * }} props
 */
export default function NerisSectionNav({
  sidebarItems = [],
  activeSidebarId,
  onSelect,
  sectionStatus = {},
  collapsed = false,
  mobileOpen = false,
  onToggleMobile,
}) {
  function StatusIcon({ status }) {
    if (status === "complete") return <CheckCircle2 size={14} className="status-complete nav-status" />;
    if (status === "warning") return <AlertCircle size={14} className="status-warning nav-status" />;
    if (status === "error") return <AlertCircle size={14} className="status-error nav-status" />;
    if (status === "na") return <MinusCircle size={14} className="status-na nav-status" />;
    return <Circle size={14} className="status-pending nav-status" />;
  }

  return (
    <aside
      className={`neris-ws-sidebar${collapsed ? " collapsed" : ""}${mobileOpen ? " mobile-open" : ""}`}
      aria-label="Incident sections"
    >
      {onToggleMobile ? (
        <button type="button" className="neris-ws-sidebar-toggle" onClick={onToggleMobile} aria-label="Toggle navigation">
          <Circle size={16} />
        </button>
      ) : null}
      <ul className="neris-ws-nav">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
          const status = aggregateSidebarStatus(sectionStatus, item.sectionIds);
          return (
            <li key={item.id}>
              <button
                type="button"
                className={activeSidebarId === item.id ? "active" : ""}
                onClick={() => onSelect(item.id)}
                title={item.label}
              >
                <Icon size={18} />
                <span className="neris-ws-nav-label">{item.label}</span>
                <StatusIcon status={status} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
