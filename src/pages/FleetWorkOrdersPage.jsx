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
  syncLegacyWorkOrders,
  transitionFleetWorkOrder,
  updateFleetWorkOrder,
} from "../lib/fleet/index.js";
import { activeOptionsWithSelected, firstActiveId } from "../lib/fleet/repairsConfig.js";
import {
  buildCompletionMessage,
  isUnitDown,
  unitDownLabel,
  workOrderPriorityLabel,
  workOrderStatusLabel,
  workOrderTypeLabel,
} from "../lib/fleet/workOrderLoopLogic.js";
import { friendlyError } from "../lib/friendlyError.js";
import DamagePhotoGrid from "../components/DamagePhotoGrid.jsx";

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
      const [nextAssets, nextShops, nextVendors] = await Promise.all([
        ensureFleetAssets(departmentId, legacyApparatus, actor),
        ensureFleetShopsSeeded(departmentId, actor),
        ensureFleetVendorsSeeded(departmentId, actor),
      ]);
      // Editors copy any classic Maintenance orders that never reached Fleet (never deletes).
      // Read-only viewers can't write, so they just see what is already here.
      let nextOrders;
      if (canEdit) {
        const sync = await syncLegacyWorkOrders(departmentId, legacyWorkOrders, { ...actor, assets: nextAssets });
        nextOrders = sync.workOrders;
        if (sync.added.length) {
          setMessage(`${sync.added.length} work order${sync.added.length === 1 ? "" : "s"} from the old Maintenance list ${sync.added.length === 1 ? "was" : "were"} added here.`);
        }
      } else {
        nextOrders = await ensureFleetWorkOrders(departmentId, legacyWorkOrders, actor);
      }
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
        shopId: c.shopId || firstActiveId(nextShops),
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
      setError(friendlyError(loadError, "Couldn't load work orders."));
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

  /**
   * Complete a work order (status change or passed QC) and report what else closed.
   * When the unit is out of service or restricted, ask whether to put it back in service.
   * @param {(audit: object) => Promise<object>} run
   */
  async function completeWorkOrder(workOrder, run) {
    const asset = assets.find((row) => row.id === workOrder.fleetAssetId) || null;
    const unitName = asset?.unitDesignation || asset?.fleetNumber || workOrder.fleetNumber || "This unit";
    let returnToService = false;
    if (isUnitDown(asset)) {
      returnToService = window.confirm(
        `${unitName} is ${unitDownLabel(asset)}.\n\nPut ${unitName} back in service now that this work is done?\n\nOK = back in service. Cancel = leave its status as it is.`
      );
    }
    setSaving(true);
    setError("");
    try {
      const result = await run({ ...actor, returnToService });
      const { completion, ...next } = result || {};
      upsert(next);
      if (completion?.returnedToService) {
        setAssets((current) => current.map((row) => (
          row.id === asset?.id ? { ...row, status: "in_service", activeRestriction: "" } : row
        )));
      }
      const warnings = [...(completion?.warnings || [])];
      if (asset && isUnitDown(asset) && !completion?.returnedToService && !returnToService) {
        warnings.push(`${unitName} is still ${unitDownLabel(asset)}.`);
      }
      setMessage(completion
        ? buildCompletionMessage({ ...completion, unitName: completion.unitName || unitName, warnings })
        : `Work order ${next.workOrderNumber} completed.`);
    } catch (completeError) {
      setError(friendlyError(completeError, "Couldn't complete the work order."));
    } finally {
      setSaving(false);
    }
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
      setCreateDraft({ ...emptyCreate, fleetAssetId: assets[0]?.id || "", shopId: firstActiveId(shops) });
      setMessage(`Work order ${created.workOrderNumber} created.`);
    } catch (createError) {
      setError(friendlyError(createError, "Couldn't create work order."));
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
            <CirclePlus size={14} /> New Work Order
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
            description="Create a work order here. Reports members send from the Employee Portal, and anything left in the old Maintenance list, show up here automatically."
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
                    <div><span className="occupancy-muted">Type</span><strong>{workOrderTypeLabel(selected.workOrderType)}</strong></div>
                    <div><span className="occupancy-muted">Priority</span><strong>{workOrderPriorityLabel(selected.priority)}</strong></div>
                    <div><span className="occupancy-muted">Shop</span><strong>{selected.shopName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Vendor</span><strong>{selected.vendorName || "—"}</strong></div>
                    <div><span className="occupancy-muted">Actual cost</span><strong>${Number(selected.actualCost || 0).toFixed(2)}</strong></div>
                    <div><span className="occupancy-muted">Downtime</span><strong>{selected.downtimeHours || 0} h</strong></div>
                    <div><span className="occupancy-muted">Opened</span><strong>{selected.openedAt ? new Date(selected.openedAt).toLocaleString() : "—"}</strong></div>
                  </div>
                  <p>{selected.complaint}</p>
                  <DamagePhotoGrid photos={selected.photos} title="Photos from the report" />

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
                              if (status === "completed") {
                                await completeWorkOrder(selected, (audit) => (
                                  transitionFleetWorkOrder(departmentId, selected.id, status, audit)
                                ));
                                return;
                              }
                              setSaving(true);
                              setError("");
                              try {
                                const next = await transitionFleetWorkOrder(departmentId, selected.id, status, actor);
                                upsert(next);
                                setMessage(`Work order ${next.workOrderNumber} moved to ${workOrderStatusLabel(status)}.`);
                              } catch (transitionError) {
                                setError(friendlyError(transitionError, "Couldn't change the status."));
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            {status === "completed" ? "Mark completed" : `Move to ${workOrderStatusLabel(status)}`}
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
                                setError(friendlyError(taskError, "Couldn't add task."));
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Add Task
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
                              setError(friendlyError(laborError, "Couldn't add labor."));
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Log Labor
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
                              setError(friendlyError(partError, "Couldn't add part."));
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Add Part
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
                                if (selected.status !== "completed") {
                                  await completeWorkOrder(selected, (audit) => (
                                    completeWorkOrderQc(departmentId, selected.id, { passed: true, notes: qcNotes }, audit)
                                  ));
                                  return;
                                }
                                setSaving(true);
                                try {
                                  const next = await completeWorkOrderQc(departmentId, selected.id, {
                                    passed: true,
                                    notes: qcNotes,
                                  }, actor);
                                  upsert(next);
                                  setMessage("QC passed.");
                                } catch (qcError) {
                                  setError(friendlyError(qcError, "Couldn't complete QC."));
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
                                  setError(friendlyError(qcError, "Couldn't fail QC."));
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
                <button type="button" className="icon-button" aria-label="Close" onClick={() => setShowCreate(false)}>×</button>
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
                    {activeOptionsWithSelected(shops, createDraft.shopId).map((shop) => (
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
                    {activeOptionsWithSelected(vendors, createDraft.vendorId).map((vendor) => (
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
