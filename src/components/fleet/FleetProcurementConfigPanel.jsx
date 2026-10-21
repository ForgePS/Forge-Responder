import {
  getBuildMilestoneTemplates,
  getCommissioningChecklist,
  getProcurementPriorities,
  getProcurementRequestStatuses,
} from "../../lib/fleet/index.js";

/**
 * Reference lists for procurement / lifecycle in Configuration Studio.
 */
export default function FleetProcurementConfigPanel() {
  const priorities = getProcurementPriorities();
  const statuses = getProcurementRequestStatuses();
  const milestones = getBuildMilestoneTemplates();
  const commissioning = getCommissioningChecklist();

  return (
    <section className="fleet-procurement-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Request priorities</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {priorities.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Request lifecycle statuses</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {statuses.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Default build milestones</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>#</span><span>Milestone</span></div>
            {milestones.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.sortOrder}</strong>
                <span>{row.name}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Commissioning checklist</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Item</span></div>
            {commissioning.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
