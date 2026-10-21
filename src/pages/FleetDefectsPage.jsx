import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CirclePlus, Save, ShieldAlert, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  addDefectEvidence,
  applyFleetStatusDecision,
  canEditFleetDefects,
  canEditFleetWorkOrders,
  canManageFleetStatus,
  canViewFleetDefects,
  closeDefect,
  createDefect,
  createFleetWorkOrder,
  createReserveRequest,
  ensureDefectCategoriesSeeded,
  ensureFleetAssets,
  getDefaultDefectSeverities,
  listDefects,
  listReserveRequests,
  reopenDefect,
  updateDefect,
  updateReserveRequest,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetDefectsPage({ query = "", onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetDefects(permissions, isCreator);
  const canEdit = canEditFleetDefects(permissions, isCreator);
  const canStatus = canManageFleetStatus(permissions, isCreator);
  const canCreateWo = canEditFleetWorkOrders(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [reserveRequests, setReserveRequests] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createDraft, setCreateDraft] = useState({
    fleetAssetId: "",
    severity: "moderate",
    categoryId: "",
    description: "",
  });
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [resolution, setResolution] = useState("");
  const [restrictionText, setRestrictionText] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const severities = getDefaultDefectSeverities();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextAssets, nextCategories, nextDefects, nextReserves] = await Promise.all([
        ensureFleetAssets(departmentId, legacyApparatus, actor),
        ensureDefectCategoriesSeeded(departmentId, actor),
        listDefects(departmentId, { openOnly: false }),
        listReserveRequests(departmentId),
      ]);
      setAssets(nextAssets);
      setCategories(nextCategories);
      setRecords(nextDefects);
      setReserveRequests(nextReserves);
      setSelectedId((current) => current || nextDefects[0]?.id || "");
      setCreateDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        categoryId: c.categoryId || nextCategories[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load defects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selected = useMemo(
    () => records.find((row) => row.id === selectedId) || null,
    [records, selectedId]
  );

  const visible = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return records.filter((row) => !["closed", "rejected"].includes(row.status));
    return records.filter((row) => (
      [row.defectNumber, row.fleetNumber, row.description, row.severity, row.status, row.checkItemLabel]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [records, query]);

  function upsert(next) {
    setRecords((current) => [next, ...current.filter((row) => row.id !== next.id)]);
    setSelectedId(next.id);
  }

  async function handleCreate() {
    if (!canEdit || !createDraft.fleetAssetId || !createDraft.description.trim()) return;
    setSaving(true);
    setError("");
    try {
      const category = categories.find((row) => row.id === createDraft.categoryId);
      const created = await createDefect(departmentId, {
        fleetAssetId: createDraft.fleetAssetId,
        severity: createDraft.severity,
        categoryId: createDraft.categoryId,
        categoryName: category?.name || "",
        system: category?.system || "",
        description: createDraft.description.trim(),
        source: "manual",
      }, actor);
      upsert(created);
      setShowCreate(false);
      setCreateDraft((c) => ({ ...c, description: "" }));
      setMessage("Defect submitted.");
    } catch (createError) {
      setError(createError?.message || "Unable to create defect.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStatus(decision) {
    if (!selected || !canStatus) return;
    setSaving(true);
    setError("");
    try {
      await applyFleetStatusDecision(departmentId, {
        fleetAssetId: selected.fleetAssetId,
        decision,
        basis: `From defect ${selected.defectNumber}`,
        authority: actor.actorName,
        defectIds: [selected.id],
        restriction: decision === "restrict"
          ? (restrictionText || selected.restriction || "Restricted pending repair")
          : "",
      }, actor);
      const next = await updateDefect(departmentId, selected.id, {
        status: decision === "return_to_service" ? "ready_for_verification" : "accepted",
      }, actor);
      upsert(next);
      setMessage(`Status decision applied: ${decision}`);
    } catch (statusError) {
      setError(statusError?.message || "Unable to apply status decision.");
    } finally {
      setSaving(false);
    }
  }

  async function handleReserve() {
    if (!selected || !canStatus) return;
    setSaving(true);
    try {
      const reserve = assets.find((row) => (
        row.id !== selected.fleetAssetId && row.status === "reserve"
      )) || assets.find((row) => row.id !== selected.fleetAssetId);
      const request = await createReserveRequest(departmentId, {
        outOfServiceAssetId: selected.fleetAssetId,
        requestedReserveAssetId: reserve?.id || "",
        defectId: selected.id,
        reason: `Reserve needed — defect ${selected.defectNumber}`,
      }, actor);
      setReserveRequests((current) => [request, ...current]);
      const next = await updateDefect(departmentId, selected.id, {
        reserveRequestId: request.id,
      }, actor);
      upsert(next);
      setMessage("Reserve request created.");
    } catch (reserveError) {
      setError(reserveError?.message || "Unable to request reserve.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Fleet Defects"
        description="Defect lifecycle, severity, restrictions, OOS decisions, and reserve requests."
        activeNavName="Fleet Defects"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <CirclePlus size={14} /> Report defect
          </button>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading defects...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && !records.length ? (
          <FleetEmptyState
            title="No defects"
            description="Report a defect manually or complete a failed readiness check."
            icon={AlertTriangle}
          />
        ) : null}

        {!loading && records.length ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header>
                <div><AlertTriangle size={15} /><strong>Defects</strong></div>
                <span className="inspections-count">{visible.length}</span>
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
                        <strong>{item.defectNumber}</strong>
                        <small>
                          {item.fleetNumber || "No unit"} · {item.severity}
                          {item.checkItemLabel ? ` · ${item.checkItemLabel}` : ""}
                        </small>
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
                  <div><strong>{selected.defectNumber}</strong></div>
                  <FleetStatusBadge status={selected.severity} />
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Unit</span><strong>{selected.fleetNumber || "—"}</strong></div>
                    <div><span className="occupancy-muted">Status</span><strong>{selected.status}</strong></div>
                    <div><span className="occupancy-muted">Category</span><strong>{selected.categoryName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Source</span><strong>{selected.source}</strong></div>
                    <div><span className="occupancy-muted">Reported</span><strong>{selected.reportedAt ? new Date(selected.reportedAt).toLocaleString() : "—"}</strong></div>
                    <div><span className="occupancy-muted">OOS rec.</span><strong>{selected.oosRecommendation}</strong></div>
                  </div>
                  <p>{selected.description}</p>
                  {selected.activeRestriction || selected.restriction ? (
                    <p className="occupancy-muted">Restriction: {selected.restriction || selected.activeRestriction}</p>
                  ) : null}

                  {canEdit && !["closed", "rejected"].includes(selected.status) ? (
                    <>
                      {canCreateWo && !selected.workOrderId ? (
                        <div className="occupancy-detail-actions">
                          <button
                            className="primary-button"
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              setError("");
                              try {
                                const wo = await createFleetWorkOrder(departmentId, {
                                  fleetAssetId: selected.fleetAssetId,
                                  workOrderType: "defect",
                                  priority: selected.severity === "critical" || selected.severity === "high"
                                    ? selected.severity
                                    : "medium",
                                  complaint: selected.description,
                                  defectId: selected.id,
                                  source: "defect",
                                  oosRequired: selected.oosRecommendation === "immediate_oos",
                                  category: selected.categoryName || "",
                                }, actor);
                                const next = await updateDefect(departmentId, selected.id, {
                                  workOrderId: wo.id,
                                  status: "work_order_created",
                                }, actor);
                                upsert(next);
                                setMessage(`Work order ${wo.workOrderNumber} created.`);
                                onNavigate?.("Fleet Work Orders");
                              } catch (woError) {
                                setError(woError?.message || "Unable to create work order.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            <Wrench size={14} /> Create work order
                          </button>
                        </div>
                      ) : null}
                      {selected.workOrderId ? (
                        <p className="occupancy-muted">
                          Linked work order: {selected.workOrderId}{" "}
                          <button
                            className="text-button"
                            type="button"
                            onClick={() => onNavigate?.("Fleet Work Orders")}
                          >
                            Open board
                          </button>
                        </p>
                      ) : null}

                      <Field label="Evidence notes">
                        <textarea rows={2} value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} />
                      </Field>
                      <div className="occupancy-detail-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={saving || !evidenceNotes.trim()}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const next = await addDefectEvidence(departmentId, selected.id, { notes: evidenceNotes }, actor);
                              upsert(next);
                              setEvidenceNotes("");
                              setMessage("Evidence added.");
                            } catch (evError) {
                              setError(evError?.message || "Unable to add evidence.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Add evidence
                        </button>
                      </div>

                      {canStatus ? (
                        <>
                          <Field label="Restriction text (for restrict decision)">
                            <input value={restrictionText} onChange={(e) => setRestrictionText(e.target.value)} />
                          </Field>
                          <div className="occupancy-detail-actions">
                            <button className="secondary-button" type="button" disabled={saving} onClick={() => handleStatus("restrict")}>
                              Restrict unit
                            </button>
                            <button className="secondary-button" type="button" disabled={saving} onClick={() => handleStatus("out_of_service")}>
                              Mark OOS
                            </button>
                            <button className="secondary-button" type="button" disabled={saving} onClick={() => handleStatus("return_to_service")}>
                              Return to service
                            </button>
                            <button className="secondary-button" type="button" disabled={saving} onClick={handleReserve}>
                              Request reserve
                            </button>
                          </div>
                        </>
                      ) : null}

                      <Field label="Closure / resolution notes">
                        <textarea rows={2} value={resolution} onChange={(e) => setResolution(e.target.value)} />
                      </Field>
                      <div className="occupancy-detail-actions">
                        <button
                          className="primary-button"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const next = await closeDefect(departmentId, selected.id, { resolution }, actor);
                              upsert(next);
                              setMessage("Defect closed.");
                            } catch (closeError) {
                              setError(closeError?.message || "Unable to close.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          <Save size={14} /> Close defect
                        </button>
                      </div>
                    </>
                  ) : null}

                  {canEdit && selected.status === "closed" ? (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={saving}
                      onClick={async () => {
                        setSaving(true);
                        try {
                          const next = await reopenDefect(departmentId, selected.id, { reason: "Reopened from defects board" }, actor);
                          upsert(next);
                          setMessage("Defect reopened.");
                        } catch (reopenError) {
                          setError(reopenError?.message || "Unable to reopen.");
                        } finally {
                          setSaving(false);
                        }
                      }}
                    >
                      Reopen
                    </button>
                  ) : null}

                  {(selected.evidence || []).length ? (
                    <section className="occupancy-section">
                      <header><div><strong>Evidence</strong></div></header>
                      <ul className="occupancy-timeline">
                        {selected.evidence.map((item) => (
                          <li key={item.id}>
                            <strong>{item.type}</strong>
                            <small>{item.addedAt ? new Date(item.addedAt).toLocaleString() : ""} · {item.addedBy || ""}</small>
                            <p>{item.notes}</p>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}

        {reserveRequests.filter((row) => row.status === "requested").length ? (
          <section className="panel" style={{ marginTop: "12px" }}>
            <header><div><ShieldAlert size={15} /><strong>Open reserve requests</strong></div></header>
            <div className="panel-body">
              <ul className="occupancy-timeline">
                {reserveRequests.filter((row) => row.status === "requested").map((req) => (
                  <li key={req.id}>
                    <strong>{req.outOfServiceUnit}</strong>
                    <small>
                      → {req.requestedReserveUnit || "Any reserve"} · {req.reason}
                    </small>
                    {canStatus ? (
                      <div className="occupancy-detail-actions">
                        <button
                          className="text-button"
                          type="button"
                          onClick={async () => {
                            const next = await updateReserveRequest(departmentId, req.id, { status: "fulfilled" }, actor);
                            setReserveRequests((current) => current.map((row) => (row.id === next.id ? next : row)));
                            setMessage("Reserve request fulfilled.");
                          }}
                        >
                          Fulfill
                        </button>
                        <button
                          className="text-button"
                          type="button"
                          onClick={async () => {
                            const next = await updateReserveRequest(departmentId, req.id, { status: "cancelled" }, actor);
                            setReserveRequests((current) => current.map((row) => (row.id === next.id ? next : row)));
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {showCreate ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>Report defect</strong>
                <button type="button" onClick={() => setShowCreate(false)}>×</button>
              </header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select
                    value={createDraft.fleetAssetId}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>{asset.fleetNumber || asset.id}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Severity">
                  <select
                    value={createDraft.severity}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, severity: e.target.value }))}
                  >
                    {severities.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Category">
                  <select
                    value={createDraft.categoryId}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, categoryId: e.target.value }))}
                  >
                    {categories.map((row) => (
                      <option key={row.id} value={row.id}>{row.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Description">
                  <textarea
                    rows={3}
                    value={createDraft.description}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, description: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={handleCreate}>Submit</button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
