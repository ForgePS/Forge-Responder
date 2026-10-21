import { useEffect, useState } from "react";
import {
  ArrowLeftRight,
  CalendarRange,
  CirclePlus,
  ClipboardList,
  Droplets,
  MapPin,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildOperationsBoard,
  canEditFleetOperations,
  canViewFleetOperations,
  checkLoadPlan,
  completeTransfer,
  createCheckout,
  createPoolReservation,
  createReserveSwap,
  createTransfer,
  endReserveSwap,
  ensureFleetAssets,
  getDeconTypes,
  recordDeconEvent,
  returnCheckout,
  saveAssignment,
  saveLoadPlan,
  updatePoolReservation,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetOperationsPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetOperations(permissions, isCreator);
  const canEdit = canEditFleetOperations(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("board");
  const [board, setBoard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [modal, setModal] = useState("");
  const [assignDraft, setAssignDraft] = useState({ fleetAssetId: "", station: "", shift: "A", notes: "" });
  const [transferDraft, setTransferDraft] = useState({ fleetAssetId: "", toStation: "", toShift: "", reason: "", meterValue: "" });
  const [swapDraft, setSwapDraft] = useState({ frontlineAssetId: "", reserveAssetId: "", reason: "" });
  const [checkoutDraft, setCheckoutDraft] = useState({ fleetAssetId: "", purpose: "", destination: "", expectedReturnAt: "", driverName: "" });
  const [reserveDraft, setReserveDraft] = useState({ fleetAssetId: "", purpose: "", startsAt: "", endsAt: "" });
  const [deconDraft, setDeconDraft] = useState({ fleetAssetId: "", deconType: "routine", reason: "", areas: "", notes: "" });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const deconTypes = getDeconTypes();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextAssets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const nextBoard = await buildOperationsBoard(departmentId);
      setAssets(nextAssets);
      setBoard(nextBoard);
      const first = nextAssets[0]?.id || "";
      const reserve = nextAssets.find((a) => a.status === "reserve")?.id || nextAssets[1]?.id || first;
      setAssignDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || first }));
      setTransferDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || first }));
      setSwapDraft((c) => ({ ...c, frontlineAssetId: c.frontlineAssetId || first, reserveAssetId: c.reserveAssetId || reserve }));
      setCheckoutDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || first, driverName: c.driverName || actor.actorName }));
      setReserveDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || first }));
      setDeconDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || first }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load operations.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Fleet Operations"
        description="Assignments, transfers, reserve swaps, checkout, pool reservations, load plans, and decon."
        activeNavName="Fleet Operations"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setModal("assign")}>Assign</button>
            <button className="secondary-button" type="button" onClick={() => setModal("transfer")}>Transfer</button>
            <button className="secondary-button" type="button" onClick={() => setModal("swap")}>Swap</button>
            <button className="secondary-button" type="button" onClick={() => setModal("checkout")}>Checkout</button>
            <button className="secondary-button" type="button" onClick={() => setModal("reserve")}>Reserve</button>
            <button className="primary-button" type="button" onClick={() => setModal("decon")}>
              <CirclePlus size={14} /> Decon
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading operations...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading && board ? (
          <section className="fleet-summary">
            {[
              ["Assignments", board.summary.activeAssignments, "info"],
              ["Transfers", board.summary.openTransfers, "warning"],
              ["Swaps", board.summary.activeSwaps, "warning"],
              ["Checkouts", board.summary.openCheckouts, "info"],
              ["Overdue", board.summary.overdueCheckouts, "critical"],
              ["Conflicts", board.summary.reservationConflicts, "critical"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Fleet operations">
            {[
              ["board", "Board", Truck],
              ["assignments", "Assignments", MapPin],
              ["transfers", "Transfers", ArrowLeftRight],
              ["checkouts", "Checkout & pool", CalendarRange],
              ["load", "Load plans", ClipboardList],
              ["decon", "Decontamination", Droplets],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={`inspections-subnav-item${tab === id ? " active" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "board" && board ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><strong>Open checkouts</strong></div></header>
              <div className="panel-body">
                {board.checkouts.length ? (
                  <ul className="occupancy-timeline">
                    {board.checkouts.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <small>{row.driverName} · {row.purpose || "No purpose"} · {row.status}</small>
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No open checkouts.</p>}
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Active swaps & transfers</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {board.swaps.map((row) => (
                    <li key={row.id}>
                      <strong>{row.frontlineUnit} ↔ {row.reserveUnit}</strong>
                      <small>{row.reason || "Reserve swap"}</small>
                    </li>
                  ))}
                  {board.transfers.map((row) => (
                    <li key={row.id}>
                      <strong>{row.fleetNumber}</strong>
                      <small>{row.fromStation} → {row.toStation} · {row.status}</small>
                    </li>
                  ))}
                  {!board.swaps.length && !board.transfers.length ? (
                    <li><span className="occupancy-muted">No active swaps or open transfers.</span></li>
                  ) : null}
                </ul>
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "assignments" ? (
          (board?.assignments || []).length ? (
            <section className="panel">
              <header><div><MapPin size={15} /><strong>Active assignments</strong></div></header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Unit</span><span>Station</span><span>Shift</span><span>Designation</span><span>Effective</span>
                  </div>
                  {board.assignments.map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.fleetNumber}</strong>
                      <span>{row.station || "—"}</span>
                      <span>{row.shift || "—"}</span>
                      <span>{row.unitDesignation || "—"}</span>
                      <span>{row.effectiveFrom ? new Date(row.effectiveFrom).toLocaleDateString() : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No assignments" description="Assign units to stations and shifts to build effective-dated history." icon={MapPin} />
          )
        ) : null}

        {!loading && tab === "transfers" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><ArrowLeftRight size={15} /><strong>Transfers</strong></div></header>
              <div className="panel-body">
                {(board?.transfers || []).length ? (
                  <ul className="occupancy-timeline">
                    {board.transfers.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <small>{row.fromStation} → {row.toStation} · {row.status}</small>
                        {canEdit && row.status !== "completed" ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={async () => {
                              setSaving(true);
                              try {
                                await completeTransfer(departmentId, row.id, actor);
                                setMessage(`Transfer completed for ${row.fleetNumber}.`);
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Unable to complete transfer.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Complete
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No open transfers.</p>}
              </div>
            </section>
            <section className="panel">
              <header><div><RefreshCw size={15} /><strong>Reserve swaps</strong></div></header>
              <div className="panel-body">
                {(board?.swaps || []).length ? (
                  <ul className="occupancy-timeline">
                    {board.swaps.map((row) => (
                      <li key={row.id}>
                        <strong>{row.frontlineUnit} ↔ {row.reserveUnit}</strong>
                        <small>{row.reason || "Active swap"}</small>
                        {canEdit ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={async () => {
                              setSaving(true);
                              try {
                                await endReserveSwap(departmentId, row.id, actor);
                                setMessage("Reserve swap ended.");
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Unable to end swap.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            End swap
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No active reserve swaps.</p>}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "checkouts" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><strong>Checkouts</strong></div></header>
              <div className="panel-body">
                {(board?.checkouts || []).length ? (
                  <ul className="occupancy-timeline">
                    {board.checkouts.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <small>
                          {row.driverName} · due {row.expectedReturnAt ? new Date(row.expectedReturnAt).toLocaleString() : "—"}
                        </small>
                        <FleetStatusBadge status={row.status} />
                        {canEdit ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={async () => {
                              setSaving(true);
                              try {
                                await returnCheckout(departmentId, row.id, {
                                  endMeter: row.startMeter,
                                  conditionEnd: "good",
                                }, actor);
                                setMessage(`Returned ${row.fleetNumber}.`);
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Unable to return.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            Return
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No open checkouts.</p>}
              </div>
            </section>
            <section className="panel">
              <header><div><CalendarRange size={15} /><strong>Pool reservations</strong></div></header>
              <div className="panel-body">
                {(board?.reservations || []).length ? (
                  <ul className="occupancy-timeline">
                    {board.reservations.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <small>
                          {row.reservedBy} · {row.startsAt ? new Date(row.startsAt).toLocaleString() : ""}
                          {row.conflict ? ` · ${row.conflictReason}` : ""}
                        </small>
                        <FleetStatusBadge status={row.conflict ? "critical" : row.status} />
                        {canEdit && row.status === "requested" ? (
                          <button
                            className="text-button"
                            type="button"
                            onClick={async () => {
                              await updatePoolReservation(departmentId, row.id, {
                                status: "approved",
                                approvedBy: actor.actorName,
                                conflict: false,
                                conflictReason: "",
                              }, actor);
                              setMessage("Reservation approved.");
                              await reload();
                            }}
                          >
                            Approve
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No open reservations.</p>}
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "load" ? (
          <section className="panel">
            <header>
              <div><ClipboardList size={15} /><strong>Equipment load plans</strong></div>
              {canEdit ? (
                <button
                  className="text-button"
                  type="button"
                  disabled={saving || !assets[0]}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await saveLoadPlan(departmentId, {
                        fleetAssetId: assets[0].id,
                        name: `${assets[0].fleetNumber} load plan`,
                      }, actor);
                      setMessage("Load plan created with starter equipment list.");
                      await reload();
                    } catch (err) {
                      setError(err?.message || "Unable to create load plan.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  <CirclePlus size={14} /> New plan
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              {(board?.loadPlans || []).length ? (
                <ul className="occupancy-timeline">
                  {board.loadPlans.map((plan) => (
                    <li key={plan.id}>
                      <strong>{plan.fleetNumber || plan.name}</strong>
                      <small>
                        {plan.items.length} items
                        {plan.missingCount ? ` · ${plan.missingCount} below minimum` : " · ok"}
                        {plan.lastCheckedAt ? ` · checked ${new Date(plan.lastCheckedAt).toLocaleString()}` : ""}
                      </small>
                      {canEdit ? (
                        <button
                          className="text-button"
                          type="button"
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await checkLoadPlan(
                                departmentId,
                                plan.id,
                                plan.items.map((item) => ({
                                  itemId: item.id,
                                  actualQuantity: Number(item.quantity) || 0,
                                })),
                                actor
                              );
                              setMessage(`Checked ${plan.fleetNumber || plan.name}.`);
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to check load plan.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Mark checked (full)
                        </button>
                      ) : null}
                      <ul>
                        {plan.items.slice(0, 6).map((item) => (
                          <li key={item.id}>
                            <small>{item.name} · {item.compartment} · qty {item.actualQuantity === "" ? item.quantity : item.actualQuantity}/{item.minimumQuantity || item.quantity}</small>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : (
                <FleetEmptyState title="No load plans" description="Create an apparatus load plan to track expected vs actual equipment." icon={ClipboardList} />
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "decon" ? (
          (board?.decons || []).length ? (
            <section className="panel">
              <header><div><Droplets size={15} /><strong>Decontamination</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {board.decons.map((row) => (
                    <li key={row.id}>
                      <strong>{row.fleetNumber} · {row.deconType}</strong>
                      <small>
                        {row.personnel}
                        {row.occurredAt ? ` · ${new Date(row.occurredAt).toLocaleString()}` : ""}
                        {row.oosMinutes ? ` · OOS ${row.oosMinutes} min` : ""}
                      </small>
                      {row.reason ? <p>{row.reason}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No decon records" description="Log routine, post-fire, post-EMS, and BBP decontamination." icon={Droplets} />
          )
        ) : null}

        {modal === "assign" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Assign unit</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={assignDraft.fleetAssetId} onChange={(e) => setAssignDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Station"><input value={assignDraft.station} onChange={(e) => setAssignDraft((c) => ({ ...c, station: e.target.value }))} /></Field>
                <Field label="Shift"><input value={assignDraft.shift} onChange={(e) => setAssignDraft((c) => ({ ...c, shift: e.target.value }))} /></Field>
                <Field label="Notes"><textarea rows={2} value={assignDraft.notes} onChange={(e) => setAssignDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveAssignment(departmentId, { ...assignDraft, status: "active" }, actor);
                    setModal("");
                    setMessage("Assignment saved.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to assign.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "transfer" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Request transfer</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={transferDraft.fleetAssetId} onChange={(e) => setTransferDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber} ({a.station || "no station"})</option>)}
                  </select>
                </Field>
                <Field label="To station"><input value={transferDraft.toStation} onChange={(e) => setTransferDraft((c) => ({ ...c, toStation: e.target.value }))} /></Field>
                <Field label="To shift"><input value={transferDraft.toShift} onChange={(e) => setTransferDraft((c) => ({ ...c, toShift: e.target.value }))} /></Field>
                <Field label="Meter"><input value={transferDraft.meterValue} onChange={(e) => setTransferDraft((c) => ({ ...c, meterValue: e.target.value }))} /></Field>
                <Field label="Reason"><textarea rows={2} value={transferDraft.reason} onChange={(e) => setTransferDraft((c) => ({ ...c, reason: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !transferDraft.toStation.trim()} onClick={async () => {
                  setSaving(true);
                  try {
                    await createTransfer(departmentId, transferDraft, actor);
                    setModal("");
                    setMessage("Transfer requested.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to create transfer.");
                  } finally {
                    setSaving(false);
                  }
                }}>Request</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "swap" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Reserve swap</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Frontline unit">
                  <select value={swapDraft.frontlineAssetId} onChange={(e) => setSwapDraft((c) => ({ ...c, frontlineAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Reserve unit">
                  <select value={swapDraft.reserveAssetId} onChange={(e) => setSwapDraft((c) => ({ ...c, reserveAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Reason"><textarea rows={2} value={swapDraft.reason} onChange={(e) => setSwapDraft((c) => ({ ...c, reason: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await createReserveSwap(departmentId, swapDraft, actor);
                    setModal("");
                    setMessage("Reserve swap started.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to start swap.");
                  } finally {
                    setSaving(false);
                  }
                }}>Start swap</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "checkout" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Check out unit</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={checkoutDraft.fleetAssetId} onChange={(e) => setCheckoutDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Driver"><input value={checkoutDraft.driverName} onChange={(e) => setCheckoutDraft((c) => ({ ...c, driverName: e.target.value }))} /></Field>
                <Field label="Purpose"><input value={checkoutDraft.purpose} onChange={(e) => setCheckoutDraft((c) => ({ ...c, purpose: e.target.value }))} /></Field>
                <Field label="Destination"><input value={checkoutDraft.destination} onChange={(e) => setCheckoutDraft((c) => ({ ...c, destination: e.target.value }))} /></Field>
                <Field label="Expected return"><input type="datetime-local" value={checkoutDraft.expectedReturnAt} onChange={(e) => setCheckoutDraft((c) => ({ ...c, expectedReturnAt: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    const expected = checkoutDraft.expectedReturnAt
                      ? new Date(checkoutDraft.expectedReturnAt).toISOString()
                      : "";
                    await createCheckout(departmentId, { ...checkoutDraft, expectedReturnAt: expected }, actor);
                    setModal("");
                    setMessage("Unit checked out.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to check out.");
                  } finally {
                    setSaving(false);
                  }
                }}>Checkout</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "reserve" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Pool reservation</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={reserveDraft.fleetAssetId} onChange={(e) => setReserveDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Purpose"><input value={reserveDraft.purpose} onChange={(e) => setReserveDraft((c) => ({ ...c, purpose: e.target.value }))} /></Field>
                <Field label="Starts"><input type="datetime-local" value={reserveDraft.startsAt} onChange={(e) => setReserveDraft((c) => ({ ...c, startsAt: e.target.value }))} /></Field>
                <Field label="Ends"><input type="datetime-local" value={reserveDraft.endsAt} onChange={(e) => setReserveDraft((c) => ({ ...c, endsAt: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !reserveDraft.startsAt} onClick={async () => {
                  setSaving(true);
                  try {
                    const created = await createPoolReservation(departmentId, {
                      ...reserveDraft,
                      startsAt: new Date(reserveDraft.startsAt).toISOString(),
                      endsAt: reserveDraft.endsAt ? new Date(reserveDraft.endsAt).toISOString() : new Date(reserveDraft.startsAt).toISOString(),
                    }, actor);
                    setModal("");
                    setMessage(created.conflict ? `Reservation saved with conflict: ${created.conflictReason}` : "Reservation created.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to reserve.");
                  } finally {
                    setSaving(false);
                  }
                }}>Reserve</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "decon" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Record decontamination</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={deconDraft.fleetAssetId} onChange={(e) => setDeconDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select value={deconDraft.deconType} onChange={(e) => setDeconDraft((c) => ({ ...c, deconType: e.target.value }))}>
                    {deconTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Areas"><input value={deconDraft.areas} onChange={(e) => setDeconDraft((c) => ({ ...c, areas: e.target.value }))} /></Field>
                <Field label="Reason"><textarea rows={2} value={deconDraft.reason} onChange={(e) => setDeconDraft((c) => ({ ...c, reason: e.target.value }))} /></Field>
                <Field label="Notes"><textarea rows={2} value={deconDraft.notes} onChange={(e) => setDeconDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await recordDeconEvent(departmentId, deconDraft, actor);
                    setModal("");
                    setMessage("Decontamination recorded.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to record decon.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
