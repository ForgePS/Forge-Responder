import { useEffect, useMemo, useState } from "react";
import {
  CheckSquare,
  CirclePlus,
  ClipboardList,
  FileText,
  Landmark,
  Shield,
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
  buildProcurementBoard,
  canEditFleetProcurement,
  canViewFleetProcurement,
  completeCommissioning,
  createBuildProject,
  createProcurementRequest,
  createSpecification,
  getAssetInsuranceTypes,
  getBuildProjectStatuses,
  getGrantStatuses,
  getProcurementPriorities,
  getProcurementRequestStatuses,
  getSpecStatuses,
  saveAssetInsurance,
  saveGrant,
  toggleCommissioningItem,
  updateBuildMilestone,
  updateProcurementRequest,
  updateSpecification,
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
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
}

export default function FleetProcurementPage({ onNavigate }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewFleetProcurement(permissions, isCreator);
  const canEdit = canEditFleetProcurement(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("requests");
  const [board, setBoard] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [modal, setModal] = useState("");
  const [requestDraft, setRequestDraft] = useState({
    need: "",
    fleetClass: "Engine",
    justification: "",
    operationalGap: "",
    requiredCapabilities: "",
    estimatedCost: "0",
    fundingSource: "",
    priority: "medium",
    targetDate: "",
    requestingUnit: "",
  });
  const [specDraft, setSpecDraft] = useState({
    title: "",
    version: "1.0",
    requestId: "",
    fleetClass: "",
    requirements: "",
    evaluationCriteria: "",
    committee: "",
  });
  const [buildDraft, setBuildDraft] = useState({
    name: "",
    requestId: "",
    specificationId: "",
    manufacturer: "",
    dealer: "",
    contractDate: "",
    scheduledDelivery: "",
    fleetNumberDraft: "",
  });
  const [grantDraft, setGrantDraft] = useState({
    name: "",
    agency: "",
    grantNumber: "",
    amount: "0",
    matchRequired: "0",
    status: "identified",
  });
  const [insuranceDraft, setInsuranceDraft] = useState({
    fleetNumber: "",
    buildProjectId: "",
    policyType: "physical_damage",
    carrier: "",
    policyNumber: "",
    effectiveDate: "",
    expirationDate: "",
    premium: "0",
    deductible: "0",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const priorities = getProcurementPriorities();
  const requestStatuses = getProcurementRequestStatuses();
  const specStatuses = getSpecStatuses();
  const buildStatuses = getBuildProjectStatuses();
  const grantStatuses = getGrantStatuses();
  const insuranceTypes = getAssetInsuranceTypes();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const nextBoard = await buildProcurementBoard(departmentId);
      setBoard(nextBoard);
      setSelectedId((c) => {
        if (c) return c;
        return nextBoard.requests[0]?.id
          || nextBoard.builds[0]?.id
          || nextBoard.specs[0]?.id
          || "";
      });
      setSpecDraft((c) => ({ ...c, requestId: c.requestId || nextBoard.requests[0]?.id || "" }));
      setBuildDraft((c) => ({
        ...c,
        requestId: c.requestId || nextBoard.requests[0]?.id || "",
        specificationId: c.specificationId || nextBoard.specs[0]?.id || "",
      }));
      setInsuranceDraft((c) => ({
        ...c,
        buildProjectId: c.buildProjectId || nextBoard.builds[0]?.id || "",
      }));
    } catch (loadError) {
      setError(loadError?.message || "Unable to load procurement.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const selectedBuild = useMemo(
    () => (board?.builds || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );
  const selectedRequest = useMemo(
    () => (board?.requests || []).find((row) => row.id === selectedId) || null,
    [board, selectedId]
  );

  return (
    <FleetPermissionGate allowed={allowed} title="Fleet Procurement">
      <FleetModuleLayout
        title="Fleet Procurement"
        description="Fleet requests, specifications, build tracking, commissioning, grants, and apparatus insurance."
        activeNavName="Fleet Procurement"
        onNavigate={onNavigate}
        actions={canEdit ? (
          <div className="inspections-header-actions">
            <button className="primary-button" type="button" onClick={() => setModal("request")}>
              <CirclePlus size={14} /> New request
            </button>
          </div>
        ) : null}
      >
        {loading ? <div className="inspections-loading-state" role="status"><p>Loading procurement...</p></div> : null}
        {error ? <div className="banner error" role="alert">{error}</div> : null}
        {message ? <div className="banner success" role="status">{message}</div> : null}

        {!loading && board ? (
          <section className="inspections-kpi-grid" style={{ marginBottom: "12px" }}>
            {[
              ["Open requests", board.summary.openRequests, ""],
              ["Active builds", board.summary.openBuilds, ""],
              ["Commissioning", board.summary.commissioning, "warn"],
              ["Pipeline value", money(board.summary.pipelineValue), ""],
              ["Active grants", board.summary.activeGrants, ""],
              ["Insurance expiring", board.summary.expiringInsurance, board.summary.expiringInsurance ? "critical" : ""],
            ].map(([label, value, tone]) => (
              <article className={`inspections-kpi${tone ? ` ${tone}` : ""}`} key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </article>
            ))}
          </section>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Procurement sections">
            {[
              ["requests", "Requests", ClipboardList],
              ["specs", "Specifications", FileText],
              ["builds", "Build tracking", Truck],
              ["commissioning", "Commissioning", CheckSquare],
              ["grants", "Grants", Landmark],
              ["insurance", "Insurance", Shield],
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

        {!loading && tab === "requests" ? (
          (board?.requests || []).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><strong>Fleet requests</strong></div>
                  <span className="inspections-count">{board.requests.length}</span>
                </header>
                <div className="panel-body">
                  <div className="list-select">
                    {board.requests.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={selectedId === item.id ? "active" : ""}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.requestNumber}</strong>
                        <span>{item.need || item.fleetClass || "Request"}</span>
                        <FleetStatusBadge status={item.status} />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><div><strong>Request detail</strong></div></header>
                <div className="panel-body">
                  {selectedRequest ? (
                    <>
                      <p><strong>{selectedRequest.need || "Need"}</strong></p>
                      <p className="muted">{selectedRequest.justification || "No justification yet."}</p>
                      <dl className="detail-grid">
                        <div><dt>Class</dt><dd>{selectedRequest.fleetClass || "—"}</dd></div>
                        <div><dt>Priority</dt><dd>{selectedRequest.priority}</dd></div>
                        <div><dt>Estimate</dt><dd>{money(selectedRequest.estimatedCost)}</dd></div>
                        <div><dt>Funding</dt><dd>{selectedRequest.fundingSource || "—"}</dd></div>
                        <div><dt>Target</dt><dd>{selectedRequest.targetDate || "—"}</dd></div>
                        <div><dt>Unit</dt><dd>{selectedRequest.requestingUnit || "—"}</dd></div>
                      </dl>
                      {canEdit ? (
                        <div className="inspections-header-actions" style={{ marginTop: "12px", flexWrap: "wrap" }}>
                          <select
                            value={selectedRequest.status}
                            onChange={async (e) => {
                              setSaving(true);
                              try {
                                await updateProcurementRequest(departmentId, selectedRequest.id, { status: e.target.value }, actor);
                                setMessage("Request status updated.");
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Unable to update request.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          >
                            {requestStatuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                          </select>
                          <button type="button" onClick={() => {
                            setSpecDraft((c) => ({
                              ...c,
                              requestId: selectedRequest.id,
                              title: `${selectedRequest.fleetClass || "Apparatus"} specification`,
                              fleetClass: selectedRequest.fleetClass,
                            }));
                            setModal("spec");
                          }}>Create specification</button>
                          <button type="button" onClick={() => {
                            setBuildDraft((c) => ({
                              ...c,
                              requestId: selectedRequest.id,
                              specificationId: selectedRequest.specificationId || c.specificationId,
                              name: selectedRequest.need || `${selectedRequest.fleetClass} build`,
                              fleetNumberDraft: selectedRequest.fleetClass || "",
                            }));
                            setModal("build");
                          }}>Start build</button>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">Select a request.</p>
                  )}
                </div>
              </section>
            </section>
          ) : (
            <FleetEmptyState title="No fleet requests" description="Capture capital and replacement needs with justification, funding, and priority." icon={ClipboardList} />
          )
        ) : null}

        {!loading && tab === "specs" ? (
          (board?.specs || []).length ? (
            <section className="panel">
              <header>
                <div><strong>Specifications</strong></div>
                {canEdit ? (
                  <button type="button" onClick={() => setModal("spec")}><CirclePlus size={14} /> Add</button>
                ) : null}
              </header>
              <div className="panel-body">
                <div className="cert-table" style={{ minWidth: 0 }}>
                  <div className="cert-row cert-head">
                    <span>Title</span><span>Version</span><span>Status</span><span>Award</span><span />
                  </div>
                  {board.specs.map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.title}</strong>
                      <span>{row.version}</span>
                      <FleetStatusBadge status={row.status} />
                      <span>{row.awardVendor || "—"} {row.awardPrice ? money(row.awardPrice) : ""}</span>
                      {canEdit ? (
                        <select
                          value={row.status}
                          onChange={async (e) => {
                            try {
                              await updateSpecification(departmentId, row.id, { status: e.target.value }, actor);
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to update specification.");
                            }
                          }}
                        >
                          {specStatuses.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      ) : <span />}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : (
            <FleetEmptyState title="No specifications" description="Version requirements, evaluation criteria, and award details for apparatus buys." icon={FileText} />
          )
        ) : null}

        {!loading && tab === "builds" ? (
          (board?.builds || []).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header>
                  <div><strong>Build projects</strong></div>
                  {canEdit ? (
                    <button type="button" onClick={() => setModal("build")}><CirclePlus size={14} /> New build</button>
                  ) : null}
                </header>
                <div className="panel-body">
                  <div className="list-select">
                    {board.builds.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={selectedId === item.id ? "active" : ""}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <strong>{item.projectNumber}</strong>
                        <span>{item.name}</span>
                        <FleetStatusBadge status={item.status} />
                      </button>
                    ))}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><div><strong>Milestones</strong></div></header>
                <div className="panel-body">
                  {selectedBuild ? (
                    <>
                      <p className="muted">{selectedBuild.manufacturer || "Manufacturer TBD"} · {selectedBuild.dealer || "Dealer TBD"}</p>
                      <div className="cert-table" style={{ minWidth: 0 }}>
                        <div className="cert-row cert-head">
                          <span>Milestone</span><span>Planned</span><span>Actual</span><span>Status</span>
                        </div>
                        {selectedBuild.milestones.map((ms) => (
                          <div className="cert-row" key={ms.id}>
                            <strong>{ms.name}</strong>
                            <span>{ms.plannedDate || "—"}</span>
                            <span>{ms.actualDate || "—"}</span>
                            {canEdit ? (
                              <select
                                value={ms.status}
                                onChange={async (e) => {
                                  try {
                                    await updateBuildMilestone(departmentId, selectedBuild.id, ms.id, { status: e.target.value }, actor);
                                    setMessage(`Updated ${ms.name}.`);
                                    await reload();
                                  } catch (err) {
                                    setError(err?.message || "Unable to update milestone.");
                                  }
                                }}
                              >
                                <option value="pending">Pending</option>
                                <option value="in_progress">In progress</option>
                                <option value="complete">Complete</option>
                                <option value="delayed">Delayed</option>
                                <option value="skipped">Skipped</option>
                              </select>
                            ) : (
                              <FleetStatusBadge status={ms.status} />
                            )}
                          </div>
                        ))}
                      </div>
                      <p style={{ marginTop: "8px" }}>
                        Project status: <FleetStatusBadge status={selectedBuild.status} />
                        {" "}
                        {buildStatuses.find((s) => s.id === selectedBuild.status)?.label || selectedBuild.status}
                      </p>
                    </>
                  ) : (
                    <p className="muted">Select a build project.</p>
                  )}
                </div>
              </section>
            </section>
          ) : (
            <FleetEmptyState title="No build projects" description="Track manufacturer milestones from preconstruction through acceptance." icon={Truck} />
          )
        ) : null}

        {!loading && tab === "commissioning" ? (
          (board?.builds || []).filter((row) => !["planned", "cancelled"].includes(row.status)).length ? (
            <section className="personnel-workspace occupancy-workspace">
              <section className="panel">
                <header><div><strong>Projects in delivery / commissioning</strong></div></header>
                <div className="panel-body">
                  <div className="list-select">
                    {board.builds
                      .filter((row) => !["planned", "cancelled"].includes(row.status))
                      .map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={selectedId === item.id ? "active" : ""}
                          onClick={() => setSelectedId(item.id)}
                        >
                          <strong>{item.projectNumber}</strong>
                          <span>{item.fleetNumberDraft || item.name}</span>
                          <FleetStatusBadge status={item.status} />
                        </button>
                      ))}
                  </div>
                </div>
              </section>
              <section className="panel">
                <header><div><strong>Acceptance checklist</strong></div></header>
                <div className="panel-body">
                  {selectedBuild ? (
                    <>
                      {selectedBuild.commissioning.map((item) => (
                        <label key={item.id} className="config-field" style={{ flexDirection: "row", alignItems: "center", gap: "8px" }}>
                          <input
                            type="checkbox"
                            disabled={!canEdit || saving}
                            checked={item.completed}
                            onChange={async (e) => {
                              setSaving(true);
                              try {
                                await toggleCommissioningItem(departmentId, selectedBuild.id, item.id, e.target.checked, actor);
                                await reload();
                              } catch (err) {
                                setError(err?.message || "Unable to update checklist.");
                              } finally {
                                setSaving(false);
                              }
                            }}
                          />
                          <span>{item.label}</span>
                          {item.completedBy ? <span className="muted">· {item.completedBy}</span> : null}
                        </label>
                      ))}
                      {canEdit && selectedBuild.status !== "complete" ? (
                        <button
                          className="primary-button"
                          type="button"
                          style={{ marginTop: "12px" }}
                          disabled={saving}
                          onClick={async () => {
                            setSaving(true);
                            setError("");
                            try {
                              await completeCommissioning(departmentId, selectedBuild.id, {
                                createAsset: true,
                                fleetNumber: selectedBuild.fleetNumberDraft || selectedBuild.projectNumber,
                                name: selectedBuild.name,
                              }, actor);
                              setMessage("Commissioning complete — fleet asset created.");
                              await reload();
                            } catch (err) {
                              setError(err?.message || "Unable to complete commissioning.");
                            } finally {
                              setSaving(false);
                            }
                          }}
                        >
                          Complete commissioning & create asset
                        </button>
                      ) : null}
                      {selectedBuild.fleetAssetId ? (
                        <p className="muted" style={{ marginTop: "8px" }}>Linked asset: {selectedBuild.fleetAssetId}</p>
                      ) : null}
                    </>
                  ) : (
                    <p className="muted">Select a project.</p>
                  )}
                </div>
              </section>
            </section>
          ) : (
            <FleetEmptyState title="Nothing in commissioning" description="After delivery, run factory acceptance, training, CAD, NERIS, insurance, and in-service approval." icon={CheckSquare} />
          )
        ) : null}

        {!loading && tab === "grants" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("grant")}><CirclePlus size={14} /> Add grant</button>
              </div>
            ) : null}
            {(board?.grants || []).length ? (
              <section className="panel">
                <header><div><strong>Grants & funding</strong></div></header>
                <div className="panel-body">
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>Grant</span><span>Agency</span><span>Amount</span><span>Status</span>
                    </div>
                    {board.grants.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.name}</strong>
                        <span>{row.agency || "—"}</span>
                        <span>{money(row.amount)}</span>
                        <FleetStatusBadge status={row.status} />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <FleetEmptyState title="No grants tracked" description="Link AFG, SAFER, and local capital funding to fleet requests." icon={Landmark} />
            )}
          </>
        ) : null}

        {!loading && tab === "insurance" ? (
          <>
            {canEdit ? (
              <div className="inspections-header-actions" style={{ marginBottom: "8px" }}>
                <button type="button" onClick={() => setModal("insurance")}><CirclePlus size={14} /> Add policy</button>
              </div>
            ) : null}
            {(board?.insurance || []).length ? (
              <section className="panel">
                <header><div><strong>Apparatus insurance</strong></div></header>
                <div className="panel-body">
                  <div className="cert-table" style={{ minWidth: 0 }}>
                    <div className="cert-row cert-head">
                      <span>Unit</span><span>Carrier</span><span>Policy</span><span>Expires</span><span>Type</span>
                    </div>
                    {board.insurance.map((row) => (
                      <div className="cert-row" key={row.id}>
                        <strong>{row.fleetNumber || row.buildProjectId || "—"}</strong>
                        <span>{row.carrier || "—"}</span>
                        <span>{row.policyNumber || "—"}</span>
                        <span>{row.expirationDate || "—"}</span>
                        <span>{insuranceTypes.find((t) => t.id === row.policyType)?.label || row.policyType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            ) : (
              <FleetEmptyState title="No insurance policies" description="Bind liability and physical damage coverage before in-service." icon={Shield} />
            )}
          </>
        ) : null}

        {modal === "request" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>New fleet request</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Need"><input value={requestDraft.need} onChange={(e) => setRequestDraft((c) => ({ ...c, need: e.target.value }))} /></Field>
                <Field label="Fleet class"><input value={requestDraft.fleetClass} onChange={(e) => setRequestDraft((c) => ({ ...c, fleetClass: e.target.value }))} /></Field>
                <Field label="Requesting unit"><input value={requestDraft.requestingUnit} onChange={(e) => setRequestDraft((c) => ({ ...c, requestingUnit: e.target.value }))} /></Field>
                <Field label="Priority">
                  <select value={requestDraft.priority} onChange={(e) => setRequestDraft((c) => ({ ...c, priority: e.target.value }))}>
                    {priorities.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Estimated cost"><input value={requestDraft.estimatedCost} onChange={(e) => setRequestDraft((c) => ({ ...c, estimatedCost: e.target.value }))} /></Field>
                <Field label="Funding source"><input value={requestDraft.fundingSource} onChange={(e) => setRequestDraft((c) => ({ ...c, fundingSource: e.target.value }))} /></Field>
                <Field label="Target date"><input type="date" value={requestDraft.targetDate} onChange={(e) => setRequestDraft((c) => ({ ...c, targetDate: e.target.value }))} /></Field>
                <Field label="Justification"><textarea rows={3} value={requestDraft.justification} onChange={(e) => setRequestDraft((c) => ({ ...c, justification: e.target.value }))} /></Field>
                <Field label="Operational gap"><textarea rows={2} value={requestDraft.operationalGap} onChange={(e) => setRequestDraft((c) => ({ ...c, operationalGap: e.target.value }))} /></Field>
                <Field label="Required capabilities"><textarea rows={2} value={requestDraft.requiredCapabilities} onChange={(e) => setRequestDraft((c) => ({ ...c, requiredCapabilities: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !requestDraft.need} onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await createProcurementRequest(departmentId, {
                      ...requestDraft,
                      estimatedCost: Number(requestDraft.estimatedCost) || 0,
                      status: "submitted",
                    }, actor);
                    setMessage("Fleet request created.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to create request.");
                  } finally {
                    setSaving(false);
                  }
                }}>Submit request</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "spec" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>New specification</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Title"><input value={specDraft.title} onChange={(e) => setSpecDraft((c) => ({ ...c, title: e.target.value }))} /></Field>
                <Field label="Version"><input value={specDraft.version} onChange={(e) => setSpecDraft((c) => ({ ...c, version: e.target.value }))} /></Field>
                <Field label="Linked request">
                  <select value={specDraft.requestId} onChange={(e) => setSpecDraft((c) => ({ ...c, requestId: e.target.value }))}>
                    <option value="">None</option>
                    {(board?.requests || []).map((row) => <option key={row.id} value={row.id}>{row.requestNumber} · {row.need || row.fleetClass}</option>)}
                  </select>
                </Field>
                <Field label="Fleet class"><input value={specDraft.fleetClass} onChange={(e) => setSpecDraft((c) => ({ ...c, fleetClass: e.target.value }))} /></Field>
                <Field label="Committee"><input value={specDraft.committee} onChange={(e) => setSpecDraft((c) => ({ ...c, committee: e.target.value }))} /></Field>
                <Field label="Requirements"><textarea rows={3} value={specDraft.requirements} onChange={(e) => setSpecDraft((c) => ({ ...c, requirements: e.target.value }))} /></Field>
                <Field label="Evaluation criteria"><textarea rows={2} value={specDraft.evaluationCriteria} onChange={(e) => setSpecDraft((c) => ({ ...c, evaluationCriteria: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !specDraft.title} onClick={async () => {
                  setSaving(true);
                  try {
                    await createSpecification(departmentId, specDraft, actor);
                    setMessage("Specification created.");
                    setModal("");
                    setTab("specs");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to create specification.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "build" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Start build project</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Project name"><input value={buildDraft.name} onChange={(e) => setBuildDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Draft fleet number"><input value={buildDraft.fleetNumberDraft} onChange={(e) => setBuildDraft((c) => ({ ...c, fleetNumberDraft: e.target.value }))} /></Field>
                <Field label="Manufacturer"><input value={buildDraft.manufacturer} onChange={(e) => setBuildDraft((c) => ({ ...c, manufacturer: e.target.value }))} /></Field>
                <Field label="Dealer"><input value={buildDraft.dealer} onChange={(e) => setBuildDraft((c) => ({ ...c, dealer: e.target.value }))} /></Field>
                <Field label="Contract date"><input type="date" value={buildDraft.contractDate} onChange={(e) => setBuildDraft((c) => ({ ...c, contractDate: e.target.value }))} /></Field>
                <Field label="Scheduled delivery"><input type="date" value={buildDraft.scheduledDelivery} onChange={(e) => setBuildDraft((c) => ({ ...c, scheduledDelivery: e.target.value }))} /></Field>
                <Field label="Linked request">
                  <select value={buildDraft.requestId} onChange={(e) => setBuildDraft((c) => ({ ...c, requestId: e.target.value }))}>
                    <option value="">None</option>
                    {(board?.requests || []).map((row) => <option key={row.id} value={row.id}>{row.requestNumber}</option>)}
                  </select>
                </Field>
                <Field label="Specification">
                  <select value={buildDraft.specificationId} onChange={(e) => setBuildDraft((c) => ({ ...c, specificationId: e.target.value }))}>
                    <option value="">None</option>
                    {(board?.specs || []).map((row) => <option key={row.id} value={row.id}>{row.title}</option>)}
                  </select>
                </Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !buildDraft.name} onClick={async () => {
                  setSaving(true);
                  try {
                    await createBuildProject(departmentId, { ...buildDraft, status: "in_production" }, actor);
                    setMessage("Build project started.");
                    setModal("");
                    setTab("builds");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to create build.");
                  } finally {
                    setSaving(false);
                  }
                }}>Start build</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "grant" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add grant</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Name"><input value={grantDraft.name} onChange={(e) => setGrantDraft((c) => ({ ...c, name: e.target.value }))} /></Field>
                <Field label="Agency"><input value={grantDraft.agency} onChange={(e) => setGrantDraft((c) => ({ ...c, agency: e.target.value }))} /></Field>
                <Field label="Grant number"><input value={grantDraft.grantNumber} onChange={(e) => setGrantDraft((c) => ({ ...c, grantNumber: e.target.value }))} /></Field>
                <Field label="Amount"><input value={grantDraft.amount} onChange={(e) => setGrantDraft((c) => ({ ...c, amount: e.target.value }))} /></Field>
                <Field label="Match required"><input value={grantDraft.matchRequired} onChange={(e) => setGrantDraft((c) => ({ ...c, matchRequired: e.target.value }))} /></Field>
                <Field label="Status">
                  <select value={grantDraft.status} onChange={(e) => setGrantDraft((c) => ({ ...c, status: e.target.value }))}>
                    {grantStatuses.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !grantDraft.name} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveGrant(departmentId, {
                      ...grantDraft,
                      amount: Number(grantDraft.amount) || 0,
                      matchRequired: Number(grantDraft.matchRequired) || 0,
                    }, actor);
                    setMessage("Grant saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save grant.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}

        {modal === "insurance" ? (
          <div className="modal-backdrop" role="dialog">
            <div className="modal-card">
              <header><strong>Add apparatus insurance</strong><button type="button" onClick={() => setModal("")}>×</button></header>
              <div className="modal-body config-grid">
                <Field label="Fleet number"><input value={insuranceDraft.fleetNumber} onChange={(e) => setInsuranceDraft((c) => ({ ...c, fleetNumber: e.target.value }))} /></Field>
                <Field label="Build project">
                  <select value={insuranceDraft.buildProjectId} onChange={(e) => setInsuranceDraft((c) => ({ ...c, buildProjectId: e.target.value }))}>
                    <option value="">None</option>
                    {(board?.builds || []).map((row) => <option key={row.id} value={row.id}>{row.projectNumber}</option>)}
                  </select>
                </Field>
                <Field label="Type">
                  <select value={insuranceDraft.policyType} onChange={(e) => setInsuranceDraft((c) => ({ ...c, policyType: e.target.value }))}>
                    {insuranceTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                  </select>
                </Field>
                <Field label="Carrier"><input value={insuranceDraft.carrier} onChange={(e) => setInsuranceDraft((c) => ({ ...c, carrier: e.target.value }))} /></Field>
                <Field label="Policy number"><input value={insuranceDraft.policyNumber} onChange={(e) => setInsuranceDraft((c) => ({ ...c, policyNumber: e.target.value }))} /></Field>
                <Field label="Effective"><input type="date" value={insuranceDraft.effectiveDate} onChange={(e) => setInsuranceDraft((c) => ({ ...c, effectiveDate: e.target.value }))} /></Field>
                <Field label="Expiration"><input type="date" value={insuranceDraft.expirationDate} onChange={(e) => setInsuranceDraft((c) => ({ ...c, expirationDate: e.target.value }))} /></Field>
                <Field label="Premium"><input value={insuranceDraft.premium} onChange={(e) => setInsuranceDraft((c) => ({ ...c, premium: e.target.value }))} /></Field>
                <Field label="Deductible"><input value={insuranceDraft.deductible} onChange={(e) => setInsuranceDraft((c) => ({ ...c, deductible: e.target.value }))} /></Field>
              </div>
              <footer>
                <button type="button" onClick={() => setModal("")}>Cancel</button>
                <button className="primary-button" type="button" disabled={saving || !insuranceDraft.carrier} onClick={async () => {
                  setSaving(true);
                  try {
                    await saveAssetInsurance(departmentId, {
                      ...insuranceDraft,
                      premium: Number(insuranceDraft.premium) || 0,
                      deductible: Number(insuranceDraft.deductible) || 0,
                      certificateOnFile: true,
                    }, actor);
                    setMessage("Insurance policy saved.");
                    setModal("");
                    await reload();
                  } catch (err) {
                    setError(err?.message || "Unable to save insurance.");
                  } finally {
                    setSaving(false);
                  }
                }}>Save</button>
              </footer>
            </div>
          </div>
        ) : null}
      </FleetModuleLayout>
    </FleetPermissionGate>
  );
}
