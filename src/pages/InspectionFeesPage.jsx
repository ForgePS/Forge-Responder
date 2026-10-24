import { useEffect, useMemo, useState } from "react";
import {
  CirclePlus,
  DollarSign,
  FileText,
  Receipt,
  Scale,
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import InspectionEmptyState from "../components/inspections/InspectionEmptyState.jsx";
import InspectionPermissionGate from "../components/inspections/InspectionPermissionGate.jsx";
import InspectionStatusBadge from "../components/inspections/InspectionStatusBadge.jsx";
import InspectionsModuleLayout, {
  PREVENTION_TOOL_TABS,
} from "../components/inspections/InspectionsModuleLayout.jsx";
import {
  adjustInspectionFee,
  canEditInspectionFees,
  canViewInspectionFees,
  createInspectionFee,
  createInvoiceFromFees,
  ensureOccupancyRecords,
  formatCurrency,
  getAdjustmentTypeOptions,
  getPaymentMethodOptions,
  labelForFeeStatus,
  labelForFeeType,
  labelForInvoiceStatus,
  labelForPaymentMethod,
  labelForPaymentStatus,
  listInspectionRecords,
  loadFeeBoard,
  recordPayment,
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

const OCCUPANCY_SESSION_KEY = "forge-fees-filter-occupancy";
const INSPECTION_SESSION_KEY = "forge-fees-create-inspection";

function readSession(key) {
  if (typeof sessionStorage === "undefined") return "";
  try {
    const value = sessionStorage.getItem(key) || "";
    sessionStorage.removeItem(key);
    return value;
  } catch {
    return "";
  }
}

const TABS = [
  { id: "fees", label: "Fees" },
  { id: "invoices", label: "Invoices" },
  { id: "payments", label: "Payments" },
  { id: "adjustments", label: "Adjustments" },
];

export default function InspectionFeesPage({
  onNavigate,
  query = "",
  initialOccupancyId = "",
}) {
  const { departmentId } = useTenant();
  const { permissions, isCreator, user, membership } = useAuth();
  const allowed = canViewInspectionFees(permissions, isCreator);
  const canEdit = canEditInspectionFees(permissions, isCreator);

  const [occupancyFilter, setOccupancyFilter] = useState(
    () => initialOccupancyId || readSession(OCCUPANCY_SESSION_KEY)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("fees");
  const [board, setBoard] = useState(null);
  const [occupancies, setOccupancies] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [selectedFeeIds, setSelectedFeeIds] = useState([]);
  const [modal, setModal] = useState("");

  const [feeDraft, setFeeDraft] = useState({
    scheduleId: "",
    occupancyId: "",
    inspectionId: "",
    amount: "",
    dueAt: "",
    notes: "",
  });
  const [paymentDraft, setPaymentDraft] = useState({
    invoiceId: "",
    feeId: "",
    amount: "",
    method: "cash",
    reference: "",
    notes: "",
  });
  const [adjustDraft, setAdjustDraft] = useState({
    feeId: "",
    adjustmentType: "waiver",
    amount: "",
    reason: "",
  });

  const actor = {
    actorUid: user?.uid || "system",
    actorName: membership?.displayName || user?.displayName || user?.email || "User",
  };
  const paymentMethods = getPaymentMethodOptions();
  const adjustmentTypes = getAdjustmentTypeOptions();

  async function reload() {
    if (!departmentId || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const pendingInspectionId = readSession(INSPECTION_SESSION_KEY);
      const [nextBoard, nextOccupancies, nextInspections] = await Promise.all([
        loadFeeBoard(departmentId),
        ensureOccupancyRecords(departmentId, [], actor),
        listInspectionRecords(departmentId),
      ]);
      setBoard(nextBoard);
      setOccupancies(nextOccupancies);
      setInspections(nextInspections);
      setFeeDraft((current) => ({
        ...current,
        scheduleId: current.scheduleId || nextBoard.schedules.find((row) => row.active)?.id || "",
        occupancyId: current.occupancyId || occupancyFilter || nextOccupancies[0]?.id || "",
        inspectionId: current.inspectionId || pendingInspectionId || "",
      }));
      if (pendingInspectionId) {
        setModal("fee");
        const inspection = nextInspections.find((row) => row.id === pendingInspectionId);
        if (inspection?.occupancyId) setOccupancyFilter(inspection.occupancyId);
      }
    } catch (loadError) {
      console.error(loadError);
      setError(loadError?.message || "Unable to load fees & payments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialOccupancyId) setOccupancyFilter(initialOccupancyId);
  }, [initialOccupancyId]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departmentId, allowed]);

  const metrics = board?.metrics || {};
  const needle = String(query || "").trim().toLowerCase();
  const occupancyName = useMemo(
    () => occupancies.find((row) => row.id === occupancyFilter)?.name || occupancyFilter,
    [occupancies, occupancyFilter]
  );

  const fees = useMemo(() => {
    let rows = board?.fees || [];
    if (occupancyFilter) rows = rows.filter((row) => row.occupancyId === occupancyFilter);
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle, occupancyFilter]);

  const invoices = useMemo(() => {
    let rows = board?.invoices || [];
    if (occupancyFilter) rows = rows.filter((row) => row.occupancyId === occupancyFilter);
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle, occupancyFilter]);

  const payments = useMemo(() => {
    let rows = board?.payments || [];
    if (occupancyFilter) rows = rows.filter((row) => row.occupancyId === occupancyFilter);
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle, occupancyFilter]);

  const adjustments = useMemo(() => {
    let rows = board?.adjustments || [];
    if (occupancyFilter) rows = rows.filter((row) => row.occupancyId === occupancyFilter);
    if (!needle) return rows;
    return rows.filter((row) => Object.values(row).join(" ").toLowerCase().includes(needle));
  }, [board, needle, occupancyFilter]);

  const invoiceableFees = fees.filter(
    (row) => ["open", "partially_paid"].includes(row.status) && !row.invoiceId && row.balance > 0
  );

  function toggleFeeSelection(feeId) {
    setSelectedFeeIds((current) => (
      current.includes(feeId)
        ? current.filter((id) => id !== feeId)
        : [...current, feeId]
    ));
  }

  async function run(fn, success) {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await fn();
      setMessage(success);
      setModal("");
      setSelectedFeeIds([]);
      await reload();
    } catch (actionError) {
      setError(actionError?.message || "Action failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <InspectionPermissionGate allowed={allowed} title="Fees & Payments">
      <InspectionsModuleLayout
        title="Fees & Payments"
        description="Fee schedule charges, invoices, staff-recorded payments, and adjustments."
        activeNavName="Fees & Payments"
        onNavigate={onNavigate}
        tabs={PREVENTION_TOOL_TABS}
        actions={canEdit ? (
          <div className="occupancy-detail-actions">
            <button className="primary-button" type="button" onClick={() => setModal("fee")}>
              <CirclePlus size={14} /> Add fee
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!selectedFeeIds.length}
              onClick={() => run(
                () => createInvoiceFromFees(departmentId, { feeIds: selectedFeeIds }, actor),
                "Invoice issued."
              )}
            >
              <FileText size={14} /> Invoice selected
            </button>
            <button className="secondary-button" type="button" onClick={() => setModal("payment")}>
              <Receipt size={14} /> Record payment
            </button>
          </div>
        ) : null}
      >
        {error ? <p className="occupancy-error">{error}</p> : null}
        {message ? <p className="occupancy-message">{message}</p> : null}
        {occupancyFilter ? (
          <p className="occupancy-message">
            Filtered to occupancy: <strong>{occupancyName || occupancyFilter}</strong>{" "}
            <button className="link-button" type="button" onClick={() => setOccupancyFilter("")}>
              Clear filter
            </button>
          </p>
        ) : null}
        {loading ? <p className="occupancy-muted">Loading fees…</p> : null}

        {!loading ? (
          <div className="inspections-kpi-grid">
            {[
              ["Outstanding", formatCurrency(metrics.outstanding || 0)],
              ["Collected", formatCurrency(metrics.collected || 0)],
              ["Open fees", metrics.openFeeCount || 0],
              ["Open invoices", metrics.openInvoiceCount || 0],
              ["Current", formatCurrency(metrics.aging?.current || 0)],
              ["90+ days", formatCurrency(metrics.aging?.["90_plus"] || 0)],
            ].map(([label, value]) => (
              <div key={label} className="inspections-kpi-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {!loading ? (
          <nav className="inspections-subnav" aria-label="Fee sections">
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

        {modal === "fee" && canEdit ? (
          <section className="panel">
            <header><div><DollarSign size={15} /><strong>Add fee</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Fee schedule" wide>
                <select
                  value={feeDraft.scheduleId}
                  onChange={(e) => {
                    const schedule = (board?.schedules || []).find((row) => row.id === e.target.value);
                    setFeeDraft((c) => ({
                      ...c,
                      scheduleId: e.target.value,
                      amount: schedule ? String(schedule.amount) : c.amount,
                    }));
                  }}
                >
                  {(board?.schedules || []).filter((row) => row.active).map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} — {formatCurrency(row.amount)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Occupancy" wide>
                <select
                  value={feeDraft.occupancyId}
                  onChange={(e) => setFeeDraft((c) => ({ ...c, occupancyId: e.target.value }))}
                >
                  {occupancies.map((row) => (
                    <option key={row.id} value={row.id}>{row.name} — {row.address || "No address"}</option>
                  ))}
                </select>
              </Field>
              <Field label="Inspection (optional)" wide>
                <select
                  value={feeDraft.inspectionId}
                  onChange={(e) => setFeeDraft((c) => ({ ...c, inspectionId: e.target.value }))}
                >
                  <option value="">None</option>
                  {inspections
                    .filter((row) => !feeDraft.occupancyId || row.occupancyId === feeDraft.occupancyId)
                    .slice(0, 100)
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.inspectionNumber} — {row.occupancyName || "Occupancy"}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={feeDraft.amount}
                  onChange={(e) => setFeeDraft((c) => ({ ...c, amount: e.target.value }))}
                />
              </Field>
              <Field label="Due date">
                <input
                  type="date"
                  value={feeDraft.dueAt}
                  onChange={(e) => setFeeDraft((c) => ({ ...c, dueAt: e.target.value }))}
                />
              </Field>
              <Field label="Notes" wide>
                <textarea
                  rows={2}
                  value={feeDraft.notes}
                  onChange={(e) => setFeeDraft((c) => ({ ...c, notes: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !feeDraft.scheduleId || !feeDraft.occupancyId}
                  onClick={() => run(async () => {
                    await createInspectionFee(departmentId, {
                      ...feeDraft,
                      amount: feeDraft.amount === "" ? undefined : Number(feeDraft.amount),
                    }, actor);
                  }, "Fee created.")}
                >
                  Save fee
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "payment" && canEdit ? (
          <section className="panel">
            <header><div><Receipt size={15} /><strong>Record payment</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Invoice" wide>
                <select
                  value={paymentDraft.invoiceId}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, invoiceId: e.target.value, feeId: "" }))}
                >
                  <option value="">Select invoice (or use fee below)</option>
                  {(board?.invoices || [])
                    .filter((row) => row.balance > 0 && row.status !== "void")
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.invoiceNumber} — {row.occupancyName} — {formatCurrency(row.balance)} due
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Or single fee" wide>
                <select
                  value={paymentDraft.feeId}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, feeId: e.target.value, invoiceId: "" }))}
                >
                  <option value="">Select fee</option>
                  {(board?.fees || [])
                    .filter((row) => row.balance > 0 && !["void", "waived", "paid"].includes(row.status))
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.feeNumber} — {row.name} — {formatCurrency(row.balance)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentDraft.amount}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, amount: e.target.value }))}
                />
              </Field>
              <Field label="Method">
                <select
                  value={paymentDraft.method}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, method: e.target.value }))}
                >
                  {paymentMethods.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Reference">
                <input
                  value={paymentDraft.reference}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, reference: e.target.value }))}
                  placeholder="Check # / auth code"
                />
              </Field>
              <Field label="Notes" wide>
                <textarea
                  rows={2}
                  value={paymentDraft.notes}
                  onChange={(e) => setPaymentDraft((c) => ({ ...c, notes: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !(paymentDraft.invoiceId || paymentDraft.feeId) || !(Number(paymentDraft.amount) > 0)}
                  onClick={() => run(
                    () => recordPayment(departmentId, {
                      ...paymentDraft,
                      amount: Number(paymentDraft.amount),
                    }, actor),
                    "Payment recorded."
                  )}
                >
                  Save payment
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {modal === "adjust" && canEdit ? (
          <section className="panel">
            <header><div><Scale size={15} /><strong>Adjust / waive fee</strong></div></header>
            <div className="panel-body occupancy-form-grid">
              <Field label="Fee" wide>
                <select
                  value={adjustDraft.feeId}
                  onChange={(e) => setAdjustDraft((c) => ({ ...c, feeId: e.target.value }))}
                >
                  <option value="">Select fee</option>
                  {(board?.fees || [])
                    .filter((row) => !["void", "paid"].includes(row.status))
                    .map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.feeNumber} — {row.name} — bal {formatCurrency(row.balance)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="Type">
                <select
                  value={adjustDraft.adjustmentType}
                  onChange={(e) => setAdjustDraft((c) => ({ ...c, adjustmentType: e.target.value }))}
                >
                  {adjustmentTypes.map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Amount (blank = full balance for waiver)">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={adjustDraft.amount}
                  onChange={(e) => setAdjustDraft((c) => ({ ...c, amount: e.target.value }))}
                />
              </Field>
              <Field label="Reason" wide>
                <textarea
                  rows={2}
                  value={adjustDraft.reason}
                  onChange={(e) => setAdjustDraft((c) => ({ ...c, reason: e.target.value }))}
                />
              </Field>
              <div className="occupancy-detail-actions">
                <button className="secondary-button" type="button" onClick={() => setModal("")}>Cancel</button>
                <button
                  className="primary-button"
                  type="button"
                  disabled={saving || !adjustDraft.feeId}
                  onClick={() => run(
                    () => adjustInspectionFee(departmentId, adjustDraft.feeId, {
                      adjustmentType: adjustDraft.adjustmentType,
                      amount: adjustDraft.amount === "" ? undefined : Number(adjustDraft.amount),
                      reason: adjustDraft.reason,
                    }, actor),
                    "Adjustment saved."
                  )}
                >
                  Save adjustment
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {!loading && tab === "fees" ? (
          <section className="panel">
            <header>
              <div><DollarSign size={15} /><strong>Fees</strong></div>
              {canEdit ? (
                <button className="secondary-button" type="button" onClick={() => setModal("adjust")}>
                  <Scale size={14} /> Adjust / waive
                </button>
              ) : null}
            </header>
            <div className="panel-body">
              {!fees.length ? (
                <InspectionEmptyState
                  title="No fees yet"
                  description="Add a fee from the schedule, or create one from an inspection."
                />
              ) : (
                <div className="personnel-list">
                  {fees.map((row) => (
                    <div key={row.id} className="person-row">
                      <label className="occupancy-primary-toggle">
                        {invoiceableFees.some((fee) => fee.id === row.id) ? (
                          <input
                            type="checkbox"
                            checked={selectedFeeIds.includes(row.id)}
                            onChange={() => toggleFeeSelection(row.id)}
                          />
                        ) : <span />}
                        <span>
                          <strong>{row.feeNumber}</strong>
                          <small className="occupancy-muted">
                            {" "}{row.name} · {labelForFeeType(row.feeTypeId)} · {row.occupancyName || "—"}
                          </small>
                        </span>
                      </label>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={labelForFeeStatus(row.status)} />
                        <strong>{formatCurrency(row.balance)}</strong>
                        <small className="occupancy-muted">due {formatDate(row.dueAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "invoices" ? (
          <section className="panel">
            <header><div><FileText size={15} /><strong>Invoices</strong></div></header>
            <div className="panel-body">
              {!invoices.length ? (
                <InspectionEmptyState
                  title="No invoices"
                  description="Select open fees and click Invoice selected."
                />
              ) : (
                <div className="personnel-list">
                  {invoices.map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.invoiceNumber}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.occupancyName || "—"} · {row.feeIds.length} fee(s)
                        </small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={labelForInvoiceStatus(row.status)} />
                        <strong>{formatCurrency(row.balance)}</strong>
                        <small className="occupancy-muted">due {formatDate(row.dueAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "payments" ? (
          <section className="panel">
            <header><div><Receipt size={15} /><strong>Payments</strong></div></header>
            <div className="panel-body">
              {!payments.length ? (
                <InspectionEmptyState
                  title="No payments recorded"
                  description="Staff can record cash, check, card, or online payments against invoices or fees."
                />
              ) : (
                <div className="personnel-list">
                  {payments.map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.paymentNumber}</strong>
                        <small className="occupancy-muted">
                          {" "}{labelForPaymentMethod(row.method)} · {row.receiptNumber || "—"}
                          {row.reference ? ` · ref ${row.reference}` : ""}
                        </small>
                      </span>
                      <div className="occupancy-detail-actions">
                        <InspectionStatusBadge status={labelForPaymentStatus(row.status)} />
                        <strong>{formatCurrency(row.amount)}</strong>
                        <small className="occupancy-muted">{formatDate(row.receivedAt)}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        {!loading && tab === "adjustments" ? (
          <section className="panel">
            <header><div><Scale size={15} /><strong>Adjustments</strong></div></header>
            <div className="panel-body">
              {!adjustments.length ? (
                <InspectionEmptyState
                  title="No adjustments"
                  description="Waivers, reductions, increases, refunds, and write-offs appear here."
                />
              ) : (
                <div className="personnel-list">
                  {adjustments.map((row) => (
                    <div key={row.id} className="person-row">
                      <span>
                        <strong>{row.adjustmentNumber}</strong>
                        <small className="occupancy-muted">
                          {" "}{row.adjustmentType} · {row.feeNumber} · {row.reason || "No reason"}
                        </small>
                      </span>
                      <strong>{formatCurrency(row.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}
      </InspectionsModuleLayout>
    </InspectionPermissionGate>
  );
}
