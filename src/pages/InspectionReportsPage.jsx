import { useEffect, useMemo, useState } from "react";
import {
  CirclePlus,
  Download,
  FileBarChart2,
  Play,
  Save,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout, {
  PREVENTION_TOOL_TABS,
} from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  canEditInspectionReports,
  canViewInspectionReports,
  downloadJson,
  downloadRowsAsCsv,
  formatCurrency,
  getInspectionReportDataSources,
  getPreventionKpiCards,
  getScheduleFrequencies,
  getScheduleStatuses,
  getStandardInspectionReportCatalog,
  loadInspectionReportingBoard,
  recordInspectionReportRun,
  runCustomInspectionReport,
  runScheduledInspectionReportNow,
  runStandardInspectionReport,
  saveInspectionReport,
  saveScheduledInspectionReport,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function ChartBars({ title, rows = [], valueKey = "count" }) {
  const max = Math.max(1, ...rows.map((row) => Number(row[valueKey]) || 0));
  return (
    <section className="panel">
      <header><div><strong>{title}</strong></div></header>
      <div className="panel-body">
        {!rows.length ? (
          <p className="occupancy-muted">No data yet.</p>
        ) : (
          <div className="inspection-chart-bars">
            {rows.slice(0, 8).map((row) => {
              const value = Number(row[valueKey]) || 0;
              const label = row.key || row.status || row.type || row.group || "—";
              return (
                <div key={label} className="inspection-chart-row">
                  <span>{label}</span>
                  <div className="inspection-chart-track">
                    <div style={{ width: `${Math.max(4, (value / max) * 100)}%` }} />
                  </div>
                  <strong>{valueKey === "count" && !String(title).toLowerCase().includes("fee")
                    ? value
                    : (typeof value === "number" && title.toLowerCase().includes("aging")
                      ? formatCurrency(value)
                      : value)}</strong>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "standard", label: "Standard reports" },
  { id: "custom", label: "Custom reports" },
  { id: "scheduled", label: "Scheduled" },
];

export default function InspectionReportsPage({ onNavigate, query = "" }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionReports(permissions, isCreator);
  const canEdit = canEditInspectionReports(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("overview");
  const [board, setBoard] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [modal, setModal] = useState("");
  const [customDraft, setCustomDraft] = useState({
    name: "Custom prevention report",
    dataSource: "inspections",
    fields: ["inspectionNumber", "status", "occupancyName", "dueAt"],
    sortBy: "dueAt",
    sortDir: "asc",
    groupBy: "",
    filters: { status: "", occupancyName: "" },
  });
  const [scheduleDraft, setScheduleDraft] = useState({
    name: "",
    reportId: "inspections_by_status",
    reportKind: "standard",
    frequency: "weekly",
    status: "draft",
    recipients: "",
    notes: "",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const catalog = getStandardInspectionReportCatalog();
  const dataSources = getInspectionReportDataSources();
  const kpiCards = getPreventionKpiCards();
  const frequencies = getScheduleFrequencies();
  const scheduleStatuses = getScheduleStatuses();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setBoard(await loadInspectionReportingBoard(departmentId));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load reporting board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const needle = String(query || "").trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    if (!needle) return catalog;
    return catalog.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [catalog, needle]);

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setModal("");
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunStandard(reportId) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await runStandardInspectionReport(departmentId, reportId);
      setReportResult(result);
      await recordInspectionReportRun(departmentId, {
        reportId,
        reportName: result.name,
        reportKind: "standard",
        rowCount: result.rows.length,
        format: "preview",
      }, actor);
      setTab("standard");
      setMessage(`Ran ${result.name} (${result.rows.length} rows).`);
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Unable to run report.");
    } finally {
      setSaving(false);
    }
  }

  const sourceFields = dataSources.find((row) => row.id === customDraft.dataSource)?.fields || [];

  return (
    <InspectionPermissionGate allowed={allowed} title="Inspection Reports">
      <InspectionsModuleLayout
        title="Inspection Reports"
        description="Prevention KPIs, charts, standard catalog, custom builder, and scheduled delivery stubs."
        activeNavName="Inspection Reports"
        onNavigate={onNavigate}
        tabs={PREVENTION_TOOL_TABS}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setModal("custom")}>
              <CirclePlus size={14} /> Save custom
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("schedule")}>
              <CirclePlus size={14} /> Schedule report
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {loading ? <p className="occupancy-muted">Loading reports…</p> : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Report sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        {modal === "custom" && canEdit ? (
          <section className="panel">
            <header><div><Save size={15} /><strong>Save custom report</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={customDraft.name} onChange={(e) => setCustomDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Data source">
                <select
                  value={customDraft.dataSource}
                  onChange={(e) => {
                    const next = dataSources.find((row) => row.id === e.target.value);
                    setCustomDraft((c) => ({
                      ...c,
                      dataSource: e.target.value,
                      fields: next?.fields?.slice(0, 5) || [],
                      sortBy: next?.fields?.[0] || "",
                    }));
                  }}
                >
                  {dataSources.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Group by (optional)">
                <select value={customDraft.groupBy} onChange={(e) => setCustomDraft((c) => ({ ...c, groupBy: e.target.value }))}>
                  <option value="">None</option>
                  {sourceFields.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </Field>
              <Field label="Fields" wide>
                <select
                  multiple
                  size={6}
                  value={customDraft.fields}
                  onChange={(e) => setCustomDraft((c) => ({
                    ...c,
                    fields: Array.from(e.target.selectedOptions).map((opt) => opt.value),
                  }))}
                >
                  {sourceFields.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !customDraft.name}
                  onClick={() => run(
                    () => saveInspectionReport(departmentId, customDraft, actor),
                    "Custom report saved."
                  )}
                >
                  Save definition
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "schedule" && canEdit ? (
          <section className="panel">
            <header><div><FileBarChart2 size={15} /><strong>Schedule report</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Name" wide>
                <input value={scheduleDraft.name} onChange={(e) => setScheduleDraft((c) => ({ ...c, name: e.target.value }))} />
              </Field>
              <Field label="Standard report" wide>
                <select
                  value={scheduleDraft.reportId}
                  onChange={(e) => setScheduleDraft((c) => ({ ...c, reportId: e.target.value, reportKind: "standard" }))}
                >
                  {catalog.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Frequency">
                <select value={scheduleDraft.frequency} onChange={(e) => setScheduleDraft((c) => ({ ...c, frequency: e.target.value }))}>
                  {frequencies.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Status">
                <select value={scheduleDraft.status} onChange={(e) => setScheduleDraft((c) => ({ ...c, status: e.target.value }))}>
                  {scheduleStatuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Recipients (email stub)" wide>
                <input
                  value={scheduleDraft.recipients}
                  onChange={(e) => setScheduleDraft((c) => ({ ...c, recipients: e.target.value }))}
                  placeholder="chief@example.gov"
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !scheduleDraft.name}
                  onClick={() => run(
                    () => saveScheduledInspectionReport(departmentId, scheduleDraft, actor),
                    "Schedule saved (email delivery deferred)."
                  )}
                >
                  Save schedule
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "overview" ? (
          <>
            <div className="inspections-kpi-grid">
              {kpiCards.map((card) => {
                const value = board?.kpis?.[card.id];
                const display = card.id === "outstanding_fees" || card.id === "revenue_collected"
                  ? formatCurrency(value || 0)
                  : (value ?? 0);
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="inspections-kpi-card inspections-kpi-card-button"
                    onClick={() => onNavigate?.(card.drillNav)}
                  >
                    <span>{card.label}</span>
                    <strong>{display}</strong>
                  </button>
                );
              })}
            </div>
            <div className="inspection-chart-grid">
              <ChartBars title="Inspections by status" rows={board?.charts?.inspectionsByStatus || []} />
              <ChartBars title="Inspections by type" rows={board?.charts?.inspectionsByType || []} />
              <ChartBars title="Open violations by severity" rows={board?.charts?.violationsBySeverity || []} />
              <ChartBars title="Fee aging" rows={board?.charts?.feeAging || []} valueKey="count" />
            </div>
          </>
        ) : null}

        {!loading && tab === "standard" ? (
          <section className="panel">
            <header><div><FileBarChart2 size={15} /><strong>Standard report catalog</strong></div></header>
            <div className="panel-body">
              <div className="personnel-list">
                {filteredCatalog.map((row) => (
                  <div key={row.id} className="person-row">
                    <span>
                      <strong>{row.label}</strong>
                      <small className="occupancy-muted"> {row.description}</small>
                    </span>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={saving}
                      onClick={() => handleRunStandard(row.id)}
                    >
                      <Play size={14} /> Run
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "custom" ? (
          <section className="panel">
            <header>
              <div><strong>Saved custom reports</strong></div>
              <button
                className="secondary-button"
                type="button"
                disabled={saving}
                onClick={() => run(async () => {
                  const result = await runCustomInspectionReport(departmentId, customDraft);
                  setReportResult(result);
                  await recordInspectionReportRun(departmentId, {
                    reportId: "custom-preview",
                    reportName: result.name,
                    reportKind: "custom",
                    rowCount: result.rows.length,
                    format: "preview",
                  }, actor);
                }, "Custom preview ready.")}
              >
                <Play size={14} /> Preview current draft
              </button>
            </header>
            <div className="panel-body">
              {!(board?.savedReports || []).length ? (
                <InspectionEmptyState
                  title="No custom reports yet"
                  description="Save a custom definition to reuse field sets and filters."
                />
              ) : (
                <div className="personnel-list">
                  {(board.savedReports || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted"> {row.dataSource} · {(row.fields || []).join(", ")}</small>
                      </span>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={saving}
                        onClick={() => run(async () => {
                          const result = await runCustomInspectionReport(departmentId, row);
                          setReportResult(result);
                          await recordInspectionReportRun(departmentId, {
                            reportId: row.id,
                            reportName: result.name,
                            reportKind: "custom",
                            rowCount: result.rows.length,
                            format: "preview",
                          }, actor);
                        }, `Ran ${row.name}.`)}
                      >
                        <Play size={14} /> Run
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "scheduled" ? (
          <section className="panel">
            <header><div><strong>Scheduled reports</strong></div></header>
            <div className="panel-body">
              <p className="occupancy-muted">
                Schedules store frequency and recipients. Email delivery is stubbed — Run now executes the report and logs last run.
              </p>
              {!(board?.schedules || []).length ? (
                <InspectionEmptyState title="No schedules" description="Create a schedule to track recurring prevention reports." />
              ) : (
                <div className="personnel-list">
                  {(board.schedules || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.name}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.reportName || row.reportId} · {row.frequency} · {row.recipients || "no recipients"}
                        </small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={row.status} />
                        {canEdit ? (
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving}
                            onClick={() => run(async () => {
                              const { result } = await runScheduledInspectionReportNow(departmentId, row.id, actor);
                              setReportResult(result);
                            }, "Schedule run recorded.")}
                          >
                            <Play size={14} /> Run now
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {reportResult ? (
          <section className="panel">
            <header>
              <div>
                <strong>{reportResult.name}</strong>
                <small className="occupancy-muted"> {reportResult.rows.length} rows</small>
              </div>
              <div className="occupancy-detail-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadRowsAsCsv(`${reportResult.reportId || "report"}.csv`, reportResult.rows)}
                  disabled={!reportResult.rows.length}
                >
                  <Download size={14} /> CSV
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadJson(`${reportResult.reportId || "report"}.json`, reportResult)}
                >
                  <Download size={14} /> JSON
                </button>
              </div>
            </header>
            <div className="panel-body">
              {!reportResult.rows.length ? (
                <p className="occupancy-muted">Report returned no rows.</p>
              ) : (
                <div className="table-wrap">
                  <table className="inspections-table">
                    <thead>
                      <tr>
                        {(reportResult.columns || Object.keys(reportResult.rows[0] || {})).map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reportResult.rows.slice(0, 100).map((row, index) => (
                        <tr key={index}>
                          {(reportResult.columns || Object.keys(row)).map((col) => (
                            <td key={col}>{row[col] == null ? "—" : String(row[col])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && (board?.reportRuns || []).length ? (
          <section className="panel">
            <header><div><strong>Recent runs</strong></div></header>
            <div className="panel-body">
              <div className="personnel-list">
                {(board.reportRuns || []).slice(0, 10).map((row) => (
                  <div key={row.id} className="person-row">
                    <span>
                      <strong>{row.reportName || row.reportId}</strong>
                      <small className="occupancy-muted"> {row.reportKind} · {row.rowCount} rows</small>
                    </span>
                    <small className="occupancy-muted">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</small>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
