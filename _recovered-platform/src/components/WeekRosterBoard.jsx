import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Megaphone,
} from "lucide-react";
import { buildWeekRosterBoardModel } from "../lib/weekRosterBoard.js";
import { parseDayId, shiftCalendarStyle, shiftShortLabel } from "../lib/shiftCalendar.js";

function shiftBadgeStyle(shiftLabel, rotation) {
  const styles = shiftCalendarStyle(shiftLabel, rotation);
  return {
    background: styles["--shift-fill"],
    color: styles["--shift-text"],
  };
}

function WeekRosterDayColumn({
  day,
  rotation,
  selected = false,
  collapsed = false,
  onToggleCollapse,
  onSelectDay,
}) {
  return (
    <article className={`week-roster-column${selected ? " is-selected" : ""}`}>
      <button
        type="button"
        className="week-roster-column-head"
        onClick={() => onSelectDay?.({ id: day.dayId, kind: "day", shift: day.shift })}
      >
        <span className="week-roster-column-weekday">{day.weekday}</span>
        <span className="week-roster-column-date">{day.calendarDay}</span>
        <span
          className="week-roster-column-shift-badge"
          style={shiftBadgeStyle(day.shift, rotation)}
        >
          {shiftShortLabel(day.shift)} Shift
        </span>
        <Megaphone size={13} className="week-roster-column-megaphone" aria-hidden="true" />
      </button>

      <div className="week-roster-column-body">
        <button
          type="button"
          className="week-roster-dept-bar"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
        >
          <span>{day.departmentTitle}</span>
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>

        {!collapsed ? day.stationGroups.map((stationGroup) => (
          <section key={`${day.dayId}-${stationGroup.station}`} className="week-roster-station">
            <h4 className="week-roster-station-label">{stationGroup.stationLabel}</h4>

            {stationGroup.units.map((unitEntry) => (
              <div
                key={`${day.dayId}-${unitEntry.unit}`}
                className={`week-roster-unit-card${unitEntry.hasVacancy ? " has-vacancy" : ""}`}
              >
                <div
                  className="week-roster-unit-head"
                  style={shiftBadgeStyle(day.shift, rotation)}
                >
                  {unitEntry.hasVacancy ? (
                    <AlertCircle size={14} className="week-roster-unit-icon alert" />
                  ) : (
                    <Check size={14} className="week-roster-unit-icon" />
                  )}
                  <strong>{unitEntry.unit}</strong>
                  <span className="week-roster-unit-shift">{shiftShortLabel(day.shift)}</span>
                </div>

                <div className="week-roster-unit-body">
                  {unitEntry.crew.map((member) => (
                    <div key={member.id} className="week-roster-member">
                      <strong>{member.name}</strong>
                      <span>{member.role}</span>
                      <span className="week-roster-member-time">{member.timeStart}-{member.timeEndLabel}</span>
                      <span className="week-roster-member-time">{member.timeStart}</span>
                    </div>
                  ))}

                  {unitEntry.vacancies.map((vacancy) => (
                    <div
                      key={vacancy.id}
                      className={`week-roster-member week-roster-open${vacancy.tone === "critical" ? " is-critical" : ""}`}
                    >
                      <strong>Open</strong>
                      <span>{vacancy.role}</span>
                    </div>
                  ))}

                  {!unitEntry.crew.length && !unitEntry.vacancies.length ? (
                    <div className="week-roster-member week-roster-empty">No assignment</div>
                  ) : null}
                </div>
              </div>
            ))}
          </section>
        )) : null}
      </div>
    </article>
  );
}

export default function WeekRosterBoard({
  weekSnapshots = [],
  selectedId = "",
  onSelectDay,
  rotation,
  onWeekChange,
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
  title = "7-Day Roster",
}) {
  const [collapsedDays, setCollapsedDays] = useState({});

  const boardDays = useMemo(
    () => buildWeekRosterBoardModel({
      weekSnapshots,
      apparatus,
      stationNames,
      departmentName,
      shiftChangeTime,
    }),
    [weekSnapshots, apparatus, stationNames, departmentName, shiftChangeTime]
  );

  if (!boardDays.length) return null;

  const weekLabel = `${parseDayId(boardDays[0].dayId).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${parseDayId(boardDays[boardDays.length - 1].dayId).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  function toggleDayCollapse(dayId) {
    setCollapsedDays((current) => ({
      ...current,
      [dayId]: !current[dayId],
    }));
  }

  return (
    <section className="week-roster-board">
      <header className="week-roster-board-header">
        <div>
          <h2>{title}</h2>
          <p>{weekLabel} — apparatus assignments by station. Click a day to select it on the calendar.</p>
        </div>
        <div className="week-roster-board-nav">
          <button type="button" className="week-roster-nav-btn" onClick={() => onWeekChange?.(-1)} aria-label="Previous week">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="week-roster-nav-btn" onClick={() => onWeekChange?.(1)} aria-label="Next week">
            <ChevronRight size={16} />
          </button>
        </div>
      </header>

      <div className="week-roster-board-scroll">
        <div className="week-roster-board-grid">
          {boardDays.map((day) => (
            <WeekRosterDayColumn
              key={day.dayId}
              day={day}
              rotation={rotation}
              selected={day.dayId === selectedId}
              collapsed={Boolean(collapsedDays[day.dayId])}
              onToggleCollapse={() => toggleDayCollapse(day.dayId)}
              onSelectDay={onSelectDay}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
