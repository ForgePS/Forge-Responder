import { Fragment, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  filterDepartmentsBySearch,
  normalizeDepartmentStateId,
  sortDepartmentsByState,
} from "../lib/departmentBranchUtils.js";
import {
  formatSubscriptionDate,
  getSubscriptionStatus,
  normalizeSubscription,
} from "../lib/subscriptionUtils.js";

function subscriptionStatusLabel(subscription = {}) {
  const rowStatus = getSubscriptionStatus(subscription);
  if (!subscription.expirationDate) return "Not set";
  if (rowStatus?.level === "critical" && rowStatus.daysRemaining < 0) return "Expired";
  if (rowStatus?.show) return `${rowStatus.daysRemaining}d left`;
  return "Active";
}

export default function DepartmentBranchesPanel({
  departments = [],
  workspaceId = "",
  inPlatformWorkspace = false,
  isCreator = false,
  onReload,
  onOpenDepartment,
  onManageSubscriptions,
  onSetSubscriptionDates,
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const visibleDepartments = useMemo(() => {
    const filtered = filterDepartmentsBySearch(departments, searchQuery);
    return sortDepartmentsByState(filtered);
  }, [departments, searchQuery]);

  return (
    <>
      <p className="auth-help">
        {isCreator
          ? "Existing branches can receive subscription expiration dates under the Subscriptions tab in the FORGE platform workspace."
          : "Department branches are listed here. Subscription terms are managed by the FORGE platform creator."}
      </p>

      <div className="department-branches-toolbar">
        <label className="global-search department-branches-search">
          <Search size={16} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by department, state, ID, or address..."
            aria-label="Search department branches"
          />
        </label>
        <span className="department-branches-count">
          {visibleDepartments.length} of {departments.length} branch{departments.length === 1 ? "" : "es"}
        </span>
      </div>

      <div className="cert-table department-branches-table">
        <div className="cert-row cert-head">
          <span>Department</span>
          <span>State</span>
          <span>ID</span>
          <span>Expires</span>
          <span>Status</span>
          <span>Portal path</span>
          <span />
        </div>
        {!departments.length && (
          <p className="auth-help">No department branches yet. Use the form above to create your first agency platform.</p>
        )}
        {departments.length > 0 && !visibleDepartments.length && (
          <p className="auth-help">No branches match your search.</p>
        )}
        {visibleDepartments.map((department, index) => {
          const subscription = normalizeSubscription(department.subscription || {});
          const rowStatus = getSubscriptionStatus(subscription);
          const stateId = normalizeDepartmentStateId(department.stateId, department.address);
          const previousState = index > 0
            ? normalizeDepartmentStateId(
              visibleDepartments[index - 1].stateId,
              visibleDepartments[index - 1].address
            )
            : "";
          const showStateDivider = stateId && stateId !== previousState;

          return (
            <Fragment key={department.id}>
              {showStateDivider && (
                <div className="department-branches-state-divider" aria-hidden="true">
                  <span>{stateId}</span>
                </div>
              )}
              <div className="cert-row">
                <strong>{department.name}</strong>
                <span className="department-branch-state">{stateId || "—"}</span>
                <span>{department.id}</span>
                <span>{formatSubscriptionDate(subscription.expirationDate)}</span>
                <span className={`subscription-status subscription-status-${rowStatus?.level || "unknown"}`}>
                  {subscriptionStatusLabel(subscription)}
                </span>
                <span>/{department.id}</span>
                <button
                  className="row-action"
                  type="button"
                  onClick={() => onOpenDepartment?.(department.id)}
                >
                  {department.id === workspaceId && !inPlatformWorkspace ? "Active" : "Open"}
                </button>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="platform-config-actions">
        <button className="secondary-button" type="button" onClick={onReload}>
          Refresh department list
        </button>
        {isCreator && inPlatformWorkspace ? (
          <button className="primary-button" type="button" onClick={onManageSubscriptions}>
            Manage subscriptions
          </button>
        ) : null}
        {isCreator && !inPlatformWorkspace ? (
          <button className="primary-button" type="button" onClick={onSetSubscriptionDates}>
            Set subscription dates
          </button>
        ) : null}
      </div>
    </>
  );
}
