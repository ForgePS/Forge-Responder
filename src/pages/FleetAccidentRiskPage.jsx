import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CirclePlus,
  FileWarning,
  ShieldAlert,
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
  buildRiskBoard,
  canEditFleetRisk,
  canViewFleetAccidentSensitive,
  canViewFleetRisk,
  createAccidentEvent,
  createInsuranceClaim,
  createRoadsideEvent,
  createSafetyReview,
  ensureFleetAssets,
  getAccidentEventTypes,
  getInsuranceClaimStatuses,
  getRoadsideStatuses,
  getSafetyReviewOutcomes,
  updateAccidentEvent,
  updateInsuranceClaim,
  updateRoadsideEvent,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetAccidentRiskPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetRisk(permissions, isCreator);
  const canEdit = canEditFleetRisk(permissions, isCreator);
  const canSensitive = canViewFleetAccidentSensitive(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("accidents");
  const [board, setBoard] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState("");
  const [accidentDraft, setAccidentDraft] = useState({
    fleetAssetId: "",
    eventType: "collision",
    location: "",
    description: "",
    driverName: "",
    damageEstimate: "0",
    markOos: true,
    createWorkOrder: true,
    emergencyResponse: false,
  });
  const [claimDraft, setClaimDraft] = useState({ accidentEventId: "", carrier: "", policyNumber: "", estimate: "0", deductible: "0" });
  const [roadsideDraft, setRoadsideDraft] = useState({ fleetAssetId: "", providerId: "", location: "", symptoms: "", createWorkOrder: true });
  const [reviewDraft, setReviewDraft] = useState({ accidentEventId: "", outcome: "pending", findings: "", correctiveAction: "", trainingRequired: false });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const eventTypes = getAccidentEventTypes();
  const claimStatuses = getInsuranceClaimStatuses();
  const roadsideStatuses = getRoadsideStatuses();
  const reviewOutcomes = getSafetyReviewOutcomes();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextAssets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const nextBoard = await buildRiskBoard(departmentId, canSensitive);
      setAssets(nextAssets);
      setBoard(nextBoard);
      setSelectedId((c) => c || nextBoard.accidents[0]?.id || "");
      setAccidentDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        driverName: c.driverName || actor.actorName,
      }));
      setRoadsideDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        providerId: c.providerId || nextBoard.providers[0]?.id || "",
      }));
      setClaimDraft((c) => ({
        ...c,
        accidentEventId: c.accidentEventId || nextBoard.accidents[0]?.id || "",
      }));
      setReviewDraft((c) => ({
        ...c,
        accidentEventId: c.accidentEventId || nextBoard.accidents[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load accident & risk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed, canSensitive]);

  const selected = useMemo(
    () => (board?.accidents || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Accident & Risk"
        description="Accident events, insurance claims, towing / roadside, and safety review with restricted access."
        activeNavName="Accident & Risk"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setModal("roadside")}>Roadside</button>
            <button className="secondary-button" type="button" onClick={() => setModal("claim")}>Claim</button>
            <button className="secondary-button" type="button" onClick={() => setModal("review")}>Safety review</button>
            <button className="primary-button" type="button" onClick={() => setModal("accident")}>
              <CirclePlus size={14} /> Report accident
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading accident & risk...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}
        {!loading && !canSensitive ? (
          <p className="occupancy-muted">
            Sensitive fields (legal notes, medical, preventability findings) are restricted. Request <code>viewFleetAccidentSensitive</code> for full access.
          </p>
        ) : null}

        {!loading && board ? (
          <section className="fleet-summary">
            {[
              ["Open accidents", board.summary.openAccidents, "critical"],
              ["Open claims", board.summary.openClaims, "warning"],
              ["Roadside open", board.summary.roadsideOpen, "warning"],
              ["Safety pending", board.summary.safetyPending, "info"],
              ["Recovered", `$${board.summary.recovered}`, "success"],
              ["Tow providers", board.summary.providers, "info"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Accident risk">
            {[
              ["accidents", "Accidents", AlertTriangle],
              ["claims", "Insurance claims", FileWarning],
              ["roadside", "Tow & roadside", Truck],
              ["reviews", "Safety reviews", ShieldAlert],
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

        {!loading && tab === "accidents" ? (
          (board?.accidents || []).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><AlertTriangle size={15} /><strong>Events</strong></div>
                  <span className="inspections-count">{board.accidents.length}</span>
                </header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {board.accidents.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <span>
                          <strong>{item.eventNumber}</strong>
                          <small>{item.fleetNumber} · {item.eventType}</small>
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
                    <div><strong>{selected.eventNumber}</strong></div>
                    <FleetStatusBadge status={selected.eventType} />
                  </header>
                  <div className="panel-body config-studio-body">
                    <div className="occupancy-form-grid">
                      <div><span className="occupancy-muted">Unit</span><strong>{selected.fleetNumber || "—"}</strong></div>
                      <div><span className="occupancy-muted">Driver</span><strong>{selected.driverName || "—"}</strong></div>
                      <div><span className="occupancy-muted">When</span><strong>{selected.occurredAt ? new Date(selected.occurredAt).toLocaleString() : "—"}</strong></div>
                      <div><span className="occupancy-muted">Location</span><strong>{selected.location || "—"}</strong></div>
                      <div><span className="occupancy-muted">Estimate</span><strong>${Number(selected.damageEstimate || 0).toFixed(2)}</strong></div>
                      <div><span className="occupancy-muted">WO / Claim</span><strong>{selected.workOrderId || "—"} / {selected.claimId || "—"}</strong></div>
                    </div>
                    <p>{selected.description}</p>
                    {canSensitive ? (
                      <>
                        <p className="occupancy-muted">Injuries: {selected.injuries || "None recorded"}</p>
                        <p className="occupancy-muted">Preventability: {selected.preventability || "—"}</p>
                        {selected.legalNotes ? <p>Legal: {selected.legalNotes}</p> : null}
                        {selected.medicalNotes ? <p>Medical: {selected.medicalNotes}</p> : null}
                      </>
                    ) : (
                      <p className="occupancy-muted">Injuries / legal / medical / preventability: restricted</p>
                    )}
                    {canEdit && selected.status !== "closed" ? (
                      <div className="occupancy-detail-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await updateAccidentEvent(departmentId, selected.id, { status: "under_review" }, actor);
                              setMessage("Marked under review.");
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to update.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Under review
                        </button>
                        <button
                          className="primary-button"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await updateAccidentEvent(departmentId, selected.id, {
                                status: "closed",
                                disposition: "Closed from risk board",
                              }, actor);
                              setMessage("Accident closed.");
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to close.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Close
                        </button>
                        {selected.workOrderId ? (
                          <button className="text-button" type="button" onClick={() => onNavigate?.("Fleet Work Orders")}>
                            Open work order
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </section>
              ) : null}
            </section>
          ) : (
            <FleetEmptyState title="No accident events" description="Report a collision, backing incident, vandalism, or other damage event." icon={AlertTriangle} />
          )
        ) : null}

        {!loading && tab === "claims" ? (
          (board?.claims || []).length ? (
            <section className="panel">
              <header><div><FileWarning size={15} /><strong>Insurance claims</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {board.claims.map((claim) => (
                    <li key={claim.id}>
                      <strong>{claim.claimNumber}</strong>
                      <small>
                        {claim.fleetNumber} · {claim.carrier || "No carrier"} · est ${claim.estimate} · {claim.status}
                      </small>
                      {canEdit && !["paid", "closed", "denied"].includes(claim.status) ? (
                        <div className="occupancy-detail-actions">
                          {claimStatuses.filter((s) => s.id !== claim.status).slice(0, 3).map((status) => (
                            <button
                              key={status.id}
                              className="text-button"
                              type="button"
                              onClick={async () => {
                                const patch = { status: status.id };
                                if (status.id === "paid") patch.payment = claim.estimate || claim.payment;
                                await updateInsuranceClaim(departmentId, claim.id, patch, actor);
                                setMessage(`Claim ${claim.claimNumber} → ${status.id}`);
                                await reload();
                              }}
                            >
                              {status.label}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No insurance claims" description="File a claim from an accident event to track carrier recovery." icon={FileWarning} />
          )
        ) : null}

        {!loading && tab === "roadside" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><Truck size={15} /><strong>Roadside / tow</strong></div></header>
              <div className="panel-body">
                {(board?.roadside || []).length ? (
                  <ul className="occupancy-timeline">
                    {board.roadside.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <small>
                          {row.providerName || "No provider"} · {row.location || "No location"} · {row.status}
                        </small>
                        <p>{row.symptoms}</p>
                        {canEdit && !["completed", "cancelled"].includes(row.status) ? (
                          <div className="occupancy-detail-actions">
                            {roadsideStatuses.filter((s) => !["cancelled"].includes(s.id) && s.id !== row.status).slice(0, 3).map((status) => (
                              <button
                                key={status.id}
                                className="text-button"
                                type="button"
                                onClick={async () => {
                                  const patch = { status: status.id };
                                  if (status.id === "on_scene") patch.arrivedAt = new Date().toISOString();
                                  await updateRoadsideEvent(departmentId, row.id, patch, actor);
                                  await reload();
                                }}
                              >
                                {status.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="occupancy-muted">No roadside events.</p>}
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Approved providers</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {(board?.providers || []).map((provider) => (
                    <li key={provider.id}>
                      <strong>{provider.name}</strong>
                      <small>{provider.services || "General"}{provider.afterHoursPhone ? ` · AH ${provider.afterHoursPhone}` : ""}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </section>
        ) : null}

        {!loading && tab === "reviews" ? (
          (board?.reviews || []).length ? (
            <section className="panel">
              <header><div><ShieldAlert size={15} /><strong>Safety reviews</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {board.reviews.map((row) => (
                    <li key={row.id}>
                      <strong>{row.fleetNumber || row.accidentEventId}</strong>
                      <small>
                        {row.outcome} · {row.reviewedBy}
                        {row.reviewedAt ? ` · ${new Date(row.reviewedAt).toLocaleString()}` : ""}
                        {row.trainingRequired ? " · training required" : ""}
                      </small>
                      {canSensitive && row.findings ? <p>{row.findings}</p> : null}
                      {!canSensitive ? <p className="occupancy-muted">Findings restricted</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No safety reviews" description="Complete preventability reviews after accident investigation." icon={ShieldAlert} />
          )
        ) : null}

        {modal === "accident" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Report accident</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={accidentDraft.fleetAssetId} onChange={(e) => setAccidentDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select value={accidentDraft.eventType} onChange={(e) => setAccidentDraft((c) => ({ ...c, eventType: e.target.value }))}>
                    {eventTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Driver"><input value={accidentDraft.driverName} onChange={(e) => setAccidentDraft((c) => ({ ...c, driverName: e.target.value }))} /></Field>
                <Field label="Location"><input value={accidentDraft.location} onChange={(e) => setAccidentDraft((c) => ({ ...c, location: e.target.value }))} /></Field>
                <Field label="Damage estimate"><input value={accidentDraft.damageEstimate} onChange={(e) => setAccidentDraft((c) => ({ ...c, damageEstimate: e.target.value }))} /></Field>
                <Field label="Description"><textarea rows={3} value={accidentDraft.description} onChange={(e) => setAccidentDraft((c) => ({ ...c, description: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={accidentDraft.markOos} onChange={(e) => setAccidentDraft((c) => ({ ...c, markOos: e.target.checked }))} />
                  Mark unit out of service
                </label>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={accidentDraft.createWorkOrder} onChange={(e) => setAccidentDraft((c) => ({ ...c, createWorkOrder: e.target.checked }))} />
                  Create repair work order
                </label>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={accidentDraft.emergencyResponse} onChange={(e) => setAccidentDraft((c) => ({ ...c, emergencyResponse: e.target.checked }))} />
                  During emergency response
                </label>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !accidentDraft.fleetAssetId} onClick={async () => {
                  setSaving(true);
                  try {
                    await createAccidentEvent(departmentId, {
                      ...accidentDraft,
                      damageEstimate: Number(accidentDraft.damageEstimate) || 0,
                    }, actor);
                    setModal("");
                    setMessage("Accident reported.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to report accident.");
                  } finally {
                    setSaving(false);
                  }
                }}>Submit</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "claim" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>File insurance claim</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Accident">
                  <select value={claimDraft.accidentEventId} onChange={(e) => setClaimDraft((c) => ({ ...c, accidentEventId: e.target.value }))}>
                    {(board?.accidents || []).map((a) => <option key={a.id} value={a.id}>{a.eventNumber} · {a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Carrier"><input value={claimDraft.carrier} onChange={(e) => setClaimDraft((c) => ({ ...c, carrier: e.target.value }))} /></Field>
                <Field label="Policy #"><input value={claimDraft.policyNumber} onChange={(e) => setClaimDraft((c) => ({ ...c, policyNumber: e.target.value }))} /></Field>
                <Field label="Estimate"><input value={claimDraft.estimate} onChange={(e) => setClaimDraft((c) => ({ ...c, estimate: e.target.value }))} /></Field>
                <Field label="Deductible"><input value={claimDraft.deductible} onChange={(e) => setClaimDraft((c) => ({ ...c, deductible: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await createInsuranceClaim(departmentId, {
                      ...claimDraft,
                      estimate: Number(claimDraft.estimate) || 0,
                      deductible: Number(claimDraft.deductible) || 0,
                    }, actor);
                    setModal("");
                    setMessage("Insurance claim filed.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to file claim.");
                  } finally {
                    setSaving(false);
                  }
                }}>File</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "roadside" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Dispatch roadside / tow</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={roadsideDraft.fleetAssetId} onChange={(e) => setRoadsideDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Provider">
                  <select value={roadsideDraft.providerId} onChange={(e) => setRoadsideDraft((c) => ({ ...c, providerId: e.target.value }))}>
                    {(board?.providers || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="Location"><input value={roadsideDraft.location} onChange={(e) => setRoadsideDraft((c) => ({ ...c, location: e.target.value }))} /></Field>
                <Field label="Symptoms"><textarea rows={2} value={roadsideDraft.symptoms} onChange={(e) => setRoadsideDraft((c) => ({ ...c, symptoms: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={roadsideDraft.createWorkOrder} onChange={(e) => setRoadsideDraft((c) => ({ ...c, createWorkOrder: e.target.checked }))} />
                  Create work order
                </label>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await createRoadsideEvent(departmentId, {
                      ...roadsideDraft,
                      accidentEventId: selectedId || "",
                    }, actor);
                    setModal("");
                    setMessage("Roadside / tow dispatched.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to dispatch.");
                  } finally {
                    setSaving(false);
                  }
                }}>Dispatch</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "review" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Safety review</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Accident">
                  <select value={reviewDraft.accidentEventId} onChange={(e) => setReviewDraft((c) => ({ ...c, accidentEventId: e.target.value }))}>
                    {(board?.accidents || []).map((a) => <option key={a.id} value={a.id}>{a.eventNumber} · {a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Outcome">
                  <select value={reviewDraft.outcome} onChange={(e) => setReviewDraft((c) => ({ ...c, outcome: e.target.value }))}>
                    {reviewOutcomes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Findings"><textarea rows={3} value={reviewDraft.findings} onChange={(e) => setReviewDraft((c) => ({ ...c, findings: e.target.value }))} /></Field>
                <Field label="Corrective action"><textarea rows={2} value={reviewDraft.correctiveAction} onChange={(e) => setReviewDraft((c) => ({ ...c, correctiveAction: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={reviewDraft.trainingRequired} onChange={(e) => setReviewDraft((c) => ({ ...c, trainingRequired: e.target.checked }))} />
                  Training required
                </label>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !canSensitive} onClick={async () => {
                  setSaving(true);
                  try {
                    await createSafetyReview(departmentId, reviewDraft, actor);
                    setModal("");
                    setMessage("Safety review recorded.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save review.");
                  } finally {
                    setSaving(false);
                  }
                }}>
                  {canSensitive ? "Save review" : "Sensitive access required"}
                </button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
