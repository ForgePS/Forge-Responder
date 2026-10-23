import { useEffect, useState } from "react";
import {
  listPlatformDepartments,
  loadDepartmentSettings,
} from "../lib/platformService.js";
import {
  daysUntilExpiration,
  formatSubscriptionDate,
  getSubscriptionStatus,
  normalizeSubscription,
  SUBSCRIPTION_WARNING_DAYS,
} from "../lib/subscriptionUtils.js";
import DepartmentSubscriptionEditor from "./DepartmentSubscriptionEditor.jsx";

function subscriptionStatusLabel(subscription = {}) {
  const status = getSubscriptionStatus(subscription);
  if (!status) return "Not set";
  if (status.level === "critical" && status.daysRemaining < 0) return "Expired";
  if (status.show) return `${status.daysRemaining} day(s) left`;
  return "Active";
}

export default function DepartmentSubscriptionPanel({
  onMessage,
  onOpenDepartment,
  fixedDepartmentId = "",
}) {
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(fixedDepartmentId || "");
  const [loading, setLoading] = useState(true);
  const [editorKey, setEditorKey] = useState(0);

  const selectedDepartment = departments.find((item) => item.id === selectedDepartmentId);

  async function loadDepartments() {
    setLoading(true);
    try {
      const items = await listPlatformDepartments();
      const enriched = await Promise.all(items.map(async (department) => {
        const settings = await loadDepartmentSettings(department.id);
        return {
          ...department,
          subscription: settings.subscription || department.subscription,
        };
      }));
      setDepartments(enriched);
      const nextId = fixedDepartmentId || selectedDepartmentId || enriched[0]?.id || "";
      if (nextId && nextId !== selectedDepartmentId) {
        setSelectedDepartmentId(nextId);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDepartments();
  }, [fixedDepartmentId]);

  useEffect(() => {
    if (fixedDepartmentId) {
      setSelectedDepartmentId(fixedDepartmentId);
    }
  }, [fixedDepartmentId]);

  function handleSaved() {
    loadDepartments();
    setEditorKey((current) => current + 1);
  }

  if (loading) {
    return <p className="auth-help">Loading department subscriptions...</p>;
  }

  return (
    <section className="department-subscription-panel">
      <p className="auth-help">
        Set the subscription term for each department branch. Branches without an expiration date show as
        {" "}<strong>Not set</strong>. System Admin shows a warning starting {SUBSCRIPTION_WARNING_DAYS} days before expiration.
      </p>

      {!fixedDepartmentId && (
        <div className="department-subscription-toolbar">
          <label>
            <span>Department branch</span>
            <select
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
            >
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.shortName || department.name || department.id}
                </option>
              ))}
            </select>
          </label>
          {onOpenDepartment && selectedDepartmentId ? (
            <button className="secondary-button" type="button" onClick={() => onOpenDepartment(selectedDepartmentId)}>
              Open branch workspace
            </button>
          ) : null}
        </div>
      )}

      <div className="cert-table department-subscription-table">
        <div className="cert-row cert-head">
          <span>Department</span>
          <span>Start</span>
          <span>Expires</span>
          <span>Status</span>
        </div>
        {departments.map((department) => {
          const subscription = normalizeSubscription(department.subscription || {});
          const daysLeft = daysUntilExpiration(subscription.expirationDate);
          const rowStatus = getSubscriptionStatus(subscription);
          const isSelected = department.id === selectedDepartmentId;
          return (
            <button
              key={department.id}
              type="button"
              className={`cert-row department-subscription-row ${isSelected ? "active" : ""}`}
              onClick={() => setSelectedDepartmentId(department.id)}
            >
              <strong>{department.shortName || department.name || department.id}</strong>
              <span>{formatSubscriptionDate(subscription.startDate)}</span>
              <span>{formatSubscriptionDate(subscription.expirationDate)}</span>
              <span className={`subscription-status subscription-status-${rowStatus?.level || "unknown"}`}>
                {subscriptionStatusLabel(subscription)}
                {typeof daysLeft === "number" && daysLeft >= 0 && daysLeft <= SUBSCRIPTION_WARNING_DAYS
                  ? ` · ${daysLeft}d`
                  : ""}
              </span>
            </button>
          );
        })}
      </div>

      <DepartmentSubscriptionEditor
        key={`${selectedDepartmentId}-${editorKey}`}
        departmentId={selectedDepartmentId}
        departmentName={selectedDepartment?.shortName || selectedDepartment?.name}
        onMessage={onMessage}
        onSaved={handleSaved}
        compact
      />
    </section>
  );
}
