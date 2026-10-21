import { ShieldCheck } from "lucide-react";
import {
  getInspectionHardeningChecklist,
  getImportRecordTypes,
  getDeploymentChecklistItems,
} from "../../lib/inspections/index.js";

/**
 * Import / hardening reference for Inspection Config Studio (Phase 13).
 */
export default function InspectionHardeningConfigPanel() {
  const checks = getInspectionHardeningChecklist();
  const imports = getImportRecordTypes();
  const deploy = getDeploymentChecklistItems();

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div>
            <ShieldCheck size={15} />
            <strong>Import & hardening</strong>
          </div>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            CSV import, reconciliation, readiness checks, load smoke, and cutover docs live under
            Prevention → Import & Hardening.
          </p>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Import types</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {imports.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code>
                <span>{row.label} · required {row.requiredColumns.join(", ")}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Hardening checklist</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {checks.map((row) => (
              <li key={row.id}>
                <code>{row.category}</code>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Deploy checklist (excerpt)</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {deploy.slice(0, 5).map((item) => (
              <li key={item}><span>{item}</span></li>
            ))}
          </ul>
        </div>
      </section>
    </section>
  );
}
