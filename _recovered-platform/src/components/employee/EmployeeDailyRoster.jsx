import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { buildDayScheduleSnapshot } from "../../lib/schedulingRoster.js";
import { buildDailyRosterDayBoard } from "../../lib/weekRosterBoard.js";
import { formatDayId, parseDayId, shiftCalendarStyle, shiftShortLabel } from "../../lib/shiftCalendar.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

function shiftBadgeStyle(shiftLabel, rotation) {
  const styles = shiftCalendarStyle(shiftLabel, rotation);
  return {
    background: styles["--shift-fill"],
    color: styles["--shift-text"],
  };
}

function DailyRosterUnitCard({ unitEntry, shift, rotation, collapsed, onToggle }) {
  return (
    <section className={`daily-roster-unit${unitEntry.hasVacancy ? " has-vacancy" : ""}`}>
      <button
        type="button"
        className="daily-roster-unit-head"
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <span className="daily-roster-unit-toggle">
          {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </span>
        <span className="daily-roster-unit-name">{unitEntry.unit}</span>
        <span className="daily-roster-unit-meta">{unitEntry.staffingLabel}</span>
        <span className="daily-roster-unit-meta">24 Hours</span>
        <span className="daily-roster-unit-meta">{unitEntry.members[0]?.timeWindow || "—"}</span>
        <span
          className="daily-roster-unit-shift"
          style={shiftBadgeStyle(shift, rotation)}
        >
          {shiftShortLabel(shift)} Shift
        </span>
      </button>

      {!collapsed ? (
        <div className="daily-roster-unit-body">
          <div className="daily-roster-member-row daily-roster-member-head">
            <span>Role</span>
            <span>Name</span>
            <span>Duration</span>
            <span>Shift Time</span>
            <span>Status</span>
          </div>
          {unitEntry.members.map((member) => (
            <div
              className={`daily-roster-member-row${member.status === "Open Shift" ? " is-open" : ""}`}
              key={member.id}
            >
              <span>{member.role}</span>
              <span>{member.name}</span>
              <span>{member.durationLabel}</span>
              <span>{member.timeWindow}</span>
              <span className={
                member.status === "Open Shift" ? "cell-warning"
                  : member.status === "On Leave" ? "cell-warning"
                    : "cell-success"
              }
              >
                {member.status}
              </span>
            </div>
          ))}
          {!unitEntry.members.length ? (
            <div className="daily-roster-member-row is-empty">
              <span>No assignments</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function EmployeeDailyRoster({
  scheduleDays = [],
  rotation = defaultShiftRotation,
  roster = [],
  personnel = [],
  leaveRequests = [],
  schedulingSettings = {},
  apparatus = [],
  stationNames = [],
  departmentTitle = "",
  shiftChangeTime = "07:00",
}) {
  const [collapsedStations, setCollapsedStations] = useState({});
  const [collapsedUnits, setCollapsedUnits] = useState({});
  const todayId = formatDayId(new Date());

  const snapshot = useMemo(
    () => buildDayScheduleSnapshot({
      dayId: todayId,
      scheduleDays,
      rotation,
      roster,
      personnel,
      leaveRequests,
      schedulingSettings,
      apparatus,
    }),
    [todayId, scheduleDays, rotation, roster, personnel, leaveRequests, schedulingSettings, apparatus]
  );

  const dayBoard = useMemo(
    () => buildDailyRosterDayBoard({
      daySnapshot: snapshot,
      displayUnits: snapshot.displayUnits,
      apparatus,
      stationNames,
      departmentName: departmentTitle,
      shiftChangeTime,
    }),
    [snapshot, apparatus, stationNames, departmentTitle, shiftChangeTime]
  );

  const dateLabel = parseDayId(todayId).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const rosterRows = snapshot.roster || [];
  const staffed = snapshot.coverage?.staffed ?? snapshot.staffed ?? 0;
  const minimum = snapshot.coverage?.minimum ?? snapshot.minimum ?? 0;

  function toggleStation(stationKey) {
    setCollapsedStations((current) => ({
      ...current,
      [stationKey]: !current[stationKey],
    }));
  }

  function toggleUnit(unitKey) {
    setCollapsedUnits((current) => ({
      ...current,
      [unitKey]: !current[unitKey],
    }));
  }

  return (
    <div className="employee-daily-roster">
      <p className="employee-daily-roster-date">{dateLabel}</p>
      <div className="cert-detail-grid employee-daily-roster-summary">
        <div><span>Staffing</span><strong>{staffed} / {minimum}</strong></div>
        <div><span>Shift On Duty</span><strong>{snapshot.shift || "—"}</strong></div>
        <div><span>On Duty</span><strong>{rosterRows.filter((row) => row.status === "On Duty").length}</strong></div>
        <div><span>On Leave</span><strong>{rosterRows.filter((row) => row.status === "Leave").length}</strong></div>
      </div>

      <div className="daily-roster-board">
        {dayBoard.stationGroups.map((stationGroup) => {
          const stationKey = stationGroup.station || stationGroup.stationLabel;
          const stationCollapsed = Boolean(collapsedStations[stationKey]);

          return (
            <section className="daily-roster-station" key={stationKey}>
              <button
                type="button"
                className="daily-roster-station-head"
                onClick={() => toggleStation(stationKey)}
                aria-expanded={!stationCollapsed}
              >
                <span className="daily-roster-station-toggle">
                  {stationCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                </span>
                <span>{stationGroup.stationLabel || stationGroup.station || "Station"}</span>
              </button>

              {!stationCollapsed ? (
                <div className="daily-roster-station-body">
                  {stationGroup.units.map((unitEntry) => {
                    const unitKey = `${stationKey}-${unitEntry.unit}`;
                    return (
                      <DailyRosterUnitCard
                        key={unitKey}
                        unitEntry={unitEntry}
                        shift={snapshot.shift}
                        rotation={rotation}
                        collapsed={Boolean(collapsedUnits[unitKey])}
                        onToggle={() => toggleUnit(unitKey)}
                      />
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        {!dayBoard.stationGroups.length && (
          <p className="empty-table">No station or apparatus assignments for today&apos;s shift yet.</p>
        )}
      </div>

      <p className="auth-help employee-daily-roster-note">
        Updates automatically each day based on the shift rotation and approved leave.
      </p>
    </div>
  );
}
