import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Filter, Megaphone } from "lucide-react";
import {
  buildExtendedMonthCells,
  buildWeekCells,
  shiftShortLabel,
} from "../lib/scheduleCalendarView.js";
import {
  isDarkShiftColor,
  monthLabel,
  orderShiftLegendSequence,
  resolveShiftRotation,
  shiftCalendarStyle,
  STAFFING_DEFICIT_LEGEND_LABEL,
} from "../lib/shiftCalendar.js";
import { defaultShiftRotation } from "../data/defaultShiftRotation.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY_SHIFTS = [];

function shiftBadgeStyle(shiftLabel, rotation) {
  const styles = shiftCalendarStyle(shiftLabel, rotation);
  return {
    background: styles["--shift-fill"],
    color: styles["--shift-text"],
  };
}

export default function ScheduleCalendar({
  title = "Calendar",
  showTitle = true,
  showFilter = true,
  showViewToggle = true,
  showLegend = true,
  showTodayButton = true,
  viewMode: controlledViewMode,
  onViewModeChange,
  year,
  month,
  onMonthChange,
  referenceDayId = "",
  scheduleDays = [],
  rotation = defaultShiftRotation,
  profileShifts = EMPTY_SHIFTS,
  selectedId = "",
  selectedDates = [],
  selectionMode = "none",
  onSelectDay,
  decorateDay,
  minDate = "",
  maxDate = "",
  isDaySelectable,
  className = "",
  compact = false,
  helpText = "",
  footerNote = "",
  subtitle = "",
}) {
  const today = new Date();
  const [showLegendPanel, setShowLegendPanel] = useState(false);
  const [internalViewMode, setInternalViewMode] = useState("month");
  const viewMode = controlledViewMode || internalViewMode;

  const resolvedRotation = useMemo(
    () => resolveShiftRotation(rotation, profileShifts),
    [rotation, profileShifts]
  );

  const monthCells = useMemo(
    () => buildExtendedMonthCells(year, month, scheduleDays, resolvedRotation),
    [year, month, scheduleDays, resolvedRotation]
  );

  const weekCells = useMemo(
    () => buildWeekCells(referenceDayId || selectedId || formatDayIdFromParts(year, month, 1), scheduleDays, resolvedRotation),
    [referenceDayId, selectedId, year, month, scheduleDays, resolvedRotation]
  );

  const cells = viewMode === "week" ? weekCells : monthCells;
  const legendShifts = orderShiftLegendSequence(resolvedRotation.sequence);
  const selectedSet = new Set(selectedDates.length ? selectedDates : (selectedId ? [selectedId] : []));

  function setViewMode(next) {
    if (onViewModeChange) onViewModeChange(next);
    else setInternalViewMode(next);
  }

  function moveMonth(delta) {
    const next = new Date(year, month + delta, 1);
    onMonthChange?.(next.getFullYear(), next.getMonth());
  }

  function moveWeek(delta) {
    const anchor = referenceDayId || selectedId || formatDayIdFromParts(year, month, 1);
    const date = parseDayIdSafe(anchor);
    date.setDate(date.getDate() + (delta * 7));
    onMonthChange?.(date.getFullYear(), date.getMonth());
    onSelectDay?.({ id: formatDayIdFromDate(date), kind: "day" });
  }

  function jumpToToday() {
    onMonthChange?.(today.getFullYear(), today.getMonth());
    onSelectDay?.({
      id: formatDayIdFromDate(today),
      kind: "day",
    });
  }

  function handleSelect(cell) {
    if (cell.kind !== "day" || selectionMode === "none") return;
    if (isDaySelectable && !isDaySelectable(cell.id)) return;
    onSelectDay?.(cell);
  }

  function handleNav(delta) {
    if (viewMode === "week") moveWeek(delta);
    else moveMonth(delta);
  }

  return (
    <section className={`schedule-calendar${compact ? " schedule-calendar-compact" : ""}${className ? ` ${className}` : ""}`}>
      {(showTitle || showFilter || showViewToggle || showTodayButton) && (
        <header className="schedule-calendar-toolbar">
          <div className="schedule-calendar-toolbar-left">
            {showTitle ? <h2 className="schedule-calendar-title">{title}</h2> : null}
            {showFilter ? (
              <button
                type="button"
                className={`schedule-calendar-filter${showLegendPanel ? " is-active" : ""}`}
                onClick={() => setShowLegendPanel((current) => !current)}
                aria-label="Toggle calendar legend"
                aria-pressed={showLegendPanel}
              >
                <Filter size={15} />
              </button>
            ) : null}
          </div>

          <div className="schedule-calendar-toolbar-center">
            <button type="button" className="schedule-calendar-nav-btn" onClick={() => handleNav(-1)} aria-label="Previous">
              <ChevronLeft size={16} />
            </button>
            <strong className="schedule-calendar-month-label">{monthLabel(year, month)}</strong>
            <button type="button" className="schedule-calendar-nav-btn" onClick={() => handleNav(1)} aria-label="Next">
              <ChevronRight size={16} />
            </button>
            {showTodayButton ? (
              <button type="button" className="schedule-calendar-today-btn" onClick={jumpToToday}>
                Today
              </button>
            ) : null}
          </div>

          {showViewToggle ? (
            <div className="schedule-calendar-view-toggle" role="tablist" aria-label="Calendar view">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "month"}
                className={viewMode === "month" ? "is-active" : ""}
                onClick={() => setViewMode("month")}
              >
                Month
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === "week"}
                className={viewMode === "week" ? "is-active" : ""}
                onClick={() => setViewMode("week")}
              >
                Week
              </button>
            </div>
          ) : null}
        </header>
      )}

      {subtitle ? <p className="schedule-calendar-subtitle">{subtitle}</p> : null}

      {showLegend && showLegendPanel ? (
        <div className="schedule-calendar-legend">
          {legendShifts.map((shift) => {
            const swatchColor = resolvedRotation.shiftColors?.[shift] || "#64748b";
            const dark = isDarkShiftColor(swatchColor);
            return (
              <span key={shift} className="schedule-calendar-legend-chip">
                <i
                  className={`schedule-calendar-swatch${dark ? " is-dark" : ""}`}
                  style={{ background: dark ? "#000000" : swatchColor }}
                />
                {shiftShortLabel(shift)} Shift
              </span>
            );
          })}
          <span className="schedule-calendar-legend-chip schedule-calendar-legend-muted">
            <i className="schedule-calendar-swatch schedule-calendar-swatch-cap" />
            CAP
          </span>
          <span className="schedule-calendar-legend-chip schedule-calendar-legend-muted">
            <i className="schedule-calendar-swatch schedule-calendar-swatch-deficit" />
            {STAFFING_DEFICIT_LEGEND_LABEL}
          </span>
        </div>
      ) : null}

      <div className="schedule-calendar-grid">
        {WEEKDAYS.map((label) => (
          <div key={label} className="schedule-calendar-weekday">{label}</div>
        ))}
        {cells.map((cell) => {
          if (cell.kind !== "day") return null;

          const decoration = decorateDay?.(cell) || {};
          const selected = selectedSet.has(cell.id);
          const selectable = selectionMode === "none"
            ? true
            : (isDaySelectable ? isDaySelectable(cell.id) : true);
          const disabled = selectionMode !== "none" && !selectable;
          const {
            scheduled = null,
            staffed,
            minimum,
            isDeficit = false,
            badgeCount = 0,
            showMegaphone = false,
            staffingLabel = "",
          } = decoration;

          const cellClasses = [
            "schedule-calendar-day",
            cell.inMonth ? "" : "is-outside-month",
            cell.isToday ? "is-today" : "",
            selected ? "is-selected" : "",
            isDeficit ? "is-deficit" : "",
            scheduled ? "has-scheduled" : "",
            disabled ? "is-disabled" : "",
          ].filter(Boolean).join(" ");

          const content = (
            <>
              <div className="schedule-calendar-day-top">
                <span className="schedule-calendar-date">{cell.calendarDay}</span>
                <div className="schedule-calendar-badges">
                  <span
                    className="schedule-calendar-shift-badge"
                    style={shiftBadgeStyle(cell.shift, resolvedRotation)}
                  >
                    {shiftShortLabel(cell.shift)} Shift
                  </span>
                  <span className="schedule-calendar-cap-badge">CAP: {cell.capNumber}</span>
                </div>
              </div>

              <div className="schedule-calendar-day-body">
                {scheduled ? (
                  <div className="schedule-calendar-scheduled-block">
                    <div className="schedule-calendar-scheduled-head">Scheduled</div>
                    <div className="schedule-calendar-scheduled-body">
                      <strong>{scheduled.unit}</strong>
                      <span>{scheduled.station}</span>
                      <span>{scheduled.position}</span>
                      <span className="schedule-calendar-scheduled-time">{scheduled.timeWindow}</span>
                    </div>
                  </div>
                ) : staffingLabel ? (
                  <div className="schedule-calendar-staffing-block">
                    <strong>{staffingLabel}</strong>
                    <span>staffed</span>
                  </div>
                ) : null}
              </div>

              <div className="schedule-calendar-day-footer">
                {showMegaphone ? (
                  <Megaphone size={13} className="schedule-calendar-megaphone" aria-hidden="true" />
                ) : <span />}
                {badgeCount > 0 ? (
                  <span className="schedule-calendar-count-badge" aria-label={`${badgeCount} open`}>
                    {badgeCount}
                  </span>
                ) : null}
              </div>
            </>
          );

          if (selectionMode === "none") {
            return (
              <button
                key={cell.id}
                type="button"
                className={cellClasses}
                onClick={() => handleSelect(cell)}
                aria-label={`${cell.weekday}, ${cell.date}, ${cell.shift}`}
                aria-pressed={selected}
              >
                {content}
              </button>
            );
          }

          return (
            <button
              key={cell.id}
              type="button"
              className={cellClasses}
              disabled={disabled}
              onClick={() => handleSelect(cell)}
              aria-label={`${cell.weekday}, ${cell.date}, ${cell.shift}`}
              aria-pressed={selected}
              aria-disabled={disabled}
            >
              {content}
            </button>
          );
        })}
      </div>

      {helpText ? <p className="schedule-calendar-help">{helpText}</p> : null}
      {footerNote ? <p className="schedule-calendar-footnote">{footerNote}</p> : null}
    </section>
  );
}

function formatDayIdFromParts(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDayIdFromDate(date) {
  return formatDayIdFromParts(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseDayIdSafe(id) {
  const [year, month, day] = String(id).split("-").map(Number);
  return new Date(year, month - 1, day);
}
