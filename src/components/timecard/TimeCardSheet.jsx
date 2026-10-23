import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveDepartmentLogoUrl } from "../../lib/brandAssets.js";
import { computeWeekHourBreakdown } from "../../lib/timeCardWorkflow.js";

const WEEKDAY_HEADERS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SUMMARY_ROW_ONE = [
  { key: "regularHours", label: "Total Regular Hrs. Worked" },
  { key: "annualLeave", label: "Annual Leave Hrs" },
  { key: "sickLeave", label: "Sick Leave Hrs" },
  { key: "militaryLeave", label: "Military Leave Hrs" },
];

const SUMMARY_ROW_TWO = [
  { key: "medicUnitHours", label: "FF Medic Unit Hrs" },
  { key: "holidayHours", label: "Holiday Hrs." },
  { key: "overtimeHours", label: "Over Time Hrs." },
  { key: "workersCompHours", label: "W/C Hrs.", editable: true },
];

function formatHours(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
}

function resolveDayLeaveKind(day = {}) {
  const sick = Number.parseFloat(day.leaveHours?.sickLeave);
  const vacation = Number.parseFloat(day.leaveHours?.annualLeave);
  if (Number.isFinite(sick) && sick > 0) return "sick";
  if (Number.isFinite(vacation) && vacation > 0) return "vacation";
  return "";
}

function TimeCardWeekTotalCell({ lines = [] }) {
  return (
    <div className="time-card-week-total">
      {lines.map((line) => (
        <div
          key={line.displayText}
          className={`time-card-week-total-line${
            line.tone === "leave" || line.tone === "holiday" ? " is-leave" : ""
          }${line.tone === "overtime" ? " is-overtime" : ""}`}
        >
          {line.displayText}
        </div>
      ))}
    </div>
  );
}

function TimeCardSignatureField({ label, value = "", interactive, readOnly = false, onChange }) {
  return (
    <label>
      <span>{label}</span>
      {interactive ? (
        <>
          <input
            type="text"
            className="time-card-edit-only"
            value={value}
            placeholder=""
            readOnly={readOnly || undefined}
            onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          />
          <div className="time-card-signature-line time-card-print-only" aria-hidden="true">
            {value}
          </div>
        </>
      ) : (
        <div className="time-card-signature-line">{value}</div>
      )}
    </label>
  );
}

function TimeCardDayCell({
  day,
  isFireMedic,
  interactive,
  adminMode,
  onMedicHoursChange,
}) {
  const medicValue = day.medicUnitHoursRaw !== undefined && day.medicUnitHoursRaw !== null
    ? String(day.medicUnitHoursRaw)
    : (day.medicUnitHours ? String(day.medicUnitHours) : "");

  const leaveKind = resolveDayLeaveKind(day);
  const showShiftTimes = day.showShiftTimes && (day.startTimeLabel || day.endTimeLabel);

  return (
    <div
      className={[
        "time-card-day",
        day.onLeave ? "is-leave" : "",
        leaveKind ? `is-${leaveKind}-leave` : "",
        day.isWorkDay ? "is-work" : "",
        day.isHoliday ? "is-holiday" : "",
        isFireMedic ? "is-medic" : "",
      ].filter(Boolean).join(" ")}
    >
      <span className="time-card-day-date">{day.calendarDay}</span>

      {isFireMedic ? (
        interactive ? (
          <>
            <input
              type="number"
              min="0"
              step="0.5"
              className="time-card-medic-box time-card-edit-only"
              value={medicValue}
              placeholder=""
              aria-label={`FF Medic unit hours for ${day.weekdayShort} ${day.calendarDay}`}
              onChange={(event) => onMedicHoursChange?.(day.id, event.target.value)}
            />
            {day.medicUnitHours > 0 ? (
              <span className="time-card-medic-box time-card-medic-box-static time-card-print-only">
                {formatHours(day.medicUnitHours)}
              </span>
            ) : (
              <span className="time-card-medic-box time-card-medic-box-static time-card-medic-box-empty time-card-print-only" aria-hidden="true" />
            )}
          </>
        ) : (
          <span className={`time-card-medic-box time-card-medic-box-static${day.medicUnitHours > 0 ? "" : " time-card-medic-box-empty"}`}>
            {formatHours(day.medicUnitHours)}
          </span>
        )
      ) : null}

      <div className="time-card-day-main">
        {showShiftTimes ? (
          <div className="time-card-day-times">
            {day.startTimeLabel ? (
              <span className="time-card-day-time">{day.startTimeLabel}</span>
            ) : null}
            {day.endTimeLabel ? (
              <span className="time-card-day-time">{day.endTimeLabel}</span>
            ) : null}
          </div>
        ) : null}

        {day.cellMain ? <span className="time-card-day-hours">{day.cellMain}</span> : null}
        {day.workHoursDisplay ? (
          <span className="time-card-day-hours is-regular-work">{day.workHoursDisplay}</span>
        ) : null}
        {day.isHoliday && day.holidayName && day.cellMain !== day.holidayName ? (
          <span className="time-card-day-holiday-label">{day.holidayName}</span>
        ) : null}
      </div>
    </div>
  );
}

export default function TimeCardSheet({
  model,
  totals = {},
  savedEntry = null,
  departmentTitle = "Fire and EMS",
  departmentLogoUrl = "",
  interactive = false,
  adminMode = false,
  showPayPeriodNav = false,
  onPayPeriodPrevious,
  onPayPeriodNext,
  onMedicHoursChange,
  onSummaryChange,
  onEmployeeSignature,
  onDepartmentHeadSignature,
  className = "",
}) {
  const logoSrc = resolveDepartmentLogoUrl(departmentLogoUrl);
  const title = departmentTitle.includes("Time Sheet")
    ? departmentTitle
    : `${departmentTitle} Time Sheet`;

  function renderSummaryValue(key, editable) {
    if (interactive && editable) {
      return (
        <>
          <input
            type="number"
            min="0"
            step="0.5"
            className="time-card-edit-only"
            value={savedEntry?.summary?.[key] ?? ""}
            onChange={(event) => onSummaryChange?.(key, event.target.value)}
          />
          <strong className="time-card-print-only">{formatHours(totals[key])}</strong>
        </>
      );
    }
    return <strong>{formatHours(totals[key])}</strong>;
  }

  return (
    <article className={`time-card-sheet${interactive ? " is-interactive" : " is-print"} ${className}`.trim()}>
      <header className="time-card-header">
        <h2 className="time-card-title">{title}</h2>
        {logoSrc ? (
          <div className="time-card-logo-wrap">
            <img className="time-card-logo" src={logoSrc} alt="" />
          </div>
        ) : null}
        <div className="time-card-meta-row">
          <label className="time-card-meta-field">
            <span>Employee:</span>
            <strong>{model.employeeName}</strong>
          </label>
          <label className="time-card-meta-field">
            <span>Pay Period:</span>
            {showPayPeriodNav ? (
              <div className="time-card-pay-period-nav">
                <button type="button" className="time-card-nav-btn" onClick={onPayPeriodPrevious} aria-label="Previous pay period">
                  <ChevronLeft size={14} />
                </button>
                <strong>{model.payPeriodLabel}</strong>
                <button type="button" className="time-card-nav-btn" onClick={onPayPeriodNext} aria-label="Next pay period">
                  <ChevronRight size={14} />
                </button>
              </div>
            ) : (
              <strong>{model.payPeriodLabel}</strong>
            )}
          </label>
        </div>
      </header>

      <div className="time-card-week-scroll">
        <div className="time-card-calendar">
          <div className="time-card-weekdays">
            {WEEKDAY_HEADERS.map((label) => (
              <span key={label}>{label}</span>
            ))}
            <span className="time-card-weekday-total" aria-hidden="true" />
          </div>
          {model.weeks.map((week, weekIndex) => (
            <div
              key={`week-${weekIndex}`}
              className={`time-card-week-grid${weekIndex > 0 ? " time-card-week-row-separated" : ""}`}
            >
              {week.map((day, columnIndex) => (
                day ? (
                  <TimeCardDayCell
                    key={day.id}
                    day={day}
                    isFireMedic={model.isFireMedic}
                    interactive={interactive}
                    adminMode={adminMode}
                    onMedicHoursChange={onMedicHoursChange}
                  />
                ) : (
                  <div key={`${weekIndex}-pad-${columnIndex}`} className="time-card-day time-card-day-pad" aria-hidden="true" />
                )
              ))}
              <TimeCardWeekTotalCell lines={computeWeekHourBreakdown(week)} />
            </div>
          ))}
        </div>
      </div>

      {adminMode && interactive ? (
        <p className="time-card-extra-help auth-help">
          Roster and extra work hours appear in the day cell as regular hours.
          Overtime pay applies only after{" "}
          {formatHours(totals.overtimeThresholdLimit || 106)} actual hours in the pay period.
          Sick, vacation, and holiday pay do not count toward that threshold.
        </p>
      ) : null}

      <section className="time-card-summary-grid">
        <p className="time-card-summary-caption auth-help">Pay period totals (weekly columns show each week only).</p>
        <div className="time-card-summary-row time-card-summary-row-4">
          {SUMMARY_ROW_ONE.map(({ key, label }) => (
            <label key={key} className="time-card-summary-cell time-card-summary-cell-inline">
              <span>{label}:</span>
              {renderSummaryValue(key, false)}
            </label>
          ))}
        </div>
        <div className="time-card-summary-row time-card-summary-row-4">
          {SUMMARY_ROW_TWO.map(({ key, label, editable }) => (
            <label key={key} className="time-card-summary-cell time-card-summary-cell-inline">
              <span>{label}:</span>
              {renderSummaryValue(key, editable)}
            </label>
          ))}
        </div>
        {adminMode && interactive && totals.actualWorkedHours > 0 ? (
          <p className="time-card-overtime-note auth-help">
            {formatHours(totals.actualWorkedHours)} actual hours worked this period
            {totals.overtimeThresholdHours > 0
              ? ` · ${formatHours(totals.overtimeThresholdHours)} overtime after ${formatHours(totals.overtimeThresholdLimit || 106)} threshold`
              : ` · no overtime yet (threshold ${formatHours(totals.overtimeThresholdLimit || 106)} actual hours; sick/vacation excluded)`}
            .
          </p>
        ) : null}
        <label className="time-card-summary-cell time-card-summary-cell-inline time-card-summary-grand">
          <span>Grand Total Hours to be Paid:</span>
          <strong>{formatHours(totals.grandTotal)}</strong>
        </label>
      </section>

      <footer className="time-card-certify">
        <div className="time-card-certify-row">
          <p className="time-card-certify-text">We certify this time sheet to be true and correct:</p>
          <TimeCardSignatureField
            label="Department Head Signature"
            value={savedEntry?.departmentHeadSignature || ""}
            interactive={interactive}
            readOnly={!adminMode}
            onChange={interactive && adminMode ? onDepartmentHeadSignature : undefined}
          />
          <TimeCardSignatureField
            label="Employee's Signature"
            value={savedEntry?.employeeSignature || ""}
            interactive={interactive}
            onChange={interactive ? onEmployeeSignature : undefined}
          />
        </div>
      </footer>
    </article>
  );
}
