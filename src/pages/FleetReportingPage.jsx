import { useEffect, useMemo, useState } from "react";
import {
  Cable,
  CirclePlus,
  Download,
  FileBarChart2,
  GitBranch,
  LayoutDashboard,
  Play,
  Settings2,
  Zap,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildReportingCommandBoard,
  canEditFleetReporting,
  canViewFleetReporting,
  downloadJson,
  downloadRowsAsCsv,
  ensureFleetAssets,
  getAutomationActions,
  getAutomationStatuses,
  getAutomationTriggers,
  getIntegrationAdapterTypes,
  getReportDataSources,
  getStandardReportCatalog,
  getWorkflowTemplates,
  recordReportRun,
  runAutomation,
  runCustomReport,
  runStandardReport,
  saveAutomation,
  saveCadMapping,
  saveIntegrationAdapter,
  saveNerisMapping,
  saveSavedReport,
  saveWorkflow,
  testIntegrationAdapter,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function FleetReportingPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetReporting(permissions, isCreator);
  const canEdit = canEditFleetReporting(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("dashboard");
  const [board, setBoard] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState("");
  const [customDraft, setCustomDraft] = useState({
    name: "Custom fleet report",
    dataSource: "assets",
    fields: ["fleetNumber", "type", "station", "status"],
    sortBy: "fleetNumber",
    sortDir: "asc",
    groupBy: "",
    filters: { status: "", station: "" },
  });
  const [automationDraft, setAutomationDraft] = useState({
    name: "",
    trigger: "critical_defect",
    action: "escalate",
    status: "draft",
    description: "",
  });
  const [workflowDraft, setWorkflowDraft] = useState({
    name: "",
    templateId: "defect_review",
    status: "draft",
  });
  const [nerisDraft, setNerisDraft] = useState({
    fleetAssetId: "",
    nerisEntityId: "",
    nerisResourceId: "",
    resourceType: "",
    capability: "",
  });
  const [cadDraft, setCadDraft] = useState({
    fleetAssetId: "",
    cadUnitId: "",
    cadResourceType: "",
    availability: "available",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const catalog = getStandardReportCatalog();
  const dataSources = getReportDataSources();
  const triggers = getAutomationTriggers();
  const actions = getAutomationActions();
  const autoStatuses = getAutomationStatuses();
  const workflowTemplates = getWorkflowTemplates();
  const adapterTypes = getIntegrationAdapterTypes();

  const selectedSourceFields = useMemo(
    () => dataSources.find((row) => row.id === customDraft.dataSource)?.fields || [],
    [dataSources, customDraft.dataSource]
  );

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const next = await buildReportingCommandBoard(departmentId);
      setBoard(next);
      setSelectedId((c) => c || next.automations[0]?.id || next.workflows[0]?.id || "");
      setNerisDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
      setCadDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load reporting.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedAutomation = useMemo(
    () => (board?.automations || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );
  const selectedWorkflow = useMemo(
    () => (board?.workflows || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );

  async function exportResult(result, format = "csv") {
    if (!result?.rows) return;
    const base = (result.label || result.name || "fleet-report").replace(/\s+/g, "-").toLowerCase();
    if (format === "json") {
      downloadJson(`${base}.json`, result);
    } else {
      downloadRowsAsCsv(`${base}.csv`, result.rows);
    }
    await recordReportRun(departmentId, {
      reportId: result.reportId || "",
      reportName: result.label || result.name || "Report",
      rowCount: result.rowCount,
      exportFormat: format,
    }, actor).catch(() => null);
  }

  return (
    <FleetPermissionGate allowed={allowed} title="Reporting & Automation">
      <FleetModuleLayout
        title="Reporting & Automation"
        description="Command KPIs, standard and custom reports, automations, workflows, and NERIS/CAD/accounting adapters."
        activeNavName="Reporting & Automation"
        onNavigate={onNavigate}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading reporting...</p></div> : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        {message ? <div className="banner success" role="status">{message}</div> : null}

        {!loading && board ? (
          <section className="inspections-kpi-grid" style={{ marginBottom: "12px" }}>
            {[
              ["Active fleet", board.kpis.totalAssets, ""],
              ["In service", board.kpis.inService, ""],
              ["OOS", board.kpis.oos, board.kpis.oos ? "critical" : ""],
              ["Open defects", board.kpis.openDefects, board.kpis.criticalDefects ? "warn" : ""],
              ["Open WOs", board.kpis.openWorkOrders, ""],
              ["Availability", `${board.kpis.availability}%`, ""],
              ["YTD cost", money(board.kpis.annualCost), ""],
              ["Urgent replace", board.kpis.urgentReplacements, board.kpis.urgentReplacements ? "critical" : ""],
            ].map(([label, value, tone]) => (
              <article className={`inspections-kpi${tone ? ` ${tone}` : ""}`} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Reporting sections">
            {[
              ["dashboard", "Dashboard", LayoutDashboard],
              ["reports", "Standard reports", FileBarChart2],
              ["custom", "Custom builder", Settings2],
              ["automations", "Automations", Zap],
              ["workflows", "Workflows", GitBranch],
              ["integrations", "Integrations", Cable],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "dashboard" && board ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><strong>Operational snapshot</strong></div></header>
              <div className="panel-body">
                <dl className="detail-grid">
                  <div><dt>Reserve</dt><dd>{board.kpis.reserve}</dd></div>
                  <div><dt>Restricted</dt><dd>{board.kpis.restricted}</dd></div>
                  <div><dt>Critical defects</dt><dd>{board.kpis.criticalDefects}</dd></div>
                  <div><dt>Downtime hrs</dt><dd>{board.kpis.downtimeHours}</dd></div>
                  <div><dt>Open accidents</dt><dd>{board.kpis.openAccidents}</dd></div>
                  <div><dt>Open recalls</dt><dd>{board.kpis.openRecalls}</dd></div>
                  <div><dt>Warranty claims</dt><dd>{board.kpis.openWarrantyClaims}</dd></div>
                  <div><dt>Insurance expiring</dt><dd>{board.kpis.expiringInsurance}</dd></div>
                  <div><dt>Procurement open</dt><dd>{board.kpis.openProcurement}</dd></div>
                  <div><dt>NERIS mapped</dt><dd>{board.kpis.nerisMapped}</dd></div>
                  <div><dt>CAD mapped</dt><dd>{board.kpis.cadMapped}</dd></div>
                  <div><dt>Enabled automations</dt><dd>{board.kpis.enabledAutomations}</dd></div>
                </dl>
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Recent report runs</strong></div></header>
              <div className="panel-body">
                {(board.reportRuns || []).length ? (
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head"><span>Report</span><span>Rows</span><span>When</span></div>
                    {board.reportRuns.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.reportName || row.reportId}</strong>
                        <span>{row.rowCount}</span>
                        <span>{(row.createdAt || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No report runs yet.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "reports" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><strong>Standard reports</strong></div></header>
              <div className="panel-body">
                <div className="list-select">
                  {catalog.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        setError("");
                        try {
                          const result = await runStandardReport(departmentId, item.id);
                          setReportResult(result);
                          setMessage(`${result.label}: ${result.rowCount} rows`);
                        } catch (err) {
                          setError(err?.message || "Unable to run report.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      <strong>{item.label}</strong>
                      <span>{item.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
            <section className="panel">
              <header>
                <div><strong>{reportResult?.label || "Results"}</strong></div>
                {reportResult ? (
                  <div className="inspections-header-actions">
                    <button type="button" onClick={() => exportResult(reportResult, "csv")}><Download size={14} /> CSV</button>
                    <button type="button" onClick={() => exportResult(reportResult, "json")}><Download size={14} /> JSON</button>
                  </div>
                ) : null}
              </header>
              <div className="panel-body">
                {reportResult?.rows?.length ? (
                  <div className="cert-table" style={{ minWidth: 0, overflowX: "auto" }}>
                    <div className="cert-row cert-head">
                      {Object.keys(reportResult.rows[0]).map((key) => <span key={key}>{key}</span>)}
                    </div>
                    {reportResult.rows.slice(0, 50).map((row, index) => (
                      <div className="cert-row" key={index}>
                        {Object.values(row).map((value, i) => (
                          <span key={i}>{value == null || value === "" ? "—" : String(value)}</span>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : (
                  <FleetEmptyState title="Run a report" description="Select a standard report to preview rows, then export CSV or JSON." icon={FileBarChart2} />
                )}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "custom" ? (
          <section className="panel">
            <header>
              <div><strong>Custom report builder</strong></div>
              {canEdit ? (
                <div className="inspections-header-actions">
                  <button type="button" disabled={saving} onClick={async () => {
                    setSaving(true);
                    try {
                      await saveSavedReport(departmentId, customDraft, actor);
                      setMessage("Report definition saved.");
                      await reload();
                    } catch (err) {
                      setError(err?.message || "Unable to save report.");
                    } finally {
                      setSaving(false);
                    }
                  }}>Save definition</button>
                  <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                    setSaving(true);
                    try {
                      const result = await runCustomReport(departmentId, customDraft);
                      setReportResult(result);
                      setMessage(`Custom report: ${result.rowCount} rows`);
                    } catch (err) {
                      setError(err?.message || "Unable to run custom report.");
                    } finally {
                      setSaving(false);
                    }
                  }}><Play size={14} /> Run</button>
                </div>
              ) : null}
            </header>
            <div className="panel-body config-grid">
              <Field label="Name"><input value={customDraft.name} onChange={(e) => setCustomDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
              <Field label="Data source">
                <select
                  value={customDraft.dataSource}
                  onChange={(e) => {
                    const source = e.target.value;
                    const fields = dataSources.find((row) => row.id === source)?.fields || [];
                    setCustomDraft((c) => ({ ...c, dataSource: source, fields: fields.slice(0, 4), sortBy: fields[0] || "" }));
                  }}
                >
                  {dataSources.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Sort by">
                <select value={customDraft.sortBy} onChange={(e) => setCustomDraft((c) => ({ ...c, sortBy: e.target.value }))}>
                  {selectedSourceFields.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </Field>
              <Field label="Sort direction">
                <select value={customDraft.sortDir} onChange={(e) => setCustomDraft((c) => ({ ...c, sortDir: e.target.value }))}>
                  <option value="asc">Ascending</option>
                  <option value="desc">Descending</option>
                </select>
              </Field>
              <Field label="Group by">
                <select value={customDraft.groupBy} onChange={(e) => setCustomDraft((c) => ({ ...c, groupBy: e.target.value }))}>
                  <option value="">None</option>
                  {selectedSourceFields.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </Field>
              <Field label="Status filter"><input value={customDraft.filters.status} onChange={(e) => setCustomDraft((c) => ({ ...c, filters: { ...c.filters, status: e.target.value } }))} placeholder="optional" /></Field>
              <Field label="Station filter"><input value={customDraft.filters.station} onChange={(e) => setCustomDraft((c) => ({ ...c, filters: { ...c.filters, station: e.target.value } }))} placeholder="optional" /></Field>
              <div className="config-field wide">
                <span>Fields</span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                  {selectedSourceFields.map((field) => (
                    <label key={field} style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                      <input
                        type="checkbox"
                        checked={customDraft.fields.includes(field)}
                        onChange={(e) => {
                          setCustomDraft((c) => ({
                            ...c,
                            fields: e.target.checked
                              ? [...c.fields, field]
                              : c.fields.filter((f) => f !== field),
                          }));
                        }}
                      />
                      {field}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {reportResult?.rows && tab === "custom" ? (
              <div className="panel-body">
                <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                  <button type="button" onClick={() => exportResult(reportResult, "csv")}><Download size={14} /> CSV</button>
                  <button type="button" onClick={() => exportResult(reportResult, "json")}><Download size={14} /> JSON</button>
                </div>
                <p className="muted">{reportResult.rowCount} rows</p>
              </div>
            ) : null}
            {(board?.savedReports || []).length ? (
              <div className="panel-body">
                <strong>Saved definitions</strong>
                <ul>
                  {board.savedReports.map((row) => (
                    <li key={row.id}>
                      <button type="button" onClick={() => {
                        setCustomDraft({
                          name: row.name,
                          dataSource: row.dataSource,
                          fields: row.fields,
                          sortBy: row.sortBy,
                          sortDir: row.sortDir,
                          groupBy: row.groupBy,
                          filters: row.filters || { status: "", station: "" },
                        });
                      }}>{row.name}</button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && tab === "automations" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("automation")}><CirclePlus size={14} /> New automation</button>
              </div>
            ) : null}
            {(board?.automations || []).length ? (
              <section className="personnel-workspace occupancy-workspace">
                <section className="panel">
                  <header><div><strong>Automations</strong></div></header>
                  <div className="panel-body">
                    <div className="list-select">
                      {board.automations.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={selectedId === item.id ? "active" : ""}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <strong>{item.name}</strong>
                          <span>{triggers.find((t) => t.id === item.trigger)?.label || item.trigger}</span>
                          <FleetStatusBadge status={item.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <header><div><strong>Automation detail</strong></div></header>
                  <div className="panel-body">
                    {selectedAutomation ? (
                      <>
                        <p>{selectedAutomation.description || "No description."}</p>
                        <dl className="detail-grid">
                          <div><dt>Trigger</dt><dd>{triggers.find((t) => t.id === selectedAutomation.trigger)?.label}</dd></div>
                          <div><dt>Action</dt><dd>{actions.find((a) => a.id === selectedAutomation.action)?.label}</dd></div>
                          <div><dt>Runs</dt><dd>{selectedAutomation.runCount}</dd></div>
                          <div><dt>Last result</dt><dd>{selectedAutomation.lastRunResult || "—"}</dd></div>
                        </dl>
                        {canEdit ? (
                          <div className="inspections-header-actions" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                            <select
                              value={selectedAutomation.status}
                              onChange={async (e) => {
                                await saveAutomation(departmentId, { ...selectedAutomation, status: e.target.value }, actor);
                                await reload();
                              }}
                            >
                              {autoStatuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                            </select>
                            <button type="button" disabled={saving} onClick={async () => {
                              setSaving(true);
                              try {
                                const result = await runAutomation(departmentId, selectedAutomation.id, { dryRun: true }, actor);
                                setMessage(result.run.message);
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Dry run failed.");
                              } finally {
                                setSaving(false);
                              }
                            }}>Dry run</button>
                            <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                              setSaving(true);
                              try {
                                const result = await runAutomation(departmentId, selectedAutomation.id, { dryRun: false }, actor);
                                setMessage(result.run.message);
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Run failed.");
                              } finally {
                                setSaving(false);
                              }
                            }}><Play size={14} /> Run</button>
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="muted">Select an automation.</p>
                    )}
                    {(board.automationRuns || []).length ? (
                      <div style={{ marginTop: "16px" }}>
                        <strong>Recent runs</strong>
                        <div className="cert-table" style={{ minWidth: 0, marginTop: "8px" }}>
                          <div className="cert-row cert-head"><span>Automation</span><span>Matches</span><span>Mode</span></div>
                          {board.automationRuns.slice(0, 10).map((row) => (
                            <div className="cert-row" key={row.id}>
                              <strong>{row.automationName}</strong>
                              <span>{row.matchedCount}</span>
                              <span>{row.dryRun ? "dry run" : "live"}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </section>
              </section>
            ) : (
              <FleetEmptyState title="No automations" description="Seeded starters cover critical defects, PM overdue, and replacement thresholds." icon={Zap} />
            )}
          </>
        ) : null}

        {!loading && tab === "workflows" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("workflow")}><CirclePlus size={14} /> New workflow</button>
              </div>
            ) : null}
            {(board?.workflows || []).length ? (
              <section className="personnel-workspace occupancy-workspace">
                <section className="panel">
                  <header><div><strong>Workflows</strong></div></header>
                  <div className="panel-body">
                    <div className="list-select">
                      {board.workflows.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={selectedId === item.id ? "active" : ""}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <strong>{item.name}</strong>
                          <span>v{item.version}</span>
                          <FleetStatusBadge status={item.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <header><div><strong>Nodes</strong></div></header>
                  <div className="panel-body">
                    {selectedWorkflow ? (
                      <ol>
                        {selectedWorkflow.nodes.map((node) => (
                          <li key={node.id}><strong>{node.type}</strong> — {node.label}</li>
                        ))}
                      </ol>
                    ) : (
                      <p className="muted">Select a workflow.</p>
                    )}
                    <p className="muted" style={{ marginTop: "12px" }}>
                      Templates: {workflowTemplates.map((t) => t.label).join(", ")}
                    </p>
                  </div>
                </section>
              </section>
            ) : (
              <FleetEmptyState title="No workflows" description="Versioned workflows for defect review, OOS, procurement, and disposal." icon={GitBranch} />
            )}
          </>
        ) : null}

        {!loading && tab === "integrations" ? (
          <>
            <section className="panel" style={{ marginBottom: "12px" }}>
              <header>
                <div><strong>Adapters</strong></div>
                {canEdit ? (
                  <button type="button" onClick={() => setModal("adapter")}><CirclePlus size={14} /> Add adapter</button>
                ) : null}
              </header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Name</span><span>Type</span><span>Status</span><span>Last test</span><span />
                  </div>
                  {(board?.adapters || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.name}</strong>
                      <span>{adapterTypes.find((t) => t.id === row.adapterType)?.label || row.adapterType}</span>
                      <FleetStatusBadge status={row.status} />
                      <span>{row.lastTestResult || "—"}</span>
                      {canEdit ? (
                        <button type="button" disabled={saving} onClick={async () => {
                          setSaving(true);
                          try {
                            const next = await testIntegrationAdapter(departmentId, row.id, actor);
                            setMessage(next.lastTestResult);
                            await reload();
                          } catch (err) {
                            setError(err?.message || "Test failed.");
                          } finally {
                            setSaving(false);
                          }
                        }}>Test</button>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><strong>NERIS mappings</strong></div>
                  {canEdit ? <button type="button" onClick={() => setModal("neris")}><CirclePlus size={14} /> Map</button> : null}
                </header>
                <div className="panel-body">
                  {(board?.neris || []).length ? (
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head"><span>Unit</span><span>Entity</span><span>Resource</span><span>Type</span></div>
                      {board.neris.map((row) => (
                        <div className="cert-row" key={row.id}>
                          <strong>{row.fleetNumber}</strong>
                          <span>{row.nerisEntityId || "—"}</span>
                          <span>{row.nerisResourceId || "—"}</span>
                          <span>{row.resourceType || "—"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">No NERIS mappings yet. Forge remains source of truth; mappings are versioned separately.</p>
                  )}
                </div>
              </section>
              <section className="panel">
                <header>
                  <div><strong>CAD mappings</strong></div>
                  {canEdit ? <button type="button" onClick={() => setModal("cad")}><CirclePlus size={14} /> Map</button> : null}
                </header>
                <div className="panel-body">
                  {(board?.cad || []).length ? (
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head"><span>Unit</span><span>CAD ID</span><span>Type</span><span>Availability</span></div>
                      {board.cad.map((row) => (
                        <div className="cert-row" key={row.id}>
                          <strong>{row.fleetNumber}</strong>
                          <span>{row.cadUnitId || "—"}</span>
                          <span>{row.cadResourceType || "—"}</span>
                          <span>{row.availability}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted">CAD unit IDs only — fleet OOS status is never overwritten by CAD sync.</p>
                  )}
                </div>
              </section>
            </section>
          </>
        ) : null}

        {modal === "automation" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>New automation</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Name"><input value={automationDraft.name} onChange={(e) => setAutomationDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Trigger">
                  <select value={automationDraft.trigger} onChange={(e) => setAutomationDraft((c) => ({ ...c, trigger: e.target.value }))}>
                    {triggers.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Action">
                  <select value={automationDraft.action} onChange={(e) => setAutomationDraft((c) => ({ ...c, action: e.target.value }))}>
                    {actions.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Description"><textarea rows={2} value={automationDraft.description} onChange={(e) => setAutomationDraft((c) => ({ ...c, description: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !automationDraft.name} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveAutomation(departmentId, automationDraft, actor);
                    setMessage("Automation saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save automation.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "workflow" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>New workflow</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Name"><input value={workflowDraft.name} onChange={(e) => setWorkflowDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Template">
                  <select value={workflowDraft.templateId} onChange={(e) => setWorkflowDraft((c) => ({ ...c, templateId: e.target.value }))}>
                    {workflowTemplates.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !workflowDraft.name} onClick={async () => {
                  setSaving(true);
                  try {
                    const template = workflowTemplates.find((row) => row.id === workflowDraft.templateId);
                    await saveWorkflow(departmentId, {
                      ...workflowDraft,
                      nodes: [
                        { id: "n1", type: "start", label: "Start" },
                        { id: "n2", type: "task", label: template?.label || "Process" },
                        { id: "n3", type: "approval", label: "Approval" },
                        { id: "n4", type: "end", label: "End" },
                      ],
                      status: "draft",
                    }, actor);
                    setMessage("Workflow saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save workflow.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "adapter" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add integration adapter</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Name"><input id="adapter-name" defaultValue="" /></Field>
                <Field label="Type">
                  <select id="adapter-type" defaultValue="webhook">
                    {adapterTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Endpoint"><input id="adapter-endpoint" defaultValue="" placeholder="https://..." /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    const name = document.getElementById("adapter-name")?.value || "Adapter";
                    const adapterType = document.getElementById("adapter-type")?.value || "webhook";
                    const endpoint = document.getElementById("adapter-endpoint")?.value || "";
                    await saveIntegrationAdapter(departmentId, { name, adapterType, endpoint, status: "draft" }, actor);
                    setMessage("Adapter saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save adapter.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "neris" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>NERIS mapping</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={nerisDraft.fleetAssetId} onChange={(e) => setNerisDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="NERIS entity ID"><input value={nerisDraft.nerisEntityId} onChange={(e) => setNerisDraft((c) => ({ ...c, nerisEntityId: e.target.value }))} /></Field>
                <Field label="NERIS resource ID"><input value={nerisDraft.nerisResourceId} onChange={(e) => setNerisDraft((c) => ({ ...c, nerisResourceId: e.target.value }))} /></Field>
                <Field label="Resource type"><input value={nerisDraft.resourceType} onChange={(e) => setNerisDraft((c) => ({ ...c, resourceType: e.target.value }))} /></Field>
                <Field label="Capability"><input value={nerisDraft.capability} onChange={(e) => setNerisDraft((c) => ({ ...c, capability: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveNerisMapping(departmentId, { ...nerisDraft, validated: true, lastValidatedAt: new Date().toISOString() }, actor);
                    setMessage("NERIS mapping saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save NERIS mapping.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "cad" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>CAD mapping</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={cadDraft.fleetAssetId} onChange={(e) => setCadDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="CAD unit ID"><input value={cadDraft.cadUnitId} onChange={(e) => setCadDraft((c) => ({ ...c, cadUnitId: e.target.value }))} /></Field>
                <Field label="CAD resource type"><input value={cadDraft.cadResourceType} onChange={(e) => setCadDraft((c) => ({ ...c, cadResourceType: e.target.value }))} /></Field>
                <Field label="Availability">
                  <select value={cadDraft.availability} onChange={(e) => setCadDraft((c) => ({ ...c, availability: e.target.value }))}>
                    <option value="available">Available</option>
                    <option value="committed">Committed</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveCadMapping(departmentId, cadDraft, actor);
                    setMessage("CAD mapping saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save CAD mapping.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
