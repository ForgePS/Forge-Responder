import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CirclePlus,
  Gavel,
  RotateCcw,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  canEditInspectionEnforcement,
  canViewInspectionEnforcement,
  completeReinspectionAttempt,
  createAppeal,
  createCitation,
  createEnforcementOrder,
  decideAppeal,
  getEnforcementOrderTypeOptions,
  issueCitation,
  issueEnforcementOrder,
  labelForAppealStatus,
  labelForCitationStatus,
  labelForCorrectionStatus,
  labelForOrderStatus,
  labelForReinspectionStatus,
  liftEnforcementOrder,
  listInspectionRecords,
  listViolations,
  loadEnforcementBoard,
  markReinspectionNoAccess,
  reviewCorrection,
  scheduleReinspection,
  submitCorrection,
  updateAppeal,
} from "../lib/inspections/index.js";

function Field({ label, children, wide = false }) {
  return (
    <label className={`config-field${wide ? " wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

const TABS = [
  { id: "reinspections", label: "Reinspections" },
  { id: "orders", label: "Orders" },
  { id: "citations", label: "Citations" },
  { id: "appeals", label: "Appeals" },
  { id: "corrections", label: "Corrections" },
];

export default function InspectionEnforcementPage({ onNavigate, query = "" }) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionEnforcement(permissions, isCreator);
  const canEdit = canEditInspectionEnforcement(permissions, isCreator);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("reinspections");
  const [board, setBoard] = useState(null);
  const [inspections, setInspections] = useState([]);
  const [violations, setViolations] = useState([]);
  const [modal, setModal] = useState("");

  const [reiInspectionId, setReiInspectionId] = useState("");
  const [reiDate, setReiDate] = useState("");
  const [orderDraft, setOrderDraft] = useState({
    orderTypeId: "fire_watch",
    inspectionId: "",
    requirements: "",
    title: "",
  });
  const [citationDraft, setCitationDraft] = useState({
    violationId: "",
    fineAmount: "0",
    description: "",
    dueAt: "",
  });
  const [appealDraft, setAppealDraft] = useState({
    citationId: "",
    appellantName: "",
    grounds: "",
    hearingAt: "",
  });
  const [correctionDraft, setCorrectionDraft] = useState({
    violationId: "",
    submittedByName: "",
    explanation: "",
    evidenceNotes: "",
    reinspectionRequested: false,
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };

  const orderTypes = getEnforcementOrderTypeOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [nextBoard, nextInspections, nextViolations] = await Promise.all([
        loadEnforcementBoard(departmentId),
        listInspectionRecords(departmentId, {}),
        listViolations(departmentId, { openOnly: true }),
      ]);
      setBoard(nextBoard);
      setInspections(Array.isArray(nextInspections) ? nextInspections : []);
      setViolations(Array.isArray(nextViolations) ? nextViolations : []);
      setReiInspectionId((current) => current || nextInspections[0]?.id || "");
      setOrderDraft((current) => ({
        ...current,
        inspectionId: current.inspectionId || nextInspections[0]?.id || "",
      }));
      setCitationDraft((current) => ({
        ...current,
        violationId: current.violationId || nextViolations[0]?.id || "",
      }));
      setCorrectionDraft((current) => ({
        ...current,
        violationId: current.violationId || nextViolations[0]?.id || "",
      }));
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load enforcement board.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const metrics = board?.metrics || {};
  const needle = String(query || "").trim().toLowerCase();

  const filteredReinspections = useMemo(() => {
    const rows = board?.reinspections || [];
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle]);

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setModal("");
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Enforcement Cases">
      <InspectionsModuleLayout
        title="Enforcement Cases"
        description="Reinspections, fire-watch / stop-work orders, citations, appeals, and correction review."
        activeNavName="Enforcement Cases"
        onNavigate={onNavigate}
        tabs={[
          { id: "enforcement", label: "Enforcement Cases", navName: "Enforcement Cases" },
          { id: "violations", label: "Open Violations", navName: "Open Violations" },
          { id: "notices", label: "Notices & Certificates", navName: "Notices & Certificates" },
        ]}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="secondary-button" type="button" onClick={() => setModal("reinspection")}>
              <RotateCcw size={14} /> Schedule reinspection
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("order")}>
              <ShieldAlert size={14} /> New order
            </button>
            <button className="primary-button" type="button" onClick={() => setModal("citation")}>
              <CirclePlus size={14} /> Citation
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {loading ? <p className="occupancy-muted">Loading enforcement…</p> : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Reinspections open", metrics.reinspectionsOpen || 0],
              ["Active orders", metrics.ordersActive || 0],
              ["Open citations", metrics.citationsOpen || 0],
              ["Open appeals", metrics.appealsOpen || 0],
              ["Corrections pending", metrics.correctionsPending || 0],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Enforcement sections">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`inspections-subnav-item${tab === item.id ? " active" : ""}`}
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        ) : null}

        {modal === "reinspection" && canEdit ? (
          <section className="panel">
            <header><div><RotateCcw size={15} /><strong>Schedule reinspection</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Original inspection" wide>
                <select value={reiInspectionId} onChange={(e) => setReiInspectionId(e.target.value)}>
                  {inspections.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.inspectionNumber} — {row.occupancyName || "No occupancy"}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Scheduled date">
                <input type="date" value={reiDate} onChange={(e) => setReiDate(e.target.value)} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !reiInspectionId}
                  onClick={() => run(
                    () => scheduleReinspection(departmentId, reiInspectionId, {
                      scheduledAt: reiDate ? new Date(reiDate).toISOString() : "",
                    }, actor),
                    "Reinspection scheduled."
                  )}
                >
                  Schedule
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "order" && canEdit ? (
          <section className="panel">
            <header><div><ShieldAlert size={15} /><strong>New enforcement order</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Order type">
                <select
                  value={orderDraft.orderTypeId}
                  onChange={(e) => setOrderDraft((c) => ({ ...c, orderTypeId: e.target.value }))}
                >
                  {orderTypes.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </Field>
              <Field label="Linked inspection" wide>
                <select
                  value={orderDraft.inspectionId}
                  onChange={(e) => setOrderDraft((c) => ({ ...c, inspectionId: e.target.value }))}
                >
                  {inspections.map((row) => (
                    <option key={row.id} value={row.id}>{row.inspectionNumber} — {row.occupancyName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title" wide>
                <input value={orderDraft.title} onChange={(e) => setOrderDraft((c) => ({ ...c, title: e.target.value }))} />
              </Field>
              <Field label="Requirements" wide>
                <textarea
                  rows={3}
                  value={orderDraft.requirements}
                  onChange={(e) => setOrderDraft((c) => ({ ...c, requirements: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => run(async () => {
                    const inspection = inspections.find((row) => row.id === orderDraft.inspectionId);
                    await createEnforcementOrder(departmentId, {
                      ...orderDraft,
                      occupancyId: inspection?.occupancyId,
                      occupancyName: inspection?.occupancyName,
                      address: inspection?.address,
                      inspectionNumber: inspection?.inspectionNumber,
                      title: orderDraft.title || orderTypes.find((t) => t.id === orderDraft.orderTypeId)?.label,
                    }, actor);
                  }, "Order created.")}
                >
                  Create draft order
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "citation" && canEdit ? (
          <section className="panel">
            <header><div><Gavel size={15} /><strong>New citation</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Violation" wide>
                <select
                  value={citationDraft.violationId}
                  onChange={(e) => setCitationDraft((c) => ({ ...c, violationId: e.target.value }))}
                >
                  {violations.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} — {row.occupancyName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Fine amount">
                <input
                  type="number"
                  value={citationDraft.fineAmount}
                  onChange={(e) => setCitationDraft((c) => ({ ...c, fineAmount: e.target.value }))}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={citationDraft.dueAt}
                  onChange={(e) => setCitationDraft((c) => ({ ...c, dueAt: e.target.value }))}
                />
              </Field>
              <Field label="Description" wide>
                <textarea
                  rows={2}
                  value={citationDraft.description}
                  onChange={(e) => setCitationDraft((c) => ({ ...c, description: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !citationDraft.violationId}
                  onClick={() => run(async () => {
                    const violation = violations.find((row) => row.id === citationDraft.violationId);
                    await createCitation(departmentId, {
                      violationId: violation?.id,
                      inspectionId: violation?.inspectionId,
                      occupancyId: violation?.occupancyId,
                      occupancyName: violation?.occupancyName,
                      address: violation?.address,
                      codeCitation: violation?.codeCitation,
                      description: citationDraft.description || violation?.description || violation?.name,
                      fineAmount: Number(citationDraft.fineAmount) || 0,
                      dueAt: citationDraft.dueAt,
                    }, actor);
                  }, "Citation created.")}
                >
                  Create citation
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "reinspections" ? (
          <section className="panel">
            <header><div><RotateCcw size={15} /><strong>Reinspections</strong></div></header>
            <div className="panel-body">
              {!filteredReinspections.length ? (
                <InspectionEmptyState
                  title="No reinspection records"
                  description="Schedule a reinspection from an original inspection with open violations."
                />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>Original</span>
                    <span>New</span>
                    <span>Occupancy</span>
                    <span>Attempt</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {filteredReinspections.map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.reinspectionNumber}</strong>
                      <span>{row.originalInspectionNumber}</span>
                      <span>{row.newInspectionNumber}</span>
                      <span>{row.occupancyName}</span>
                      <span>#{row.attemptNumber}</span>
                      <span><InspectionStatusBadge status={labelForReinspectionStatus(row.status)} /></span>
                      <span className="occupancy-detail-actions">
                        {canEdit && !["completed", "cancelled"].includes(row.status) ? (
                          <>
                            <button
                              className="text-button"
                              type="button"
                              disabled={saving}
                              onClick={() => run(
                                () => markReinspectionNoAccess(departmentId, row.id, "No access recorded", actor),
                                "No-access recorded."
                              )}
                            >
                              No access
                            </button>
                            <button
                              className="text-button"
                              type="button"
                              disabled={saving}
                              onClick={() => run(
                                () => completeReinspectionAttempt(departmentId, row.id, actor),
                                "Reinspection attempt completed."
                              )}
                            >
                              Complete
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "orders" ? (
          <section className="panel">
            <header>
              <div><ShieldAlert size={15} /><strong>Enforcement orders</strong></div>
              {canEdit ? (
                <button className="secondary-button" type="button" onClick={() => setModal("order")}>New order</button>
              ) : null}
            </header>
            <div className="panel-body">
              {!(board?.orders || []).length ? (
                <InspectionEmptyState title="No orders" description="Create fire-watch, stop-work, closure, or unsafe-building orders." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>Type</span>
                    <span>Occupancy</span>
                    <span>Status</span>
                    <span>Effective</span>
                    <span>Actions</span>
                  </div>
                  {(board.orders || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.orderNumber}</strong>
                      <span>{orderTypes.find((t) => t.id === row.orderTypeId)?.label || row.orderTypeId}</span>
                      <span>{row.occupancyName || "—"}</span>
                      <span><InspectionStatusBadge status={labelForOrderStatus(row.status)} /></span>
                      <span>{formatDate(row.effectiveAt)}</span>
                      <span className="occupancy-detail-actions">
                        {canEdit && row.status === "draft" ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => issueEnforcementOrder(departmentId, row.id, actor),
                            "Order issued."
                          )}>Issue</button>
                        ) : null}
                        {canEdit && ["issued", "active"].includes(row.status) ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => liftEnforcementOrder(departmentId, row.id, actor),
                            "Order lifted."
                          )}>Lift</button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "citations" ? (
          <section className="panel">
            <header>
              <div><Gavel size={15} /><strong>Citations</strong></div>
              {canEdit ? (
                <button className="secondary-button" type="button" onClick={() => setModal("citation")}>New citation</button>
              ) : null}
            </header>
            <div className="panel-body">
              {!(board?.citations || []).length ? (
                <InspectionEmptyState title="No citations" description="Issue citations from escalated or open violations." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>Occupancy</span>
                    <span>Fine</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.citations || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.citationNumber}</strong>
                      <span>{row.occupancyName || "—"}</span>
                      <span>${Number(row.fineAmount || 0).toFixed(0)}</span>
                      <span><InspectionStatusBadge status={labelForCitationStatus(row.status)} /></span>
                      <span className="occupancy-detail-actions">
                        {canEdit && row.status === "draft" ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => issueCitation(departmentId, row.id, actor),
                            "Citation issued."
                          )}>Issue</button>
                        ) : null}
                        {canEdit && ["issued", "served"].includes(row.status) ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => {
                            setAppealDraft({
                              citationId: row.id,
                              appellantName: "",
                              grounds: "",
                              hearingAt: "",
                            });
                            setModal("appeal");
                          }}>File appeal</button>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {modal === "appeal" && canEdit ? (
          <section className="panel">
            <header><div><Scale size={15} /><strong>File appeal</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Appellant">
                <input value={appealDraft.appellantName} onChange={(e) => setAppealDraft((c) => ({ ...c, appellantName: e.target.value }))} />
              </Field>
              <Field label="Hearing date">
                <input type="date" value={appealDraft.hearingAt} onChange={(e) => setAppealDraft((c) => ({ ...c, hearingAt: e.target.value }))} />
              </Field>
              <Field label="Grounds" wide>
                <textarea rows={3} value={appealDraft.grounds} onChange={(e) => setAppealDraft((c) => ({ ...c, grounds: e.target.value }))} />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving}
                  onClick={() => run(async () => {
                    const citation = (board?.citations || []).find((row) => row.id === appealDraft.citationId);
                    await createAppeal(departmentId, {
                      ...appealDraft,
                      citationNumber: citation?.citationNumber,
                      occupancyId: citation?.occupancyId,
                      occupancyName: citation?.occupancyName,
                      address: citation?.address,
                      inspectionId: citation?.inspectionId,
                      hearingAt: appealDraft.hearingAt || "",
                    }, actor);
                  }, "Appeal filed.")}
                >
                  File appeal
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "appeals" ? (
          <section className="panel">
            <header><div><Scale size={15} /><strong>Appeals & hearings</strong></div></header>
            <div className="panel-body">
              {!(board?.appeals || []).length ? (
                <InspectionEmptyState title="No appeals" description="Appeals can be filed from issued citations." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Number</span>
                    <span>Citation</span>
                    <span>Appellant</span>
                    <span>Hearing</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.appeals || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.appealNumber}</strong>
                      <span>{row.citationNumber || "—"}</span>
                      <span>{row.appellantName || "—"}</span>
                      <span>{formatDate(row.hearingAt)}</span>
                      <span><InspectionStatusBadge status={labelForAppealStatus(row.status)} /></span>
                      <span className="occupancy-detail-actions">
                        {canEdit && ["filed", "scheduled"].includes(row.status) ? (
                          <button className="text-button" type="button" disabled={saving} onClick={() => run(
                            () => updateAppeal(departmentId, row.id, { status: "scheduled" }, actor),
                            "Hearing scheduled."
                          )}>Schedule</button>
                        ) : null}
                        {canEdit && !["upheld", "overturned", "modified", "withdrawn", "closed"].includes(row.status) ? (
                          <>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => decideAppeal(departmentId, row.id, "upheld", "Upheld on review", actor),
                              "Appeal upheld."
                            )}>Uphold</button>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => decideAppeal(departmentId, row.id, "overturned", "Overturned on review", actor),
                              "Appeal overturned."
                            )}>Overturn</button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "corrections" ? (
          <section className="panel">
            <header>
              <div><AlertTriangle size={15} /><strong>Correction submissions</strong></div>
              {canEdit ? (
                <button className="secondary-button" type="button" onClick={() => setModal("correction")}>
                  Log correction
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              <p className="occupancy-muted">Staff-mediated correction portal. Public self-service portal is deferred.</p>
              {!(board?.corrections || []).length ? (
                <InspectionEmptyState title="No correction submissions" description="Log evidence submitted by a responsible party for inspector review." />
              ) : (
                <div className="cert-table">
                  <div className="cert-row cert-head">
                    <span>Occupancy</span>
                    <span>Submitted by</span>
                    <span>Status</span>
                    <span>Actions</span>
                  </div>
                  {(board.corrections || []).map((row) => (
                    <div className="cert-row" key={row.id}>
                      <strong>{row.occupancyName || "—"}</strong>
                      <span>{row.submittedByName || "—"}</span>
                      <span><InspectionStatusBadge status={labelForCorrectionStatus(row.status)} /></span>
                      <span className="occupancy-detail-actions">
                        {canEdit && ["submitted", "under_review", "more_info_requested"].includes(row.status) ? (
                          <>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => reviewCorrection(departmentId, row.id, { status: "accepted", reviewNotes: "Evidence accepted." }, actor),
                              "Correction accepted."
                            )}>Accept</button>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => reviewCorrection(departmentId, row.id, { status: "rejected", reviewNotes: "Evidence rejected." }, actor),
                              "Correction rejected."
                            )}>Reject</button>
                            <button className="text-button" type="button" disabled={saving} onClick={() => run(
                              () => reviewCorrection(departmentId, row.id, { status: "more_info_requested", reviewNotes: "Need more information." }, actor),
                              "More info requested."
                            )}>More info</button>
                          </>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {modal === "correction" && canEdit ? (
          <section className="panel">
            <header><div><AlertTriangle size={15} /><strong>Log correction submission</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Violation" wide>
                <select
                  value={correctionDraft.violationId}
                  onChange={(e) => setCorrectionDraft((c) => ({ ...c, violationId: e.target.value }))}
                >
                  {violations.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} — {row.occupancyName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Submitted by">
                <input
                  value={correctionDraft.submittedByName}
                  onChange={(e) => setCorrectionDraft((c) => ({ ...c, submittedByName: e.target.value }))}
                />
              </Field>
              <label className="occupancy-primary-toggle">
                <input
                  type="checkbox"
                  checked={correctionDraft.reinspectionRequested}
                  onChange={(e) => setCorrectionDraft((c) => ({ ...c, reinspectionRequested: e.target.checked }))}
                />
                Reinspection requested
              </label>
              <Field label="Explanation" wide>
                <textarea
                  rows={2}
                  value={correctionDraft.explanation}
                  onChange={(e) => setCorrectionDraft((c) => ({ ...c, explanation: e.target.value }))}
                />
              </Field>
              <Field label="Evidence notes" wide>
                <textarea
                  rows={2}
                  value={correctionDraft.evidenceNotes}
                  onChange={(e) => setCorrectionDraft((c) => ({ ...c, evidenceNotes: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !correctionDraft.violationId}
                  onClick={() => run(
                    () => submitCorrection(departmentId, correctionDraft, actor),
                    "Correction logged for review."
                  )}
                >
                  Submit
                </button>
              </div>
            </div>
          </section>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
