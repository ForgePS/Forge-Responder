import {
  getAutomationActions,
  getAutomationTriggers,
  getIntegrationAdapterTypes,
  getStandardReportCatalog,
  getWorkflowTemplates,
} from "../../lib/fleet/index.js";

/**
 * Reference lists for reporting / automation / integrations.
 */
export default function FleetReportingConfigPanel() {
  const reports = getStandardReportCatalog();
  const triggers = getAutomationTriggers();
  const actions = getAutomationActions();
  const workflows = getWorkflowTemplates();
  const adapters = getIntegrationAdapterTypes();

  return (
    <section className="fleet-reporting-config">
      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Standard report catalog</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {reports.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Automation triggers</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {triggers.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Automation actions</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {actions.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel" style={{ marginBottom: "12px" }}>
        <header><div><strong>Workflow templates</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {workflows.map((row) => (
              <div className="cert-row" key={row.id}>
                <strong>{row.id}</strong>
                <span>{row.label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Integration adapter types</strong></div></header>
        <div className="panel-body">
          <div className="cert-table" style={{ minWidth: 0 }}>
            <div className="cert-row cert-head"><span>ID</span><span>Label</span></div>
            {adapters.map((row) => (
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
