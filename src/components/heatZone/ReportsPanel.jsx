import { useState } from "react";
import { Download, FileText, Printer } from "lucide-react";
import { Panel } from "../shell/ui.jsx";
import { loadHeatZoneReport } from "../../lib/heatZone/heatZoneService.js";
import { downloadReportCsv, downloadReportXlsx, openReportPrint } from "../../lib/heatZone/heatZoneExport.js";
import { describeError, formatCount } from "../../lib/heatZone/heatZoneUi.js";

const REPORT_TYPES = [
  { id: "geographic", label: "Geographic (hot spots)" },
  { id: "district", label: "By district" },
  { id: "hourly", label: "By hour of day" },
  { id: "daily", label: "By day" },
  { id: "classification", label: "By classification" },
  { id: "comparison", label: "Period comparison", history: true },
];

const FORMATS = [
  { id: "csv", label: "CSV" },
  { id: "xlsx", label: "Excel" },
  { id: "pdf", label: "PDF / print" },
];

const PREVIEW_ROWS = 15;

function deliver(report, format) {
  if (format === "csv") downloadReportCsv(report);
  else if (format === "xlsx") downloadReportXlsx(report);
  else openReportPrint(report);
}

/** Report generator. The server applies filters, scope and permissions and audits each export. */
export default function ReportsPanel({ departmentId, requestFilters, canViewHistory, disabled }) {
  const [reportType, setReportType] = useState("geographic");
  const [format, setFormat] = useState("csv");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [printBlocked, setPrintBlocked] = useState(false);
  const types = REPORT_TYPES.filter((t) => !t.history || canViewHistory);
  const type = types.some((t) => t.id === reportType) ? reportType : types[0].id;

  async function generate() {
    setBusy(true);
    setError("");
    setPrintBlocked(false);
    try {
      const result = await loadHeatZoneReport(departmentId, type, requestFilters, format);
      setReport({ ...result, format });
      try {
        deliver(result, format);
      } catch (exportError) {
        setPrintBlocked(format === "pdf");
        setError(exportError?.message || "Unable to export the report.");
      }
    } catch (loadError) {
      setError(describeError(loadError, "Unable to generate the report.").message);
    } finally {
      setBusy(false);
    }
  }

  // Re-open the print view for the report just generated (pop-up was blocked).
  function reopenPrint() {
    setError("");
    setPrintBlocked(false);
    try {
      openReportPrint(report);
    } catch (exportError) {
      setError(exportError?.message || "Unable to open the print view.");
      setPrintBlocked(true);
    }
  }

  const meta = report?.meta;
  return (
    <div className="hz-stack">
      <Panel title="Generate report" icon={FileText}>
        <div className="hz-form">
          <label className="config-field">
            <span>Report</span>
            <select value={type} onChange={(e) => setReportType(e.target.value)}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </label>
          <div className="config-field">
            <span>Format</span>
            <div className="hz-chip-set" role="radiogroup" aria-label="Format">
              {FORMATS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={format === f.id} className={`hz-chip${format === f.id ? " active" : ""}`} onClick={() => setFormat(f.id)}>{f.label}</button>
              ))}
            </div>
          </div>
          <div className="hz-form-actions">
            <button type="button" className="primary-button hz-button" disabled={busy || disabled} onClick={generate}>
              <Download size={14} /> {busy ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
        <p className="hz-panel-note">The report uses the filters currently applied on this page and your district access. Each export is recorded in the department audit log.{!canViewHistory ? " Period comparison reports need the “View Heat Zone history” permission." : ""}</p>
        {disabled && <p className="hz-panel-note is-error">Fix the date range before generating a report.</p>}
        {error && (
          <div className="error-banner hz-banner" role="alert">
            <span>{error}</span>
            {printBlocked && <button type="button" className="secondary-button hz-button" onClick={reopenPrint}><Printer size={14} /> Open print view</button>}
          </div>
        )}
      </Panel>

      {report && (
        <Panel
          title={`Preview · ${meta.title}`}
          icon={FileText}
          action={<span className="hz-panel-hint">{FORMATS.find((f) => f.id === report.format)?.label} export</span>}
        >
          <dl className="hz-report-meta">
            <div><dt>Agency</dt><dd>{meta.agencyName}</dd></div>
            <div><dt>Date range</dt><dd>{meta.from} to {meta.to} ({meta.timeZone})</dd></div>
            <div><dt>Filters</dt><dd>{(meta.filters || []).join("; ") || "None"}</dd></div>
            <div><dt>District scope</dt><dd>{meta.districtScope || "—"}</dd></div>
            <div><dt>Calls in report</dt><dd>{formatCount(meta.totalCalls)}</dd></div>
            <div><dt>Generated</dt><dd>{meta.generatedAtLocal}{meta.generatedBy ? ` by ${meta.generatedBy}` : ""}</dd></div>
          </dl>
          {meta.truncated && <p className="hz-panel-note">Result limited to the first 50,000 incidents in range.</p>}
          <div className="data-table-wrap">
            <table className="hz-table">
              <thead><tr>{report.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <tr key={i}>{row.map((cell, j) => <td key={j}>{cell === null || cell === undefined ? "" : String(cell)}</td>)}</tr>
                ))}
              </tbody>
            </table>
            {!report.rows.length && <div className="empty-table">No rows for these filters.</div>}
          </div>
          {report.rows.length > PREVIEW_ROWS && <p className="hz-chart-foot">Showing the first {PREVIEW_ROWS} of {formatCount(report.rows.length)} rows. The export contains every row.</p>}
          {(report.notes || []).map((note) => <p key={note} className="hz-panel-note">{note}</p>)}
        </Panel>
      )}
    </div>
  );
}
