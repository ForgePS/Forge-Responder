import { useMemo, useState } from "react";
import ScheduleCalendar from "../ScheduleCalendar.jsx";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";
import {
  formatPayPeriodLabel,
  getPayPeriodLengthDays,
  normalizePayPeriod,
  resolvePayPeriodForDay,
} from "../../lib/payPeriods.js";
import { resolveApprovedLeaveCountForDay } from "../../lib/schedulingRoster.js";
import {
  formatSelectableDateRange,
  isDayWithinRange,
} from "../../lib/employeePortalWorkflow.js";
import { formatDayId } from "../../lib/shiftCalendar.js";

function sortDayIds(values = []) {
  return [...values].sort();
}

export default function PortalDayPicker({
  label = "Select dates",
  selectedDates = [],
  onChange,
  mode = "multiple",
  scheduleDays = [],
  rotation = defaultShiftRotation,
  payPeriod = null,
  leaveRequests = [],
  personnel = [],
  roster = [],
  minDate = "",
  maxDate = "",
  rangeHint = "",
  isDayDisplayed = null,
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const resolvedPayPeriod = useMemo(
    () => normalizePayPeriod(payPeriod || {}),
    [payPeriod]
  );

  const currentPayPeriod = useMemo(
    () => resolvePayPeriodForDay(formatDayId(today), resolvedPayPeriod),
    [today, resolvedPayPeriod]
  );

  const payPeriodLength = useMemo(
    () => getPayPeriodLengthDays(resolvedPayPeriod),
    [resolvedPayPeriod]
  );

  const decorateDay = useMemo(() => function decoratePickerDay(cell) {
    const capCount = resolveApprovedLeaveCountForDay({
      dayId: cell.id,
      shift: cell.shift,
      roster,
      personnel,
      leaveRequests,
    });

    return {
      capCount,
      badgeCount: capCount,
      showMegaphone: capCount > 0,
    };
  }, [leaveRequests, personnel, roster]);

  function handleMonthChange(nextYear, nextMonth) {
    setYear(nextYear);
    setMonth(nextMonth);
  }

  function handleSelectDay(cell) {
    if (cell.kind !== "day") return;
    if (isDayDisplayed && !isDayDisplayed(cell.id, cell)) return;
    if (!isDayWithinRange(cell.id, minDate, maxDate)) return;

    if (mode === "single") {
      onChange?.([cell.id]);
      return;
    }

    const selectedSet = new Set(selectedDates);
    const next = selectedSet.has(cell.id)
      ? selectedDates.filter((id) => id !== cell.id)
      : sortDayIds([...selectedDates, cell.id]);
    onChange?.(next);
  }

  const rangeLabel = formatSelectableDateRange(minDate, maxDate);
  const helpText = [
    mode === "single"
      ? "Click a day to select it."
      : "Click individual days to select or deselect them. Days do not need to be consecutive.",
    rangeHint,
    rangeLabel ? `Available dates: ${rangeLabel}.` : "",
    selectedDates.length ? `Selected: ${selectedDates.length} day${selectedDates.length === 1 ? "" : "s"}.` : "",
  ].filter(Boolean).join(" ");

  return (
    <div className="portal-day-picker">
      {payPeriod ? (
        <p className="portal-day-picker-pay-period">
          <strong>Current pay period:</strong> {formatPayPeriodLabel(currentPayPeriod)}
          {" · "}
          Repeats every {payPeriodLength} days.
        </p>
      ) : null}

      <ScheduleCalendar
        title={label}
        showFilter={false}
        showViewToggle={false}
        showLegend={false}
        showTodayButton={false}
        compact
        className="portal-day-picker-calendar"
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
        scheduleDays={scheduleDays}
        rotation={rotation}
        selectedDates={selectedDates}
        selectionMode={mode === "single" ? "single" : "multiple"}
        onSelectDay={handleSelectDay}
        decorateDay={decorateDay}
        leaveRequests={leaveRequests}
        personnel={personnel}
        roster={roster}
        isDayDisplayed={isDayDisplayed}
        isDaySelectable={(dayId) => {
          if (isDayDisplayed && !isDayDisplayed(dayId)) return false;
          return isDayWithinRange(dayId, minDate, maxDate);
        }}
        helpText={helpText}
      />
    </div>
  );
}
