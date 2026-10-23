import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import { getAppCheckStatus } from "../lib/firebaseClient.js";
import {
  canManageFleetConfig,
  canViewFleetDashboard,
  clearOfflineQueue,
  downloadPermissionMatrixCsv,
  getOfflineQueueSummary,
  listHardeningCheckRuns,
  loadFleetSettings,
  resolveOfflineConflict,
  runFleetHardeningChecks,
  runFleetLoadSmoke,
  saveHardeningCheckRun,
  saveFleetSettings,
} from "../lib/fleet/index.js";

export default function FleetHardeningPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canManageFleetConfig(permissions, isCreator)
    || canViewFleetDashboard(permissions, isCreator);
  const canEdit = canManageFleetConfig(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("readiness");
  const [board, setBoard] = useState(null);
  const [runs, setRuns] = useState([]);
  const [offline, setOffline] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loadResult, setLoadResult] = useState(null);
  const [appCheck, setAppCheck] = useState(() => getAppCheckStatus());

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextBoard, nextRuns, nextSettings] = await Promise.all([
        runFleetHardeningChecks(departmentId),
        listHardeningCheckRuns(departmentId).catch(() => []),
        loadFleetSettings(departmentId),
      ]);
      setBoard(nextBoard);
      setRuns(nextRuns);
      setSettings(nextSettings);
      setOffline(getOfflineQueueSummary(departmentId));
      setAppCheck(getAppCheckStatus());
    } catch (loadError) {
      setError(loadError?.message || "Unable to run hardening checks.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  return (
    <FleetPermissionGate allowed={allowed} title="Fleet Hardening">
      <FleetModuleLayout
        title="Fleet Hardening"
        description="Production readiness, offline conflicts, accessibility/security checks, documentation, and cutover controls."
        activeNavName="Fleet Hardening"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="inspections-header-actions">
            <button type="button" disabled={saving} onClick={() => downloadPermissionMatrixCsv()}>
              <Download size={14} /> Permission matrix
            </button>
            <button type="button" disabled={saving || loading} onClick={reload}>
              <RefreshCw size={14} /> Re-run checks
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={saving || !board}
              onClick={async () => {
                setSaving(true);
                try {
                  await saveHardeningCheckRun(departmentId, board, actor);
                  setMessage("Hardening snapshot saved.");
                  await reload();
                } catch (err) {
                  setError(err?.message || "Unable to save snapshot.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <ShieldCheck size={14} /> Save snapshot
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Running hardening checks...</p></div> : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        {message ? <div className="banner success" role="status">{message}</div> : null}

        {!loading && board ? (
          <section className="inspections-kpi-grid" style={{ marginBottom: "12px" }} aria-label="Hardening summary">
            {[
              ["Pass", board.summary.pass, ""],
              ["Warn", board.summary.warn, board.summary.warn ? "warn" : ""],
              ["Fail", board.summary.fail, board.summary.fail ? "critical" : ""],
              ["Assets", board.assets, ""],
              ["Offline queue", board.offline?.queued || 0, board.offline?.queued ? "warn" : ""],
              ["Cutover ready", board.readyForCutover ? "Yes" : "Not yet", board.readyForCutover ? "" : "warn"],
            ].map(([label, value, tone]) => (
              <article className={`inspections-kpi${tone ? ` ${tone}` : ""}`} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Hardening sections">
            {[
              ["readiness", "Readiness"],
              ["offline", "Offline"],
              ["load", "Load / App Check"],
              ["cutover", "Cutover"],
              ["docs", "Documentation"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "readiness" && board ? (
          <section className="panel">
            <header><div><strong>Definition of done checks</strong></div></header>
            <div className="panel-body">
              <div className="cert-table" style={{ minWidth: 0 }}>
                <div className="cert-row cert-head">
                  <span>Check</span><span>Category</span><span>Status</span><span>Detail</span>
                </div>
                {board.checks.map((row) => (
                  <div className="cert-row" key={row.id}>
                    <strong>{row.label}</strong>
                    <span>{row.category}</span>
                    <FleetStatusBadge status={row.status} />
                    <span>{row.detail}</span>
                  </div>
                ))}
              </div>
              {runs.length ? (
                <div style={{ marginTop: "16px" }}>
                  <strong>Saved snapshots</strong>
                  <ul>
                    {runs.slice(0, 8).map((row) => (
                      <li key={row.id}>
                        {row.id} · {(row.createdAt || "").slice(0, 16).replace("T", " ")} ·{" "}
                        {row.readyForCutover ? "READY" : "NOT READY"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </section>
        ) : null}

        {!loading && tab === "offline" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><strong>Offline mutation queue</strong></div>
                {canEdit ? (
                  <button type="button" onClick={() => {
                    clearOfflineQueue(departmentId);
                    setOffline(getOfflineQueueSummary(departmentId));
                    setMessage("Offline queue cleared.");
                  }}>Clear queue</button>
                ) : null}
              </header>
              <div className="panel-body">
                {(offline?.queue || []).length ? (
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>ID</span><span>Collection</span><span>Record</span><span>Queued</span>
                    </div>
                    {offline.queue.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.id}</strong>
                        <span>{row.collection}</span>
                        <span>{row.recordId}</span>
                        <span>{(row.clientUpdatedAt || "").slice(0, 16).replace("T", " ")}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <FleetEmptyState title="Queue empty" description="Offline check drafts and queued mutations appear here when devices work offline." icon={WifiOff} />
                )}
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Conflicts</strong></div></header>
              <div className="panel-body">
                {(offline?.conflicts || []).filter((row) => row.status === "open").length ? (
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>ID</span><span>Reason</span><span>Actions</span>
                    </div>
                    {offline.conflicts.filter((row) => row.status === "open").map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.id}</strong>
                        <span>{row.message || row.reason}</span>
                        {canEdit ? (
                          <span style={{ display: "flex", gap: "6px" }}>
                            <button type="button" onClick={() => {
                              resolveOfflineConflict(departmentId, row.id, "keep_server", actor.actorName);
                              setOffline(getOfflineQueueSummary(departmentId));
                              setMessage("Kept server version.");
                            }}>Keep server</button>
                            <button type="button" onClick={() => {
                              resolveOfflineConflict(departmentId, row.id, "keep_local", actor.actorName);
                              setOffline(getOfflineQueueSummary(departmentId));
                              setMessage("Kept local version (apply manually on next sync).");
                            }}>Keep local</button>
                          </span>
                        ) : <span>—</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted"><CheckCircle2 size={14} aria-hidden /> No open conflicts.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "load" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><strong>App Check</strong></div>
              </header>
              <div className="panel-body">
                <dl className="detail-grid">
                  <div><dt>Configured</dt><dd>{appCheck?.configured ? "Yes" : "No (optional)"}</dd></div>
                  <div><dt>Active</dt><dd>{appCheck?.active ? "Yes" : "No"}</dd></div>
                  <div><dt>Provider</dt><dd>{appCheck?.provider || "—"}</dd></div>
                  <div><dt>Debug token</dt><dd>{appCheck?.debugTokenEnabled ? "Enabled" : "Off"}</dd></div>
                </dl>
                {appCheck?.error ? <p className="banner error" role="alert">{appCheck.error}</p> : null}
                <p className="muted" style={{ marginTop: "8px" }}>
                  Set <code>VITE_FIREBASE_APPCHECK_SITE_KEY</code> (and optional <code>VITE_FIREBASE_APPCHECK_PROVIDER</code> / <code>VITE_FIREBASE_APPCHECK_DEBUG_TOKEN</code>) then rebuild to enforce App Check.
                </p>
              </div>
            </section>
            <section className="panel">
              <header>
                <div><strong>Load smoke</strong></div>
                {canEdit ? (
                  <button
                    className="primary-button"
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      setError("");
                      try {
                        const result = await runFleetLoadSmoke(departmentId, { concurrency: 4, rounds: 3 });
                        setLoadResult(result);
                        setMessage(result.pass ? `Load smoke passed · p95 ${result.p95Ms}ms` : "Load smoke completed with failures.");
                      } catch (err) {
                        setError(err?.message || "Load smoke failed.");
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Run client smoke
                  </button>
                ) : null}
              </header>
              <div className="panel-body">
                <p className="muted">CLI: <code>npm run fleet:load-smoke</code></p>
                {loadResult ? (
                  <dl className="detail-grid">
                    <div><dt>Samples</dt><dd>{loadResult.sampleCount}</dd></div>
                    <div><dt>Success</dt><dd>{loadResult.successCount}</dd></div>
                    <div><dt>Failures</dt><dd>{loadResult.failureCount}</dd></div>
                    <div><dt>Avg</dt><dd>{loadResult.avgMs} ms</dd></div>
                    <div><dt>p95</dt><dd>{loadResult.p95Ms} ms</dd></div>
                    <div><dt>Result</dt><dd><FleetStatusBadge status={loadResult.pass ? "pass" : "fail"} /></dd></div>
                  </dl>
                ) : (
                  <p className="muted">No smoke run yet this session.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "cutover" && settings ? (
          <section className="panel">
            <header><div><strong>Cutover flags</strong></div></header>
            <div className="panel-body config-grid">
              <label className="config-field" style={{ flexDirection: "row", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  disabled={!canEdit || saving}
                  checked={Boolean(settings.legacyApparatusWritesLocked)}
                  onChange={async (e) => {
                    setSaving(true);
                    try {
                      const next = await saveFleetSettings(departmentId, {
                        ...settings,
                        legacyApparatusWritesLocked: e.target.checked,
                      }, actor);
                      setSettings(next);
                      setMessage("Updated legacy write lock.");
                      await reload();
                    } catch (err) {
                      setError(err?.message || "Unable to save settings.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
                <span>Lock classic Apparatus list writes</span>
              </label>
              <label className="config-field" style={{ flexDirection: "row", gap: "8px", alignItems: "center" }}>
                <input
                  type="checkbox"
                  disabled={!canEdit || saving}
                  checked={Boolean(settings.redirectApparatusToFleetAssets)}
                  onChange={async (e) => {
                    setSaving(true);
                    try {
                      const next = await saveFleetSettings(departmentId, {
                        ...settings,
                        redirectApparatusToFleetAssets: e.target.checked,
                      }, actor);
                      setSettings(next);
                      setMessage("Updated Apparatus redirect.");
                      await reload();
                    } catch (err) {
                      setError(err?.message || "Unable to save settings.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                />
                <span>Redirect Apparatus nav to All Fleet Assets</span>
              </label>
              <p className="muted">
                See docs/fleet/deployment-rollback.md for hosting/rules rollback. Disable these flags to reverse cutover without deleting fleetAssets.
              </p>
            </div>
          </section>
        ) : null}

        {!loading && tab === "docs" ? (
          <section className="panel">
            <header><div><strong>Documentation pack</strong></div></header>
            <div className="panel-body">
              <ul className="fleet-docs-list">
                <li><strong>Administrator</strong> — docs/fleet/admin-guide.md</li>
                <li><strong>Fleet manager</strong> — docs/fleet/fleet-manager-guide.md</li>
                <li><strong>Operator</strong> — docs/fleet/operator-guide.md</li>
                <li><strong>Technician</strong> — docs/fleet/technician-guide.md</li>
                <li><strong>Vendor portal</strong> — docs/fleet/vendor-portal-guide.md</li>
                <li><strong>Deployment / rollback</strong> — docs/fleet/deployment-rollback.md</li>
                <li><strong>Architecture</strong> — docs/fleet/architecture.md</li>
                <li><strong>Data model</strong> — docs/fleet/data-model.md</li>
                <li><strong>Permission matrix</strong> — docs/fleet/permission-matrix.md</li>
                <li><strong>Migration report</strong> — docs/fleet/migration-report.md</li>
                <li><strong>Phase 1 assessment</strong> — docs/fleet-existing-module-assessment.md</li>
              </ul>
              <p className="muted" style={{ marginTop: "12px" }}>
                App Check is optional via env; load smoke is available in Hardening and via <code>npm run fleet:load-smoke</code>.
              </p>
            </div>
          </section>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
