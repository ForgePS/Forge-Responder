import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, ShieldCheck, Truck, Users, X, CirclePlus } from "lucide-react";
import { buildMonthCalendar, formatDayId, parseDayId, resolveShiftRotation, shiftShortLabel } from "../lib/shiftCalendar.js";
import { buildDayRoster, buildDayScheduleSnapshot, buildDayScopedRosterId, buildOvertimeRosterId, buildPartialSlotRosterId, buildWeekScheduleSnapshots, buildDefaultShiftTimes, calculateShiftDurationHours, DEFAULT_SHIFT_DURATION_HOURS, formatDurationLabel, normalizeShiftTime, resolveDayCoverageMetrics, resolveRosterPersonnelId } from "../lib/schedulingRoster.js";
import { getPersonDisplayName } from "../lib/personnelSchema.js";
import { canonicalApparatusUnitName } from "../lib/apparatusSchema.js";
import { buildSchedulingUnitOptions, resolveSchedulingDisplayUnits } from "../lib/schedulingSettings.js";
import { vacancyPickupStatusDetail } from "../lib/vacancyPickupWorkflow.js";
import ShiftTradesPanel from "../components/scheduling/ShiftTradesPanel.jsx";
import LeaveRequestsPanel from "../components/scheduling/LeaveRequestsPanel.jsx";
import CallShiftPanel from "../components/scheduling/CallShiftPanel.jsx";
import ShiftCalendar from "../components/ShiftCalendar.jsx";
import WeekRosterView from "../components/WeekRosterView.jsx";
import AdminDailyRoster from "../components/admin/AdminDailyRoster.jsx";

import { Badge, Panel } from "../components/shell/ui.jsx";

const ADMIN_SCHEDULE_TABS = [
  { id: "daily", label: "Daily Roster" },
  { id: "requests", label: "Requests & Coverage" },
  { id: "trades", label: "Shift Trades" },
  { id: "callshift", label: "Shift Broadcast" },
];

const ADMIN_SCHEDULE_RANGE_TABS = [
  { id: "week", label: "7-Day Schedule" },
  { id: "calendar", label: "30 Day Calendar" },
];

export default function SchedulingPage({
  days = [],
  setDays,
  roster = [],
  setRoster,
  personnel = [],
  setPersonnel,
  apparatus = [],
  leaveRequests = [],
  setLeaveRequests,
  overtimeOffers = [],
  setOvertimeOffers,
  vacancyPickups = [],
  setVacancyPickups,
  shiftTrades = [],
  setShiftTrades,
  callShifts = [],
  setCallShifts,
  shiftRotation,
  profileShifts = [],
  schedulingSettings = {},
  departmentName = "",
  departmentId = "",
  stationNames = [],
  shiftChangeTime = "07:00",
  canEditRoster = false,
  canManageCallShifts = false,
  callShiftRules = [],
  rosterLoaded = true,
  initialTab = null,
  onInitialTabConsumed,
}) {
  const rotation = useMemo(
    () => resolveShiftRotation(shiftRotation, profileShifts),
    [shiftRotation, profileShifts]
  );
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [selectedId, setSelectedId] = useState(formatDayId(today));
  const [message, setMessage] = useState("");
  const [rosterTab, setRosterTab] = useState("daily");
  const [weekRosterStartId, setWeekRosterStartId] = useState(() => formatDayId(today));

  useEffect(() => {
    if (!initialTab) return;
    setRosterTab(initialTab);
    onInitialTabConsumed?.();
  }, [initialTab, onInitialTabConsumed]);

  useEffect(() => {
    if (rosterTab === "week") {
      setWeekRosterStartId(formatDayId(new Date()));
    }
  }, [rosterTab]);

  const selectedDay = useMemo(() => {
    const monthCells = buildMonthCalendar(calendarYear, calendarMonth, days, rotation);
    const now = new Date();
    const fallback = {
      id: formatDayId(now),
      shift: "A Shift",
      staffed: 21,
      minimum: 21,
      leave: 0,
      status: "Complete",
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    };
    return monthCells.find((cell) => cell.kind === "day" && cell.id === selectedId)
      || monthCells.find((cell) => cell.kind === "day")
      || (Array.isArray(days) ? days.find(Boolean) : null)
      || fallback;
  }, [calendarYear, calendarMonth, days, rotation, selectedId]);

  const displayUnits = useMemo(
    () => resolveSchedulingDisplayUnits(schedulingSettings, apparatus),
    [schedulingSettings, apparatus]
  );
  const unitOptions = useMemo(
    () => buildSchedulingUnitOptions(apparatus, schedulingSettings),
    [apparatus, schedulingSettings]
  );
  const dayRoster = useMemo(
    () => buildDayRoster({
      roster,
      personnel,
      selectedShift: selectedDay?.shift || "",
      selectedDayId: selectedId,
      leaveRequests,
      shiftTrades,
      knownUnits: unitOptions,
    }),
    [roster, personnel, selectedDay?.shift, selectedId, leaveRequests, shiftTrades, unitOptions]
  );
  const dayCoverage = useMemo(
    () => resolveDayCoverageMetrics({ dayRoster, personnel }),
    [dayRoster, personnel]
  );
  const rosterSnapshotOptions = useMemo(() => ({
    scheduleDays: days,
    rotation,
    roster,
    personnel,
    leaveRequests,
    shiftTrades,
    schedulingSettings,
    apparatus,
    shiftChangeTime,
  }), [days, rotation, roster, personnel, leaveRequests, shiftTrades, schedulingSettings, apparatus, shiftChangeTime]);
  const selectedDaySnapshot = useMemo(
    () => {
      try {
        return buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: selectedId });
      } catch (error) {
        console.error("Failed to build day schedule snapshot", error);
        return {
          id: selectedId,
          shift: selectedDay?.shift || "A Shift",
          weekday: "",
          date: "",
          staffed: 0,
          minimum: 0,
          leave: 0,
          status: "Deficit",
          roster: [],
          coverage: { staffed: 0, minimum: 0, leave: 0, status: "Deficit", vacancies: 0 },
          displayUnits: [],
          apparatusVacancies: [],
          apparatusGroups: { grouped: [] },
          openVacancies: [],
        };
      }
    },
    [rosterSnapshotOptions, selectedId, selectedDay?.shift]
  );
  const weekSnapshots = useMemo(
    () => {
      try {
        return buildWeekScheduleSnapshots({ ...rosterSnapshotOptions, referenceDayId: weekRosterStartId });
      } catch (error) {
        console.error("Failed to build week schedule snapshots", error);
        return [];
      }
    },
    [rosterSnapshotOptions, weekRosterStartId]
  );
  const liveMonthMetrics = useMemo(() => {
    const monthCells = buildMonthCalendar(calendarYear, calendarMonth, days, rotation)
      .filter((cell) => cell.kind === "day");
    return Object.fromEntries(monthCells.map((cell) => {
      try {
        const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: cell.id });
        return [cell.id, {
          staffed: snapshot.staffed,
          minimum: snapshot.minimum,
          leave: snapshot.leave,
          status: snapshot.status,
        }];
      } catch (error) {
        console.error("Failed to build month metrics for", cell.id, error);
        return [cell.id, { staffed: 0, minimum: 0, leave: 0, status: "Deficit" }];
      }
    }));
  }, [calendarYear, calendarMonth, days, rotation, rosterSnapshotOptions]);
  const vacancies = selectedDaySnapshot?.openVacancies?.length ?? dayCoverage.vacancies ?? 0;
  const scheduleStats = [
    { label: "Selected Shift", value: shiftShortLabel(selectedDaySnapshot?.shift || selectedDay?.shift || ""), tone: "info", icon: CalendarDays },
    { label: "Staffed Today", value: selectedDaySnapshot?.coverage?.staffed ?? dayCoverage.staffed, tone: "success", icon: Users },
    { label: "Daily Staffing", value: selectedDaySnapshot?.coverage?.minimum ?? dayCoverage.minimum, tone: "neutral", icon: ShieldCheck },
    { label: "Open Vacancies", value: vacancies, tone: vacancies > 0 ? "critical" : "success", icon: AlertTriangle },
    { label: "Leave Today", value: selectedDaySnapshot?.coverage?.leave ?? dayCoverage.leave, tone: (selectedDaySnapshot?.coverage?.leave ?? dayCoverage.leave) > 0 ? "warning" : "neutral", icon: Clock3 },
  ];

  function selectDay(day) {
    const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: day.id });
    setSelectedId(day.id);
    if (!setDays) return;
    setDays((current) => {
      const nextEntry = {
        id: day.id,
        weekday: snapshot.weekday || day.weekday,
        date: snapshot.date || day.date,
        shift: snapshot.shift || day.shift,
        staffed: snapshot.staffed,
        minimum: snapshot.minimum,
        leave: snapshot.leave,
        status: snapshot.status,
      };
      if (current.some((entry) => entry.id === day.id)) {
        return current.map((entry) => (entry.id === day.id ? { ...entry, ...nextEntry } : entry));
      }
      return [...current, nextEntry];
    });
  }

  function shiftSelectedWeek(delta) {
    const date = parseDayId(weekRosterStartId);
    date.setDate(date.getDate() + (delta * 7));
    const nextId = formatDayId(date);
    setWeekRosterStartId(nextId);
    setSelectedId(nextId);
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function shiftSelectedDay(delta) {
    const date = parseDayId(selectedId);
    date.setDate(date.getDate() + delta);
    const nextId = formatDayId(date);
    const snapshot = buildDayScheduleSnapshot({ ...rosterSnapshotOptions, dayId: nextId });
    selectDay({
      id: nextId,
      kind: "day",
      weekday: snapshot.weekday,
      date: snapshot.date,
      shift: snapshot.shift,
    });
    setCalendarYear(date.getFullYear());
    setCalendarMonth(date.getMonth());
  }

  function updateApparatus(id, nextApparatus, explicitPersonnelId = "") {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }

    const personId = resolveRosterPersonnelId(id, explicitPersonnelId);
    if (!personId) {
      setMessage("Could not identify personnel for that assignment");
      return;
    }

    const person = personnel.find((entry) => entry.id === personId);
    if (!person) {
      setMessage(`Personnel record not found for ${personId}`);
      return;
    }

    const dayId = selectedId;
    const rosterId = String(id || "").includes(":S")
      ? String(id)
      : buildDayScopedRosterId(personId, dayId);
    const isLeave = nextApparatus === "Vacation" || nextApparatus === "Sick" || nextApparatus === "Leave";

    setRoster((current) => {
      const existing = current.find((member) => member.id === rosterId);
      const nextMember = {
        id: rosterId,
        personnelId: personId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: isLeave ? nextApparatus : nextApparatus,
        leaveType: nextApparatus === "Vacation" ? "Vacation" : nextApparatus === "Sick" ? "Sick" : "",
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: isLeave ? "Leave" : "On Duty",
        durationHours: existing?.durationHours ?? DEFAULT_SHIFT_DURATION_HOURS,
        shiftStartTime: existing?.shiftStartTime ?? null,
        shiftEndTime: existing?.shiftEndTime ?? null,
        shiftEndDayOffset: Number.isInteger(existing?.shiftEndDayOffset) ? existing.shiftEndDayOffset : null,
        slotRole: existing?.slotRole ?? null,
        slotIndex: Number.isInteger(existing?.slotIndex) ? existing.slotIndex : null,
      };

      if (existing) {
        return current.map((member) => (member.id === rosterId ? { ...member, ...nextMember } : member));
      }

      return [...current, nextMember];
    });

    if (!isLeave && nextApparatus !== "Unassigned" && setPersonnel) {
      const unit = canonicalApparatusUnitName(nextApparatus);
      setPersonnel((current) => current.map((entry) => (
        entry.id === personId ? { ...entry, unit, assignment: unit } : entry
      )));
    }

    setMessage(
      isLeave
        ? `${getPersonDisplayName(person)} marked ${nextApparatus} for ${selectedDaySnapshot.date}`
        : "Apparatus assignment updated"
    );
  }

  function updateMemberShiftTime(rosterEntryId, shiftTimes = {}, slotOptions = {}) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }
    if (!rosterEntryId) return;

    const shiftStartTime = normalizeShiftTime(shiftTimes.shiftStartTime, shiftChangeTime);
    const shiftEndTime = normalizeShiftTime(shiftTimes.shiftEndTime, shiftChangeTime);
    const shiftEndDayOffset = shiftTimes.shiftEndDayOffset ? 1 : 0;
    const durationHours = calculateShiftDurationHours(shiftStartTime, shiftEndTime, shiftEndDayOffset);
    const { slotRole = null, slotIndex = null } = slotOptions;

    setRoster((current) => current.map((member) => (
      member.id === rosterEntryId
        ? {
          ...member,
          shiftStartTime,
          shiftEndTime,
          shiftEndDayOffset,
          durationHours,
          slotRole: slotRole ?? member.slotRole ?? null,
          slotIndex: Number.isInteger(slotIndex) ? slotIndex : (member.slotIndex ?? null),
        }
        : member
    )));
    setMessage(`Shift time updated · ${formatDurationLabel(durationHours)}`);
  }

  function assignPersonToUnit(personnelId, unit, slotOptions = {}) {
    if (!personnelId || !unit) return;

    const {
      slotRole = null,
      slotIndex = null,
      isPartial = false,
      shiftStartTime = null,
      shiftEndTime = null,
      shiftEndDayOffset = null,
    } = slotOptions;

    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }

    const person = personnel.find((entry) => entry.id === personnelId);
    if (!person) {
      setMessage("Personnel record not found");
      return;
    }

    const dayId = selectedId;
    const normalizedUnit = canonicalApparatusUnitName(unit);
    const defaultTimes = buildDefaultShiftTimes(shiftChangeTime);
    const resolvedStart = normalizeShiftTime(shiftStartTime || defaultTimes.shiftStartTime, shiftChangeTime);
    const resolvedEnd = normalizeShiftTime(shiftEndTime || defaultTimes.shiftEndTime, shiftChangeTime);
    const resolvedEndDayOffset = shiftEndDayOffset != null
      ? (shiftEndDayOffset ? 1 : 0)
      : defaultTimes.shiftEndDayOffset;
    const parsedDuration = calculateShiftDurationHours(resolvedStart, resolvedEnd, resolvedEndDayOffset);

    let rosterId = buildDayScopedRosterId(personnelId, dayId);
    if (isPartial && Number.isInteger(slotIndex)) {
      rosterId = buildPartialSlotRosterId(personnelId, dayId, normalizedUnit, slotIndex);
    }

    setRoster((current) => {
      const existing = current.find((member) => member.id === rosterId);
      const nextMember = {
        id: rosterId,
        personnelId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: normalizedUnit,
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: "On Duty",
        shiftStartTime: resolvedStart,
        shiftEndTime: resolvedEnd,
        shiftEndDayOffset: resolvedEndDayOffset,
        durationHours: parsedDuration,
        slotRole: slotRole ?? null,
        slotIndex: Number.isInteger(slotIndex) ? slotIndex : null,
      };

      if (existing) {
        return current.map((member) => (member.id === rosterId ? { ...member, ...nextMember } : member));
      }

      return [...current, nextMember];
    });

    if (!isPartial && setPersonnel) {
      setPersonnel((current) => current.map((entry) => (
        entry.id === personnelId
          ? { ...entry, unit: normalizedUnit, assignment: normalizedUnit }
          : entry
      )));
    }

    setMessage(
      isPartial
        ? `${getPersonDisplayName(person)} assigned ${formatDurationLabel(parsedDuration)} on ${normalizedUnit}`
        : "Apparatus assignment updated"
    );
  }

  function addOvertimeToUnit(personnelId, unit) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!rosterLoaded) {
      setMessage("Roster is still loading — try again in a moment");
      return;
    }
    if (!personnelId || !unit) return;

    const person = personnel.find((entry) => entry.id === personnelId);
    if (!person) {
      setMessage("Personnel record not found");
      return;
    }

    const dayId = selectedId;
    const normalizedUnit = canonicalApparatusUnitName(unit);
    const dutyShift = String(selectedDaySnapshot.shift || "").trim();
    const homeShift = String(person.shift || "").trim();

    if (homeShift && dutyShift && homeShift === dutyShift) {
      setMessage(`${getPersonDisplayName(person)} is already on ${dutyShift} Shift`);
      return;
    }

    const rosterId = buildOvertimeRosterId(personnelId, dayId, normalizedUnit);

    setRoster((current) => {
      if (current.some((member) => member.id === rosterId)) {
        return current;
      }

      const nextMember = {
        id: rosterId,
        personnelId,
        dayId,
        name: getPersonDisplayName(person),
        rank: person.rank,
        shift: person.shift,
        apparatus: normalizedUnit,
        position: person.position || (person.driver === "Approved" ? "Driver" : person.ems || "Firefighter"),
        status: "On Duty",
        isOvertime: true,
      };

      return [...current, nextMember];
    });

    setMessage(`${getPersonDisplayName(person)} added to ${normalizedUnit} for overtime (${homeShift || "other"} shift)`);
  }

  function removeOvertimeFromUnit(personnelId, unit) {
    if (!setRoster) {
      setMessage("Roster is read-only");
      return;
    }
    if (!personnelId || !unit) return;

    const rosterId = buildOvertimeRosterId(personnelId, selectedId, unit);
    const person = personnel.find((entry) => entry.id === personnelId);

    setRoster((current) => current.filter((member) => member.id !== rosterId));
    setMessage(
      person
        ? `${getPersonDisplayName(person)} removed from ${canonicalApparatusUnitName(unit)} overtime`
        : "Overtime assignment removed"
    );
  }

  function assignOvertime(id) {
    const offer = overtimeOffers.find((item) => item.id === id);
    if (!offer) return;
    setOvertimeOffers((current) => current.map((item) => item.id === id ? { ...item, status: "Assigned" } : item));
    setDays((current) => current.map((day) => day.date === offer.date && day.shift === offer.shift ? { ...day, staffed: day.staffed + 1, status: day.staffed + 1 >= day.minimum ? "Complete" : "Deficit" } : day));
    setMessage(`${offer.position} overtime assigned for ${offer.date}`);
  }

  function decideVacancyPickup(id, status) {
    if (!setVacancyPickups) return;
    setVacancyPickups((current) => current.map((item) => (
      item.id === id
        ? {
          ...item,
          status,
          approvalStage: "complete",
          decidedAt: new Date().toISOString(),
        }
        : item
    )));
    setMessage(`Vacancy pickup request ${status.toLowerCase()}.`);
  }

  const pendingVacancyCount = vacancyPickups.filter((item) => /pending/i.test(item.status || "")).length;

  const leaveRequestsPanel = (
    <LeaveRequestsPanel
      leaveRequests={leaveRequests}
      setLeaveRequests={setLeaveRequests}
      personnel={personnel}
      setPersonnel={setPersonnel}
      canManage={canEditRoster}
    />
  );

  const vacancyPickupsPanel = (
    <Panel title="Vacancy Pickup Requests" icon={Users} action={<span className="panel-count">{pendingVacancyCount} pending</span>}>
      <div className="request-list">
        {vacancyPickups.length ? vacancyPickups.map((request) => {
          const actionable = /pending/i.test(request.status || "");
          return (
            <div className="request-row" key={request.id}>
              <div>
                <strong>{request.person}</strong>
                <span>{request.vacancyLabel} · {request.date} · {request.shift}</span>
                {request.message ? <small>{request.message}</small> : null}
                <small>{vacancyPickupStatusDetail(request)}</small>
              </div>
              <Badge>{request.status}</Badge>
              {actionable && canEditRoster && (
                <div className="inline-actions">
                  <button onClick={() => decideVacancyPickup(request.id, "Approved")}><Check size={13} /> Approve</button>
                  <button onClick={() => decideVacancyPickup(request.id, "Denied")}><X size={13} /> Deny</button>
                </div>
              )}
            </div>
          );
        }) : <p className="auth-help">No vacancy pickup requests yet.</p>}
      </div>
    </Panel>
  );

  const staffingPanel = (
    <Panel title="Daily Staffing" icon={ShieldCheck}>
      <div className="staffing-card">
        <div>
          <strong>{dayCoverage.staffed} / {dayCoverage.minimum}</strong>
          <span>{vacancies ? `${vacancies} position needs coverage` : "Daily staffing met"}</span>
        </div>
        <div className="staffing-meter">
          <i style={{ width: `${Math.min(100, dayCoverage.minimum ? (dayCoverage.staffed / dayCoverage.minimum) * 100 : 100)}%` }} />
        </div>
        <div className="staffing-requirements">
          <span>Command</span><b>{dayCoverage.command}</b>
          <span>Company Officers</span><b>{dayCoverage.officers}</b>
          <span>Drivers</span><b>{dayCoverage.drivers}</b>
          <span>Paramedics</span><b>{dayCoverage.paramedics}</b>
          <span>EMT</span><b>{dayCoverage.emt}</b>
        </div>
      </div>
    </Panel>
  );

  const overtimePanel = (
    <Panel title="Overtime Coverage" icon={Clock3} action={<button className="text-button">Create vacancy</button>}>
      <div className="overtime-grid">{overtimeOffers.map((offer) => <div key={offer.id} className="overtime-card"><div><strong>{offer.date} - {offer.shift}</strong><span>{offer.position}</span></div><Badge>{offer.status}</Badge><small>{offer.applicants} available members</small><button className="row-action" disabled={offer.status === "Assigned"} onClick={() => assignOvertime(offer.id)}>{offer.status === "Assigned" ? "Assigned" : "Assign"}</button></div>)}</div>
    </Panel>
  );

  return <div className="module-page scheduling-page">
    <section className="module-heading"><div><span className="module-icon"><CalendarDays size={22} /></span><div><h1>Scheduling</h1><p>Visual shift calendar, daily apparatus roster, leave, overtime, shift trades, and daily staffing.</p></div></div><div className="heading-actions"><button className="secondary-button">Print Roster</button><button className="primary-button"><CirclePlus size={14} /> Add Shift Note</button></div></section>
    <section className="schedule-summary">
      {scheduleStats.map(({ label, value, tone, icon: Icon }) => (
        <div key={label} className={`schedule-stat stat-${tone}`}>
          <Icon size={15} className="schedule-stat-icon" />
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
    </section>
    {message && <div className="success-banner">{message}<button onClick={() => setMessage("")}><X size={13} /></button></div>}

    <section className="schedule-view-toggle">
      <div className="segmented-control schedule-view-tabs" role="tablist" aria-label="Scheduling views">
        {ADMIN_SCHEDULE_TABS.slice(0, 1).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={rosterTab === tab.id}
            className={rosterTab === tab.id ? "active" : ""}
            onClick={() => setRosterTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}

        <div className="schedule-range-group" role="presentation">
          {ADMIN_SCHEDULE_RANGE_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={rosterTab === tab.id}
              className={rosterTab === tab.id ? "active" : ""}
              onClick={() => setRosterTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {ADMIN_SCHEDULE_TABS.slice(1).map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={rosterTab === tab.id}
            className={rosterTab === tab.id ? "active" : ""}
            onClick={() => setRosterTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <span className="schedule-roster-count">
        {rosterTab === "trades"
          ? `${shiftTrades.length} shift trade requests`
          : rosterTab === "callshift"
            ? `${callShifts.length} shift broadcast${callShifts.length === 1 ? "" : "s"}`
            : rosterTab === "calendar"
              ? `${selectedDaySnapshot.weekday}, ${selectedDaySnapshot.date} selected`
              : rosterTab === "week"
                ? "7-day apparatus roster"
                : `${dayRoster.length} members on ${selectedDay.shift}`}
      </span>
    </section>

    <section className={`schedule-workspace${rosterTab === "requests" ? " is-requests" : ""}${rosterTab === "week" ? " is-week-roster" : ""}${rosterTab === "calendar" ? " is-calendar" : ""}${rosterTab === "trades" ? " is-trades" : ""}${rosterTab === "callshift" ? " is-callshift" : ""}`}>
      <div className="schedule-main" role="tabpanel">
        {rosterTab === "calendar" ? (
          <ShiftCalendar
            year={calendarYear}
            month={calendarMonth}
            onMonthChange={(year, month) => {
              setCalendarYear(year);
              setCalendarMonth(month);
              const nextMonthDays = buildMonthCalendar(year, month, days, rotation).filter((cell) => cell.kind === "day");
              if (!nextMonthDays.some((cell) => cell.id === selectedId) && nextMonthDays[0]) {
                setSelectedId(nextMonthDays[0].id);
              }
            }}
            existingDays={days}
            selectedId={selectedId}
            onSelectDay={selectDay}
            rotation={rotation}
            profileShifts={profileShifts}
            liveDayMetrics={liveMonthMetrics}
            viewMode="month"
            showViewToggle={false}
            leaveRequests={leaveRequests}
            personnel={personnel}
            roster={roster}
          />
        ) : null}

        {rosterTab === "daily" ? (
          <Panel
            title={`Daily Roster · ${selectedDaySnapshot.weekday}, ${selectedDaySnapshot.date}`}
            icon={Truck}
            action={(
              <div className="schedule-day-nav">
                <button type="button" className="secondary-button" onClick={() => shiftSelectedDay(-1)} aria-label="Previous day">
                  <ChevronLeft size={14} />
                </button>
                <button type="button" className="secondary-button" onClick={() => setRosterTab("calendar")}>
                  Calendar
                </button>
                <button type="button" className="secondary-button" onClick={() => shiftSelectedDay(1)} aria-label="Next day">
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          >
            <AdminDailyRoster
              dayId={selectedId}
              scheduleDays={days}
              rotation={rotation}
              roster={roster}
              personnel={personnel}
              leaveRequests={leaveRequests}
              shiftTrades={shiftTrades}
              schedulingSettings={schedulingSettings}
              apparatus={apparatus}
              stationNames={stationNames}
              departmentTitle={departmentName}
              shiftChangeTime={shiftChangeTime}
              canEdit={canEditRoster && rosterLoaded}
              unitOptions={unitOptions}
              onUpdateApparatus={updateApparatus}
              onAssignToUnit={assignPersonToUnit}
              onUpdateMemberShiftTime={updateMemberShiftTime}
              onAddOvertimeToUnit={addOvertimeToUnit}
              onRemoveOvertimeFromUnit={removeOvertimeFromUnit}
              rosterLoaded={rosterLoaded}
            />
          </Panel>
        ) : null}

        {rosterTab === "week" ? (
          <WeekRosterView
            weekSnapshots={weekSnapshots}
            selectedId={weekRosterStartId}
            onSelectDay={selectDay}
            rotation={rotation}
            onWeekChange={shiftSelectedWeek}
            apparatus={apparatus}
            stationNames={stationNames}
            departmentName={departmentName}
            shiftChangeTime={shiftChangeTime}
            personnel={personnel}
            schedulingSettings={schedulingSettings}
          />
        ) : null}

        {rosterTab === "trades" ? (
          <ShiftTradesPanel
            trades={shiftTrades}
            setTrades={setShiftTrades}
            personnel={personnel}
            setPersonnel={setPersonnel}
          />
        ) : null}

        {rosterTab === "callshift" ? (
          <CallShiftPanel
            callShifts={callShifts}
            setCallShifts={setCallShifts}
            personnel={personnel}
            roster={roster}
            leaveRequests={leaveRequests}
            shiftTrades={shiftTrades}
            scheduleDays={days}
            schedulingSettings={schedulingSettings}
            apparatus={apparatus}
            shiftRotation={shiftRotation}
            profileShifts={profileShifts}
            departmentId={departmentId}
            callShiftRules={callShiftRules}
            canManage={canManageCallShifts || canEditRoster}
          />
        ) : null}

        {rosterTab === "requests" ? (
          <div className="schedule-requests-stack">
            {staffingPanel}
            {leaveRequestsPanel}
            {vacancyPickupsPanel}
            {overtimePanel}
          </div>
        ) : null}
      </div>

      {rosterTab !== "requests" && rosterTab !== "trades" && rosterTab !== "callshift" && rosterTab !== "week" && rosterTab !== "calendar" ? (
        <div className="schedule-side">
          {staffingPanel}
          {leaveRequestsPanel}
          {vacancyPickupsPanel}
        </div>
      ) : null}
    </section>
  </div>;
}
