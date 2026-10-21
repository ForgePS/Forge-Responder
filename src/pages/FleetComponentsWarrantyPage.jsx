import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Battery,
  CirclePlus,
  Droplets,
  FileWarning,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildComponentAlerts,
  buildRecallBoard,
  buildWarrantyBoard,
  canEditFleetComponents,
  canViewFleetComponents,
  completeRecallForAsset,
  confirmRecallAssetMatches,
  createWarrantyClaim,
  ensureFleetAssets,
  getBatteryPositions,
  getFluidTypes,
  getRecallCampaignTypes,
  getTireConditions,
  getTirePositions,
  getWarrantyClaimStatuses,
  recordFluidEvent,
  saveFleetBattery,
  saveFleetRecall,
  saveFleetTire,
  saveFleetWarranty,
  updateWarrantyClaim,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function FleetComponentsWarrantyPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetComponents(permissions, isCreator);
  const canEdit = canEditFleetComponents(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("alerts");
  const [assets, setAssets] = useState([]);
  const [components, setComponents] = useState(null);
  const [recalls, setRecalls] = useState(null);
  const [warranties, setWarranties] = useState(null);
  const [selectedRecallId, setSelectedRecallId] = useState("");
  const [modal, setModal] = useState("");
  const [tireDraft, setTireDraft] = useState({ fleetAssetId: "", position: "LF", manufacturer: "", size: "", treadDepth: "8", condition: "good" });
  const [batteryDraft, setBatteryDraft] = useState({ fleetAssetId: "", position: "primary", manufacturer: "", chemistry: "AGM", stateOfHealth: "90" });
  const [fluidDraft, setFluidDraft] = useState({ fleetAssetId: "", fluidType: "engine_oil", action: "service", quantity: "8", leak: false, notes: "" });
  const [recallDraft, setRecallDraft] = useState({ campaignNumber: "", campaignType: "recall", manufacturer: "", component: "", description: "", safetyRisk: "moderate", oosRequired: false });
  const [warrantyDraft, setWarrantyDraft] = useState({ fleetAssetId: "", provider: "", coveredSystem: "Whole vehicle", warrantyType: "bumper_to_bumper", expirationDate: "" });
  const [claimDraft, setClaimDraft] = useState({ fleetAssetId: "", warrantyId: "", claimedAmount: "0", provider: "", notes: "" });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const tirePositions = getTirePositions();
  const tireConditions = getTireConditions();
  const batteryPositions = getBatteryPositions();
  const fluidTypes = getFluidTypes();
  const campaignTypes = getRecallCampaignTypes();
  const claimStatuses = getWarrantyClaimStatuses();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextAssets = await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const [compBoard, recallBoard, warrantyBoard] = await Promise.all([
        buildComponentAlerts(departmentId),
        buildRecallBoard(departmentId),
        buildWarrantyBoard(departmentId),
      ]);
      setAssets(nextAssets);
      setComponents(compBoard);
      setRecalls(recallBoard);
      setWarranties(warrantyBoard);
      setSelectedRecallId((c) => c || recallBoard.rows[0]?.id || "");
      setTireDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "" }));
      setBatteryDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "" }));
      setFluidDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "" }));
      setWarrantyDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "" }));
      setClaimDraft((c) => ({
        ...c,
        fleetAssetId: c.fleetAssetId || nextAssets[0]?.id || "",
        warrantyId: c.warrantyId || warrantyBoard.warranties[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load components & warranty.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedRecall = useMemo(
    () => (recalls?.rows || []).find((row) => row.id === selectedRecallId) || null,
    [recalls, selectedRecallId]
  );

  return (
    <FleetPermissionGate allowed={allowed}>
      <FleetModuleLayout
        title="Components & Warranty"
        description="Tires, batteries, fluids, recalls / bulletins, and warranty recovery."
        activeNavName="Components & Warranty"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setModal("tire")}>Tire</button>
            <button className="secondary-button" type="button" onClick={() => setModal("battery")}>Battery</button>
            <button className="secondary-button" type="button" onClick={() => setModal("fluid")}>Fluid</button>
            <button className="secondary-button" type="button" onClick={() => setModal("recall")}>Recall</button>
            <button className="secondary-button" type="button" onClick={() => setModal("warranty")}>Warranty</button>
            <button className="primary-button" type="button" onClick={() => setModal("claim")}>
              <CirclePlus size={14} /> Claim
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading components...</p></div> : null}
        {!loading && error ? <div className="inspections-error-state" role="alert"><strong>Error</strong><p>{error}</p></div> : null}
        {!loading && message ? <p className="occupancy-message">{message}</p> : null}

        {!loading ? (
          <section className="fleet-summary">
            {[
              ["Alerts", components?.summary?.alerts || 0, "critical"],
              ["Tires", components?.summary?.tires || 0, "info"],
              ["Batteries", components?.summary?.batteries || 0, "info"],
              ["Open recalls", recalls?.summary?.open || 0, "warning"],
              ["Expiring warranties", warranties?.summary?.expiring || 0, "warning"],
              ["Recovered", `$${warranties?.summary?.recovered || 0}`, "success"],
            ].map(([label, value, tone]) => (
              <div key={label} className={`fleet-stat stat-${tone}`}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Components warranty">
            {[
              ["alerts", "Alerts", AlertTriangle],
              ["tires", "Tires", ShieldCheck],
              ["batteries", "Batteries", Battery],
              ["fluids", "Fluids", Droplets],
              ["recalls", "Recalls & bulletins", FileWarning],
              ["warranty", "Warranties & claims", ShieldCheck],
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

        {!loading && tab === "alerts" ? (
          (components?.alerts || []).length ? (
            <section className="panel">
              <header><div><AlertTriangle size={15} /><strong>Component alerts</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {components.alerts.map((alert) => (
                    <li key={alert.id}>
                      <strong>{alert.label}</strong>
                      <small>{alert.type} · {alert.severity}</small>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No component alerts" description="Worn tread, low battery health, leaks, and expired component warranties appear here." icon={AlertTriangle} />
          )
        ) : null}

        {!loading && tab === "tires" ? (
          (components?.tires || []).length ? (
            <section className="panel">
              <header><div><strong>Tires</strong></div></header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Unit</span><span>Position</span><span>Size</span><span>Tread</span><span>Condition</span><span>Status</span>
                  </div>
                  {components.tires.map((tire) => (
                    <div className="cert-row" key={tire.id}>
                      <strong>{tire.fleetNumber || "—"}</strong>
                      <span>{tire.position}</span>
                      <span>{tire.size || "—"}</span>
                      <span>{tire.treadDepth || "—"}</span>
                      <span>{tire.condition}</span>
                      <span><FleetStatusBadge status={tire.status} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No tires tracked" description="Add installed or inventory tires to start lifecycle tracking." icon={ShieldCheck} />
          )
        ) : null}

        {!loading && tab === "batteries" ? (
          (components?.batteries || []).length ? (
            <section className="panel">
              <header><div><Battery size={15} /><strong>Batteries</strong></div></header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Unit</span><span>Position</span><span>Chemistry</span><span>SOH</span><span>Warranty</span><span>Status</span>
                  </div>
                  {components.batteries.map((battery) => (
                    <div className="cert-row" key={battery.id}>
                      <strong>{battery.fleetNumber || "—"}</strong>
                      <span>{battery.position}</span>
                      <span>{battery.chemistry}</span>
                      <span>{battery.stateOfHealth || "—"}%</span>
                      <span>{battery.warrantyExpiresAt || "—"}</span>
                      <span><FleetStatusBadge status={battery.status} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No batteries tracked" description="Track starting, auxiliary, and EV batteries." icon={Battery} />
          )
        ) : null}

        {!loading && tab === "fluids" ? (
          (components?.fluids || []).length ? (
            <section className="panel">
              <header><div><Droplets size={15} /><strong>Fluid events</strong></div></header>
              <div className="panel-body">
                <ul className="occupancy-timeline">
                  {components.fluids.slice(0, 40).map((event) => (
                    <li key={event.id}>
                      <strong>{event.fleetNumber || "Unit"} · {event.fluidType}</strong>
                      <small>
                        {event.action} · {event.quantity} {event.unit}
                        {event.leak ? " · LEAK" : ""}
                        {event.occurredAt ? ` · ${new Date(event.occurredAt).toLocaleString()}` : ""}
                      </small>
                      {event.notes ? <p>{event.notes}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No fluid events" description="Record oil, coolant, hydraulic, DEF, and leak events." icon={Droplets} />
          )
        ) : null}

        {!loading && tab === "recalls" ? (
          (recalls?.rows || []).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><FileWarning size={15} /><strong>Campaigns</strong></div>
                  <span className="inspections-count">{recalls.rows.length}</span>
                </header>
                <div className="panel-body">
                  <div className="personnel-list">
                    {recalls.rows.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={item.id === selectedRecallId ? "person-row selected" : "person-row"}
                        onClick={() => setSelectedRecallId(item.id)}
                      >
                        <span>
                          <strong>{item.campaignNumber}</strong>
                          <small>{item.campaignType} · {item.component || item.manufacturer}</small>
                        </span>
                        <FleetStatusBadge status={item.status} />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              {selectedRecall ? (
                <section className="panel">
                  <header>
                    <div><strong>{selectedRecall.campaignNumber}</strong></div>
                    <FleetStatusBadge status={selectedRecall.safetyRisk} />
                  </header>
                  <div className="panel-body config-studio-body">
                    <p>{selectedRecall.description}</p>
                    <div className="occupancy-form-grid">
                      <div><span className="occupancy-muted">Type</span><strong>{selectedRecall.campaignType}</strong></div>
                      <div><span className="occupancy-muted">Manufacturer</span><strong>{selectedRecall.manufacturer || "—"}</strong></div>
                      <div><span className="occupancy-muted">Component</span><strong>{selectedRecall.component || "—"}</strong></div>
                      <div><span className="occupancy-muted">Remaining</span><strong>{selectedRecall.remainingCount}</strong></div>
                      <div><span className="occupancy-muted">OOS required</span><strong>{selectedRecall.oosRequired ? "Yes" : "No"}</strong></div>
                      <div><span className="occupancy-muted">Remedy</span><strong>{selectedRecall.remedy || "—"}</strong></div>
                    </div>
                    {selectedRecall.suggestedMatches?.length && canEdit ? (
                      <div className="occupancy-detail-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            try {
                              await confirmRecallAssetMatches(
                                departmentId,
                                selectedRecall.id,
                                selectedRecall.suggestedMatches.map((a) => a.id),
                                actor
                              );
                              setMessage(`Confirmed ${selectedRecall.suggestedMatches.length} asset match(es).`);
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to confirm matches.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Confirm suggested matches ({selectedRecall.suggestedMatches.length})
                        </button>
                      </div>
                    ) : null}
                    {(selectedRecall.affectedAssets || []).length ? (
                      <ul className="occupancy-timeline">
                        {selectedRecall.affectedAssets.map((asset) => {
                          const done = (selectedRecall.completedAssetIds || []).includes(asset.id);
                          return (
                            <li key={asset.id}>
                              <strong>{asset.fleetNumber}</strong>
                              <small>{done ? "Completed" : "Open"}</small>
                              {canEdit && !done ? (
                                <button
                                  className="text-button"
                                  type="button"
                                  onClick={async () => {
                                    setSaving(true);
                                    try {
                                      await completeRecallForAsset(departmentId, selectedRecall.id, asset.id, actor);
                                      setMessage(`Marked ${asset.fleetNumber} complete.`);
                                      await reload();
                                    } catch (err) {
                                      setError(err?.message || "Unable to complete.");
                                    } finally {
                                      setSaving(false);
                                    }
                                  }}
                                >
                                  Complete
                                </button>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="occupancy-muted">No affected assets linked yet. Add year/make/model filters or confirm matches.</p>
                    )}
                  </div>
                </section>
              ) : null}
            </section>
          ) : (
            <FleetEmptyState title="No recalls or bulletins" description="Create a safety recall, service bulletin, or department campaign." icon={FileWarning} />
          )
        ) : null}

        {!loading && tab === "warranty" ? (
          <section className="personnel-workspace occupancy-workspace">
            <section className="panel">
              <header><div><ShieldCheck size={15} /><strong>Coverage</strong></div></header>
              <div className="panel-body">
                {(warranties?.warranties || []).length ? (
                  <ul className="occupancy-timeline">
                    {warranties.warranties.map((row) => (
                      <li key={row.id}>
                        <strong>{row.fleetNumber || "Unit"} · {row.provider || row.warrantyType}</strong>
                        <small>
                          {row.coveredSystem} · exp {row.expirationDate || "—"} · {row.status}
                        </small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="occupancy-muted">No warranties on file.</p>
                )}
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Claims</strong></div></header>
              <div className="panel-body">
                {(warranties?.claims || []).length ? (
                  <ul className="occupancy-timeline">
                    {warranties.claims.map((claim) => (
                      <li key={claim.id}>
                        <strong>{claim.claimNumber}</strong>
                        <small>
                          {claim.fleetNumber} · ${claim.claimedAmount} · {claim.status}
                        </small>
                        {canEdit && !["paid", "rejected"].includes(claim.status) ? (
                          <div className="occupancy-detail-actions">
                            {claimStatuses.filter((s) => s.id !== claim.status).slice(0, 3).map((status) => (
                              <button
                                key={status.id}
                                className="text-button"
                                type="button"
                                onClick={async () => {
                                  const patch = { status: status.id };
                                  if (status.id === "approved" || status.id === "paid") {
                                    patch.approvedAmount = claim.claimedAmount;
                                    patch.paymentReceived = status.id === "paid" ? claim.claimedAmount : claim.paymentReceived;
                                  }
                                  await updateWarrantyClaim(departmentId, claim.id, patch, actor);
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
                ) : (
                  <p className="occupancy-muted">No warranty claims yet.</p>
                )}
              </div>
            </section>
          </section>
        ) : null}

        {modal === "tire" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Add tire</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={tireDraft.fleetAssetId} onChange={(e) => setTireDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Position">
                  <select value={tireDraft.position} onChange={(e) => setTireDraft((c) => ({ ...c, position: e.target.value }))}>
                    {tirePositions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Manufacturer"><input value={tireDraft.manufacturer} onChange={(e) => setTireDraft((c) => ({ ...c, manufacturer: e.target.value }))} /></Field>
                <Field label="Size"><input value={tireDraft.size} onChange={(e) => setTireDraft((c) => ({ ...c, size: e.target.value }))} /></Field>
                <Field label="Tread (32nds)"><input value={tireDraft.treadDepth} onChange={(e) => setTireDraft((c) => ({ ...c, treadDepth: e.target.value }))} /></Field>
                <Field label="Condition">
                  <select value={tireDraft.condition} onChange={(e) => setTireDraft((c) => ({ ...c, condition: e.target.value }))}>
                    {tireConditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveFleetTire(departmentId, tireDraft, actor);
                    setModal("");
                    setMessage("Tire saved.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save tire.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "battery" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Add battery</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={batteryDraft.fleetAssetId} onChange={(e) => setBatteryDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Position">
                  <select value={batteryDraft.position} onChange={(e) => setBatteryDraft((c) => ({ ...c, position: e.target.value }))}>
                    {batteryPositions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
                <Field label="Manufacturer"><input value={batteryDraft.manufacturer} onChange={(e) => setBatteryDraft((c) => ({ ...c, manufacturer: e.target.value }))} /></Field>
                <Field label="Chemistry"><input value={batteryDraft.chemistry} onChange={(e) => setBatteryDraft((c) => ({ ...c, chemistry: e.target.value }))} /></Field>
                <Field label="State of health %"><input value={batteryDraft.stateOfHealth} onChange={(e) => setBatteryDraft((c) => ({ ...c, stateOfHealth: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveFleetBattery(departmentId, batteryDraft, actor);
                    setModal("");
                    setMessage("Battery saved.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save battery.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "fluid" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Record fluid event</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={fluidDraft.fleetAssetId} onChange={(e) => setFluidDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Fluid">
                  <select value={fluidDraft.fluidType} onChange={(e) => setFluidDraft((c) => ({ ...c, fluidType: e.target.value }))}>
                    {fluidTypes.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </Field>
                <Field label="Action">
                  <select value={fluidDraft.action} onChange={(e) => setFluidDraft((c) => ({ ...c, action: e.target.value }))}>
                    <option value="service">Service / change</option>
                    <option value="top_off">Top off</option>
                    <option value="sample">Sample / analysis</option>
                    <option value="leak">Leak observation</option>
                  </select>
                </Field>
                <Field label="Quantity"><input value={fluidDraft.quantity} onChange={(e) => setFluidDraft((c) => ({ ...c, quantity: e.target.value }))} /></Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={fluidDraft.leak} onChange={(e) => setFluidDraft((c) => ({ ...c, leak: e.target.checked }))} />
                  Leak
                </label>
                <Field label="Notes"><textarea rows={2} value={fluidDraft.notes} onChange={(e) => setFluidDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await recordFluidEvent(departmentId, {
                      ...fluidDraft,
                      quantity: Number(fluidDraft.quantity) || 0,
                      leak: fluidDraft.leak || fluidDraft.action === "leak",
                    }, actor);
                    setModal("");
                    setMessage("Fluid event recorded.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to record fluid.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "recall" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>New recall / bulletin</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Campaign #"><input value={recallDraft.campaignNumber} onChange={(e) => setRecallDraft((c) => ({ ...c, campaignNumber: e.target.value }))} /></Field>
                <Field label="Type">
                  <select value={recallDraft.campaignType} onChange={(e) => setRecallDraft((c) => ({ ...c, campaignType: e.target.value }))}>
                    {campaignTypes.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </Field>
                <Field label="Manufacturer"><input value={recallDraft.manufacturer} onChange={(e) => setRecallDraft((c) => ({ ...c, manufacturer: e.target.value }))} /></Field>
                <Field label="Component"><input value={recallDraft.component} onChange={(e) => setRecallDraft((c) => ({ ...c, component: e.target.value }))} /></Field>
                <Field label="Safety risk">
                  <select value={recallDraft.safetyRisk} onChange={(e) => setRecallDraft((c) => ({ ...c, safetyRisk: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="moderate">Moderate</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <label className="occupancy-primary-toggle">
                  <input type="checkbox" checked={recallDraft.oosRequired} onChange={(e) => setRecallDraft((c) => ({ ...c, oosRequired: e.target.checked }))} />
                  OOS required until complete
                </label>
                <Field label="Description"><textarea rows={3} value={recallDraft.description} onChange={(e) => setRecallDraft((c) => ({ ...c, description: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !recallDraft.description.trim()} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveFleetRecall(departmentId, recallDraft, actor);
                    setModal("");
                    setMessage("Recall / bulletin saved.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save recall.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "warranty" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>Add warranty coverage</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={warrantyDraft.fleetAssetId} onChange={(e) => setWarrantyDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Provider"><input value={warrantyDraft.provider} onChange={(e) => setWarrantyDraft((c) => ({ ...c, provider: e.target.value }))} /></Field>
                <Field label="Covered system"><input value={warrantyDraft.coveredSystem} onChange={(e) => setWarrantyDraft((c) => ({ ...c, coveredSystem: e.target.value }))} /></Field>
                <Field label="Type"><input value={warrantyDraft.warrantyType} onChange={(e) => setWarrantyDraft((c) => ({ ...c, warrantyType: e.target.value }))} /></Field>
                <Field label="Expiration date"><input type="date" value={warrantyDraft.expirationDate} onChange={(e) => setWarrantyDraft((c) => ({ ...c, expirationDate: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveFleetWarranty(departmentId, warrantyDraft, actor);
                    setModal("");
                    setMessage("Warranty coverage saved.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save warranty.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </div>
            </section>
          </div>
        ) : null}

        {modal === "claim" ? (
          <div className="modal-backdrop">
            <section className="workflow-modal">
              <header><strong>New warranty claim</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-content occupancy-form-grid">
                <Field label="Unit">
                  <select value={claimDraft.fleetAssetId} onChange={(e) => setClaimDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {assets.map((a) => <option key={a.id} value={a.id}>{a.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Warranty">
                  <select value={claimDraft.warrantyId} onChange={(e) => setClaimDraft((c) => ({ ...c, warrantyId: e.target.value }))}>
                    <option value="">None</option>
                    {(warranties?.warranties || []).map((w) => (
                      <option key={w.id} value={w.id}>{w.fleetNumber} · {w.provider || w.coveredSystem}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Claimed amount"><input value={claimDraft.claimedAmount} onChange={(e) => setClaimDraft((c) => ({ ...c, claimedAmount: e.target.value }))} /></Field>
                <Field label="Provider"><input value={claimDraft.provider} onChange={(e) => setClaimDraft((c) => ({ ...c, provider: e.target.value }))} /></Field>
                <Field label="Notes"><textarea rows={2} value={claimDraft.notes} onChange={(e) => setClaimDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
              </div>
              <div className="modal-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await createWarrantyClaim(departmentId, {
                      ...claimDraft,
                      claimedAmount: Number(claimDraft.claimedAmount) || 0,
                    }, actor);
                    setModal("");
                    setMessage("Warranty claim submitted.");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to create claim.");
                  } finally {
                    setSaving(false);
                  }
                }}>Submit</button>
              </div>
            </section>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
