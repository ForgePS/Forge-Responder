import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
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
  buildOccupancyImportTemplateCsv,
  buildViolationImportTemplateCsv,
  canManageInspectionHardening,
  canViewInspectionHardening,
  commitInspectionImport,
  downloadInspectionPermissionMatrixCsv,
  downloadTextFile,
  getAdminDocSections,
  getDeploymentChecklistItems,
  getImportRecordTypes,
  listInspectionImportBatches,
  loadInspectionHardeningBoard,
  markImportBatchRolledBack,
  previewInspectionImport,
  runInspectionDataReconciliation,
  runInspectionLoadSmoke,
  saveInspectionHardeningCheckRun,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

const TABS = [
  { id: "readiness", label: "Readiness" },
  { id: "import", label: "Import" },
  { id: "reconcile", label: "Reconciliation" },
  { id: "a11y", label: "Accessibility" },
  { id: "docs", label: "Documentation" },
];

export default function InspectionHardeningPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionHardening(permissions, isCreator);
  const canManage = canManageInspectionHardening(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("readiness");
  const [board, setBoard] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loadResult, setLoadResult] = useState(null);
  const [reconcile, setReconcile] = useState(null);

  const [recordType, setRecordType] = useState("occupancies");
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState("update");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const importTypes = getImportRecordTypes();
  const docs = getAdminDocSections();
  const deployItems = getDeploymentChecklistItems();
  const activeType = useMemo(
    () => importTypes.find((row) => row.id === recordType) || importTypes[0],
    [importTypes, recordType]
  );

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextBoard, nextBatches] = await Promise.all([
        loadInspectionHardeningBoard(departmentId),
        listInspectionImportBatches(departmentId),
      ]);
      setBoard(nextBoard);
      setBatches(nextBatches);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load hardening board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await fn();
      setMessage(typeof success === "function" ? success(result) : success);
      await reload();
      return result;
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file) {
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    const nextPreview = await previewInspectionImport(departmentId, {
      csvText: text,
      recordType,
    });
    setMapping(nextPreview.mapping);
    setPreview(nextPreview);
  }

  async function handlePreview() {
    setSaving(true);
    setError("");
    try {
      const nextPreview = await previewInspectionImport(departmentId, {
        csvText,
        recordType,
        mapping,
      });
      setMapping(nextPreview.mapping);
      setPreview(nextPreview);
      setMessage(`Preview ready: ${nextPreview.validation.validCount} valid · ${nextPreview.validation.errorCount} errors`);
    } catch (previewError) {
      setError(previewError?.message || "Preview failed.");
    } finally {
      setSaving(false);
    }
  }

  const a11yChecks = (board?.checks || []).filter((row) => row.category === "accessibility");
  const securityChecks = (board?.checks || []).filter((row) => row.category === "security");

  return (
    <InspectionPermissionGate allowed={allowed} title="Import & Data Quality">
      <InspectionsModuleLayout
        title="Import & Data Quality"
        description="CSV import with reconciliation, readiness checks, accessibility review, load smoke, and cutover docs."
        activeNavName="Import & Data Quality"
        onNavigate={onNavigate}
        tabs={PREVENTION_TOOL_TABS}
        actions={canManage ? (
          <div className="occupancy-detail-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => run(
                () => saveInspectionHardeningCheckRun(departmentId, board, actor),
                "Hardening run saved."
              )}
            >
              <ShieldCheck size={14} /> Save run
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => run(async () => {
                const result = await runInspectionLoadSmoke(departmentId);
                setLoadResult(result);
                return result;
              }, (result) => `Load smoke ${result.ok ? "passed" : "failed"} in ${result.totalMs}ms`)}
            >
              <RefreshCw size={14} /> Load smoke
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {loading ? <p className="occupancy-muted">Running readiness checks…</p> : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Pass", board?.summary?.pass || 0],
              ["Warn", board?.summary?.warn || 0],
              ["Fail", board?.summary?.fail || 0],
              ["Occupancies", board?.counts?.occupancies || 0],
              ["Inspections", board?.counts?.inspections || 0],
              ["Import batches", board?.counts?.importBatches || 0],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Hardening sections">
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

        {!loading && tab === "readiness" ? (
          <>
            <section className="panel">
              <header>
                <div><ShieldCheck size={15} /><strong>Production readiness</strong></div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadInspectionPermissionMatrixCsv()}
                >
                  <Download size={14} /> Permission matrix CSV
                </button>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {(board?.checks || []).map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.label}</strong>
                        <small className="occupancy-muted"> {row.category} · {row.detail}</small>
                      </span>
                      <InspectionStatusBadge status={row.status} />
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {loadResult ? (
              <section className="panel">
                <header>
                  <div>
                    <strong>Load smoke</strong>
                    <small className="occupancy-muted"> {loadResult.totalMs}ms · {loadResult.ok ? "ok" : "failed"}</small>
                  </div>
                </header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {loadResult.steps.map((row) => (
                      <div key={row.name} className="person-row">
                        <span>
                          <strong>{row.name}</strong>
                          <small className="occupancy-muted"> {row.detail}</small>
                        </span>
                        <span>{row.ms}ms · {row.ok ? "ok" : "fail"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {(board?.runs || []).length ? (
              <section className="panel">
                <header><div><strong>Saved runs</strong></div></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {(board.runs || []).slice(0, 8).map((row) => (
                      <div key={row.id} className="person-row">
                        <span>
                          <strong>{row.id}</strong>
                          <small className="occupancy-muted">
                            {" "}pass {row.summary?.pass || 0} · warn {row.summary?.warn || 0} · fail {row.summary?.fail || 0}
                          </small>
                        </span>
                        <small className="occupancy-muted">{formatWhen(row.createdAt)}</small>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {!loading && tab === "import" ? (
          <section className="panel">
            <header><div><UploadCloud size={15} /><strong>CSV import</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Record type">
                <select
                  value={recordType}
                  onChange={(e) => {
                    setRecordType(e.target.value);
                    setPreview(null);
                    setMapping({});
                  }}
                >
                  {importTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Duplicates">
                <select value={duplicateMode} onChange={(e) => setDuplicateMode(e.target.value)}>
                  <option value="update">Update existing</option>
                  <option value="skip">Skip existing</option>
                </select>
              </Field>
              <Field label="CSV file" wide>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => handleFile(e.target.files?.[0])}
                />
              </Field>
              <div className="occupancy-detail-actions" style={{ gridColumn: "1 / -1" }}>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadTextFile(
                    "occupancies-import-template.csv",
                    buildOccupancyImportTemplateCsv()
                  )}
                >
                  <Download size={14} /> Occupancy template
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => downloadTextFile(
                    "violations-import-template.csv",
                    buildViolationImportTemplateCsv()
                  )}
                >
                  <Download size={14} /> Violation template
                </button>
                <button className="secondary-button" type="button" disabled={saving || !csvText} onClick={handlePreview}>
                  Preview
                </button>
                {canManage ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={saving || !csvText}
                    onClick={() => run(
                      () => commitInspectionImport(departmentId, {
                        csvText,
                        recordType,
                        mapping,
                        fileName,
                        duplicateMode,
                      }, actor),
                      (batch) => `Import committed: +${batch.createdCount} ~${batch.updatedCount} skip ${batch.skippedCount}`
                    )}
                  >
                    Commit import
                  </button>
                ) : null}
              </div>

              {activeType ? (
                <p className="occupancy-muted" style={{ gridColumn: "1 / -1" }}>
                  Required: {activeType.requiredColumns.join(", ")}. Optional: {activeType.optionalColumns.join(", ")}.
                </p>
              ) : null}

              {preview ? (
                <>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <strong>Column mapping</strong>
                    <div className="occupancy-form-grid" style={{ marginTop: 8 }}>
                      {[...(activeType?.requiredColumns || []), ...(activeType?.optionalColumns || [])].map((field) => (
                        <Field key={field} label={field}>
                          <select
                            value={mapping[field] || ""}
                            onChange={(e) => setMapping((current) => ({ ...current, [field]: e.target.value }))}
                          >
                            <option value="">—</option>
                            {(preview.headers || []).map((header) => (
                              <option key={header} value={header}>{header}</option>
                            ))}
                          </select>
                        </Field>
                      ))}
                    </div>
                  </div>
                  <p className="occupancy-muted" style={{ gridColumn: "1 / -1" }}>
                    Valid {preview.validation.validCount} · errors {preview.validation.errorCount}
                    · duplicate hints {preview.duplicateHints}
                  </p>
                  {preview.validation.errors?.length ? (
                    <div className="personnel-list" style={{ gridColumn: "1 / -1" }}>
                      {preview.validation.errors.slice(0, 8).map((row) => (
                        <div key={`err-${row.row}`} className="person-row">
                          <span>
                            <strong>Row {row.row}</strong>
                            <small className="occupancy-muted"> {row.messages.join("; ")}</small>
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}

              <div style={{ gridColumn: "1 / -1" }}>
                <strong>Recent batches</strong>
                {!batches.length ? (
                  <InspectionEmptyState title="No import batches" description="Commit a CSV import to create a reconciliation record." />
                ) : (
                  <div className="personnel-list" style={{ marginTop: 8 }}>
                    {batches.slice(0, 10).map((row) => (
                      <div key={row.id} className="person-row">
                        <span>
                          <strong>{row.fileName || row.id}</strong>
                          <small className="occupancy-muted">
                            {" "}{row.recordType} · +{row.createdCount} ~{row.updatedCount} skip {row.skippedCount} err {row.errorCount}
                          </small>
                        </span>
                        <div className="occupancy-detail-actions">
                          <InspectionStatusBadge status={row.status} />
                          {canManage && !row.rolledBack ? (
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={saving}
                              onClick={() => run(
                                () => markImportBatchRolledBack(departmentId, row.id, actor),
                                "Batch flagged for rollback review."
                              )}
                            >
                              Flag rollback
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "reconcile" ? (
          <section className="panel">
            <header>
              <div><strong>Data reconciliation</strong></div>
              {canManage ? (
                <button
                  className="secondary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => run(async () => {
                    const result = await runInspectionDataReconciliation(departmentId);
                    setReconcile(result);
                    return result;
                  }, (result) => `Reconciled · orphan inspections ${result.issues.orphanInspections}`)}
                >
                  <RefreshCw size={14} /> Run reconciliation
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              {!reconcile ? (
                <InspectionEmptyState
                  title="No reconciliation run yet"
                  description="Detect orphan inspections/violations and duplicate occupancy keys."
                />
              ) : (
                <>
                  <div className="inspections-kpi-grid">
                    {[
                      ["Occupancies", reconcile.counts.occupancies],
                      ["Inspections", reconcile.counts.inspections],
                      ["Violations", reconcile.counts.violations],
                      ["Orphan inspections", reconcile.issues.orphanInspections],
                      ["Orphan violations", reconcile.issues.orphanViolations],
                      ["Duplicate keys", reconcile.issues.duplicateOccupancyKeys],
                    ].map(([label, value]) => (
                      <div key={label} className="inspections-kpi-card">
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="occupancy-muted">Generated {formatWhen(reconcile.generatedAt)}</p>
                </>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "a11y" ? (
          <section className="panel">
            <header><div><CheckCircle2 size={15} /><strong>Accessibility & security review</strong></div></header>
            <div className="panel-body">
              <p className="occupancy-muted">
                Automated client checks for keyboard nav, text status labels, labeled fields, tenant isolation, and audit coverage.
                Full WCAG audit and penetration testing remain manual release gates.
              </p>
              <div className="personnel-list">
                {[...a11yChecks, ...securityChecks].map((row) => (
                  <div key={row.id} className="person-row">
                    <span>
                      <strong>{row.label}</strong>
                      <small className="occupancy-muted"> {row.detail}</small>
                    </span>
                    <InspectionStatusBadge status={row.status} />
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "docs" ? (
          <>
            <section className="panel">
              <header><div><BookOpen size={15} /><strong>Administrator documentation</strong></div></header>
              <div className="panel-body">
                {docs.map((section) => (
                  <article key={section.id} style={{ marginBottom: 14 }}>
                    <strong>{section.title}</strong>
                    <p className="occupancy-muted">{section.body}</p>
                  </article>
                ))}
                <p className="occupancy-muted">Also see docs/inspections/ in the repository.</p>
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Deployment checklist</strong></div></header>
              <div className="panel-body">
                <ul className="config-reference-list">
                  {deployItems.map((item) => (
                    <li key={item}><CheckCircle2 size={14} /><span>{item}</span></li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
