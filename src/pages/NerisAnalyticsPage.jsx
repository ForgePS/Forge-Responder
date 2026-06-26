import { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Flame, MapPin, Timer } from "lucide-react";
import {
  buildAnnualSurveyTotals,
  buildHeatMapPoints,
  buildNfpa1710Metrics,
  exportAnnualSurveyCsv,
  exportCsv,
  runAdHocReport,
} from "../lib/neris/analytics.js";
import { isNerisFeatureEnabled } from "../lib/neris/featureFlags.js";
import { useTenant } from "../context/TenantContext.jsx";

function downloadText(filename, content, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, sub }) {
  return (
    <div className="neris-analytics-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

/**
 * @param {{ reports?: Array<Record<string, unknown>> }} props
 */
export default function NerisAnalyticsPage({ reports = [] }) {
  const { settings } = useTenant();
  const [tab, setTab] = useState("nfpa1710");
  const [surveyYear, setSurveyYear] = useState(new Date().getFullYear());
  const [adHocFilter, setAdHocFilter] = useState({ status: "", incidentType: "" });

  const nfpa1710 = useMemo(() => buildNfpa1710Metrics(reports), [reports]);
  const survey = useMemo(() => buildAnnualSurveyTotals(reports, surveyYear), [reports, surveyYear]);
  const heatPoints = useMemo(() => buildHeatMapPoints(reports), [reports]);
  const adHoc = useMemo(
    () => runAdHocReport(reports, {
      columns: ["reportNumber", "incidentDate", "incidentTypeSummary", "incidentAddress", "status"],
      filters: { status: adHocFilter.status, incidentTypeSummary: adHocFilter.incidentType },
    }),
    [reports, adHocFilter],
  );

  const tabs = [
    { id: "nfpa1710", label: "NFPA 1710", icon: Timer, enabled: isNerisFeatureEnabled(settings, "nfpa1710Analytics") },
    { id: "annual", label: "Annual Survey", icon: FileSpreadsheet, enabled: isNerisFeatureEnabled(settings, "nfpaAnnualSurvey") },
    { id: "heatmap", label: "Heat Map", icon: MapPin, enabled: isNerisFeatureEnabled(settings, "incidentHeatMapping") },
    { id: "adhoc", label: "Ad-Hoc Reports", icon: BarChart3, enabled: isNerisFeatureEnabled(settings, "adHocIncidentReporting") },
  ].filter((t) => t.enabled);

  const activeTab = tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id;

  return (
    <div className="module-page neris-analytics-page">
      <section className="module-heading">
        <div>
          <span className="module-icon"><Flame size={22} /></span>
          <div>
            <h1>NERIS Analytics</h1>
            <p>NFPA 1710 response metrics, annual survey exports, incident heat mapping, and ad-hoc reporting.</p>
          </div>
        </div>
      </section>

      <section className="cert-toolbar">
        <div className="segmented-control">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={activeTab === item.id ? "active" : ""}
                onClick={() => setTab(item.id)}
              >
                <Icon size={14} /> {item.label}
              </button>
            );
          })}
        </div>
        <span>{reports.length} incident reports</span>
      </section>

      {activeTab === "nfpa1710" ? (
        <section className="neris-analytics-grid">
          <div className="neris-analytics-metrics">
            <MetricCard label="Incidents measured" value={nfpa1710.measuredCount} sub={`of ${nfpa1710.incidentCount} total`} />
            {Object.entries(nfpa1710.compliance).map(([metric, data]) => (
              <MetricCard
                key={metric}
                label={metric.replace(/Seconds$/, " (sec)")}
                value={`${data.percentage}%`}
                sub={`${data.compliant}/${data.measured} ≤ ${data.benchmark}s`}
              />
            ))}
          </div>
          <section className="panel">
            <header><strong>Incident drill-down</strong></header>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Date</th>
                    <th>Turnout</th>
                    <th>Travel</th>
                    <th>Total response</th>
                  </tr>
                </thead>
                <tbody>
                  {nfpa1710.incidents.slice(0, 25).map((row) => (
                    <tr key={row.incidentId}>
                      <td>{row.reportNumber}</td>
                      <td>{row.incidentDate}</td>
                      <td>{row.turnoutSeconds ?? "—"}s</td>
                      <td>{row.travelSeconds ?? "—"}s</td>
                      <td>{row.totalResponseSeconds ?? "—"}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab === "annual" ? (
        <section className="neris-analytics-grid">
          <div className="neris-analytics-toolbar">
            <label>
              Survey year
              <input
                type="number"
                value={surveyYear}
                onChange={(e) => setSurveyYear(Number(e.target.value))}
                min={2000}
                max={2100}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => downloadText(`nfpa-annual-survey-${surveyYear}.csv`, exportAnnualSurveyCsv(survey))}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
          <div className="neris-analytics-metrics">
            <MetricCard label="Total incidents" value={survey.totalIncidents} />
            <MetricCard label="Fire incidents" value={survey.fireIncidents} />
            <MetricCard label="EMS incidents" value={survey.emsIncidents} />
            <MetricCard label="Mutual aid" value={survey.mutualAidIncidents} />
            <MetricCard label="Civilian casualties" value={survey.civilianCasualties} />
            <MetricCard label="Firefighter casualties" value={survey.firefighterCasualties} />
            <MetricCard label="Property loss" value={`$${survey.propertyLoss.toLocaleString()}`} />
          </div>
        </section>
      ) : null}

      {activeTab === "heatmap" ? (
        <section className="panel">
          <header><strong>Incident density ({heatPoints.length} geocoded)</strong></header>
          <div className="panel-body">
            {heatPoints.length ? (
              <ul className="neris-heatmap-list">
                {heatPoints.slice(0, 50).map((point) => (
                  <li key={point.id}>
                    <strong>{point.address || "Unknown address"}</strong>
                    <span>{point.incidentType} · {point.date}</span>
                    <small>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Add latitude/longitude to incident reports to populate the heat map layer.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "adhoc" ? (
        <section className="neris-analytics-grid">
          <div className="neris-analytics-toolbar">
            <label>
              Status filter
              <input value={adHocFilter.status} onChange={(e) => setAdHocFilter((f) => ({ ...f, status: e.target.value }))} placeholder="Draft, Approved…" />
            </label>
            <label>
              Type filter
              <input value={adHocFilter.incidentType} onChange={(e) => setAdHocFilter((f) => ({ ...f, incidentType: e.target.value }))} placeholder="Structure fire…" />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => downloadText("neris-adhoc-report.csv", exportCsv(adHoc))}
            >
              <Download size={14} /> Export CSV
            </button>
          </div>
          <section className="panel">
            <header><strong>{adHoc.total} matching rows</strong></header>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    {(adHoc.columns || []).map((col) => <th key={col}>{col}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(adHoc.rows || []).slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {(adHoc.columns || []).map((col) => <td key={col}>{String(row[col] ?? "")}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
