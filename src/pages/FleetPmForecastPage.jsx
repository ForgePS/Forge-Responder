import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CirclePlus, RefreshCw, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  applyPmProgramsToFleet,
  buildPmForecast,
  canEditFleetPm,
  canViewFleetPm,
  completePmSchedule,
  ensureFleetAssets,
  ensurePmProgramsSeeded,
  generateDuePmWorkOrders,
  generatePmWorkOrder,
} from "../lib/fleet/index.js";

export default function FleetPmForecastPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetPm(permissions, isCreator);
  const canEdit = canEditFleetPm(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, overdue: 0, dueNow: 0, dueSoon: 0, ok: 0, withOpenWo: 0 });
  const [programs, setPrograms] = useState([]);
  const [filter, setFilter] = useState("actionable");
  const [selectedId, setSelectedId] = useState("");

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
      await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const [nextPrograms, forecast] = await Promise.all([
        ensurePmProgramsSeeded(departmentId, actor),
        buildPmForecast(departmentId),
      ]);
      setPrograms(nextPrograms);
      setRows(forecast.rows);
      setSummary(forecast.summary);
      setSelectedId((current) => current || forecast.rows[0]?.id || "");
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load PM forecast.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "ok") return rows.filter((row) => row.status === "ok");
    return rows.filter((row) => ["overdue", "due_now", "due_soon"].includes(row.status));
  }, [rows, filter]);

  const selected = useMemo(
    () => rows.find((row) => row.id === selectedId) || null,
    [rows, selectedId]
  );

  function upsert(next) {
    setRows((current) => {
      const updated = [next, ...current.filter((row) => row.id !== next.id)];
      return updated;
    });
    setSelectedId(next.id);
  }

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="PM Forecast"
        description="Preventive maintenance due dates, overdue work, and auto work-order generation."
        activeNavName="PM Forecast"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  const created = await applyPmProgramsToFleet(departmentId, {}, actor);
                  setMessage(created.length
                    ? `Applied programs — ${created.length} new schedule(s).`
                    : "Programs already applied to eligible assets.");
                  await reload();
                } catch (applyError) {
                  setError(applyError?.message || "Unable to apply PM programs.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <CirclePlus size={14} /> Apply programs to fleet
            </button>
            <button
              className="primary-button"
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                setError("");
                try {
                  const results = await generateDuePmWorkOrders(departmentId, actor);
                  const fresh = results.filter((row) => !row.deduped).length;
                  const dupes = results.filter((row) => row.deduped).length;
                  setMessage(`Generated ${fresh} work order(s)${dupes ? ` · ${dupes} already open` : ""}.`);
                  await reload();
                } catch (genError) {
                  setError(genError?.message || "Unable to generate work orders.");
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Wrench size={14} /> Generate due WOs
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading PM forecast...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading ? (
          <section className="fleet-summary">
            {[
              ["Overdue", summary.overdue, "critical"],
              ["Due now", summary.dueNow, "warning"],
              ["Due soon", summary.dueSoon, "warning"],
              ["Current", summary.ok, "success"],
              ["Open WOs", summary.withOpenWo, "info"],
              ["Programs", programs.length, "info"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && !rows.length ? (
          <FleetEmptyState
            title="No PM schedules"
            description="Seed programs in Configuration Studio, then apply them to the fleet."
            icon={CalendarClock}
          />
        ) : null}

        {!loading && rows.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><CalendarClock size={15} /><strong>Forecast</strong></div>
                <div className="segmented-control">
                  {[
                    ["actionable", "Actionable"],
                    ["ok", "Current"],
                    ["all", "All"],
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </header>
              <div className="panel-body">
                <div className="personnel-list">
                  {visible.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={item.id === selectedId ? "person-row selected" : "person-row"}
                      onClick={() => setSelectedId(item.id)}
                    >
                      <span>
                        <strong>{item.fleetNumber || "No unit"}</strong>
                        <small>{item.programName} · {item.remainingLabel}</small>
                      </span>
                      <FleetStatusBadge status={item.status} />
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {selected ? (
              <section className="panel">
                <header>
                  <div><strong>{selected.programName}</strong></div>
                  <FleetStatusBadge status={selected.status} />
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Unit</span><strong>{selected.fleetNumber || "—"}</strong></div>
                    <div><span className="occupancy-muted">Trigger</span><strong>{selected.triggerType}</strong></div>
                    <div><span className="occupancy-muted">Interval</span><strong>{selected.intervalValue}</strong></div>
                    <div><span className="occupancy-muted">Next due (date)</span><strong>{selected.nextDueAt ? new Date(selected.nextDueAt).toLocaleDateString() : "—"}</strong></div>
                    <div><span className="occupancy-muted">Next due (meter)</span><strong>{selected.nextDueMeter || "—"}</strong></div>
                    <div><span className="occupancy-muted">Priority</span><strong>{selected.priority}</strong></div>
                    <div><span className="occupancy-muted">Open WO</span><strong>{selected.openWorkOrderId || "None"}</strong></div>
                    <div><span className="occupancy-muted">Est. hours</span><strong>{selected.estimatedHours || 0}</strong></div>
                  </div>

                  {(selected.tasks || []).length ? (
                    <ul className="occupancy-timeline">
                      {selected.tasks.map((task) => (
                        <li key={task.id || task.description}><strong>{task.description}</strong></li>
                      ))}
                    </ul>
                  ) : null}

                  {canEdit ? (
                    <div className="occupancy-detail-actions">
                      <button
                        className="primary-button"
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            const result = await generatePmWorkOrder(departmentId, selected.id, actor);
                            upsert(result.schedule);
                            setMessage(result.deduped
                              ? `Existing open WO ${result.workOrder.workOrderNumber}`
                              : `Created WO ${result.workOrder.workOrderNumber}`);
                            onNavigate?.("Fleet Work Orders");
                          } catch (woError) {
                            setError(woError?.message || "Unable to generate work order.");
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        <Wrench size={14} /> Create work order
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={saving}
                        onClick={async () => {
                          setSaving(true);
                          try {
                            const next = await completePmSchedule(departmentId, selected.id, {}, actor);
                            upsert(next);
                            setMessage("PM marked complete — next due rolled forward.");
                            const forecast = await buildPmForecast(departmentId);
                            setRows(forecast.rows);
                            setSummary(forecast.summary);
                          } catch (completeError) {
                            setError(completeError?.message || "Unable to complete PM.");
                          } finally {
                            setSaving(false);
                          }
                        }}
                      >
                        <RefreshCw size={14} /> Mark complete
                      </button>
                    </div>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
