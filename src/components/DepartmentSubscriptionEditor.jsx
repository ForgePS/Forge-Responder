import { useEffect, useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { useTenant } from "../context/TenantContext.jsx";
import { writeAuditLog } from "../lib/auditService.js";
import { loadDepartmentSettings, saveDepartmentSubscription } from "../lib/platformService.js";
import {
  daysUntilExpiration,
  formatSubscriptionDate,
  getSubscriptionStatus,
  normalizeSubscription,
  SUBSCRIPTION_WARNING_DAYS,
} from "../lib/subscriptionUtils.js";

function subscriptionStatusLabel(subscription = {}) {
  const status = getSubscriptionStatus(subscription);
  if (!status) return "Not set";
  if (status.level === "critical" && status.daysRemaining < 0) return "Expired";
  if (status.show) return `${status.daysRemaining} day(s) left`;
  return "Active";
}

export default function DepartmentSubscriptionEditor({
  departmentId,
  departmentName = "",
  onMessage,
  onSaved,
  compact = false,
  readOnly = false,
}) {
  const { refreshDepartment } = useTenant();
  const { user, membership, isCreator } = useAuth();
  const [form, setForm] = useState({ startDate: "", expirationDate: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const previewStatus = useMemo(() => getSubscriptionStatus(form), [form]);
  const currentStatus = useMemo(() => getSubscriptionStatus(form), [form]);
  const daysLeft = daysUntilExpiration(form.expirationDate);
  const canEdit = isCreator && !readOnly;

  async function loadSubscription() {
    if (!departmentId) {
      setForm({ startDate: "", expirationDate: "" });
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const settings = await loadDepartmentSettings(departmentId);
      setForm(normalizeSubscription(settings.subscription));
    } catch (error) {
      console.error("Failed to load department subscription", error);
      onMessage?.("Failed to load subscription dates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSubscription();
  }, [departmentId]);

  async function saveSubscription() {
    if (!canEdit) {
      onMessage?.("Only the FORGE platform creator can manage branch subscriptions.");
      return;
    }
    if (!departmentId) return;
    if (!form.expirationDate) {
      onMessage?.("Subscription expiration date is required.");
      return;
    }
    if (form.startDate && form.expirationDate < form.startDate) {
      onMessage?.("Expiration date must be on or after the start date.");
      return;
    }

    const payload = normalizeSubscription({
      startDate: form.startDate || new Date().toISOString().slice(0, 10),
      expirationDate: form.expirationDate,
    });

    setSaving(true);
    try {
      await saveDepartmentSubscription(departmentId, payload);
      await writeAuditLog(departmentId, {
        action: "update",
        module: "FORGE Platform",
        summary: `Updated branch subscription (${payload.startDate} → ${payload.expirationDate})`,
        actorUid: user?.uid,
        actorName: membership?.displayName || user?.email,
      });
      setForm(payload);
      await refreshDepartment?.();
      onSaved?.(payload);
      onMessage?.(`Subscription saved for ${departmentName || departmentId}`);
    } catch (error) {
      console.error("Failed to save department subscription", error);
      onMessage?.("Failed to save subscription dates.");
    } finally {
      setSaving(false);
    }
  }

  if (!departmentId) {
    return <p className="auth-help">Select a department branch to manage its subscription.</p>;
  }

  if (!isCreator && !readOnly) {
    return (
      <p className="auth-help">
        Branch subscriptions are managed by the FORGE platform creator in Creator Console → Subscriptions.
      </p>
    );
  }

  if (loading) {
    return <p className="auth-help">Loading subscription...</p>;
  }

  const label = departmentName || departmentId;
  const hasDates = Boolean(form.startDate || form.expirationDate);

  return (
    <section className={`department-subscription-editor ${compact ? "department-subscription-editor-compact" : ""}${readOnly ? " department-subscription-editor-readonly" : ""}`}>
      {!compact && canEdit && (
        <p className="auth-help">
          Set the subscription term for <strong>{label}</strong>. System Admin shows a warning starting
          {" "}{SUBSCRIPTION_WARNING_DAYS} days before expiration.
        </p>
      )}
      {readOnly && (
        <p className="auth-help">
          View-only subscription details for <strong>{label}</strong>. Dates are managed by the FORGE platform creator.
        </p>
      )}

      {hasDates ? (
        <div className="cert-detail-grid department-subscription-summary">
          <div>
            <span>Current status</span>
            <strong className={`subscription-status subscription-status-${currentStatus?.level || "unknown"}`}>
              {subscriptionStatusLabel(form)}
            </strong>
          </div>
          <div>
            <span>Start date</span>
            <strong>{formatSubscriptionDate(form.startDate)}</strong>
          </div>
          <div>
            <span>Expiration date</span>
            <strong>{formatSubscriptionDate(form.expirationDate)}</strong>
          </div>
          {typeof daysLeft === "number" ? (
            <div>
              <span>Days remaining</span>
              <strong className={daysLeft <= SUBSCRIPTION_WARNING_DAYS ? "subscription-status-warning" : ""}>
                {daysLeft < 0 ? `${Math.abs(daysLeft)} day(s) ago` : `${daysLeft} day(s)`}
              </strong>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="auth-help department-subscription-empty">
          No subscription dates are configured for this branch yet.
        </p>
      )}

      {canEdit ? (
        <>
          <div className="workflow-form department-subscription-form">
            <label>
              <span>Subscription start date</span>
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              <span>Subscription expiration date</span>
              <input
                type="date"
                value={form.expirationDate}
                onChange={(event) => setForm((current) => ({ ...current, expirationDate: event.target.value }))}
                required
              />
            </label>
          </div>

          {previewStatus?.show ? (
            <p className={`auth-help subscription-preview subscription-preview-${previewStatus.level}`}>
              Preview: {previewStatus.message}
            </p>
          ) : previewStatus?.expirationDate ? (
            <p className="auth-help">
              Preview: active — {previewStatus.daysRemaining} day(s) remaining until {formatSubscriptionDate(form.expirationDate)}.
            </p>
          ) : null}

          <div className="platform-config-actions">
            <button className="primary-button" type="button" onClick={saveSubscription} disabled={saving}>
              <Check size={14} /> {saving ? "Saving..." : hasDates ? "Save subscription dates" : "Set subscription dates"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
