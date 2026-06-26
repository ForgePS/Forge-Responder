import { useMemo } from "react";
import ScheduleCalendar from "./ScheduleCalendar.jsx";
import { buildAdminDayDecorators } from "../lib/scheduleCalendarView.js";
import { parseDayId, resolveShiftRotation } from "../lib/shiftCalendar.js";
import { rotationSummary } from "../data/defaultShiftRotation.js";

const EMPTY_SHIFTS = [];

export default function ShiftCalendar({
  year,
  month,
  onMonthChange,
  existingDays = [],
  selectedId,
  onSelectDay,
  rotation,
  profileShifts = EMPTY_SHIFTS,
  liveDayMetrics = {},
}) {
  const resolvedRotation = useMemo(
    () => resolveShiftRotation(rotation, profileShifts),
    [rotation, profileShifts]
  );

  const decorateDay = useMemo(
    () => buildAdminDayDecorators({ liveDayMetrics }),
    [liveDayMetrics]
  );

  return (
    <section className="shift-calendar-panel">
      <ScheduleCalendar
        title="Shift Calendar"
        subtitle={`${rotationSummary(resolvedRotation)} — select a day to view roster and apparatus assignments.`}
        year={year}
        month={month}
        onMonthChange={onMonthChange}
        referenceDayId={selectedId}
        scheduleDays={existingDays}
        rotation={resolvedRotation}
        profileShifts={profileShifts}
        selectedId={selectedId}
        selectionMode="single"
        onSelectDay={onSelectDay}
        decorateDay={decorateDay}
        showTodayButton
        showViewToggle
        showFilter
        showLegend
      />

      {selectedId && (
        <p className="shift-calendar-footnote">
          Selected: {parseDayId(selectedId).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      )}
    </section>
  );
}
