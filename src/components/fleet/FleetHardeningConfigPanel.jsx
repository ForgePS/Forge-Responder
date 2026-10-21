import { getFleetPermissionMatrix, getHardeningChecklist, getFleetRulesCollectionChecklist } from "../../lib/fleet/index.js";

/**
 * Production hardening reference in Configuration Studio.
 */
export default function FleetHardeningConfigPanel() {
  const matrix = getFleetPermissionMatrix();
  const checklist = getHardeningChecklist();
  const collections = getFleetRulesCollectionChecklist();

  return (
    <section className="fleet-hardening-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Hardening checklist</strong></div></header>
        <div className="panel-body">
          <p className="muted">Open <strong>Fleet Hardening</strong> to run live checks and save snapshots.</p>
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Item</span><span>Category</span></div>
            {checklist.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
                <span>{row.category}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Permission matrix</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>Area</span><span>View</span><span>Edit</span></div>
            {matrix.map((row) => (
              <div className="cert-row" key={row.area}>
                <strong>{row.area}</strong>
                <span>{row.view}</span>
                <span>{row.edit}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Rules collection checklist</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>Collection</span></div>
            {collections.map((name) => (
              <div className="cert-row" key={name}>
                <strong>{name}</strong>
              </div>
            ))}
          </div>
        </div>
      </section>
    </section>
  );
}
