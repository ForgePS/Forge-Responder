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
  viewMode = "month",
  onViewModeChange,
  showViewToggle = true,
  weekRoster = null,
  leaveRequests = [],
  personnel = [],
  roster = [],
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
        subtitle={viewMode === "week" ? undefined : `${rotationSummary(resolvedRotation)} — select a day to view roster and apparatus assignments.`}
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
        showViewToggle={showViewToggle && Boolean(onViewModeChange)}
        showFilter
        showLegend={viewMode !== "week"}
        viewMode={viewMode}
        onViewModeChange={onViewModeChange}
        leaveRequests={leaveRequests}
        personnel={personnel}
        roster={roster}
      />

      {viewMode === "week" && weekRoster ? (
        <div className="shift-calendar-week-roster">{weekRoster}</div>
      ) : null}

      {selectedId && (
        <p className="shift-calendar-footnote">
          Selected: {parseDayId(selectedId).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      )}
    </section>
  );
}
