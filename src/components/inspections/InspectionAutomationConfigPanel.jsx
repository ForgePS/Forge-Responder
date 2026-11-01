import { Zap } from "lucide-react";
import {
  getAutomationTriggers,
  getAutomationActions,
  getWorkflowTemplates,
  getWebhookEventTypes,
  getInspectionIntegrationAdapterTypes,
  getNerisEntityTypes,
} from "../../lib/inspections/index.js";

/**
 * Automation / integrations reference for Inspection Config Studio (Phase 12).
 */
export default function InspectionAutomationConfigPanel() {
  const triggers = getAutomationTriggers();
  const actions = getAutomationActions();
  const templates = getWorkflowTemplates();
  const events = getWebhookEventTypes();
  const adapters = getInspectionIntegrationAdapterTypes();
  const neris = getNerisEntityTypes();

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div>
            <Zap size={15} />
            <strong>Automation & integrations</strong>
          </div>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            Configure rules, workflows, webhooks, calendar stubs, NERIS mappings, and adapters under
            Prevention → Automation & Integrations. Email, SMS and webhook delivery isn't connected yet; matching actions are logged only.
          </p>
        </div>
      </section>

      <div className="config-reference-grid">
        <section className="panel">
          <header><div><strong>Triggers</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {triggers.map((row) => (
                <li key={row.id}><code>{row.id}</code><span>{row.label}</span></li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel">
          <header><div><strong>Actions</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {actions.map((row) => (
                <li key={row.id}><code>{row.id}</code><span>{row.label}</span></li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      <section className="panel">
        <header><div><strong>Workflow templates</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {templates.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code>
                <span>{row.label} — {(row.nodes || []).join(" → ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="config-reference-grid">
        <section className="panel">
          <header><div><strong>Webhook events</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {events.map((row) => (
                <li key={row.id}><code>{row.id}</code><span>{row.label}</span></li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel">
          <header><div><strong>Adapters / NERIS</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {adapters.map((row) => (
                <li key={row.id}><code>{row.id}</code><span>{row.label}</span></li>
              ))}
              {neris.map((row) => (
                <li key={`neris-${row.id}`}><code>{row.id}</code><span>NERIS · {row.label}</span></li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
