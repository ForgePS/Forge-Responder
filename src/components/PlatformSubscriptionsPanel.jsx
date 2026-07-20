import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, RefreshCw } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  BILLING_CYCLE_LABELS,
  formatCurrencyFromCents,
  formatShortDate,
  PAYMENT_METHOD_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUSES,
} from "../data/platformSubscriptions.js";
import { listPlatformDepartments } from "../lib/platformService.js";
import {
  computeSubscriptionMetrics,
  extendSubscriptionTrial,
  listCustomerSubscriptions,
  listSubscriptionPlans,
  saveCustomerSubscription,
  saveSubscriptionPlan,
  syncCustomerSubscriptions,
  updateSubscriptionStatus,
} from "../lib/platformSubscriptionService.js";

const EMPTY_PLAN_FORM = {
  id: "",
  name: "",
  description: "",
  monthlyPriceCents: 0,
  annualPriceCents: 0,
  maxPersonnel: 0,
  maxPortalUsers: 0,
  maxStations: 1,
  isActive: true,
  sortOrder: 100,
  highlight: "",
  monthlyPriceDollars: "",
  annualPriceDollars: "",
};

function StatusBadge({ status }) {
  return (
    <span className={`badge badge-${status === "active" ? "success" : status === "trial" ? "info" : status === "past_due" ? "warning" : "critical"}`}>
      {SUBSCRIPTION_STATUS_LABELS[status] || status}
    </span>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="fleet-stat stat-info">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/**
 * Academy-parity SaaS subscription manager for department branches.
 * @param {{ onMessage?: (message: string) => void, onOpenDepartment?: (departmentId: string) => void }} props
 */
export default function PlatformSubscriptionsPanel({ onMessage, onOpenDepartment }) {
  const { user, isCreator } = useAuth();
  const [subTab, setSubTab] = useState("overview");
  const [plans, setPlans] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [planForm, setPlanForm] = useState({ ...EMPTY_PLAN_FORM });
  const [editingPlanId, setEditingPlanId] = useState("");
  const [subscriptionForm, setSubscriptionForm] = useState(null);

  const metrics = useMemo(() => computeSubscriptionMetrics(subscriptions, plans), [subscriptions, plans]);
  const planMap = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans]);

  const filteredSubscriptions = useMemo(() => {
    if (statusFilter === "all") return subscriptions;
    return subscriptions.filter((item) => item.status === statusFilter);
  }, [statusFilter, subscriptions]);

  const selectedSubscription = subscriptions.find((item) => item.departmentId === selectedDepartmentId) ?? null;
  const missingDepartments = departments.filter(
    (department) => !subscriptions.some((item) => item.departmentId === department.id),
  );

  async function reload() {
    setLoading(true);
    try {
      const [planRows, subscriptionRows, departmentRows] = await Promise.all([
        listSubscriptionPlans(),
        listCustomerSubscriptions(),
        listPlatformDepartments(),
      ]);
      setPlans(planRows);
      setSubscriptions(subscriptionRows);
      setDepartments(departmentRows);
      if (!selectedDepartmentId && subscriptionRows[0]?.departmentId) {
        setSelectedDepartmentId(subscriptionRows[0].departmentId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload().catch((error) => {
      console.error(error);
      onMessage?.("Unable to load subscription data.");
    });
  }, []);

  useEffect(() => {
    if (!selectedSubscription) {
      setSubscriptionForm(null);
      return;
    }
    setSubscriptionForm({ ...selectedSubscription });
  }, [selectedDepartmentId, selectedSubscription?.departmentId, selectedSubscription?.updatedBy]);

  if (!isCreator) {
    return (
      <p className="auth-help">
        Department subscriptions are managed by the FORGE platform creator in Creator Console → Subscriptions.
      </p>
    );
  }

  async function handleSyncAll() {
    if (!user?.uid) return;
    setSyncing(true);
    try {
      const rows = await syncCustomerSubscriptions(user.uid);
      setSubscriptions(rows);
      onMessage?.("Synced subscription records for all department branches.");
    } catch (error) {
      console.error(error);
      onMessage?.("Failed to sync subscriptions.");
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveSubscription(event) {
    event.preventDefault();
    if (!user?.uid || !selectedDepartmentId || !subscriptionForm) return;
    setSaving(true);
    try {
      const saved = await saveCustomerSubscription(selectedDepartmentId, subscriptionForm, user.uid);
      setSubscriptions((current) => {
        const next = current.filter((item) => item.departmentId !== saved.departmentId);
        return [...next, saved].sort((a, b) => a.departmentName.localeCompare(b.departmentName));
      });
      onMessage?.(`Saved subscription for ${saved.departmentName}.`);
    } catch (error) {
      console.error(error);
      onMessage?.("Failed to save subscription.");
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickStatus(status) {
    if (!user?.uid || !selectedDepartmentId) return;
    setSaving(true);
    try {
      const saved = await updateSubscriptionStatus(selectedDepartmentId, status, user.uid);
      setSubscriptions((current) => current.map((item) => (item.departmentId === saved.departmentId ? saved : item)));
      setSubscriptionForm({ ...saved });
      onMessage?.(`Subscription marked ${SUBSCRIPTION_STATUS_LABELS[status]}.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleExtendTrial(days) {
    if (!user?.uid || !selectedDepartmentId) return;
    setSaving(true);
    try {
      const saved = await extendSubscriptionTrial(selectedDepartmentId, days, user.uid);
      setSubscriptions((current) => current.map((item) => (item.departmentId === saved.departmentId ? saved : item)));
      setSubscriptionForm({ ...saved });
      onMessage?.(`Extended trial by ${days} days.`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePlan(event) {
    event.preventDefault();
    if (!user?.uid || !planForm.name.trim()) return;
    setSaving(true);
    try {
      const saved = await saveSubscriptionPlan(
        {
          ...planForm,
          id: editingPlanId || planForm.id || planForm.name,
          monthlyPriceCents: Math.round(Number(planForm.monthlyPriceDollars ?? 0) * 100),
          annualPriceCents: Math.round(Number(planForm.annualPriceDollars ?? 0) * 100),
        },
        user.uid,
      );
      setPlans((current) => {
        const next = current.filter((item) => item.id !== saved.id);
        return [...next, saved].sort((a, b) => a.sortOrder - b.sortOrder);
      });
      setPlanForm({ ...EMPTY_PLAN_FORM });
      setEditingPlanId("");
      onMessage?.(`Saved plan "${saved.name}".`);
    } catch (error) {
      console.error(error);
      onMessage?.("Failed to save subscription plan.");
    } finally {
      setSaving(false);
    }
  }

  function startEditPlan(plan) {
    setEditingPlanId(plan.id);
    setPlanForm({
      ...plan,
      monthlyPriceDollars: (plan.monthlyPriceCents / 100).toFixed(2),
      annualPriceDollars: (plan.annualPriceCents / 100).toFixed(2),
    });
  }

  if (loading) {
    return <p className="auth-help">Loading subscriptions…</p>;
  }

  return (
    <div className="platform-subscriptions-panel">
      <div className="department-subscription-toolbar">
        <p className="auth-help" style={{ flex: 1, margin: 0 }}>
          Manage SaaS plans, customer billing status, renewal dates, and tenant access for every department branch.
        </p>
        <button type="button" className="secondary-button" onClick={handleSyncAll} disabled={syncing}>
          <RefreshCw size={14} className={syncing ? "spin" : ""} />
          {syncing ? "Syncing…" : "Sync all tenants"}
        </button>
      </div>

      <div className="segmented-control">
        {[
          ["overview", "Overview"],
          ["customers", "Customers"],
          ["plans", "Plans"],
        ].map(([id, label]) => (
          <button key={id} type="button" className={subTab === id ? "active" : ""} onClick={() => setSubTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {subTab === "overview" ? (
        <>
          <section className="fleet-summary">
            <MetricCard label="Customers" value={String(metrics.totalCustomers)} />
            <MetricCard label="Active" value={String(metrics.activeCount)} />
            <MetricCard label="Trials" value={String(metrics.trialCount)} />
            <MetricCard label="MRR" value={formatCurrencyFromCents(metrics.mrrCents)} />
          </section>
          <div className="platform-subscriptions-overview-grid">
            <section className="panel">
              <header><div><strong>Attention needed</strong></div></header>
              <div className="panel-body">
                <ul className="platform-subscriptions-list">
                  {subscriptions
                    .filter((item) => [SUBSCRIPTION_STATUSES.PAST_DUE, SUBSCRIPTION_STATUSES.SUSPENDED].includes(item.status))
                    .map((item) => (
                      <li key={item.departmentId}>
                        <span>{item.departmentName}</span>
                        <StatusBadge status={item.status} />
                      </li>
                    ))}
                  {!metrics.pastDueCount && !metrics.suspendedCount ? (
                    <li className="auth-help">No past-due or suspended customers.</li>
                  ) : null}
                </ul>
              </div>
            </section>
            <section className="panel">
              <header><div><strong>Trials ending soon</strong></div></header>
              <div className="panel-body">
                <ul className="platform-subscriptions-list">
                  {subscriptions
                    .filter((item) => item.status === SUBSCRIPTION_STATUSES.TRIAL && item.trialEndsAt)
                    .sort((a, b) => a.trialEndsAt.localeCompare(b.trialEndsAt))
                    .slice(0, 6)
                    .map((item) => (
                      <li key={item.departmentId}>
                        <span>{item.departmentName}</span>
                        <small>{formatShortDate(item.trialEndsAt)}</small>
                      </li>
                    ))}
                  {!subscriptions.some((item) => item.status === SUBSCRIPTION_STATUSES.TRIAL) ? (
                    <li className="auth-help">No active trials.</li>
                  ) : null}
                </ul>
              </div>
            </section>
          </div>
          {missingDepartments.length ? (
            <p className="auth-help subscription-preview-warning">
              {missingDepartments.length} department branch(es) do not have subscription records yet. Use{" "}
              <strong>Sync all tenants</strong> to create them.
            </p>
          ) : null}
        </>
      ) : null}

      {subTab === "customers" ? (
        <div className="platform-subscriptions-customers">
          <section className="panel">
            <header>
              <div><strong>Customer subscriptions</strong></div>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </header>
            <div className="panel-body">
              <div className="cert-table department-subscription-table platform-subscriptions-table">
                <div className="cert-row cert-head">
                  <span>Customer</span>
                  <span>Plan</span>
                  <span>Status</span>
                  <span>Renewal</span>
                  <span>MRR</span>
                </div>
                {filteredSubscriptions.map((item) => {
                  const plan = planMap.get(item.planId);
                  const mrr =
                    item.billingCycle === "annual"
                      ? Math.round((item.amountCents || plan?.annualPriceCents || 0) / 12)
                      : item.amountCents || plan?.monthlyPriceCents || 0;
                  return (
                    <button
                      key={item.departmentId}
                      type="button"
                      className={`cert-row department-subscription-row ${selectedDepartmentId === item.departmentId ? "active" : ""}`}
                      onClick={() => setSelectedDepartmentId(item.departmentId)}
                    >
                      <strong>
                        {item.departmentName}
                        <small style={{ display: "block", opacity: 0.7 }}>{item.departmentId}</small>
                      </strong>
                      <span>{plan?.name || item.planId}</span>
                      <span><StatusBadge status={item.status} /></span>
                      <span>{formatShortDate(item.renewalDate || item.currentPeriodEnd)}</span>
                      <span>{formatCurrencyFromCents(mrr)}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="panel">
            <header><div><strong>Subscription detail</strong></div></header>
            <div className="panel-body">
              {!subscriptionForm ? (
                <p className="auth-help">Select a customer to edit subscription details.</p>
              ) : (
                <form onSubmit={handleSaveSubscription} className="workflow-form department-subscription-form">
                  <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{subscriptionForm.departmentName}</strong>
                      <div className="auth-help" style={{ margin: 0 }}>{subscriptionForm.departmentId}</div>
                    </div>
                    {onOpenDepartment ? (
                      <button type="button" className="text-button" onClick={() => onOpenDepartment(subscriptionForm.departmentId)}>
                        Open branch
                      </button>
                    ) : null}
                  </div>

                  <label>
                    <span>Plan</span>
                    <select
                      value={subscriptionForm.planId}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, planId: event.target.value }))}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>{plan.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Status</span>
                    <select
                      value={subscriptionForm.status}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, status: event.target.value }))}
                    >
                      {Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Billing cycle</span>
                    <select
                      value={subscriptionForm.billingCycle}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, billingCycle: event.target.value }))}
                    >
                      {Object.entries(BILLING_CYCLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Payment method</span>
                    <select
                      value={subscriptionForm.paymentMethod}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, paymentMethod: event.target.value }))}
                    >
                      {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Amount (USD)</span>
                    <input
                      type="number"
                      step="0.01"
                      value={String((subscriptionForm.amountCents ?? 0) / 100)}
                      onChange={(event) => setSubscriptionForm((prev) => ({
                        ...prev,
                        amountCents: Math.round(Number(event.target.value || 0) * 100),
                      }))}
                    />
                  </label>
                  <label>
                    <span>Trial ends</span>
                    <input
                      type="date"
                      value={subscriptionForm.trialEndsAt || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, trialEndsAt: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Period start</span>
                    <input
                      type="date"
                      value={subscriptionForm.currentPeriodStart || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, currentPeriodStart: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Period end / renewal</span>
                    <input
                      type="date"
                      value={subscriptionForm.currentPeriodEnd || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({
                        ...prev,
                        currentPeriodEnd: event.target.value,
                        renewalDate: event.target.value,
                      }))}
                    />
                  </label>
                  <label>
                    <span>Billing contact</span>
                    <input
                      value={subscriptionForm.billingContactName || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, billingContactName: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Billing email</span>
                    <input
                      type="email"
                      value={subscriptionForm.billingContactEmail || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, billingContactEmail: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>Billing phone</span>
                    <input
                      value={subscriptionForm.billingContactPhone || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, billingContactPhone: event.target.value }))}
                    />
                  </label>
                  <label>
                    <span>External customer id</span>
                    <input
                      value={subscriptionForm.externalCustomerId || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, externalCustomerId: event.target.value }))}
                    />
                  </label>
                  <label className="wide-field">
                    <span>Internal notes</span>
                    <textarea
                      rows={3}
                      value={subscriptionForm.notes || ""}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, notes: event.target.value }))}
                    />
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      type="checkbox"
                      checked={subscriptionForm.autoRenew !== false}
                      onChange={(event) => setSubscriptionForm((prev) => ({ ...prev, autoRenew: event.target.checked }))}
                    />
                    <span>Auto-renew subscription</span>
                  </label>

                  <div className="object-lifecycle-actions" style={{ gridColumn: "1 / -1" }}>
                    <button type="submit" className="primary-button" disabled={saving}>
                      <Check size={14} /> {saving ? "Saving…" : "Save subscription"}
                    </button>
                    <button type="button" className="secondary-button" disabled={saving} onClick={() => handleQuickStatus(SUBSCRIPTION_STATUSES.ACTIVE)}>
                      Mark active
                    </button>
                    <button type="button" className="secondary-button" disabled={saving} onClick={() => handleQuickStatus(SUBSCRIPTION_STATUSES.SUSPENDED)}>
                      Suspend
                    </button>
                    <button type="button" className="secondary-button" disabled={saving} onClick={() => handleExtendTrial(30)}>
                      Extend trial 30d
                    </button>
                  </div>
                </form>
              )}
            </div>
          </section>
        </div>
      ) : null}

      {subTab === "plans" ? (
        <div className="platform-subscriptions-plans">
          <div className="platform-subscriptions-plan-list">
            {plans.map((plan) => (
              <article key={plan.id} className="panel">
                <div className="panel-body" style={{ display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <strong>{plan.name}</strong>
                      {plan.highlight ? <div className="auth-help" style={{ margin: 0 }}>{plan.highlight}</div> : null}
                    </div>
                    <button type="button" className="text-button" onClick={() => startEditPlan(plan)}>Edit</button>
                  </div>
                  <p className="auth-help" style={{ margin: 0 }}>{plan.description}</p>
                  <div className="cert-detail-grid">
                    <div><span>Monthly</span><strong>{formatCurrencyFromCents(plan.monthlyPriceCents)}</strong></div>
                    <div><span>Annual</span><strong>{formatCurrencyFromCents(plan.annualPriceCents)}</strong></div>
                    <div><span>Personnel</span><strong>{plan.maxPersonnel || "Unlimited"}</strong></div>
                    <div><span>Portal users</span><strong>{plan.maxPortalUsers || "Unlimited"}</strong></div>
                    <div><span>Stations</span><strong>{plan.maxStations || "Unlimited"}</strong></div>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <section className="panel">
            <header>
              <div><CreditCard size={15} /><strong>{editingPlanId ? `Edit plan · ${editingPlanId}` : "Create plan"}</strong></div>
            </header>
            <div className="panel-body">
              <form onSubmit={handleSavePlan} className="workflow-form">
                {!editingPlanId ? (
                  <label>
                    <span>Plan id</span>
                    <input value={planForm.id} onChange={(event) => setPlanForm((prev) => ({ ...prev, id: event.target.value }))} placeholder="e.g. regional-plus" />
                  </label>
                ) : null}
                <label>
                  <span>Plan name</span>
                  <input required value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} />
                </label>
                <label className="wide-field">
                  <span>Description</span>
                  <textarea rows={3} value={planForm.description} onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))} />
                </label>
                <label>
                  <span>Monthly price (USD)</span>
                  <input type="number" step="0.01" value={planForm.monthlyPriceDollars ?? ""} onChange={(event) => setPlanForm((prev) => ({ ...prev, monthlyPriceDollars: event.target.value }))} />
                </label>
                <label>
                  <span>Annual price (USD)</span>
                  <input type="number" step="0.01" value={planForm.annualPriceDollars ?? ""} onChange={(event) => setPlanForm((prev) => ({ ...prev, annualPriceDollars: event.target.value }))} />
                </label>
                <label>
                  <span>Max personnel (0 = unlimited)</span>
                  <input type="number" value={String(planForm.maxPersonnel ?? 0)} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxPersonnel: Number(event.target.value) }))} />
                </label>
                <label>
                  <span>Max portal users (0 = unlimited)</span>
                  <input type="number" value={String(planForm.maxPortalUsers ?? 0)} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxPortalUsers: Number(event.target.value) }))} />
                </label>
                <label>
                  <span>Max stations (0 = unlimited)</span>
                  <input type="number" value={String(planForm.maxStations ?? 0)} onChange={(event) => setPlanForm((prev) => ({ ...prev, maxStations: Number(event.target.value) }))} />
                </label>
                <label>
                  <span>Sort order</span>
                  <input type="number" value={String(planForm.sortOrder ?? 0)} onChange={(event) => setPlanForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))} />
                </label>
                <label>
                  <span>Highlight label</span>
                  <input value={planForm.highlight || ""} onChange={(event) => setPlanForm((prev) => ({ ...prev, highlight: event.target.value }))} />
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="checkbox" checked={planForm.isActive !== false} onChange={(event) => setPlanForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
                  <span>Plan is active and available for assignment</span>
                </label>
                <div className="object-lifecycle-actions" style={{ gridColumn: "1 / -1" }}>
                  <button type="submit" className="primary-button" disabled={saving}>
                    {saving ? "Saving…" : editingPlanId ? "Update plan" : "Create plan"}
                  </button>
                  {editingPlanId ? (
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        setEditingPlanId("");
                        setPlanForm({ ...EMPTY_PLAN_FORM });
                      }}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
