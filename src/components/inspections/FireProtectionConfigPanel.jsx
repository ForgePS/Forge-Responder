import { Flame } from "lucide-react";
import {
  getFpsSystemTypeOptions,
  FPS_SYSTEM_STATUS_LABELS,
  FPS_TEST_RESULT_LABELS,
  FPS_IMPAIRMENT_STATUS_LABELS,
  FPS_DEFICIENCY_STATUS_LABELS,
  FPS_CONTRACTOR_STATUS_LABELS,
} from "../../lib/inspections/index.js";

function StatusList({ title, labels }) {
  return (
    <section className="panel">
      <header>
        <div>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="panel-body">
        <ul className="config-reference-list">
          {Object.entries(labels).map(([id, label]) => (
            <li key={id}>
              <code>{id}</code>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Fire protection systems reference for Inspection Config Studio (Phase 8).
 * Inventory and workflows live on the Fire Protection Systems page.
 */
export default function FireProtectionConfigPanel() {
  const types = getFpsSystemTypeOptions();

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div>
            <Flame size={15} />
            <strong>Fire protection systems</strong>
          </div>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            System inventory, test reports, impairments, deficiencies, and contractors are managed
            from Prevention → Fire Protection Systems. This tab lists the starter type and status
            vocabulary used by that board.
          </p>
        </div>
      </section>

      <section className="panel">
        <header>
          <div>
            <strong>System types</strong>
          </div>
        </header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {types.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="config-reference-grid">
        <StatusList title="System statuses" labels={FPS_SYSTEM_STATUS_LABELS} />
        <StatusList title="Test results" labels={FPS_TEST_RESULT_LABELS} />
        <StatusList title="Impairment statuses" labels={FPS_IMPAIRMENT_STATUS_LABELS} />
        <StatusList title="Deficiency statuses" labels={FPS_DEFICIENCY_STATUS_LABELS} />
        <StatusList title="Contractor statuses" labels={FPS_CONTRACTOR_STATUS_LABELS} />
      </div>
    </section>
  );
}
