import { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Flame, MapPin, Timer } from "lucide-react";
import {
  NFPA1710_METRICS,
  buildAnnualSurveyTotals,
  buildHeatMapPoints,
  buildNfpa1710Metrics,
  exportAnnualSurveyCsv,
  exportCsv,
  runAdHocReport,
} from "../lib/neris/analytics.js";
import { isNerisFeatureEnabled } from "../lib/neris/featureFlags.js";
import { useTenant } from "../context/TenantContext.jsx";
import { labelFromKey } from "../lib/labelFromKey.js";
import { INCIDENT_KINDS, primaryTypeLabel } from "../lib/neris/reportModel.js";
import "../styles/neris-analytics.css";

const NOT_ENOUGH = "Not enough data";

/** "2026-10-28" -> "Oct 28, 2026"; anything else passes through. */
function formatDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return value || "—";
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    .toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const money = (value) => `$${Math.round(Number(value) || 0).toLocaleString("en-US")}`;

/** Readable incident type: "Diabetic Problems" rather than "MEDICAL: ILLNESS: DIABETIC_PROBLEMS". */
function typeLabel(report) {
  const label = primaryTypeLabel(report);
  return label === "New incident" ? "Type not set" : label;
}

/** Category of a stored type ("MEDICAL: …" -> "Medical"); free text from CAD falls under Other. */
function categoryOf(typeText = "") {
  const prefix = String(typeText).split(":")[0].trim();
  return INCIDENT_KINDS.find((kind) => kind.typePrefix === prefix)?.label || "Other";
}

function formatSeconds(value) {
  if (value == null) return "—";
  if (value < 120) return `${value}s`;
  const m = Math.floor(value / 60);
  const sec = value % 60;
  if (m < 60) return sec ? `${m}m ${sec}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

const AD_HOC_LABELS = {
  reportNumber: "Report #",
  incidentDate: "Date",
  incidentTypeSummary: "Incident type",
  incidentAddress: "Address",
  status: "Status",
};

function downloadText(filename, content, mime = "text/csv") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function MetricCard({ label, value, sub, empty = false }) {
  return (
    <div className={`neris-analytics-metric${empty ? " is-empty" : ""}`}>
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
  const noYearData = survey.totalIncidents === 0;
  const heatPoints = useMemo(() => buildHeatMapPoints(reports), [reports]);
  const labelById = useMemo(() => new Map(reports.map((r) => [r.id, typeLabel(r)])), [reports]);
  const byCategory = useMemo(() => {
    const counts = {};
    for (const [type, count] of Object.entries(survey.byType || {})) {
      const category = categoryOf(type);
      counts[category] = (counts[category] || 0) + count;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [survey]);
  // Ad-hoc rows and filters use the readable type and date, so "structure fire" matches
  // and the CSV reads the same as the screen.
  const readableReports = useMemo(
    () => reports.map((r) => ({ ...r, incidentTypeSummary: labelById.get(r.id), incidentDate: formatDate(r.incidentDate) })),
    [reports, labelById],
  );
  const adHoc = useMemo(
    () => runAdHocReport(readableReports, {
      columns: ["reportNumber", "incidentDate", "incidentTypeSummary", "incidentAddress", "status"],
      filters: { status: adHocFilter.status, incidentTypeSummary: adHocFilter.incidentType },
    }),
    [readableReports, adHocFilter],
  );

  const tabs = [
    { id: "nfpa1710", label: "NFPA 1710", icon: Timer, enabled: isNerisFeatureEnabled(settings, "nfpa1710Analytics") },
    { id: "annual", label: "Annual Survey", icon: FileSpreadsheet, enabled: isNerisFeatureEnabled(settings, "nfpaAnnualSurvey") },
    { id: "heatmap", label: "Incident Locations", icon: MapPin, enabled: isNerisFeatureEnabled(settings, "incidentHeatMapping") },
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
          <p className="neris-analytics-note">
            Percent of incidents at or under the NFPA 1710 benchmark. An incident only counts toward a measure when both of its times were recorded on the report.
          </p>
          <div className="neris-analytics-metrics">
            <MetricCard label="Incidents with any times" value={nfpa1710.measuredCount} sub={`of ${nfpa1710.incidentCount} reports`} />
            {NFPA1710_METRICS.map((metric) => {
              const data = nfpa1710.compliance[metric.key];
              const empty = data.percentage == null;
              return (
                <MetricCard
                  key={metric.key}
                  label={`${metric.label} (≤ ${formatSeconds(data.benchmark)})`}
                  value={empty ? NOT_ENOUGH : `${data.percentage}%`}
                  empty={empty}
                  sub={empty
                    ? `Needs ${metric.from.toLowerCase()} and ${metric.to.toLowerCase()} times`
                    : `${data.compliant} of ${data.measured} on time · based on ${data.measured} of ${data.total} incidents · 90th percentile ${formatSeconds(data.percentile90)}`}
                />
              );
            })}
            <MetricCard
              label="Time on scene (median)"
              value={nfpa1710.scene.median == null ? NOT_ENOUGH : formatSeconds(nfpa1710.scene.median)}
              empty={nfpa1710.scene.median == null}
              sub={nfpa1710.scene.median == null ? "Needs on-scene and cleared times" : `based on ${nfpa1710.scene.measured} of ${nfpa1710.scene.total} incidents`}
            />
          </div>
          <section className="panel">
            <header><strong>Incident drill-down</strong></header>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Report</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Call processing</th>
                    <th>Turnout</th>
                    <th>Travel</th>
                    <th>Total response</th>
                    <th>On scene</th>
                  </tr>
                </thead>
                <tbody>
                  {nfpa1710.incidents.slice(0, 25).map((row, index) => (
                    <tr key={row.incidentId || index}>
                      <td>{row.reportNumber || "—"}</td>
                      <td>{formatDate(row.incidentDate)}</td>
                      <td>{labelById.get(row.incidentId) || "—"}</td>
                      <td>{formatSeconds(row.callProcessingSeconds)}</td>
                      <td>{formatSeconds(row.turnoutSeconds)}</td>
                      <td>{formatSeconds(row.travelSeconds)}</td>
                      <td>{formatSeconds(row.totalResponseSeconds)}</td>
                      <td>{formatSeconds(row.sceneSeconds)}</td>
                    </tr>
                  ))}
                  {!nfpa1710.incidents.length ? (
                    <tr><td colSpan={8}>No reports have response times yet. Add them on the Response step of each report.</td></tr>
                  ) : null}
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
            <MetricCard label="Total incidents" value={survey.totalIncidents} sub={survey.totalIncidents ? undefined : `No reports dated ${surveyYear}`} />
            <MetricCard label="Fire incidents" value={noYearData ? "—" : survey.fireIncidents} empty={noYearData} />
            <MetricCard label="Medical incidents" value={noYearData ? "—" : survey.emsIncidents} empty={noYearData} />
            <MetricCard label="Mutual aid given or received" value={noYearData ? "—" : survey.mutualAidIncidents} empty={noYearData} />
            <MetricCard
              label="Civilian injuries and deaths"
              value={noYearData ? "—" : survey.civilianCasualties}
              empty={noYearData}
              sub={noYearData ? undefined : `${survey.civilianInjuries} injured · ${survey.civilianDeaths} died · blank counts as none`}
            />
            <MetricCard
              label="Firefighter injuries"
              value={noYearData ? "—" : survey.firefighterCasualties}
              empty={noYearData}
              sub={noYearData ? undefined : "Blank counts as none"}
            />
            <MetricCard
              label="Property and contents loss"
              value={survey.lossReports ? money(survey.propertyLoss) : NOT_ENOUGH}
              empty={!survey.lossReports}
              sub={survey.lossReports ? `from ${survey.lossReports} of ${survey.totalIncidents} reports with a loss amount` : "No report this year has a loss amount entered"}
            />
          </div>
          {byCategory.length ? (
            <section className="panel">
              <header><strong>Incidents by category, {surveyYear}</strong></header>
              <div className="panel-body">
                <table className="data-table">
                  <thead>
                    <tr><th>Category</th><th>Incidents</th><th>Share</th></tr>
                  </thead>
                  <tbody>
                    {byCategory.map(([category, count]) => (
                      <tr key={category}>
                        <td>{category}</td>
                        <td>{count}</td>
                        <td>{Math.round((count / survey.totalIncidents) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </section>
      ) : null}

      {activeTab === "heatmap" ? (
        <section className="panel">
          <header><strong>{heatPoints.length ? `Incident locations (${heatPoints.length} of ${reports.length} reports have coordinates)` : "Incident locations"}</strong></header>
          <div className="panel-body">
            {heatPoints.length ? (
              <ul className="neris-heatmap-list">
                {heatPoints.slice(0, 50).map((point) => (
                  <li key={point.id}>
                    <strong>{point.address || "Unknown address"}</strong>
                    <span>{labelById.get(point.id) || "Type not set"} · {formatDate(point.date)}</span>
                    <small>{point.lat.toFixed(5)}, {point.lng.toFixed(5)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="neris-analytics-note">Add incident locations to see the map. Reports don't record map coordinates yet, so there's nothing to plot.</p>
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
              <input value={adHocFilter.incidentType} onChange={(e) => setAdHocFilter((f) => ({ ...f, incidentType: e.target.value }))} placeholder="Chest pain, fire…" />
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
            <header><strong>{adHoc.total} matching {adHoc.total === 1 ? "report" : "reports"}</strong></header>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    {(adHoc.columns || []).map((col) => <th key={col}>{AD_HOC_LABELS[col] || labelFromKey(col)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(adHoc.rows || []).slice(0, 50).map((row, i) => (
                    <tr key={i}>
                      {(adHoc.columns || []).map((col) => <td key={col}>{String(row[col] ?? "")}</td>)}
                    </tr>
                  ))}
                  {!(adHoc.rows || []).length ? (
                    <tr><td colSpan={Math.max((adHoc.columns || []).length, 1)}>No reports match these filters.</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}
