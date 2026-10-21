import { useEffect, useMemo, useState } from "react";
import { Download, Layers, Search } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import HydrantDamageModuleLayout, {
  HydrantDamagePermissionGate,
  HydrantDamageStatusBadge,
} from "../components/hydrants/HydrantDamageModuleLayout.jsx";
import {
  buildHydrantDamageAnalytics,
  canCreateHydrantDamage,
  canSendHydrantDamage,
  canViewHydrantDamage,
  createBulkHydrantDamageReports,
  downloadCsv,
  exportHydrantDamageReportsCsv,
  getDamageCategoryOptions,
  getDamageSeverityOptions,
  listHydrantDamageReports,
  previewBulkDamageGrouping,
  sendBulkHydrantDamageReports,
} from "../lib/hydrantDamage/index.js";
import { loadTenantHydrantRecords, loadStaticHydrants } from "../lib/hydrantTenantService.js";
import { isOutOfServiceHydrant } from "../lib/hydrantCompletionStats.js";
import {
  hydrantRecordKey,
  listOutOfServiceHydrants,
} from "../components/hydrants/OutOfServiceHydrantList.jsx";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value }) {
  return (
    <div className="metric">
      <strong style={{ display: "block", fontSize: "1.25rem" }}>{value}</strong>
      <span className="occupancy-muted">{label}</span>
    </div>
  );
}

export default function HydrantDamageAnalyticsPage({ onNavigate }) {
  const { departmentId, profile } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewHydrantDamage(permissions, isCreator);
  const canCreate = canCreateHydrantDamage(permissions, isCreator);
  const canSend = canSendHydrantDamage(permissions, isCreator);

  const [tab, setTab] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reports, setReports] = useState([]);
  const [hydrants, setHydrants] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [hydrantFilter, setHydrantFilter] = useState("oos");
  const [preview, setPreview] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkDraft, setBulkDraft] = useState({
    description: "",
    severity: "moderate",
    suspectedCause: "Storm / freeze event",
    damageCategoryIds: ["frozen"],
    leaking: false,
    roadwayHazard: false,
    publicSafetyHazard: false,
    markReadyToSend: false,
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const departmentName = profile?.displayTitle || profile?.name || profile?.shortName || "";
  const categories = getDamageCategoryOptions();
  const severities = getDamageSeverityOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextReports, tenantHydrants, staticHydrants] = await Promise.all([
        listHydrantDamageReports(departmentId),
        loadTenantHydrantRecords(departmentId),
        loadStaticHydrants(departmentId),
      ]);
      setReports(nextReports);
      const merged = [...tenantHydrants];
      const seen = new Set(merged.map((row) => row.location_id || row.id));
      for (const row of staticHydrants) {
        const key = row.location_id || row.id;
        if (!seen.has(key)) merged.push(row);
      }
      setHydrants(merged);
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load analytics.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const analytics = useMemo(() => buildHydrantDamageAnalytics(reports), [reports]);

  const oosHydrants = useMemo(() => listOutOfServiceHydrants(hydrants), [hydrants]);

  const filteredHydrants = useMemo(() => {
    const source = hydrantFilter === "oos" ? oosHydrants : hydrants;
    const q = search.trim().toLowerCase();
    if (!q) return source.slice(0, 400);
    return source
      .filter((row) =>
        [row.location_id, row.hydrant_id, row.id, row.address, row.full_address, row.district, row.provider, row.water_assoc]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 400);
  }, [hydrants, oosHydrants, hydrantFilter, search]);

  const selectedHydrants = useMemo(() => {
    return hydrants.filter((row) => selectedKeys.has(hydrantRecordKey(row)));
  }, [hydrants, selectedKeys]);

  function toggleHydrant(key) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys((current) => {
      const next = new Set(current);
      for (const row of filteredHydrants) next.add(hydrantRecordKey(row));
      return next;
    });
  }

  function selectAllOutOfService() {
    setHydrantFilter("oos");
    setSelectedKeys(new Set(oosHydrants.map((row) => hydrantRecordKey(row))));
  }

  function clearHydrantSelection() {
    setSelectedKeys(new Set());
  }

  async function handlePreview() {
    if (!selectedHydrants.length) {
      setError("Select at least one hydrant.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const next = await previewBulkDamageGrouping(departmentId, selectedHydrants);
      setPreview(next);
      setMessage(`Preview ready: ${next.total} hydrants across ${next.groups.length} utility groups.`);
    } catch (previewError) {
      setError(previewError?.message || "Unable to preview grouping.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkCreate() {
    if (!canCreate) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await createBulkHydrantDamageReports(departmentId, {
        hydrants: selectedHydrants,
        ...bulkDraft,
        operationalStatus: bulkDraft.operationalStatus
          || (selectedHydrants.every((row) => isOutOfServiceHydrant(row)) ? "out_of_service" : undefined),
      }, actor);
      setBulkResults(result);
      setMessage(`Bulk create finished: ${result.succeeded} ok, ${result.failed} failed.`);
      await reload();
    } catch (createError) {
      setError(createError?.message || "Bulk create failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleBulkSendFailedOrReady() {
    if (!canSend || !bulkResults) return;
    const ids = bulkResults.results
      .filter((row) => row.ok && row.readyToSend)
      .map((row) => row.reportId);
    const failedIds = (bulkResults.sendResults || [])
      .filter((row) => !row.ok)
      .map((row) => row.reportId);
    const targetIds = failedIds.length ? failedIds : ids;
    if (!targetIds.length) {
      setError("No ready-to-send reports in the last bulk result. Mark ready on create or open individual reports.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const sendResult = await sendBulkHydrantDamageReports(departmentId, targetIds, {
        ...actor,
        departmentName,
      });
      setBulkResults((current) => ({ ...current, sendResults: sendResult.results, sendSummary: sendResult }));
      setMessage(`Bulk send finished: ${sendResult.succeeded} accepted, ${sendResult.failed} failed.`);
      await reload();
    } catch (sendError) {
      setError(sendError?.message || "Bulk send failed.");
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    const csv = exportHydrantDamageReportsCsv(reports);
    downloadCsv(csv, `hydrant-damage-${departmentId || "export"}.csv`);
    setMessage("CSV downloaded.");
  }

  return (
    <HydrantDamagePermissionGate allowed={allowed}>
      <HydrantDamageModuleLayout
        title="Damage Analytics & Bulk"
        description="KPIs, utility performance, CSV export, and bulk damage report creation with per-record results."
        activeNavName="Damage Analytics"
        onNavigate={onNavigate}
        actions={(
          <div className="occupancy-detail-actions">
            <button className={`secondary-button${tab === "dashboard" ? " active" : ""}`} type="button" onClick={() => setTab("dashboard")}>
              Dashboard
            </button>
            <button className={`secondary-button${tab === "bulk" ? " active" : ""}`} type="button" onClick={() => setTab("bulk")}>
              <Layers size={14} /> Bulk reports
            </button>
            <button className="secondary-button" type="button" onClick={handleExportCsv}>
              <Download size={14} /> Export CSV
            </button>
          </div>
        )}
      >
        {loading ? <p className="occupancy-muted">Loading…</p> : null}
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && tab === "dashboard" ? (
          <div className="inspections-module-body" style={{ display: "grid", gap: 14 }}>
            <div className="metrics" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10 }}>
              <Kpi label="Open" value={analytics.kpis.open} />
              <Kpi label="Out of service" value={analytics.kpis.outOfService} />
              <Kpi label="Critical" value={analytics.kpis.critical} />
              <Kpi label="Active leaks" value={analytics.kpis.activeLeaks} />
              <Kpi label="Awaiting ack" value={analytics.kpis.awaitingAcknowledgment} />
              <Kpi label="Ack overdue" value={analytics.kpis.acknowledgmentOverdue} />
              <Kpi label="Repair overdue" value={analytics.kpis.repairOverdue} />
              <Kpi label="Ready to verify" value={analytics.kpis.readyForVerification} />
              <Kpi label="Ownership review" value={analytics.kpis.unknownOwnership} />
              <Kpi label="Delivery failures" value={analytics.kpis.deliveryFailures} />
              <Kpi label="Avg ack time" value={analytics.kpis.averageAcknowledgment} />
              <Kpi label="Avg repair time" value={analytics.kpis.averageRepair} />
              <Kpi label="SLA compliance" value={analytics.kpis.slaCompliancePercent == null ? "—" : `${analytics.kpis.slaCompliancePercent}%`} />
            </div>

            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header><strong>By water company</strong></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {analytics.byCompany.slice(0, 20).map((row) => (
                      <div key={row.id} className="person-row">
                        <span>
                          <strong>{row.label}</strong>
                          <small>{row.open} open · {row.total} total · {row.overdue} overdue</small>
                        </span>
                      </div>
                    ))}
                    {!analytics.byCompany.length ? <p className="occupancy-muted">No company breakdown yet.</p> : null}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><strong>By district</strong></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {analytics.byDistrict.slice(0, 20).map((row) => (
                      <div key={row.id} className="person-row">
                        <span>
                          <strong>{row.label}</strong>
                          <small>{row.open} open · {row.total} total</small>
                        </span>
                      </div>
                    ))}
                    {!analytics.byDistrict.length ? <p className="occupancy-muted">No district breakdown yet.</p> : null}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><strong>Repeat-damage hydrants</strong></header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {analytics.repeatDamage.map((row) => (
                      <div key={row.hydrantId} className="person-row">
                        <span>
                          <strong>{row.hydrantId}</strong>
                          <small>{row.count} reports</small>
                        </span>
                      </div>
                    ))}
                    {!analytics.repeatDamage.length ? <p className="occupancy-muted">No repeat-damage hydrants yet.</p> : null}
                  </div>
                </div>
              </section>
            </section>
          </div>
        ) : null}

        {!loading && tab === "bulk" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><strong>Select hydrants</strong></div>
                <label className="config-inline-search">
                  <Search size={14} aria-hidden />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search hydrants" />
                </label>
              </header>
              <div className="panel-body">
                <div className="oos-hydrant-source-toggle" role="group" aria-label="Hydrant list source">
                  <button
                    type="button"
                    className={`secondary-button${hydrantFilter === "oos" ? " active" : ""}`}
                    onClick={() => setHydrantFilter("oos")}
                  >
                    Out of service ({oosHydrants.length})
                  </button>
                  <button
                    type="button"
                    className={`secondary-button${hydrantFilter === "all" ? " active" : ""}`}
                    onClick={() => setHydrantFilter("all")}
                  >
                    All hydrants ({hydrants.length})
                  </button>
                </div>
                <div className="occupancy-detail-actions" style={{ margin: "8px 0" }}>
                  <button className="secondary-button" type="button" onClick={selectAllOutOfService}>
                    Select all OOS
                  </button>
                  <button className="secondary-button" type="button" onClick={selectAllVisible}>
                    Select visible
                  </button>
                  <button className="secondary-button" type="button" onClick={clearHydrantSelection}>
                    Clear
                  </button>
                </div>
                <p className="occupancy-muted">
                  {selectedKeys.size} selected
                  {hydrantFilter === "oos" ? " · showing current out-of-service inventory" : ""}
                </p>
                <div className="personnel-list" style={{ maxHeight: 360, overflow: "auto" }}>
                  {filteredHydrants.map((row) => {
                    const key = hydrantRecordKey(row);
                    const checked = selectedKeys.has(key);
                    const oos = isOutOfServiceHydrant(row);
                    return (
                      <label key={key} className={checked ? "person-row selected" : "person-row"} style={{ cursor: "pointer" }}>
                        <span>
                          <strong>{key}{oos ? " · OOS" : ""}</strong>
                          <small>{row.address || row.full_address || "No address"}</small>
                        </span>
                        <input type="checkbox" checked={checked} onChange={() => toggleHydrant(key)} />
                      </label>
                    );
                  })}
                  {!filteredHydrants.length ? (
                    <p className="occupancy-muted">
                      {hydrantFilter === "oos"
                        ? "No out-of-service hydrants in current inventory."
                        : "No hydrants match this search."}
                    </p>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="panel">
              <header><strong>Shared details</strong></header>
              <div className="panel-body">
                <div className="occupancy-form-grid">
                  <Field label="Description" wide>
                    <textarea
                      rows={4}
                      value={bulkDraft.description}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, description: e.target.value }))}
                    />
                  </Field>
                  <Field label="Suspected cause" wide>
                    <input
                      value={bulkDraft.suspectedCause}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, suspectedCause: e.target.value }))}
                    />
                  </Field>
                  <Field label="Severity">
                    <select
                      value={bulkDraft.severity}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, severity: e.target.value }))}
                    >
                      {severities.map((row) => (
                        <option key={row.id} value={row.id}>{row.label}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="config-field wide">
                    <span>Categories</span>
                    <div className="checkbox-grid">
                      {categories.slice(0, 18).map((row) => {
                        const checked = bulkDraft.damageCategoryIds?.includes(row.id);
                        return (
                          <label key={row.id} className="checkbox-inline">
                            <input
                              type="checkbox"
                              checked={Boolean(checked)}
                              disabled={!canCreate}
                              onChange={(e) => {
                                setBulkDraft((current) => {
                                  const set = new Set(current.damageCategoryIds || []);
                                  if (e.target.checked) set.add(row.id);
                                  else set.delete(row.id);
                                  return { ...current, damageCategoryIds: [...set] };
                                });
                              }}
                            />
                            <span>{row.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={bulkDraft.leaking}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, leaking: e.target.checked }))}
                    />
                    <span>Leaking</span>
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={bulkDraft.roadwayHazard}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, roadwayHazard: e.target.checked }))}
                    />
                    <span>Roadway hazard</span>
                  </label>
                  <label className="checkbox-inline">
                    <input
                      type="checkbox"
                      checked={bulkDraft.markReadyToSend}
                      disabled={!canCreate}
                      onChange={(e) => setBulkDraft((c) => ({ ...c, markReadyToSend: e.target.checked }))}
                    />
                    <span>Mark ready to send when ownership is clear</span>
                  </label>
                </div>

                <div className="occupancy-detail-actions" style={{ marginTop: 12 }}>
                  <button className="secondary-button" type="button" disabled={saving || !selectedHydrants.length} onClick={handlePreview}>
                    Preview grouping
                  </button>
                  {canCreate ? (
                    <button className="primary-button" type="button" disabled={saving || !selectedHydrants.length} onClick={handleBulkCreate}>
                      Create {selectedHydrants.length || ""} reports
                    </button>
                  ) : null}
                  {canSend && bulkResults ? (
                    <button className="secondary-button" type="button" disabled={saving} onClick={handleBulkSendFailedOrReady}>
                      Send ready / retry failed
                    </button>
                  ) : null}
                </div>

                {preview ? (
                  <div style={{ marginTop: 14 }}>
                    <p className="occupancy-muted">
                      {preview.total} hydrants · {preview.groups.length} groups · {preview.ownershipReviewCount} need ownership review
                    </p>
                    <div className="personnel-list">
                      {preview.groups.map((group) => (
                        <div key={group.key} className="person-row">
                          <span>
                            <strong>{group.waterCompanyName}</strong>
                            <small>
                              {group.waterDistrictName || "No district"} · {group.count} hydrants
                              {group.ownershipReviewCount ? ` · ${group.ownershipReviewCount} review` : ""}
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {bulkResults ? (
                  <div style={{ marginTop: 14 }}>
                    <p className="occupancy-muted">
                      Create: {bulkResults.succeeded}/{bulkResults.attempted} ok
                      {bulkResults.sendSummary
                        ? ` · Send: ${bulkResults.sendSummary.succeeded}/${bulkResults.sendSummary.attempted} accepted`
                        : ""}
                    </p>
                    <div className="personnel-list" style={{ maxHeight: 240, overflow: "auto" }}>
                      {bulkResults.results.map((row) => (
                        <div key={`${row.hydrantId}-${row.reportId || row.error}`} className="person-row">
                          <span>
                            <strong>{row.hydrantId || row.reportId}</strong>
                            <small>
                              {row.ok
                                ? `${row.reportNumber} · ${row.status}${row.warning ? ` · ${row.warning}` : ""}`
                                : row.error}
                            </small>
                          </span>
                          <HydrantDamageStatusBadge status={row.ok ? "accepted" : "failed"} label={row.ok ? "OK" : "Failed"} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </section>
        ) : null}
      </HydrantDamageModuleLayout>
    </HydrantDamagePermissionGate>
  );
}
