import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  CalendarRange,
  CirclePlus,
  DollarSign,
  RefreshCw,
  Scale,
  Timer,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import FleetModuleLayout, {
  FleetEmptyState,
  FleetPermissionGate,
  FleetStatusBadge,
} from "../components/fleet/FleetModuleLayout.jsx";
import {
  buildCostReplacementBoard,
  canEditFleetCost,
  canViewFleetCost,
  completeDisposal,
  createCostEntry,
  createDisposalRecord,
  createDowntimeEvent,
  ensureFleetAssets,
  generateCapitalPlanFromScores,
  getCostCategories,
  getDepreciationMethods,
  getDisposalMethods,
  getDowntimeReasons,
  getReplacementCaseStatuses,
  getReplacementPriorities,
  saveCapitalPlanItem,
  saveValuation,
  scoreFleetReplacements,
  syncCostsFromOperations,
  toggleDecommissionItem,
  updateDisposalRecord,
  updateDowntimeEvent,
  updateReplacementCase,
} from "../lib/fleet/index.js";

function Field({ label, children }) {
  return (
    <label className="config-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

export default function FleetCostReplacementPage({ onNavigate, legacyApparatus = [] }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetCost(permissions, isCreator);
  const canEdit = canEditFleetCost(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("costs");
  const [board, setBoard] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState("");
  const [costDraft, setCostDraft] = useState({
    fleetAssetId: "",
    category: "corrective_maintenance",
    amount: "0",
    occurredAt: "",
    description: "",
    vendorName: "",
  });
  const [downtimeDraft, setDowntimeDraft] = useState({
    fleetAssetId: "",
    reason: "corrective",
    planned: false,
    serviceImpact: "",
    notes: "",
  });
  const [valuationDraft, setValuationDraft] = useState({
    fleetAssetId: "",
    method: "straight_line",
    originalBasis: "0",
    residual: "0",
    usefulLifeYears: "15",
    marketValue: "0",
    insuredValue: "0",
    replacementValue: "0",
  });
  const [disposalDraft, setDisposalDraft] = useState({
    fleetAssetId: "",
    method: "auction",
    moveToReserve: true,
    authorization: "",
  });
  const [capitalDraft, setCapitalDraft] = useState({
    planYear: String(new Date().getFullYear() + 1),
    fleetAssetId: "",
    description: "",
    estimatedCost: "750000",
    fundingSource: "",
    priority: "plan",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const categories = getCostCategories();
  const downtimeReasons = getDowntimeReasons();
  const priorities = getReplacementPriorities();
  const caseStatuses = getReplacementCaseStatuses();
  const depMethods = getDepreciationMethods();
  const disposalMethods = getDisposalMethods();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await ensureFleetAssets(departmentId, legacyApparatus, actor);
      const next = await buildCostReplacementBoard(departmentId);
      setBoard(next);
      setSelectedId((c) => c || next.cases[0]?.id || next.disposals[0]?.id || next.assets[0]?.id || "");
      setCostDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
      setDowntimeDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
      setValuationDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
      setDisposalDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
      setCapitalDraft((c) => ({ ...c, fleetAssetId: c.fleetAssetId || next.assets[0]?.id || "" }));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load cost & replacement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedCase = useMemo(
    () => (board?.cases || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );
  const selectedDisposal = useMemo(
    () => (board?.disposals || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );

  return (
    <FleetPermissionGate allowed={allowed} title="Cost & Replacement">
      <FleetModuleLayout
        title="Cost & Replacement"
        description="Lifecycle cost, reliability, replacement scoring, capital plan, valuation, and disposal."
        activeNavName="Cost & Replacement"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="inspections-header-actions">
            <button type="button" disabled={saving} onClick={async () => {
              setSaving(true);
              setError("");
              try {
                const result = await syncCostsFromOperations(departmentId, actor);
                setMessage(`Synced ${result.created} cost entries from work orders and fuel.`);
                await reload();
              } catch (err) {
                setError(err?.message || "Unable to sync costs.");
              } finally {
                setSaving(false);
              }
            }}>
              <RefreshCw size={14} /> Sync costs
            </button>
            <button className="primary-button" type="button" disabled={saving} onClick={async () => {
              setSaving(true);
              setError("");
              try {
                const scored = await scoreFleetReplacements(departmentId, actor);
                setMessage(`Scored ${scored.length} assets.`);
                setTab("replacement");
                await reload();
              } catch (err) {
                setError(err?.message || "Unable to score fleet.");
              } finally {
                setSaving(false);
              }
            }}>
              <Scale size={14} /> Score fleet
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading cost & replacement...</p></div> : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        {message ? <div className="banner success" role="status">{message}</div> : null}

        {!loading && board ? (
          <section className="inspections-kpi-grid" style={{ marginBottom: "12px" }}>
            {[
              ["Lifecycle cost", money(board.summary.totalCost), ""],
              ["YTD cost", money(board.summary.annualCost), ""],
              ["Downtime hrs", board.summary.downtimeHours, board.summary.openDowntime ? "warn" : ""],
              ["Urgent replace", board.summary.urgentReplacements, board.summary.urgentReplacements ? "critical" : ""],
              ["Capital plan", money(board.summary.capitalTotal), ""],
              ["Book value", money(board.summary.bookValue), ""],
            ].map(([label, value, tone]) => (
              <article className={`inspections-kpi${tone ? ` ${tone}` : ""}`} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Cost and replacement sections">
            {[
              ["costs", "Costs", DollarSign],
              ["reliability", "Reliability", Timer],
              ["replacement", "Replacement", Scale],
              ["capital", "Capital plan", CalendarRange],
              ["valuation", "Valuation", BarChart3],
              ["disposal", "Decommission", Archive],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </nav>
        ) : null}

        {!loading && tab === "costs" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("cost")}><CirclePlus size={14} /> Add cost</button>
              </div>
            ) : null}
            {(board?.costs || []).length ? (
              <section className="personnel-workspace occupancy-workspace">
                <section className="panel">
                  <header><div><strong>Cost ledger</strong></div><span className="inspections-count">{board.costs.length}</span></header>
                  <div className="panel-body">
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head">
                        <span>Date</span><span>Unit</span><span>Category</span><span>Amount</span><span>Source</span>
                      </div>
                      {board.costs.slice(0, 80).map((row) => (
                        <div className="cert-row" key={row.id}>
                          <span>{row.occurredAt || "—"}</span>
                          <strong>{row.fleetNumber || "—"}</strong>
                          <span>{categories.find((c) => c.id === row.category)?.label || row.category}</span>
                          <span>{money(row.isCredit ? -Math.abs(row.amount) : row.amount)}</span>
                          <span>{row.source}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <header><div><strong>By asset</strong></div></header>
                  <div className="panel-body">
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head">
                        <span>Unit</span><span>Total</span><span>$/mi</span><span>$/hr</span>
                      </div>
                      {(board.costSummary?.assetMetrics || []).slice(0, 20).map((row) => (
                        <div className="cert-row" key={row.fleetAssetId}>
                          <strong>{row.fleetNumber}</strong>
                          <span>{money(row.totalCost)}</span>
                          <span>{row.costPerMile != null ? money(row.costPerMile) : "—"}</span>
                          <span>{row.costPerHour != null ? money(row.costPerHour) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </section>
            ) : (
              <FleetEmptyState title="No cost entries" description="Add manual costs or sync from work orders and fuel transactions." icon={DollarSign} />
            )}
          </>
        ) : null}

        {!loading && tab === "reliability" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("downtime")}><CirclePlus size={14} /> Log downtime</button>
              </div>
            ) : null}
            <section className="panel" style={{ marginBottom: "12px" }}>
              <header><div><strong>Fleet reliability</strong></div></header>
              <div className="panel-body">
                <p>
                  Planned {board?.reliability?.plannedHours || 0} hrs · Unplanned {board?.reliability?.unplannedHours || 0} hrs · Open events {board?.reliability?.openEvents || 0}
                </p>
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Unit</span><span>Downtime</span><span>Events</span><span>Availability</span><span>MTBF (hrs)</span>
                  </div>
                  {(board?.reliability?.assetMetrics || []).slice(0, 25).map((row) => (
                    <div className="cert-row" key={row.fleetAssetId}>
                      <strong>{row.fleetNumber}</strong>
                      <span>{row.downtimeHours}</span>
                      <span>{row.events}</span>
                      <span>{row.availability}%</span>
                      <span>{row.mtbfHours ?? "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
            {(board?.downtime || []).length ? (
              <section className="panel">
                <header><div><strong>Downtime events</strong></div></header>
                <div className="panel-body">
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>Unit</span><span>Reason</span><span>Hours</span><span>Status</span><span />
                    </div>
                    {board.downtime.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <span>{downtimeReasons.find((r) => r.id === row.reason)?.label || row.reason}</span>
                        <span>{row.lostServiceHours}</span>
                        <FleetStatusBadge status={row.status} />
                        {canEdit && row.status === "open" ? (
                          <button type="button" onClick={async () => {
                            try {
                              await updateDowntimeEvent(departmentId, row.id, { endedAt: new Date().toISOString(), status: "closed" }, actor);
                              setMessage("Downtime closed.");
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to close downtime.");
                            }
                          }}>Close</button>
                        ) : <span />}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <FleetEmptyState title="No downtime logged" description="Track planned and unplanned out-of-service time for availability and MTBF." icon={Timer} />
            )}
          </>
        ) : null}

        {!loading && tab === "replacement" ? (
          (board?.cases || []).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><strong>Replacement scores</strong></div>
                  <span className="muted">Model: {board.model?.name} v{board.model?.version}</span>
                </header>
                <div className="panel-body">
                  <div className="list-select">
                    {board.cases.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={selectedId === item.id ? "active" : ""}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.fleetNumber}</strong>
                        <span>Score {item.score} · {item.recommendedYear}</span>
                        <FleetStatusBadge status={item.priority} />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><div><strong>Case detail</strong></div></header>
                <div className="panel-body">
                  {selectedCase ? (
                    <>
                      <p><strong>{selectedCase.fleetNumber}</strong> — score {selectedCase.score}</p>
                      <dl className="detail-grid">
                        <div><dt>Priority</dt><dd>{priorities.find((p) => p.id === selectedCase.priority)?.label || selectedCase.priority}</dd></div>
                        <div><dt>Recommended year</dt><dd>{selectedCase.recommendedYear}</dd></div>
                        <div><dt>Est. cost</dt><dd>{money(selectedCase.estimatedCost)}</dd></div>
                        <div><dt>Status</dt><dd><FleetStatusBadge status={selectedCase.status} /></dd></div>
                      </dl>
                      <div className="cert-table" style={{ minWidth: 0, marginTop: "8px" }}>
                        <div className="cert-row cert-head"><span>Factor</span><span>Points</span></div>
                        {Object.entries(selectedCase.factorScores || {}).map(([key, value]) => (
                          <div className="cert-row" key={key}>
                            <span>{key.replace(/_/g, " ")}</span>
                            <strong>{value}</strong>
                          </div>
                        ))}
                      </div>
                      {canEdit ? (
                        <div className="inspections-header-actions" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                          <Field label="Estimated cost">
                            <input
                              defaultValue={selectedCase.estimatedCost || ""}
                              onBlur={async (e) => {
                                const estimatedCost = Number(e.target.value) || 0;
                                await updateReplacementCase(departmentId, selectedCase.id, { estimatedCost }, actor);
                                await reload();
                              }}
                            />
                          </Field>
                          <select
                            value={selectedCase.status}
                            onChange={async (e) => {
                              await updateReplacementCase(departmentId, selectedCase.id, { status: e.target.value }, actor);
                              await reload();
                            }}
                          >
                            {caseStatuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                          </select>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">Select a scored asset.</p>
                  )}
                </div>
              </section>
            </section>
          ) : (
            <FleetEmptyState title="No replacement scores" description="Run Score fleet to evaluate age, mileage, downtime, and maintenance cost." icon={Scale} />
          )
        ) : null}

        {!loading && tab === "capital" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    const items = await generateCapitalPlanFromScores(departmentId, { horizonYears: 10 }, actor);
                    setMessage(`Generated ${items.length} capital plan items (10-year).`);
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to generate capital plan.");
                  } finally {
                    setSaving(false);
                  }
                }}>
                  <CalendarRange size={14} /> Generate from scores
                </button>
                <button type="button" onClick={() => setModal("capital")}><CirclePlus size={14} /> Add line</button>
              </div>
            ) : null}
            {(board?.capital || []).length ? (
              <>
                <section className="panel" style={{ marginBottom: "12px" }}>
                  <header><div><strong>Funding by year</strong></div></header>
                  <div className="panel-body">
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head"><span>Year</span><span>Need</span></div>
                      {(board.capitalSummary?.years || []).map((year) => (
                        <div className="cert-row" key={year}>
                          <strong>{year}</strong>
                          <span>{money(board.capitalSummary.byYear[year])}</span>
                        </div>
                      ))}
                    </div>
                    <p className="muted" style={{ marginTop: "8px" }}>
                      Total {money(board.capitalSummary?.total)} · Avg/year {money(board.capitalSummary?.annualAverage)}
                    </p>
                  </div>
                </section>
                <section className="panel">
                  <header><div><strong>Plan lines</strong></div></header>
                  <div className="panel-body">
                    <div className="cert-table" style={{ minWidth: 0 }}>
                      <div className="cert-row cert-head">
                        <span>Year</span><span>Unit</span><span>Description</span><span>Cost</span><span>Priority</span>
                      </div>
                      {board.capital.map((row) => (
                        <div className="cert-row" key={row.id}>
                          <strong>{row.planYear}</strong>
                          <span>{row.fleetNumber || "—"}</span>
                          <span>{row.description}</span>
                          <span>{money(row.estimatedCost)}</span>
                          <FleetStatusBadge status={row.priority} />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            ) : (
              <FleetEmptyState title="No capital plan" description="Generate a 10-year funding outlook from replacement scores, or add lines manually." icon={CalendarRange} />
            )}
          </>
        ) : null}

        {!loading && tab === "valuation" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("valuation")}><CirclePlus size={14} /> Add valuation</button>
              </div>
            ) : null}
            {(board?.valuations || []).length ? (
              <section className="panel">
                <header><div><strong>Depreciation & valuation</strong></div></header>
                <div className="panel-body">
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>Unit</span><span>Method</span><span>Basis</span><span>Book</span><span>Market</span><span>Replace</span>
                    </div>
                    {board.valuations.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.fleetNumber}</strong>
                        <span>{depMethods.find((m) => m.id === row.method)?.label || row.method}</span>
                        <span>{money(row.originalBasis)}</span>
                        <span>{money(row.bookValue)}</span>
                        <span>{money(row.marketValue)}</span>
                        <span>{money(row.replacementValue)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <FleetEmptyState title="No valuations" description="Record acquisition basis, useful life, and insured/replacement values." icon={BarChart3} />
            )}
          </>
        ) : null}

        {!loading && tab === "disposal" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("disposal")}><CirclePlus size={14} /> Start decommission</button>
              </div>
            ) : null}
            {(board?.disposals || []).length ? (
              <section className="personnel-workspace occupancy-workspace">
                <section className="panel">
                  <header><div><strong>Decommission / disposal</strong></div></header>
                  <div className="panel-body">
                    <div className="list-select">
                      {board.disposals.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={selectedId === item.id ? "active" : ""}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <strong>{item.fleetNumber}</strong>
                          <span>{disposalMethods.find((m) => m.id === item.method)?.label || item.method}</span>
                          <FleetStatusBadge status={item.status} />
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
                <section className="panel">
                  <header><div><strong>Checklist & disposition</strong></div></header>
                  <div className="panel-body">
                    {selectedDisposal ? (
                      <>
                        {selectedDisposal.decommissionChecklist.map((item) => (
                          <label key={item.id} className="config-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                            <input
                              type="checkbox"
                              disabled={!canEdit || saving || selectedDisposal.status === "complete"}
                              checked={item.completed}
                              onChange={async (e) => {
                                setSaving(true);
                                try {
                                  await toggleDecommissionItem(departmentId, selectedDisposal.id, item.id, e.target.checked, actor);
                                  await reload();
                                } catch (err) {
                                  setError(err?.message || "Unable to update checklist.");
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            />
                            <span>{item.label}</span>
                          </label>
                        ))}
                        {canEdit && selectedDisposal.status !== "complete" ? (
                          <div className="config-grid" style={{ marginTop: "12px" }}>
                            <Field label="Buyer / recipient">
                              <input
                                defaultValue={selectedDisposal.buyerRecipient}
                                onBlur={async (e) => {
                                  await updateDisposalRecord(departmentId, selectedDisposal.id, { buyerRecipient: e.target.value }, actor);
                                }}
                              />
                            </Field>
                            <Field label="Sale price">
                              <input
                                defaultValue={selectedDisposal.salePrice || ""}
                                onBlur={async (e) => {
                                  await updateDisposalRecord(departmentId, selectedDisposal.id, { salePrice: Number(e.target.value) || 0 }, actor);
                                  await reload();
                                }}
                              />
                            </Field>
                            <Field label="Fees">
                              <input
                                defaultValue={selectedDisposal.fees || ""}
                                onBlur={async (e) => {
                                  await updateDisposalRecord(departmentId, selectedDisposal.id, { fees: Number(e.target.value) || 0 }, actor);
                                  await reload();
                                }}
                              />
                            </Field>
                            <button
                              className="primary-button"
                              type="button"
                              disabled={saving}
                              onClick={async () => {
                                setSaving(true);
                                try {
                                  await completeDisposal(departmentId, selectedDisposal.id, {
                                    titleTransferred: true,
                                    equipmentRemoved: true,
                                    dataRemoved: true,
                                  }, actor);
                                  setMessage("Disposal complete — asset marked decommissioned.");
                                  await reload();
                                } catch (err) {
                                  setError(err?.message || "Unable to complete disposal.");
                                } finally {
                                  setSaving(false);
                                }
                              }}
                            >
                              Complete disposal
                            </button>
                          </div>
                        ) : null}
                        {selectedDisposal.status === "complete" ? (
                          <p className="muted" style={{ marginTop: "8px" }}>
                            Net proceeds {money(selectedDisposal.netProceeds)} · {selectedDisposal.disposalDate}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className="muted">Select a disposal record.</p>
                    )}
                  </div>
                </section>
              </section>
            ) : (
              <FleetEmptyState title="No decommission records" description="Move units through reserve, strip radios/markings, then dispose via auction, trade-in, or transfer." icon={Archive} />
            )}
          </>
        ) : null}

        {modal === "cost" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add cost entry</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={costDraft.fleetAssetId} onChange={(e) => setCostDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Category">
                  <select value={costDraft.category} onChange={(e) => setCostDraft((c) => ({ ...c, category: e.target.value }))}>
                    {categories.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Amount"><input value={costDraft.amount} onChange={(e) => setCostDraft((c) => ({ ...c, amount: e.target.value }))} /></Field>
                <Field label="Date"><input type="date" value={costDraft.occurredAt} onChange={(e) => setCostDraft((c) => ({ ...c, occurredAt: e.target.value }))} /></Field>
                <Field label="Vendor"><input value={costDraft.vendorName} onChange={(e) => setCostDraft((c) => ({ ...c, vendorName: e.target.value }))} /></Field>
                <Field label="Description"><textarea rows={2} value={costDraft.description} onChange={(e) => setCostDraft((c) => ({ ...c, description: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving} onClick={async () => {
                  setSaving(true);
                  try {
                    await createCostEntry(departmentId, {
                      ...costDraft,
                      amount: Number(costDraft.amount) || 0,
                      source: "manual",
                    }, actor);
                    setMessage("Cost entry added.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to add cost.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "downtime" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Log downtime</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={downtimeDraft.fleetAssetId} onChange={(e) => setDowntimeDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Reason">
                  <select value={downtimeDraft.reason} onChange={(e) => setDowntimeDraft((c) => ({ ...c, reason: e.target.value }))}>
                    {downtimeReasons.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Service impact"><input value={downtimeDraft.serviceImpact} onChange={(e) => setDowntimeDraft((c) => ({ ...c, serviceImpact: e.target.value }))} /></Field>
                <Field label="Notes"><textarea rows={2} value={downtimeDraft.notes} onChange={(e) => setDowntimeDraft((c) => ({ ...c, notes: e.target.value }))} /></Field>
                <label className="config-field" style={{ flexDirection: "row", gap: "8px", alignItems: "center" }}>
                  <input type="checkbox" checked={downtimeDraft.planned} onChange={(e) => setDowntimeDraft((c) => ({ ...c, planned: e.target.checked }))} />
                  <span>Planned downtime</span>
                </label>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !downtimeDraft.fleetAssetId} onClick={async () => {
                  setSaving(true);
                  try {
                    await createDowntimeEvent(departmentId, downtimeDraft, actor);
                    setMessage("Downtime logged.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to log downtime.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "capital" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add capital plan line</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Year"><input value={capitalDraft.planYear} onChange={(e) => setCapitalDraft((c) => ({ ...c, planYear: e.target.value }))} /></Field>
                <Field label="Asset">
                  <select value={capitalDraft.fleetAssetId} onChange={(e) => setCapitalDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Description"><input value={capitalDraft.description} onChange={(e) => setCapitalDraft((c) => ({ ...c, description: e.target.value }))} /></Field>
                <Field label="Estimated cost"><input value={capitalDraft.estimatedCost} onChange={(e) => setCapitalDraft((c) => ({ ...c, estimatedCost: e.target.value }))} /></Field>
                <Field label="Funding"><input value={capitalDraft.fundingSource} onChange={(e) => setCapitalDraft((c) => ({ ...c, fundingSource: e.target.value }))} /></Field>
                <Field label="Priority">
                  <select value={capitalDraft.priority} onChange={(e) => setCapitalDraft((c) => ({ ...c, priority: e.target.value }))}>
                    {priorities.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !capitalDraft.description} onClick={async () => {
                  setSaving(true);
                  try {
                    const asset = (board?.assets || []).find((row) => row.id === capitalDraft.fleetAssetId);
                    await saveCapitalPlanItem(departmentId, {
                      ...capitalDraft,
                      planYear: Number(capitalDraft.planYear) || new Date().getFullYear(),
                      estimatedCost: Number(capitalDraft.estimatedCost) || 0,
                      fleetNumber: asset?.fleetNumber || "",
                    }, actor);
                    setMessage("Capital line saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save capital line.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "valuation" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add valuation</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={valuationDraft.fleetAssetId} onChange={(e) => setValuationDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).map((row) => <option key={row.id} value={row.id}>{row.fleetNumber}</option>)}
                  </select>
                </Field>
                <Field label="Method">
                  <select value={valuationDraft.method} onChange={(e) => setValuationDraft((c) => ({ ...c, method: e.target.value }))}>
                    {depMethods.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Original basis"><input value={valuationDraft.originalBasis} onChange={(e) => setValuationDraft((c) => ({ ...c, originalBasis: e.target.value }))} /></Field>
                <Field label="Residual"><input value={valuationDraft.residual} onChange={(e) => setValuationDraft((c) => ({ ...c, residual: e.target.value }))} /></Field>
                <Field label="Useful life (years)"><input value={valuationDraft.usefulLifeYears} onChange={(e) => setValuationDraft((c) => ({ ...c, usefulLifeYears: e.target.value }))} /></Field>
                <Field label="Market value"><input value={valuationDraft.marketValue} onChange={(e) => setValuationDraft((c) => ({ ...c, marketValue: e.target.value }))} /></Field>
                <Field label="Insured value"><input value={valuationDraft.insuredValue} onChange={(e) => setValuationDraft((c) => ({ ...c, insuredValue: e.target.value }))} /></Field>
                <Field label="Replacement value"><input value={valuationDraft.replacementValue} onChange={(e) => setValuationDraft((c) => ({ ...c, replacementValue: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !valuationDraft.fleetAssetId} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveValuation(departmentId, {
                      ...valuationDraft,
                      id: `VAL-${valuationDraft.fleetAssetId}`,
                      originalBasis: Number(valuationDraft.originalBasis) || 0,
                      residual: Number(valuationDraft.residual) || 0,
                      usefulLifeYears: Number(valuationDraft.usefulLifeYears) || 15,
                      marketValue: Number(valuationDraft.marketValue) || 0,
                      insuredValue: Number(valuationDraft.insuredValue) || 0,
                      replacementValue: Number(valuationDraft.replacementValue) || 0,
                      depreciationStartYear: new Date().getFullYear() - 5,
                    }, actor);
                    setMessage("Valuation saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save valuation.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "disposal" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Start decommission</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Asset">
                  <select value={disposalDraft.fleetAssetId} onChange={(e) => setDisposalDraft((c) => ({ ...c, fleetAssetId: e.target.value }))}>
                    {(board?.assets || []).filter((row) => !["decommissioned", "disposed"].includes(row.status)).map((row) => (
                      <option key={row.id} value={row.id}>{row.fleetNumber}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Disposal method">
                  <select value={disposalDraft.method} onChange={(e) => setDisposalDraft((c) => ({ ...c, method: e.target.value }))}>
                    {disposalMethods.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Authorization"><input value={disposalDraft.authorization} onChange={(e) => setDisposalDraft((c) => ({ ...c, authorization: e.target.value }))} /></Field>
                <label className="config-field" style={{ flexDirection: "row", gap: "8px", alignItems: "center" }}>
                  <input type="checkbox" checked={disposalDraft.moveToReserve} onChange={(e) => setDisposalDraft((c) => ({ ...c, moveToReserve: e.target.checked }))} />
                  <span>Move to reserve now</span>
                </label>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !disposalDraft.fleetAssetId} onClick={async () => {
                  setSaving(true);
                  try {
                    await createDisposalRecord(departmentId, disposalDraft, actor);
                    setMessage("Decommission started.");
                    setModal("");
                    setTab("disposal");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to start decommission.");
                  } finally {
                    setSaving(false);
                  }
                }}>Start</button>
              </footer>
            </div>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
