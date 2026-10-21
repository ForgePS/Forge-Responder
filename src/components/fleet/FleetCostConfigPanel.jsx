import {
  getCostCategories,
  getDefaultReplacementFactors,
  getDecommissionChecklist,
  getDepreciationMethods,
  getDisposalMethods,
} from "../../lib/fleet/index.js";

/**
 * Reference lists for cost / replacement configuration.
 */
export default function FleetCostConfigPanel() {
  const categories = getCostCategories();
  const factors = getDefaultReplacementFactors();
  const methods = getDepreciationMethods();
  const disposal = getDisposalMethods();
  const checklist = getDecommissionChecklist();

  return (
    <section className="fleet-cost-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Cost categories</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {categories.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Default replacement factors</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>Factor</span><span>Weight</span></div>
            {factors.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.label}</strong>
                <span>{row.weight}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Depreciation methods</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {methods.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Disposal methods</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {disposal.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Decommission checklist</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Item</span></div>
            {checklist.map((row) => (
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
