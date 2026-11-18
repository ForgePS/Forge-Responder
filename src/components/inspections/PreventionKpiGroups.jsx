import { formatCurrency } from "../../lib/inspections/index.js";

// KPI groups. Cards not listed here (custom department cards) go in the last group.
const KPI_GROUPS = [
  { id: "workload", title: "Workload", ids: ["due_today", "due_this_week", "overdue", "unassigned", "in_progress", "awaiting_approval"] },
  { id: "enforcement", title: "Enforcement", ids: ["open_violations", "violations_overdue", "reinspections_due", "active_orders", "fps_impairments"] },
  { id: "fees", title: "Fees & quality", ids: ["outstanding_fees", "revenue_collected", "preplans_review", "pass_rate"] },
];

// Cards that need attention when above zero.
const KPI_ALERT_TONES = {
  overdue: "critical",
  violations_overdue: "critical",
  fps_impairments: "critical",
  due_today: "warning",
  unassigned: "warning",
  awaiting_approval: "warning",
  reinspections_due: "warning",
  preplans_review: "warning",
};

function groupKpiCards(cards = []) {
  const known = new Set(KPI_GROUPS.flatMap((group) => group.ids));
  const groups = KPI_GROUPS.map((group) => ({
    ...group,
    cards: group.ids.map((id) => cards.find((card) => card.id === id)).filter(Boolean),
  }));
  const extra = cards.filter((card) => !known.has(card.id));
  if (extra.length) groups[groups.length - 1].cards.push(...extra);
  return groups.filter((group) => group.cards.length);
}

function formatKpiValue(id, raw) {
  if (id === "outstanding_fees" || id === "revenue_collected") return formatCurrency(raw || 0);
  if (id === "pass_rate") return `${Math.round(Number(raw) || 0)}%`;
  return raw ?? 0;
}

/** Prevention KPI cards in labelled groups (Inspections Dashboard, Inspection Reports). */
export default function PreventionKpiGroups({ cards = [], values = {}, onNavigate }) {
  return (
    <div className="insp-kpi-groups">
      {groupKpiCards(cards).map((group) => (
        <section key={group.id} className={`insp-kpi-group insp-kpi-group-${group.id}`} aria-label={group.title}>
          <h3>{group.title}</h3>
          <div className="insp-kpi-row">
            {group.cards.map((card) => {
              const raw = values?.[card.id];
              const tone = Number(raw) > 0 ? (KPI_ALERT_TONES[card.id] || "") : "";
              const isZero = !(Number(raw) > 0) && card.id !== "pass_rate";
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`insp-kpi${tone ? ` insp-kpi-${tone}` : ""}${isZero ? " insp-kpi-zero" : ""}`}
                  onClick={() => onNavigate?.(card.drillNav)}
                  title={card.drillNav ? `Open ${card.drillNav}` : undefined}
                >
                  <span className="insp-kpi-label">{String(card.label || "").replace(/\s*%$/, "")}</span>
                  <strong className="insp-kpi-value">{formatKpiValue(card.id, raw)}</strong>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
