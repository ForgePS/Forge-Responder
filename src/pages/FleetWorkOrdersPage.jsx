import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CirclePlus, ClipboardList, Save, Wrench } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  addWorkOrderLabor,
  addWorkOrderPart,
  addWorkOrderTask,
  buildWorkOrderBoard,
  canEditFleetWorkOrders,
  canViewFleetWorkOrders,
  completeWorkOrderQc,
  createFleetWorkOrder,
  ensureFleetAssets,
  ensureFleetShopsSeeded,
  ensureFleetVendorsSeeded,
  ensureFleetWorkOrders,
  getAllowedWorkOrderTransitions,
  getWorkOrderPriorityOptions,
  getWorkOrderTypeOptions,
  transitionFleetWorkOrder,
  updateFleetWorkOrder,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const emptyCreate = {
  fleetAssetId: "",
  workOrderType: "corrective",
  priority: "medium",
  complaint: "",
  shopId: "",
  vendorId: "",
  oosRequired: false,
};

export default function FleetWorkOrdersPage({
  query = "",
  onNavigate,
  legacyApparatus = [],
  legacyWorkOrders = [],
  initialDefect = null,
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetWorkOrders(permissions, isCreator);
  const canEdit = canEditFleetWorkOrders(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [records, setRecords] = useState([]);
  const [assets, setAssets] = useState([]);
  const [shops, setShops] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(Boolean(initialDefect));
  const [createDraft, setCreateDraft] = useState({ ...emptyCreate });
  const [taskText, setTaskText] = useState("");
  const [laborDraft, setLaborDraft] = useState({ hours: "1", rate: "0", notes: "" });
  const [partDraft, setPartDraft] = useState({ name: "", quantity: "1", unitCost: "0" });
  const [qcNotes, setQcNotes] = useState("");

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const priorities = getWorkOrderPriorityOptions();
  const types = getWorkOrderTypeOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextAssets, nextShops, nextVendors, nextOrders] = await Promise.all([
        ensureFleetAssets(departmentId, legacyApparatus, actor),
        ensureFleetShopsSeeded(departmentId, actor),
        ensureFleetVendorsSeeded(departmentId, actor),
        ensureFleetWorkOrders(departmentId, legacyWorkOrders, actor),
      ]);
      setAssets(nextAssets);
      setShops(nextShops);
      setVendors(nextVendors);
      setRecords(nextOrders);
      setSelectedId((current) => current || nextOrders[0]?.id || "");
      setCreateDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId
          || initialDefect?.fleetAssetId
          || nextAssets[0]?.id
          || "",
        shopId: c.shopId || nextShops[0]?.id || "",
        vendorId: c.vendorId || "",
        complaint: c.complaint || initialDefect?.description || "",
        priority: initialDefect?.severity === "critical" || initialDefect?.severity === "high"
          ? initialDefect.severity
          : c.priority,
        workOrderType: initialDefect ? "defect" : c.workOrderType,
        oosRequired: initialDefect?.oosRecommendation === "immediate_oos" || c.oosRequired,
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load work orders.");
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

  const filtered = useMemo(() => {
    const needle = String(query || "").trim().toLowerCase();
    if (!needle) return records;
    return records.filter((row) => (
      [row.workOrderNumber, row.fleetNumber, row.complaint, row.status, row.priority, row.vendorName]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    ));
  }, [records, query]);

  const board = useMemo(() => buildWorkOrderBoard(filtered), [filtered]);

  function upsert(next) {
    setRecords((current) => [next, ...current.filter((row) => row.id !== next.id)]);
    setSelectedId(next.id);
  }

  async function handleCreate() {
    if (!canEdit || !createDraft.fleetAssetId || !createDraft.complaint.trim()) return;
    setSaving(true);
    setError("");
    try {
      const shop = shops.find((row) => row.id === createDraft.shopId);
      const vendor = vendors.find((row) => row.id === createDraft.vendorId);
      const created = await createFleetWorkOrder(departmentId, {
        fleetAssetId: createDraft.fleetAssetId,
        workOrderType: createDraft.workOrderType,
        priority: createDraft.priority,
        complaint: createDraft.complaint.trim(),
        shopId: createDraft.shopId,
        shopName: shop?.name || "",
        vendorId: createDraft.vendorId,
        vendorName: vendor?.name || "",
        oosRequired: createDraft.oosRequired,
        defectId: initialDefect?.id || "",
        source: initialDefect ? "defect" : "manual",
      }, actor);
      upsert(created);
      setShowCreate(false);
      setCreateDraft({ ...emptyCreate, fleetAssetId: assets[0]?.id || "", shopId: shops[0]?.id || "" });
      setMessage(`Work order ${created.workOrderNumber} created.`);
    } catch (createError) {
      setError(createError?.message || "Unable to create work order.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Fleet Work Orders"
        description="Shop board, labor and parts, QC, and downtime for corrective and preventive work."
        activeNavName="Fleet Work Orders"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <button className="primary-button" type="button" onClick={() => setShowCreate(true)}>
            <CirclePlus size={14} /> New work order
          </button>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading work orders...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading ? (
          <section className="fleet-summary">
            {[
              ["Open", board.summary.open, "warning"],
              ["Awaiting parts", board.summary.awaitingParts, "info"],
              ["Ready for QC", board.summary.readyForQc, "info"],
              ["Critical", board.summary.critical, "critical"],
              ["Total", board.summary.total, "info"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && !records.length ? (
          <FleetEmptyState
            title="No work orders"
            description="Create a work order or migrate classic Maintenance records (auto-imports when empty)."
            icon={Wrench}
          />
        ) : null}

        {!loading && records.length ? (
          <>
            <section className="fleet-wo-board" aria-label="Work order board">
              {board.columns.map((column) => (
                <div key={column.id} className="fleet-wo-column">
                  <header>
                    <strong>{column.label}</strong>
                    <span>{column.items.length}</span>
                  </header>
                  <div className="fleet-wo-column-body">
                    {column.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`fleet-wo-card${item.id === selectedId ? " selected" : ""}`}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.workOrderNumber}</strong>
                        <span>{item.fleetNumber || "No unit"}</span>
                        <small>{item.complaint || "No complaint"}</small>
                        <FleetStatusBadge status={item.priority} />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>

            {selected ? (
              <section className="panel fleet-wo-detail">
                <header>
                  <div>
                    <ClipboardList size={15} />
                    <strong>{selected.workOrderNumber}</strong>
                  </div>
                  <FleetStatusBadge status={selected.status} />
                </header>
                <div className="panel-body config-studio-body">
                  <div className="occupancy-form-grid">
                    <div><span className="occupancy-muted">Unit</span><strong>{selected.fleetNumber || "—"}</strong></div>
                    <div><span className="occupancy-muted">Type</span><strong>{selected.workOrderType}</strong></div>
                    <div><span className="occupancy-muted">Priority</span><strong>{selected.priority}</strong></div>
                    <div><span className="occupancy-muted">Shop</span><strong>{selected.shopName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Vendor</span><strong>{selected.vendorName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Actual cost</span><strong>${Number(selected.actualCost || 0).toFixed(2)}</strong></div>
                    <div><span className="occupancy-muted">Downtime</span><strong>{selected.downtimeHours || 0} h</strong></div>
                    <div><span className="occupancy-muted">Opened</span><strong>{selected.openedAt ? new Date(selected.openedAt).toLocaleString() : "—"}</strong></div>
                  </div>
                  <p>{selected.complaint}</p>

                  {canEdit ? (
                    <>
                      <div className="occupancy-detail-actions">
                        {getAllowedWorkOrderTransitions(selected.status).map((status) => (
                          <button
                            key={status}
                            className="secondary-button"
                            type="button"
                            disabled={saving}
                            onClick={async () => {
                              setSaving(true);
                              try {
                                const next = await transitionFleetWorkOrder(departmentId, selected.id, status, actor);
                                upsert(next);
                                setMessage(`Moved to ${status.replace(/_/g, " ")}.`);
                              } catch (transitionError) {
                                setError(transitionError?.message || "Unable to transition.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            → {status.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>

                      <Field label="Diagnosis">
                        <textarea
                          rows={2}
                          value={selected.diagnosis || ""}
                          onChange={(e) => upsert({ ...selected, diagnosis: e.target.value })}
                          onBlur={async () => {
                            if (!canEdit) return;
                            const next = await updateFleetWorkOrder(departmentId, selected.id, {
                              diagnosis: selected.diagnosis,
                              correction: selected.correction,
                            }, actor);
                            upsert(next);
                          }}
                        />
                      </Field>
                      <Field label="Correction">
                        <textarea
                          rows={2}
                          value={selected.correction || ""}
                          onChange={(e) => upsert({ ...selected, correction: e.target.value })}
                        />
                      </Field>

                      <section className="occupancy-section">
                        <header><div><strong>Tasks</strong></div></header>
                        <ul className="occupancy-timeline">
                          {(selected.tasks || []).map((task) => (
                            <li key={task.id}>
                              <strong>{task.description}</strong>
                              <small>{task.status} · {task.estimatedHours || 0}h est</small>
                            </li>
                          ))}
                        </ul>
                        <div className="occupancy-detail-actions">
                          <input
                            placeholder="New task"
                            value={taskText}
                            onChange={(e) => setTaskText(e.target.value)}
                          />
                          <button
                            className="secondary-button"
                            type="button"
                            disabled={saving || !taskText.trim()}
                            onClick={async () => {
                              setSaving(true);
                              try {
                                const next = await addWorkOrderTask(departmentId, selected.id, {
                                  description: taskText.trim(),
                                }, actor);
                                upsert(next);
                                setTaskText("");
                              } catch (taskError) {
                                setError(taskError?.message || "Unable to add task.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Add task
                          </button>
                        </div>
                      </section>

                      <section className="occupancy-section">
                        <header><div><strong>Labor</strong></div></header>
                        <ul className="occupancy-timeline">
                          {(selected.labor || []).map((row) => (
                            <li key={row.id}>
                              <strong>{row.technician || "Technician"}</strong>
                              <small>{row.hours}h @ ${row.rate}</small>
                              <p>{row.notes}</p>
                            </li>
                          ))}
                        </ul>
                        <div className="occupancy-form-grid">
                          <Field label="Hours">
                            <input value={laborDraft.hours} onChange={(e) => setLaborDraft((c) => ({ ...c, hours: e.target.value }))} />
                          </Field>
                          <Field label="Rate">
                            <input value={laborDraft.rate} onChange={(e) => setLaborDraft((c) => ({ ...c, rate: e.target.value }))} />
                          </Field>
                          <Field label="Notes">
                            <input value={laborDraft.notes} onChange={(e) => setLaborDraft((c) => ({ ...c, notes: e.target.value }))} />
                          </Field>
                        </div>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const next = await addWorkOrderLabor(departmentId, selected.id, {
                                hours: Number(laborDraft.hours) || 0,
                                rate: Number(laborDraft.rate) || 0,
                                notes: laborDraft.notes,
                              }, actor);
                              upsert(next);
                              setLaborDraft({ hours: "1", rate: "0", notes: "" });
                            } catch (laborError) {
                              setError(laborError?.message || "Unable to add labor.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Log labor
                        </button>
                      </section>

                      <section className="occupancy-section">
                        <header><div><strong>Parts</strong></div></header>
                        <ul className="occupancy-timeline">
                          {(selected.parts || []).map((row) => (
                            <li key={row.id}>
                              <strong>{row.name}</strong>
                              <small>qty {row.quantity} · ${row.unitCost}</small>
                            </li>
                          ))}
                        </ul>
                        <div className="occupancy-form-grid">
                          <Field label="Part name">
                            <input value={partDraft.name} onChange={(e) => setPartDraft((c) => ({ ...c, name: e.target.value }))} />
                          </Field>
                          <Field label="Qty">
                            <input value={partDraft.quantity} onChange={(e) => setPartDraft((c) => ({ ...c, quantity: e.target.value }))} />
                          </Field>
                          <Field label="Unit cost">
                            <input value={partDraft.unitCost} onChange={(e) => setPartDraft((c) => ({ ...c, unitCost: e.target.value }))} />
                          </Field>
                        </div>
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={saving || !partDraft.name.trim()}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              const next = await addWorkOrderPart(departmentId, selected.id, {
                                name: partDraft.name.trim(),
                                quantity: Number(partDraft.quantity) || 1,
                                unitCost: Number(partDraft.unitCost) || 0,
                                vendorId: selected.vendorId,
                              }, actor);
                              upsert(next);
                              setPartDraft({ name: "", quantity: "1", unitCost: "0" });
                            } catch (partError) {
                              setError(partError?.message || "Unable to add part.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Add part
                        </button>
                      </section>

                      {selected.status === "ready_for_qc" || selected.status === "completed" ? (
                        <section className="occupancy-section">
                          <header><div><CheckCircle2 size={15} /><strong>Quality control</strong></div></header>
                          <Field label="QC notes">
                            <textarea rows={2} value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} />
                          </Field>
                          <div className="occupancy-detail-actions">
                            <button
                              className="primary-button"
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                setSaving(true);
                                try {
                                  const next = await completeWorkOrderQc(departmentId, selected.id, {
                                    passed: true,
                                    notes: qcNotes,
                                  }, actor);
                                  upsert(next);
                                  setMessage("QC passed.");
                                } catch (qcError) {
                                  setError(qcError?.message || "Unable to complete QC.");
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              <Save size={14} /> Pass QC
                            </button>
                            <button
                              className="secondary-button"
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                setSaving(true);
                                try {
                                  const next = await completeWorkOrderQc(departmentId, selected.id, {
                                    passed: false,
                                    notes: qcNotes,
                                  }, actor);
                                  upsert(next);
                                  setMessage("QC failed — returned to in progress.");
                                } catch (qcError) {
                                  setError(qcError?.message || "Unable to fail QC.");
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              Fail QC
                            </button>
                          </div>
                          {selected.qcPassed != null ? (
                            <p className="occupancy-muted">
                              Last QC: {selected.qcPassed ? "passed" : "failed"}
                              {selected.qcBy ? ` by ${selected.qcBy}` : ""}
                              {selected.qcAt ? ` · ${new Date(selected.qcAt).toLocaleString()}` : ""}
                            </p>
                          ) : null}
                        </section>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {showCreate ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header>
                <strong>{initialDefect ? "Create work order from defect" : "New work order"}</strong>
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
                <Field label="Type">
                  <select
                    value={createDraft.workOrderType}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, workOrderType: e.target.value }))}
                  >
                    {types.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Priority">
                  <select
                    value={createDraft.priority}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, priority: e.target.value }))}
                  >
                    {priorities.map((row) => (
                      <option key={row.id} value={row.id}>{row.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Shop">
                  <select
                    value={createDraft.shopId}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, shopId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>{shop.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Vendor">
                  <select
                    value={createDraft.vendorId}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, vendorId: e.target.value }))}
                  >
                    <option value="">None</option>
                    {vendors.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                    ))}
                  </select>
                </Field>
                <label className="occupancy-primary-toggle">
                  <input
                    type="checkbox"
                    checked={createDraft.oosRequired}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, oosRequired: e.target.checked }))}
                  />
                  Unit OOS / downtime required
                </label>
                <Field label="Complaint / issue">
                  <textarea
                    rows={3}
                    value={createDraft.complaint}
                    onChange={(e) => setCreateDraft((c) => ({ ...c, complaint: e.target.value }))}
                  />
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={handleCreate}>Create</button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
