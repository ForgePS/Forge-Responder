import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  buildDayScheduleSnapshot,
  buildRosterAssignmentOptions,
  resolveOvertimeRosterEntries,
} from "../../lib/schedulingRoster.js";
import { buildDailyRosterDayBoard } from "../../lib/weekRosterBoard.js";
import { getPersonDisplayName } from "../../lib/personnelSchema.js";
import { parseDayId, shiftCalendarStyle, shiftShortLabel } from "../../lib/shiftCalendar.js";
import { defaultShiftRotation } from "../../data/defaultShiftRotation.js";

function shiftBadgeStyle(shiftLabel, rotation) {
  const styles = shiftCalendarStyle(shiftLabel, rotation);
  return {
    background: styles["--shift-fill"],
    color: styles["--shift-text"],
  };
}

function AdminDailyRosterUnitCard({
  unitEntry,
  shift,
  rotation,
  collapsed,
  onToggle,
  canEdit,
  assignmentOptions,
  assignCandidates = [],
  overtimeCandidates = [],
  onUpdateApparatus,
  onAssignToUnit,
  onAddOvertimeToUnit,
  onRemoveOvertimeFromUnit,
}) {
  const [overtimePickerOpen, setOvertimePickerOpen] = useState(false);

  const assignedPersonnelIds = useMemo(
    () => new Set(unitEntry.members.filter((member) => !member.isOpen).map((member) => member.personnelId)),
    [unitEntry.members]
  );

  const unitOvertimeCandidates = useMemo(
    () => overtimeCandidates.filter((person) => !assignedPersonnelIds.has(person.id)),
    [assignedPersonnelIds, overtimeCandidates]
  );

  return (
    <section className={`daily-roster-unit${unitEntry.hasVacancy ? " has-vacancy" : ""}`}>
      <div className="daily-roster-unit-head-row">
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

        {canEdit && onAddOvertimeToUnit ? (
          <div className="daily-roster-overtime-add">
            <button
              type="button"
              className="daily-roster-overtime-add-btn"
              aria-expanded={overtimePickerOpen}
              aria-label={`Add overtime personnel to ${unitEntry.unit}`}
              title="Add personnel from another shift for overtime"
              onClick={() => setOvertimePickerOpen((current) => !current)}
            >
              <Plus size={14} />
            </button>
            {overtimePickerOpen ? (
              <select
                className="daily-roster-overtime-add-select"
                defaultValue=""
                onChange={(event) => {
                  const personId = event.target.value;
                  if (!personId) return;
                  onAddOvertimeToUnit(personId, unitEntry.unit);
                  event.target.value = "";
                  setOvertimePickerOpen(false);
                }}
                aria-label={`Select overtime member for ${unitEntry.unit}`}
              >
                <option value="">Add OT from another shift…</option>
                {unitOvertimeCandidates.map((person) => (
                  <option key={person.id} value={person.id}>
                    {getPersonDisplayName(person)}{person.shift ? ` · ${person.shift} Shift` : ""}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="daily-roster-unit-body">
          <div className="daily-roster-member-row daily-roster-member-head">
            <span>Role</span>
            <span>Name</span>
            <span>Duration</span>
            <span>Shift Time</span>
            <span>Status</span>
            {canEdit ? <span>Assignment</span> : null}
          </div>
          {unitEntry.members.map((member) => (
            <div
              className={`daily-roster-member-row${member.isOpen ? " is-open" : ""}${member.isOvertime ? " is-overtime" : ""}`}
              key={member.id}
            >
              <span>{member.role}</span>
              <span>{member.name}</span>
              <span>{member.durationLabel}</span>
              <span>{member.timeWindow}</span>
              <span className={
                member.isOpen || member.status === "Open Shift" ? "cell-warning"
                  : member.isOvertime || /overtime|\bOT\b/i.test(member.status) ? "cell-info"
                    : /leave|vacation|sick/i.test(member.status) ? "cell-warning"
                      : /trade/i.test(member.status) ? "cell-info"
                        : "cell-success"
              }
              >
                {member.status}
              </span>
              {canEdit && member.isOvertime && onRemoveOvertimeFromUnit ? (
                <span className="admin-daily-roster-assignment">
                  <button
                    type="button"
                    className="text-button daily-roster-overtime-remove-btn"
                    onClick={() => onRemoveOvertimeFromUnit(member.personnelId, unitEntry.unit)}
                  >
                    Remove OT
                  </button>
                </span>
              ) : canEdit && member.isOpen && onAssignToUnit ? (
                <span className="admin-daily-roster-assignment">
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const personId = event.target.value;
                      if (!personId) return;
                      onAssignToUnit(personId, unitEntry.unit);
                      event.target.value = "";
                    }}
                    aria-label={`Assign member to ${member.slotRole || "open"} slot on ${unitEntry.unit}`}
                  >
                    <option value="">Assign member…</option>
                    {assignCandidates.map((person) => (
                      <option key={person.id} value={person.id}>
                        {getPersonDisplayName(person)}
                      </option>
                    ))}
                  </select>
                </span>
              ) : canEdit && member.personnelId && onUpdateApparatus ? (
                <span className="admin-daily-roster-assignment">
                  <select
                    value={member.assignmentValue || member.apparatus || "Unassigned"}
                    onChange={(event) => onUpdateApparatus(member.id, event.target.value, member.personnelId)}
                    aria-label={`Assignment for ${member.name}`}
                  >
                    {assignmentOptions.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </span>
              ) : canEdit ? <span /> : null}
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

export default function AdminDailyRoster({
  dayId = "",
  scheduleDays = [],
  rotation = defaultShiftRotation,
  roster = [],
  personnel = [],
  leaveRequests = [],
  shiftTrades = [],
  schedulingSettings = {},
  apparatus = [],
  stationNames = [],
  departmentTitle = "",
  shiftChangeTime = "07:00",
  canEdit = false,
  rosterLoaded = true,
  unitOptions = [],
  onUpdateApparatus,
  onAssignToUnit,
  onAddOvertimeToUnit,
  onRemoveOvertimeFromUnit,
}) {
  const [collapsedStations, setCollapsedStations] = useState({});
  const [collapsedUnits, setCollapsedUnits] = useState({});

  const assignmentOptions = useMemo(
    () => buildRosterAssignmentOptions(unitOptions),
    [unitOptions]
  );

  const snapshot = useMemo(
    () => buildDayScheduleSnapshot({
      dayId,
      scheduleDays,
      rotation,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      schedulingSettings,
      apparatus,
    }),
    [
      dayId,
      scheduleDays,
      rotation,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      schedulingSettings,
      apparatus,
    ]
  );

  const dayBoard = useMemo(
    () => buildDailyRosterDayBoard({
      daySnapshot: snapshot,
      displayUnits: snapshot.displayUnits,
      apparatus,
      stationNames,
      departmentName: departmentTitle,
      shiftChangeTime,
      personnel,
      schedulingSettings,
    }),
    [snapshot, apparatus, stationNames, departmentTitle, shiftChangeTime, personnel, schedulingSettings]
  );

  const assignCandidates = useMemo(() => {
    const shift = String(snapshot.shift || "").trim();
    return (Array.isArray(personnel) ? personnel : [])
      .filter((person) => {
        const status = String(person.status || "").trim();
        if (/inactive|terminated/i.test(status)) return false;
        if (!String(person.shift || "").trim()) return false;
        return !shift || String(person.shift).trim() === shift;
      })
      .sort((left, right) => getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), undefined, { sensitivity: "base" }));
  }, [personnel, snapshot.shift]);

  const overtimeCandidates = useMemo(() => {
    const dutyShift = String(snapshot.shift || "").trim();
    const assignedOvertimeIds = new Set(
      resolveOvertimeRosterEntries(roster, dayId).map((entry) => entry.personnelId)
    );

    return (Array.isArray(personnel) ? personnel : [])
      .filter((person) => {
        const status = String(person.status || "").trim();
        if (/inactive|terminated/i.test(status)) return false;
        const homeShift = String(person.shift || "").trim();
        if (!homeShift || homeShift === dutyShift) return false;
        if (assignedOvertimeIds.has(person.id)) return false;
        return true;
      })
      .sort((left, right) => getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), undefined, { sensitivity: "base" }));
  }, [personnel, roster, dayId, snapshot.shift]);

  if (!dayId) {
    return <p className="auth-help">Select a day on the calendar to view the daily roster.</p>;
  }

  const dateLabel = parseDayId(dayId).toLocaleDateString("en-US", {
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

  function renderUnitCard(unitEntry, unitKey) {
    return (
      <AdminDailyRosterUnitCard
        key={unitKey}
        unitEntry={unitEntry}
        shift={snapshot.shift}
        rotation={rotation}
        collapsed={Boolean(collapsedUnits[unitKey])}
        onToggle={() => toggleUnit(unitKey)}
        canEdit={canEdit}
        assignmentOptions={assignmentOptions}
        assignCandidates={assignCandidates}
        overtimeCandidates={overtimeCandidates}
        onUpdateApparatus={onUpdateApparatus}
        onAssignToUnit={onAssignToUnit}
        onAddOvertimeToUnit={onAddOvertimeToUnit}
        onRemoveOvertimeFromUnit={onRemoveOvertimeFromUnit}
      />
    );
  }

  return (
    <div className="employee-daily-roster admin-daily-roster">
      <p className="employee-daily-roster-date">{dateLabel} · {snapshot.shift || "—"}</p>
      <div className="cert-detail-grid employee-daily-roster-summary">
        <div><span>Staffing</span><strong>{staffed} / {minimum}</strong></div>
        <div><span>Shift On Duty</span><strong>{snapshot.shift || "—"}</strong></div>
        <div><span>On Duty</span><strong>{rosterRows.filter((row) => row.status === "On Duty").length}</strong></div>
        <div><span>On Leave</span><strong>{rosterRows.filter((row) => row.status === "Leave").length}</strong></div>
      </div>

      <div className="daily-roster-board">
        {dayBoard.commandUnits?.map((unitEntry) => {
          const unitKey = `command-${unitEntry.unit}`;
          return renderUnitCard(unitEntry, unitKey);
        })}

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
                    return renderUnitCard(unitEntry, unitKey);
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
        {!dayBoard.commandUnits?.length && !dayBoard.stationGroups.length && (
          <p className="empty-table">No station or apparatus assignments for this shift day yet.</p>
        )}
      </div>

      {canEdit ? (
        <p className="auth-help employee-daily-roster-note">
          Each apparatus shows Lieutenant, Driver, and two Firefighter slots. Use the + button to add personnel from another shift for overtime. Open slots can be filled from the on-duty shift roster. EMS credentials appear as /Paramedic or /EMT on the role label.
        </p>
      ) : !rosterLoaded ? (
        <p className="auth-help employee-daily-roster-note">Loading roster data… assignment edits will be available shortly.</p>
      ) : null}
    </div>
  );
}
