import { useMemo } from "react";
import PayPeriodPanel from "./PayPeriodPanel.jsx";
import {
  defaultEmployeePortalRules,
  normalizeEmployeePortalRules,
} from "../lib/employeePortalRules.js";

export default function EmployeePortalRulesPanel({
  payPeriod,
  onPayPeriodChange,
  portalRules,
  onPortalRulesChange,
  readOnly = false,
}) {
  const normalizedRules = useMemo(
    () => normalizeEmployeePortalRules(portalRules),
    [portalRules]
  );

  function updateRules(patch) {
    onPortalRulesChange?.(normalizeEmployeePortalRules({ ...normalizedRules, ...patch }));
  }

  return (
    <section className="employee-portal-rules-panel">
      <header className="employee-portal-rules-heading">
        <strong>Employee Portal Rules</strong>
        <p className="auth-help">
          Set pay periods, how far ahead members can request vacation, and shift trade windows.
          Changes apply to the Employee Portal as soon as you save.
        </p>
      </header>

      <PayPeriodPanel
        value={payPeriod}
        onChange={onPayPeriodChange}
        readOnly={readOnly}
      />

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Vacation Rules</strong></div>
        </header>
        <div className="panel-body">
          <p className="auth-help">
            Limits how far in advance members can request vacation on the Employee Portal calendar.
          </p>
          <div className="workflow-form">
            <label>
              <span>Max advance (days)</span>
              <input
                type="number"
                min="1"
                max="365"
                value={normalizedRules.vacationMaxAdvanceDays}
                disabled={readOnly}
                onChange={(event) => updateRules({ vacationMaxAdvanceDays: event.target.value })}
              />
            </label>
          </div>
          <p className="pay-period-summary">
            Members can select vacation dates from today through{" "}
            <strong>{normalizedRules.vacationMaxAdvanceDays} days</strong> out.
          </p>
        </div>
      </section>

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Shift Trade Rules</strong></div>
        </header>
        <div className="panel-body">
          <p className="auth-help">
            Shift trades start on the member&apos;s earliest upcoming work day and can extend forward from there.
          </p>
          <div className="workflow-form">
            <label>
              <span>Max advance (months)</span>
              <input
                type="number"
                min="1"
                max="24"
                value={normalizedRules.shiftTradeMaxAdvanceMonths}
                disabled={readOnly}
                onChange={(event) => updateRules({ shiftTradeMaxAdvanceMonths: event.target.value })}
              />
            </label>
          </div>
          <p className="pay-period-summary">
            Members can schedule trades from their earliest work date through{" "}
            <strong>{normalizedRules.shiftTradeMaxAdvanceMonths} months</strong> forward.
          </p>
        </div>
      </section>
    </section>
  );
}

export { defaultEmployeePortalRules };
