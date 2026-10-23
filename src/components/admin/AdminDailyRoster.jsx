import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import {
  buildDayScheduleSnapshot,
  buildRosterAssignmentOptions,
  normalizeShiftTime,
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

function parseMilitaryTimeParts(value = "07:00") {
  const normalized = normalizeShiftTime(value);
  const [hours = "07", minutes = "00"] = normalized.split(":");
  return { hours, minutes };
}

function formatMilitaryTimeFromParts(hours = 0, minutes = 0) {
  const parsedHours = Math.min(23, Math.max(0, Number.parseInt(hours, 10) || 0));
  const parsedMinutes = Math.min(59, Math.max(0, Number.parseInt(minutes, 10) || 0));
  return `${String(parsedHours).padStart(2, "0")}:${String(parsedMinutes).padStart(2, "0")}`;
}

function MilitaryTimeField({ label, defaultValue = "07:00", hourRef, minuteRef, onCommit }) {
  const { hours, minutes } = parseMilitaryTimeParts(defaultValue);

  return (
    <span className="daily-roster-military-time" title="24-hour time (HH:MM)">
      <input
        ref={hourRef}
        type="number"
        className="daily-roster-time-part"
        min="0"
        max="23"
        step="1"
        defaultValue={hours}
        onBlur={onCommit}
        aria-label={`${label} hour (00–23)`}
      />
      <span className="daily-roster-time-separator" aria-hidden="true">:</span>
      <input
        ref={minuteRef}
        type="number"
        className="daily-roster-time-part"
        min="0"
        max="59"
        step="15"
        defaultValue={minutes}
        onBlur={onCommit}
        aria-label={`${label} minute (00–59)`}
      />
    </span>
  );
}

function MemberShiftTimeEditor({ member, onUpdateMemberShiftTime }) {
  const startHourRef = useRef(null);
  const startMinuteRef = useRef(null);
  const endHourRef = useRef(null);
  const endMinuteRef = useRef(null);
  const nextDayRef = useRef(null);

  function commit() {
    onUpdateMemberShiftTime(
      member.rosterEntryId || member.id,
      {
        shiftStartTime: formatMilitaryTimeFromParts(
          startHourRef.current?.value,
          startMinuteRef.current?.value
        ),
        shiftEndTime: formatMilitaryTimeFromParts(
          endHourRef.current?.value,
          endMinuteRef.current?.value
        ),
        shiftEndDayOffset: nextDayRef.current?.checked ? 1 : 0,
      },
      {
        slotRole: member.slotRole,
        slotIndex: member.slotIndex,
      }
    );
  }

  return (
    <span className="daily-roster-shift-time-inputs">
      <MilitaryTimeField
        label={`Shift start for ${member.name}`}
        defaultValue={member.shiftStartTime}
        hourRef={startHourRef}
        minuteRef={startMinuteRef}
        onCommit={commit}
      />
      <span className="daily-roster-time-range-separator" aria-hidden="true">–</span>
      <MilitaryTimeField
        label={`Shift end for ${member.name}`}
        defaultValue={member.shiftEndTime}
        hourRef={endHourRef}
        minuteRef={endMinuteRef}
        onCommit={commit}
      />
      <label className="daily-roster-next-day-toggle">
        <input
          ref={nextDayRef}
          type="checkbox"
          defaultChecked={Boolean(member.shiftEndDayOffset)}
          onChange={commit}
        />
        +1 day
      </label>
    </span>
  );
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
  departmentCandidates = [],
  overtimeCandidates = [],
  onUpdateApparatus,
  onAssignToUnit,
  onUpdateMemberShiftTime,
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
              className={`daily-roster-member-row${member.isOpen ? " is-open" : ""}${member.isPartialOpen ? " is-partial-open" : ""}${member.isOvertime ? " is-overtime" : ""}`}
              key={member.id}
            >
              <span>{member.role}</span>
              <span>{member.name}</span>
              <span>{member.durationLabel}</span>
              <span>
                {canEdit && member.personnelId && onUpdateMemberShiftTime ? (
                  <MemberShiftTimeEditor
                    member={member}
                    onUpdateMemberShiftTime={onUpdateMemberShiftTime}
                  />
                ) : (
                  member.timeWindow
                )}
              </span>
              <span className={
                member.isOpen || member.status === "Open Shift" ? "cell-warning"
                  : member.isPartialOpen ? "cell-warning"
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
              ) : canEdit && member.isPartialOpen && onAssignToUnit ? (
                <span className="admin-daily-roster-assignment">
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const personId = event.target.value;
                      if (!personId) return;
                      onAssignToUnit(personId, unitEntry.unit, {
                        slotRole: member.slotRole,
                        slotIndex: member.slotIndex,
                        isPartial: true,
                        shiftStartTime: member.shiftStartTime,
                        shiftEndTime: member.shiftEndTime,
                        shiftEndDayOffset: member.shiftEndDayOffset,
                        remainingHours: member.remainingHours ?? member.durationHours,
                      });
                      event.target.value = "";
                    }}
                    aria-label={`Assign member to cover ${member.durationLabel} on ${unitEntry.unit}`}
                  >
                    <option value="">Any member…</option>
                    {departmentCandidates.map((person) => (
                      <option key={person.id} value={person.id}>
                        {getPersonDisplayName(person)}{person.shift ? ` · ${person.shift} Shift` : ""}
                      </option>
                    ))}
                  </select>
                </span>
              ) : canEdit && member.isOpen && !member.isPartialOpen && onAssignToUnit ? (
                <span className="admin-daily-roster-assignment">
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const personId = event.target.value;
                      if (!personId) return;
                      onAssignToUnit(personId, unitEntry.unit, {
                        slotRole: member.slotRole,
                        slotIndex: member.slotIndex,
                        shiftStartTime: member.shiftStartTime,
                        shiftEndTime: member.shiftEndTime,
                        shiftEndDayOffset: member.shiftEndDayOffset,
                      });
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
                    onChange={(event) => onUpdateApparatus(
                      member.rosterEntryId || member.id,
                      event.target.value,
                      member.personnelId
                    )}
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
  onUpdateMemberShiftTime,
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
      shiftChangeTime,
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
      shiftChangeTime,
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

  const departmentCandidates = useMemo(
    () => (Array.isArray(personnel) ? personnel : [])
      .filter((person) => {
        const status = String(person.status || "").trim();
        return !/inactive|terminated/i.test(status);
      })
      .sort((left, right) => getPersonDisplayName(left).localeCompare(getPersonDisplayName(right), undefined, { sensitivity: "base" })),
    [personnel]
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
        departmentCandidates={departmentCandidates}
        overtimeCandidates={overtimeCandidates}
        onUpdateApparatus={onUpdateApparatus}
        onAssignToUnit={onAssignToUnit}
        onUpdateMemberShiftTime={onUpdateMemberShiftTime}
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
          Each apparatus shows Lieutenant, Driver, and two Firefighter slots. Set shift start/end times — hours calculate automatically. When a slot is not fully covered, an open line appears for any department member to fill the remainder. Use the + button for overtime from another shift.
        </p>
      ) : !rosterLoaded ? (
        <p className="auth-help employee-daily-roster-note">Loading roster data… assignment edits will be available shortly.</p>
      ) : null}
    </div>
  );
}
