import { useMemo, useState } from "react";
import { CirclePlus, Trash2 } from "lucide-react";
import {
  HOLIDAY_NON_WORK_DAY_OPTIONS,
  HOLIDAY_WORK_DAY_OPTIONS,
  normalizePayRules,
} from "../lib/payRules.js";

const emptyHolidayDraft = { date: "", name: "", paidHours: "" };

export default function PayRulesPanel({
  value,
  onChange,
  readOnly = false,
}) {
  const normalized = useMemo(() => normalizePayRules(value), [value]);
  const [holidayDraft, setHolidayDraft] = useState(emptyHolidayDraft);

  function update(patch) {
    onChange?.(normalizePayRules({ ...normalized, ...patch }));
  }

  function addHoliday() {
    const date = String(holidayDraft.date || "").slice(0, 10);
    const name = String(holidayDraft.name || "").trim();
    if (!date || !name) return;

    const paidHours = holidayDraft.paidHours === ""
      ? normalized.defaultHolidayPaidHours
      : holidayDraft.paidHours;

    update({
      holidays: [
        ...normalized.holidays,
        { id: `hol-${date}`, date, name, paidHours },
      ],
    });
    setHolidayDraft(emptyHolidayDraft);
  }

  function removeHoliday(holidayId) {
    update({
      holidays: normalized.holidays.filter((entry) => entry.id !== holidayId),
    });
  }

  function updateHolidayPaidHours(holidayId, paidHours) {
    update({
      holidays: normalized.holidays.map((entry) => (
        entry.id === holidayId ? { ...entry, paidHours } : entry
      )),
    });
  }

  function updateHolidayPolicy(patch) {
    update({
      holidayPayPolicy: {
        ...normalized.holidayPayPolicy,
        ...patch,
      },
    });
  }

  const nonWorkDayHelp = HOLIDAY_NON_WORK_DAY_OPTIONS.find(
    (option) => option.value === normalized.holidayPayPolicy.nonWorkDay
  )?.description || "";

  const workDayHelp = HOLIDAY_WORK_DAY_OPTIONS.find(
    (option) => option.value === normalized.holidayPayPolicy.workDay
  )?.description || "";

  return (
    <section className="pay-rules-panel">
      <header className="employee-portal-rules-heading">
        <strong>Pay, Overtime &amp; Holiday Rules</strong>
        <p className="auth-help">
          Configure how the employee time card calculates regular hours, holiday pay, and overtime for your department.
        </p>
      </header>

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Pay Rules</strong></div>
        </header>
        <div className="panel-body">
          <div className="workflow-form">
            <label>
              <span>Hours per shift work day</span>
              <input
                type="number"
                min="1"
                max="24"
                step="0.5"
                value={normalized.workDayHours}
                disabled={readOnly}
                onChange={(event) => update({ workDayHours: event.target.value })}
              />
            </label>
          </div>
          <p className="pay-period-summary">
            Scheduled shift days count as <strong>{normalized.workDayHours} hours</strong> unless the member is on approved leave.
            Holiday hours are paid at <strong>straight time (1.0x)</strong> and are excluded from overtime threshold calculations.
          </p>
        </div>
      </section>

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Overtime Rules</strong></div>
        </header>
        <div className="panel-body">
          <div className="workflow-form">
            <label>
              <span>Actual worked hours threshold (per pay period)</span>
              <input
                type="number"
                min="0"
                max="500"
                step="1"
                value={normalized.overtimeThresholdHours}
                disabled={readOnly}
                onChange={(event) => update({ overtimeThresholdHours: event.target.value })}
              />
            </label>
            <label>
              <span>Overtime rate multiplier</span>
              <input
                type="number"
                min="1"
                max="3"
                step="0.1"
                value={normalized.overtimeMultiplier}
                disabled={readOnly}
                onChange={(event) => update({ overtimeMultiplier: event.target.value })}
              />
            </label>
            <label className="permission-toggle permission-check wide-field">
              <input
                type="checkbox"
                checked={normalized.autoCalculateOvertime}
                disabled={readOnly}
                onChange={(event) => update({ autoCalculateOvertime: event.target.checked })}
              />
              <span>Auto-calculate overtime when actual worked hours exceed the threshold</span>
            </label>
          </div>
          <p className="pay-period-summary">
            Actual work hours (regular shifts, roster OT, and day-level extra hours) count toward the threshold.
            Sick, vacation, military leave, and holiday pay do not count. Hours above{" "}
            <strong>{normalized.overtimeThresholdHours}</strong> actual worked in a pay period
            {normalized.autoCalculateOvertime
              ? " automatically flow to overtime at "
              : " can be entered manually on time cards at "}
            <strong>{normalized.overtimeMultiplier}x</strong>.
          </p>
        </div>
      </section>

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Holiday Pay Policy</strong></div>
        </header>
        <div className="panel-body">
          <p className="auth-help">
            Control how configured holidays are paid on time sheets for personnel with an assigned shift.
            Platoon work days follow the A/B/C rotation; all other days are treated as non-work days for holiday pay.
          </p>

          <div className="workflow-form pay-rules-holiday-policy-form">
            <label className="wide-field">
              <span>When NOT scheduled to work on a holiday</span>
              <select
                value={normalized.holidayPayPolicy.nonWorkDay}
                disabled={readOnly}
                onChange={(event) => updateHolidayPolicy({ nonWorkDay: event.target.value })}
              >
                {HOLIDAY_NON_WORK_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="wide-field">
              <span>When scheduled TO WORK on a holiday</span>
              <select
                value={normalized.holidayPayPolicy.workDay}
                disabled={readOnly}
                onChange={(event) => updateHolidayPolicy({ workDay: event.target.value })}
              >
                {HOLIDAY_WORK_DAY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="permission-toggle permission-check wide-field">
              <input
                type="checkbox"
                checked={normalized.holidayPayPolicy.requireShiftAssignment}
                disabled={readOnly}
                onChange={(event) => updateHolidayPolicy({
                  requireShiftAssignment: event.target.checked,
                })}
              />
              <span>Require an assigned shift before automatic holiday pay applies</span>
            </label>
          </div>

          <p className="pay-period-summary">
            <strong>Off-day rule:</strong> {nonWorkDayHelp}
            {" "}
            <strong>Work-day rule:</strong> {workDayHelp}
            {" "}
            Holiday hours are straight time and are excluded from the overtime threshold.
          </p>
        </div>
      </section>

      <section className="portal-rules-section panel">
        <header>
          <div><strong>Holiday Calendar &amp; Paid Hours</strong></div>
        </header>
        <div className="panel-body">
          <p className="auth-help">
            Add paid holidays for this department and set how many hours each holiday pays.
            Configured holidays appear on time sheets according to the holiday pay policy above.
          </p>

          <div className="workflow-form pay-rules-default-holiday-hours">
            <label>
              <span>Default paid hours for new holidays</span>
              <input
                type="number"
                min="0"
                max="24"
                step="0.5"
                value={normalized.defaultHolidayPaidHours}
                disabled={readOnly}
                onChange={(event) => update({ defaultHolidayPaidHours: event.target.value })}
              />
            </label>
          </div>

          {!readOnly ? (
            <div className="pay-rules-holiday-form workflow-form">
              <label>
                <span>Date</span>
                <input
                  type="date"
                  value={holidayDraft.date}
                  onChange={(event) => setHolidayDraft((current) => ({
                    ...current,
                    date: event.target.value,
                  }))}
                />
              </label>
              <label>
                <span>Holiday name</span>
                <input
                  value={holidayDraft.name}
                  placeholder="Memorial Day"
                  onChange={(event) => setHolidayDraft((current) => ({
                    ...current,
                    name: event.target.value,
                  }))}
                />
              </label>
              <label>
                <span>Paid hours</span>
                <input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={holidayDraft.paidHours}
                  placeholder={String(normalized.defaultHolidayPaidHours)}
                  onChange={(event) => setHolidayDraft((current) => ({
                    ...current,
                    paidHours: event.target.value,
                  }))}
                />
              </label>
              <button
                type="button"
                className="secondary-button pay-rules-add-holiday"
                onClick={addHoliday}
                disabled={!holidayDraft.date || !holidayDraft.name.trim()}
              >
                <CirclePlus size={14} /> Add holiday
              </button>
            </div>
          ) : null}

          <div className="pay-rules-holiday-head">
            <span>Date</span>
            <span>Holiday</span>
            <span>Paid hours</span>
            {!readOnly ? <span aria-hidden="true" /> : null}
          </div>

          <div className="pay-rules-holiday-list">
            {normalized.holidays.map((holiday) => (
              <div className="pay-rules-holiday-row" key={holiday.id}>
                <strong>{formatHolidayLabel(holiday.date)}</strong>
                <span>{holiday.name}</span>
                {readOnly ? (
                  <strong className="pay-rules-holiday-paid">{holiday.paidHours} hrs</strong>
                ) : (
                  <label className="pay-rules-holiday-paid-field">
                    <span className="sr-only">Paid hours for {holiday.name}</span>
                    <input
                      type="number"
                      min="0"
                      max="24"
                      step="0.5"
                      value={holiday.paidHours}
                      onChange={(event) => updateHolidayPaidHours(holiday.id, event.target.value)}
                    />
                  </label>
                )}
                {!readOnly ? (
                  <button
                    type="button"
                    className="text-button pay-rules-remove-holiday"
                    aria-label={`Remove ${holiday.name}`}
                    onClick={() => removeHoliday(holiday.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                ) : null}
              </div>
            ))}
            {!normalized.holidays.length ? (
              <p className="auth-help">No holidays configured yet.</p>
            ) : null}
          </div>
        </div>
      </section>
    </section>
  );
}

function formatHolidayLabel(dayId = "") {
  const date = new Date(`${String(dayId).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return dayId;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
