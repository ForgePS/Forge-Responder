import { useEffect, useState } from "react";
import { ArrowRightLeft, RotateCcw, ShieldCheck } from "lucide-react";
import {
  formatMigrationReconciliationSummary,
  listMigrationReports,
  loadFleetSettings,
  rollbackApparatusMigration,
  runApparatusMigration,
  setLegacyApparatusCutover,
} from "../../lib/fleet/index.js";

/**
 * Phase 3 Migration Center — dry-run, apply, reconcile, rollback, cutover flags.
 */
export default function FleetMigrationPanel({
  departmentId,
  actor,
  apparatusFallback = [],
  workOrderFallback = [],
  onMessage,
  onError,
  onSettingsChange,
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [lastReport, setLastReport] = useState(null);

  async function reload() {
    if (!departmentId) return;
    setLoading(true);
    try {
      const [nextSettings, nextReports] = await Promise.all([
        loadFleetSettings(departmentId),
        listMigrationReports(departmentId),
      ]);
      setSettings(nextSettings);
      setReports(nextReports);
      setSelectedReportId((current) => current || nextReports[0]?.id || "");
      onSettingsChange?.(nextSettings);
    } catch (loadError) {
      onError?.(loadError?.message || "Unable to load migration center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId]);

  const selectedReport = reports.find((row) => row.id === selectedReportId) || lastReport;
  const summary = selectedReport ? formatMigrationReconciliationSummary(selectedReport) : null;

  async function runMigration(dryRun) {
    setBusy(true);
    onError?.("");
    onMessage?.("");
    try {
      const report = await runApparatusMigration(departmentId, {
        dryRun,
        apparatusFallback,
        workOrderFallback,
        batchSize: 200,
      }, actor);
      setLastReport(report);
      setReports((current) => [report, ...current.filter((row) => row.id !== report.id)]);
      setSelectedReportId(report.id);
      const label = dryRun ? "Dry run" : "Migration apply";
      onMessage?.(
        `${label} complete: ${report.created} create, ${report.updated} update, ${report.skipped} skip, ${report.aliasCount} aliases.`
      );
      const nextSettings = await loadFleetSettings(departmentId);
      setSettings(nextSettings);
      onSettingsChange?.(nextSettings);
    } catch (runError) {
      onError?.(runError?.message || "Migration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback() {
    const batchId = selectedReport?.migrationBatchId;
    if (!batchId || selectedReport?.mode !== "apply") {
      onError?.("Select an apply migration report to roll back.");
      return;
    }
    if (!window.confirm(`Roll back migration batch ${batchId}? Migrated fleet assets from this batch will be deleted. Classic apparatus lists are never deleted.`)) {
      return;
    }
    setBusy(true);
    onError?.("");
    try {
      const result = await rollbackApparatusMigration(departmentId, batchId, actor);
      onMessage?.(
        `Rollback complete: removed ${result.deletedAssets} assets and ${result.deletedAliases} aliases. Legacy writes unlocked.`
      );
      await reload();
    } catch (rollbackError) {
      onError?.(rollbackError?.message || "Rollback failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCutover(partial) {
    setBusy(true);
    onError?.("");
    try {
      const next = await setLegacyApparatusCutover(departmentId, partial, actor);
      setSettings(next);
      onSettingsChange?.(next);
      onMessage?.(
        `Cutover updated — lock=${next.legacyApparatusWritesLocked ? "on" : "off"}, redirect=${next.redirectApparatusToFleetAssets ? "on" : "off"}.`
      );
    } catch (cutoverError) {
      onError?.(cutoverError?.message || "Unable to update cutover flags.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div className="inspections-loading-state" role="status"><p>Loading migration center...</p></div>;
  }

  return (
    <section className="fleet-migration-panel">
      <section className="panel">
        <header>
          <div><ArrowRightLeft size={15} /><strong>Legacy apparatus migration</strong></div>
        </header>
        <div className="panel-body config-studio-body">
          <p className="occupancy-muted">
            Dry-run first. Apply writes fleetAssets + aliases and keeps the classic apparatus list intact.
            Lock legacy writes only after reviewing the reconciliation report.
          </p>
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" disabled={busy} onClick={() => runMigration(true)}>
              Dry run
            </button>
            <button className="primary-button" type="button" disabled={busy} onClick={() => runMigration(false)}>
              Apply migration
            </button>
            <button className="secondary-button" type="button" disabled={busy} onClick={handleRollback}>
              <RotateCcw size={14} /> Rollback selected apply
            </button>
          </div>

          {settings ? (
            <div className="occupancy-form-grid" style={{ marginTop: "12px" }}>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(settings.redirectApparatusToFleetAssets)}
                  disabled={busy}
                  onChange={(e) => handleCutover({ redirect: e.target.checked })}
                />
                Redirect Apparatus nav → All Fleet Assets
              </label>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(settings.legacyApparatusWritesLocked)}
                  disabled={busy}
                  onChange={(e) => handleCutover({ lock: e.target.checked })}
                />
                Lock classic Apparatus list edits
              </label>
            </div>
          ) : null}
        </div>
      </section>

      {summary ? (
        <section className="panel" style={{ marginTop: "12px" }}>
          <header>
            <div><ShieldCheck size={15} /><strong>Reconciliation</strong></div>
            <span className="inspections-count">{selectedReport?.id}</span>
          </header>
          <div className="panel-body">
            <p><strong>{summary.headline}</strong></p>
            <div className="inspections-kpi-grid">
              {Object.entries(summary.counts).map(([label, value]) => (
                <article key={label} className="inspections-kpi-card">
                  <span>{label}</span>
                  <strong>{value}</strong>
                </article>
              ))}
            </div>
            {summary.warnings.length ? (
              <ul className="occupancy-timeline">
                {summary.warnings.map((warning) => (
                  <li key={warning}><strong>Warning</strong><p>{warning}</p></li>
                ))}
              </ul>
            ) : (
              <p className="occupancy-muted">No reconciliation warnings.</p>
            )}
            {selectedReport?.rows?.length ? (
              <div className="cert-table" style={{ marginTop: "12px" }}>
                <div className="cert-row cert-head">
                  <span>Unit</span>
                  <span>Legacy id</span>
                  <span>Action</span>
                  <span>Result</span>
                  <span>Unmapped</span>
                </div>
                {selectedReport.rows.slice(0, 40).map((row) => (
                  <div className="cert-row" key={`${row.legacyId}-${row.result}`}>
                    <strong>{row.unit || "—"}</strong>
                    <span>{row.legacyId}</span>
                    <span>{row.action}</span>
                    <span>{row.result || "—"}</span>
                    <span>{(row.unmappedKeys || []).length || 0}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: "12px" }}>
        <header><div><strong>Migration reports</strong></div></header>
        <div className="panel-body">
          {!reports.length ? (
            <p className="occupancy-muted">No migration reports yet.</p>
          ) : (
            <div className="personnel-list">
              {reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  className={report.id === selectedReportId ? "person-row selected" : "person-row"}
                  onClick={() => setSelectedReportId(report.id)}
                >
                  <span>
                    <strong>{report.mode} · {report.status}</strong>
                    <small>
                      {report.startedAt ? new Date(report.startedAt).toLocaleString() : "—"}
                      {" · "}
                      batch {report.migrationBatchId}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
