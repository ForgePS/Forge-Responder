import { Fragment, useMemo, useState } from "react";
import { Globe, Search } from "lucide-react";
import { describeDomainStatus, registerDepartmentDomain } from "../lib/departmentDomainService.js";
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
  // Per-department web address setup state: { [id]: { busy, message, ok } }
  const [domainSetup, setDomainSetup] = useState({});

  async function setUpWebAddress(departmentId) {
    setDomainSetup((current) => ({ ...current, [departmentId]: { busy: true, message: "" } }));
    try {
      const status = await registerDepartmentDomain(departmentId);
      setDomainSetup((current) => ({
        ...current,
        [departmentId]: { busy: false, ok: true, message: describeDomainStatus(status) },
      }));
      onReload?.();
    } catch (error) {
      setDomainSetup((current) => ({
        ...current,
        [departmentId]: {
          busy: false,
          ok: false,
          message: `Couldn't set up the web address: ${error?.message || "unknown error"}`,
        },
      }));
    }
  }

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
                <span style={isCreator ? { whiteSpace: "normal" } : undefined}>
                  /{department.id}
                  {isCreator && !department.domain && !domainSetup[department.id]?.ok && (
                    <span className="department-branch-domain">
                      <br />
                      <em className="auth-help">Web address not set up</em>{" "}
                      <button
                        className="row-action"
                        type="button"
                        onClick={() => setUpWebAddress(department.id)}
                        disabled={domainSetup[department.id]?.busy}
                      >
                        <Globe size={12} /> {domainSetup[department.id]?.busy ? "Setting up..." : "Set up web address"}
                      </button>
                    </span>
                  )}
                  {domainSetup[department.id]?.message && (
                    <>
                      <br />
                      <span className="auth-help" role="status">{domainSetup[department.id].message}</span>
                    </>
                  )}
                </span>
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
