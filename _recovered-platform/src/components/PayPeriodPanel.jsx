import { useMemo } from "react";
import {
  computePayPeriodEnd,
  formatPayPeriodLabel,
  normalizePayPeriod,
  payPeriodDayCount,
} from "../lib/payPeriods.js";

export default function PayPeriodPanel({
  value,
  onChange,
  readOnly = false,
}) {
  const normalized = useMemo(() => normalizePayPeriod(value), [value]);
  const dayCount = payPeriodDayCount(normalized);

  function update(patch) {
    onChange?.(normalizePayPeriod({ ...normalized, ...patch }));
  }

  function updateStart(nextStart) {
    const endDate = computePayPeriodEnd(nextStart, dayCount);
    update({ startDate: nextStart, endDate });
  }

  function updateLength(nextLength) {
    const lengthDays = Math.max(1, parseInt(nextLength, 10) || 1);
    update({ endDate: computePayPeriodEnd(normalized.startDate, lengthDays) });
  }

  return (
    <section className="pay-period-panel panel">
      <header>
        <div><strong>Pay Period</strong></div>
      </header>
      <div className="panel-body">
        <p className="auth-help">
          Current pay period dates appear on employee leave and shift trade calendars.
        </p>
        <div className="workflow-form">
          <label>
            <span>Period Start</span>
            <input
              type="date"
              value={normalized.startDate}
              disabled={readOnly}
              onChange={(event) => updateStart(event.target.value)}
            />
          </label>
          <label>
            <span>Period End</span>
            <input
              type="date"
              value={normalized.endDate}
              disabled={readOnly}
              onChange={(event) => update({ endDate: event.target.value })}
            />
          </label>
          <label>
            <span>Length (days)</span>
            <input
              type="number"
              min="1"
              max="31"
              value={dayCount}
              disabled={readOnly}
              onChange={(event) => updateLength(event.target.value)}
            />
          </label>
        </div>
        <p className="pay-period-summary">
          <strong>Current period:</strong> {formatPayPeriodLabel(normalized)} ({dayCount} days)
        </p>
      </div>
    </section>
  );
}
