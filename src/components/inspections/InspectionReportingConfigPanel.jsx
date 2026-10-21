import { FileBarChart2 } from "lucide-react";
import {
  getPreventionKpiCards,
  getStandardInspectionReportCatalog,
  getInspectionReportDataSources,
  getScheduleFrequencies,
} from "../../lib/inspections/index.js";

/**
 * Reporting reference for Inspection Config Studio (Phase 10).
 */
export default function InspectionReportingConfigPanel() {
  const kpis = getPreventionKpiCards();
  const catalog = getStandardInspectionReportCatalog();
  const sources = getInspectionReportDataSources();
  const frequencies = getScheduleFrequencies();

  return (
    <section className="personnel-workspace occupancy-workspace">
      <section className="panel">
        <header>
          <div>
            <FileBarChart2 size={15} />
            <strong>Dashboard & reporting</strong>
          </div>
        </header>
        <div className="panel-body">
          <p className="occupancy-muted">
            KPI cards, charts, standard catalog runs, custom definitions, and schedule stubs live under
            Prevention → Inspection Reports. Email delivery for schedules is deferred.
          </p>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>KPI cards</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {kpis.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code>
                <span>{row.label} → {row.drillNav}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <header><div><strong>Standard reports</strong></div></header>
        <div className="panel-body">
          <ul className="config-reference-list">
            {catalog.map((row) => (
              <li key={row.id}>
                <code>{row.id}</code>
                <span>{row.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="config-reference-grid">
        <section className="panel">
          <header><div><strong>Data sources</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {sources.map((row) => (
                <li key={row.id}>
                  <code>{row.id}</code>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="panel">
          <header><div><strong>Schedule frequencies</strong></div></header>
          <div className="panel-body">
            <ul className="config-reference-list">
              {frequencies.map((row) => (
                <li key={row.id}>
                  <code>{row.id}</code>
                  <span>{row.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>
    </section>
  );
}
