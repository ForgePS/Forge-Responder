import { canonicalApparatusUnitName } from "./apparatusSchema.js";
import {
  buildDayRoster,
  buildDayScopedRosterId,
  ROSTER_LEAVE_ASSIGNMENTS,
  resolveOvertimeRosterEntries,
} from "./schedulingRoster.js";
import { buildSchedulingUnitOptions } from "./schedulingSettings.js";
import { recordBelongsToEmployee } from "./employeePortalUtils.js";
import {
  formatDayId,
  isPlatoonWorkDay,
  parseDayId,
  resolveShiftRotation,
  shiftForDate,
  buildScheduleDayRecord,
} from "./shiftCalendar.js";
import { resolvePayPeriodForDay } from "./payPeriods.js";
import {
  normalizePayRules,
  resolveConfiguredHolidayForDay,
  resolveHolidayPayDecision,
} from "./payRules.js";
import { defaultShiftRotation } from "../data/defaultShiftRotation.js";
import { calculateEndTime } from "./employeePortalWorkflow.js";

export const DEFAULT_WORK_DAY_HOURS = 24;

export const OVERTIME_CATEGORY_DEFS = [
  { key: "lateCalls", label: "Late Calls OT Hrs." },
  { key: "holdOver", label: "Hold Over OT Hrs." },
  { key: "training", label: "Training OT Hrs." },
  { key: "other", label: "Other OT Hrs." },
];

export function normalizeOvertimeBreakdown(summary = {}) {
  const source = summary?.overtime && typeof summary.overtime === "object"
    ? summary.overtime
    : {};
  return Object.fromEntries(
    OVERTIME_CATEGORY_DEFS.map(({ key }) => [key, source[key] ?? ""])
  );
}

export function sumDayExtraOvertimeHours(days = []) {
  return (Array.isArray(days) ? days : []).reduce(
    (sum, day) => sum + parseHours(day.extraHours),
    0
  );
}

/** @deprecated Legacy summary overtime categories — migrated into day-level extra hours when possible */
export function sumAdminOvertimeHours(summary = {}) {
  return OVERTIME_CATEGORY_DEFS.reduce(
    (sum, { key }) => sum + parseHours(normalizeOvertimeBreakdown(summary)[key]),
    0
  );
}

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function isFireMedicProvider(person = {}) {
  const ems = normalizeText(person.ems);
  const position = normalizeText(person.position);
  const rank = normalizeText(person.rank);
  if (/paramedic|firemedic|als/.test(ems)) return true;
  if (/paramedic|firemedic|medic/.test(position)) return true;
  if (/paramedic/.test(rank)) return true;
  return false;
}

export function classifyLeaveCategory(leaveType = "") {
  const type = normalizeText(leaveType);
  if (type.includes("vacation") || type.includes("annual")) return "annualLeave";
  if (type.includes("sick")) return "sickLeave";
  if (type.includes("military")) return "militaryLeave";
  if (type.includes("holiday")) return "holiday";
  if (type.includes("workers") || type.includes("w/c") || type.includes("comp")) return "workersComp";
  return "otherLeave";
}

export function formatPayPeriodRangeLabel(payPeriod = {}, referenceDayId = "") {
  const resolved = resolvePayPeriodForDay(referenceDayId || formatDayId(new Date()), payPeriod);
  const start = parseDayId(resolved.startDate);
  const end = parseDayId(resolved.endDate);
  const startLabel = start.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${startLabel} thru ${endLabel}`;
}

export function listPayPeriodDays(referenceDayId = "", payPeriod = {}) {
  const resolved = resolvePayPeriodForDay(referenceDayId || formatDayId(new Date()), payPeriod);
  const days = [];
  const cursor = parseDayId(resolved.startDate);
  const end = parseDayId(resolved.endDate);

  while (stripTime(cursor) <= stripTime(end)) {
    days.push({
      id: formatDayId(cursor),
      weekday: cursor.toLocaleDateString("en-US", { weekday: "long" }),
      weekdayShort: cursor.toLocaleDateString("en-US", { weekday: "short" }),
      calendarDay: cursor.getDate(),
      monthLabel: cursor.toLocaleDateString("en-US", { month: "short" }),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

export function splitPayPeriodWeeks(days = []) {
  if (!days.length) return [];

  const rows = [];
  let row = Array(parseDayId(days[0].id).getDay()).fill(null);

  days.forEach((day) => {
    row.push(day);
    if (row.length === 7) {
      rows.push(row);
      row = [];
    }
  });

  if (row.length) {
    while (row.length < 7) row.push(null);
    rows.push(row);
  }

  return rows;
}

function resolveApprovedLeaveForDay(dayId, leaveRequests = [], myPerson = null, membership = {}) {
  return (Array.isArray(leaveRequests) ? leaveRequests : []).filter((request) => {
    if (!/approved/i.test(String(request.status || ""))) return false;
    if (!recordBelongsToEmployee(request, membership, myPerson)) return false;
    const selectedDates = Array.isArray(request.selectedDates) ? request.selectedDates : [];
    return selectedDates.includes(dayId);
  });
}

function isRosterLeaveMarking(apparatusValue = "", leaveType = "", rosterStatus = "") {
  const apparatus = String(apparatusValue || "").trim();
  const leave = String(leaveType || "").trim();
  const status = String(rosterStatus || "").trim();
  return ROSTER_LEAVE_ASSIGNMENTS.includes(apparatus)
    || apparatus === "Leave"
    || ROSTER_LEAVE_ASSIGNMENTS.includes(leave)
    || status === "Leave";
}

/** Daily roster sick/vacation markings that are not backed by an approved leave request. */
function resolveRosterMarkedLeaveForDay({
  dayId = "",
  myPerson = null,
  rotation = defaultShiftRotation,
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  leaveRequests = [],
  shiftTrades = [],
} = {}) {
  if (!myPerson?.id || !dayId) return null;

  const dayScopedId = buildDayScopedRosterId(myPerson.id, dayId);
  const rosterEntry = (Array.isArray(roster) ? roster : []).find((member) => (
    member.id === dayScopedId
    || (member.personnelId === myPerson.id && member.dayId === dayId)
  ));

  if (rosterEntry && isRosterLeaveMarking(
    rosterEntry.apparatus || rosterEntry.assignmentValue,
    rosterEntry.leaveType,
    rosterEntry.status
  )) {
    return {
      type: rosterEntry.leaveType || rosterEntry.apparatus || rosterEntry.assignmentValue || "Leave",
      totalHours: rosterEntry.totalHours ?? "",
    };
  }

  const date = parseDayId(dayId);
  const resolvedRotation = resolveShiftRotation(rotation);
  const dayShift = shiftForDate(date, resolvedRotation);
  if (!dayShift) return null;

  const unitOptions = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: dayShift,
    selectedDayId: dayId,
    leaveRequests,
    shiftTrades,
    knownUnits: unitOptions,
  });
  const member = dayRoster.find((entry) => entry.personnelId === myPerson.id);
  if (!member || member.status !== "Leave") return null;

  return {
    type: member.leaveLabel || member.assignmentValue || "Leave",
    totalHours: "",
  };
}

/** Cross-shift daily roster overtime assignments for this employee/day. */
function resolveRosterOvertimeForPersonDay({
  dayId = "",
  myPerson = null,
  roster = [],
  workDayHours = DEFAULT_WORK_DAY_HOURS,
} = {}) {
  if (!myPerson?.id || !dayId) {
    return { hours: 0, label: "", apparatus: "" };
  }

  const entries = resolveOvertimeRosterEntries(roster, dayId)
    .filter((entry) => entry.personnelId === myPerson.id);

  if (!entries.length) {
    return { hours: 0, label: "", apparatus: "" };
  }

  const hours = entries.reduce(
    (sum, entry) => sum + (
      parseHours(entry.durationHours)
      || parseHours(entry.totalHours)
      || workDayHours
    ),
    0
  );
  const apparatus = [...new Set(
    entries
      .map((entry) => canonicalApparatusUnitName(entry.apparatus))
      .filter(Boolean)
  )].join(", ");

  return {
    hours,
    label: apparatus ? `OT · ${apparatus}` : "Overtime",
    apparatus,
  };
}

function parseHours(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sumPaidLeaveDayHours(leaveHours = {}) {
  return parseHours(leaveHours.sickLeave)
    + parseHours(leaveHours.annualLeave)
    + parseHours(leaveHours.militaryLeave)
    + parseHours(leaveHours.otherLeave);
}

export function formatTimeCardHours(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return Number.isInteger(parsed) ? String(parsed) : parsed.toFixed(1);
}

function shiftChangeTimeToHHMM(shiftChangeTime = "07:00") {
  const normalized = String(shiftChangeTime || "07:00").trim();
  if (/^\d{2}:\d{2}$/.test(normalized)) {
    return normalized.replace(":", "");
  }
  if (/^\d{4}$/.test(normalized)) {
    return normalized;
  }
  return "0700";
}

/** Normalize HH:MM, HHMM, or short input to HHMM storage. */
export function normalizeTimeCardTime(value = "", fallback = "") {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  const parsedShort = parseTimeCardShortInput(raw);
  if (parsedShort) return parsedShort;

  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 3) {
    const hh = digits.slice(0, 2).padStart(2, "0");
    const mm = digits.slice(2, 4).padStart(2, "0").slice(0, 2);
    return `${hh}${mm}`;
  }

  return fallback;
}

/** Parse paper-style input such as 7A, 7:30P, or 0700 into HHMM. */
export function parseTimeCardShortInput(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const compact = raw.toUpperCase().replace(/\s/g, "");
  const match = compact.match(/^(\d{1,2})(?::(\d{2}))?([AP])?$/);
  if (!match) return "";

  let hour = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2] || "0", 10);
  const meridiem = match[3];

  if (!Number.isFinite(hour) || !Number.isFinite(minutes) || minutes > 59) return "";

  if (meridiem === "A") {
    if (hour === 12) hour = 0;
  } else if (meridiem === "P") {
    if (hour !== 12) hour += 12;
  } else if (hour <= 12 && !match[2] && compact.length <= 2) {
    // Bare hour like "7" defaults to morning shift start.
    if (hour === 12) hour = 0;
  } else if (hour > 23) {
    return "";
  }

  return `${String(hour).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
}

/** Display HHMM as paper-style shorthand such as 7A or 7:30P. */
export function formatTimeCardShort(value = "") {
  const normalized = normalizeTimeCardTime(value, "");
  if (!normalized) return "";

  const hour24 = Number.parseInt(normalized.slice(0, 2), 10);
  const minutes = Number.parseInt(normalized.slice(2, 4), 10);
  if (!Number.isFinite(hour24) || !Number.isFinite(minutes)) return "";

  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "P" : "A";
  if (minutes === 0) return `${hour12}${suffix}`;
  return `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

function resolveDefaultDayShiftTimes({
  onLeave = false,
  approvedLeave = [],
  regularHours = 0,
  holidayHours = 0,
  paidLeaveHours = 0,
  overtimeHours = 0,
  isScheduledWorkDay = false,
  shiftChangeTime = "07:00",
  workDayHours = DEFAULT_WORK_DAY_HOURS,
} = {}) {
  if (onLeave) {
    const primary = approvedLeave[0] || {};
    const startTime = primary.startTime ? normalizeTimeCardTime(primary.startTime) : "";
    let endTime = primary.finishTime ? normalizeTimeCardTime(primary.finishTime) : "";
    const hours = parseHours(primary.totalHours) || paidLeaveHours || workDayHours;

    if (startTime) {
      if (!endTime) {
        endTime = calculateEndTime(startTime, hours).time;
      }
      return { defaultStartTime: startTime, defaultEndTime: endTime };
    }

    if (hours > 0) {
      const defaultStartTime = shiftChangeTimeToHHMM(shiftChangeTime);
      const defaultEndTime = calculateEndTime(defaultStartTime, hours).time;
      return { defaultStartTime, defaultEndTime };
    }

    return { defaultStartTime: "", defaultEndTime: "" };
  }

  const dutyHours = regularHours > 0
    ? regularHours
    : (overtimeHours > 0 ? overtimeHours : 0);
  if (dutyHours <= 0) {
    return { defaultStartTime: "", defaultEndTime: "" };
  }

  const defaultStartTime = shiftChangeTimeToHHMM(shiftChangeTime);
  const defaultEndTime = calculateEndTime(defaultStartTime, dutyHours).time;
  return { defaultStartTime, defaultEndTime };
}

/** Per-week breakdown for the totals column (Regular, Sick, Vacation, Holiday). */
const WEEK_BREAKDOWN_LABELS = {
  holiday: "Holiday",
  sick: "Sick",
  vacation: "Vacation",
  military: "Military Leave",
  workersComp: "W/C",
  ot: "OT",
};

export function computeWeekHourBreakdown(weekDays = []) {
  const days = (Array.isArray(weekDays) ? weekDays : []).filter(Boolean);
  const sums = {
    regularHours: 0,
    sickLeave: 0,
    annualLeave: 0,
    militaryLeave: 0,
    workersComp: 0,
    holidayHours: 0,
    overtimeHours: 0,
  };

  days.forEach((day) => {
    sums.regularHours += parseHours(day.countedRegularHours ?? day.regularHours);
    sums.sickLeave += parseHours(day.leaveHours?.sickLeave);
    sums.annualLeave += parseHours(day.leaveHours?.annualLeave);
    sums.militaryLeave += parseHours(day.leaveHours?.militaryLeave);
    sums.workersComp += parseHours(day.leaveHours?.workersComp);
    sums.holidayHours += parseHours(day.leaveHours?.holiday);
    sums.overtimeHours += parseHours(day.countedOvertimeHours);
  });

  const lines = [];
  if (sums.regularHours > 0) {
    lines.push({
      hours: sums.regularHours,
      displayText: formatTimeCardHours(sums.regularHours),
      tone: "regular",
    });
  }
  if (sums.holidayHours > 0) {
    lines.push({
      hours: sums.holidayHours,
      displayText: `${formatTimeCardHours(sums.holidayHours)} - ${WEEK_BREAKDOWN_LABELS.holiday}`,
      tone: "holiday",
    });
  }
  if (sums.sickLeave > 0) {
    lines.push({
      hours: sums.sickLeave,
      displayText: `${formatTimeCardHours(sums.sickLeave)} - ${WEEK_BREAKDOWN_LABELS.sick}`,
      tone: "leave",
    });
  }
  if (sums.annualLeave > 0) {
    lines.push({
      hours: sums.annualLeave,
      displayText: `${formatTimeCardHours(sums.annualLeave)} - ${WEEK_BREAKDOWN_LABELS.vacation}`,
      tone: "leave",
    });
  }
  if (sums.militaryLeave > 0) {
    lines.push({
      hours: sums.militaryLeave,
      displayText: `${formatTimeCardHours(sums.militaryLeave)} - ${WEEK_BREAKDOWN_LABELS.military}`,
      tone: "leave",
    });
  }
  if (sums.workersComp > 0) {
    lines.push({
      hours: sums.workersComp,
      displayText: `${formatTimeCardHours(sums.workersComp)} - ${WEEK_BREAKDOWN_LABELS.workersComp}`,
      tone: "leave",
    });
  }
  if (sums.overtimeHours > 0) {
    lines.push({
      hours: sums.overtimeHours,
      displayText: `${formatTimeCardHours(sums.overtimeHours)} - ${WEEK_BREAKDOWN_LABELS.ot}`,
      tone: "overtime",
    });
  }
  return lines;
}

/** Hours toward the OT threshold — regular shift work, roster OT, and manual extra only. Holiday pay is excluded. */
export function resolveDayActualWorkedHours(day = {}) {
  const regular = parseHours(day.regularHours);
  const rosterOt = parseHours(day.rosterOvertimeHours);
  const manualExtra = parseHours(day.manualExtraHours);
  return regular + rosterOt + manualExtra;
}

export function sumAllocatedOvertimeHours(days = []) {
  return (Array.isArray(days) ? days : []).reduce(
    (sum, day) => sum + parseHours(day.countedOvertimeHours),
    0
  );
}

/** Pay-period actual worked hours — sick, vacation, military leave, and holiday pay never count. */
export function sumActualWorkedHours(days = []) {
  return (Array.isArray(days) ? days : []).reduce(
    (sum, day) => sum + resolveDayActualWorkedHours(day),
    0
  );
}

/** @deprecated Use sumActualWorkedHours — kept for compatibility. */
export function sumOvertimeEligibleRegularHours(days = []) {
  return sumActualWorkedHours(days);
}

/**
 * Split each day's actual work into straight-time vs OT using a running pay-period threshold.
 * Roster OT and manual extra hours count as work first; OT premium begins after the threshold.
 */
export function allocatePayPeriodWorkHours(days = [], threshold = 106) {
  const parsedThreshold = Number.parseFloat(threshold);
  const limit = Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 106;
  let accumulated = 0;

  return (Array.isArray(days) ? days : []).map((day) => {
    const work = resolveDayActualWorkedHours(day);
    let countedRegularHours = 0;
    let countedOvertimeHours = 0;

    if (work > 0) {
      if (accumulated >= limit) {
        countedOvertimeHours = work;
      } else if (accumulated + work <= limit) {
        countedRegularHours = work;
      } else {
        countedRegularHours = limit - accumulated;
        countedOvertimeHours = work - countedRegularHours;
      }
      accumulated += work;
    }

    return {
      ...day,
      actualWorkedHours: work,
      countedRegularHours,
      countedOvertimeHours,
    };
  });
}

function resolveTimeCardCellMain(auto = {}) {
  if (auto.onLeave) {
    const sick = parseHours(auto.leaveHours?.sickLeave);
    const vacation = parseHours(auto.leaveHours?.annualLeave);
    const military = parseHours(auto.leaveHours?.militaryLeave);
    const other = parseHours(auto.leaveHours?.otherLeave);
    const hours = sick || vacation || military || other;
    if (hours > 0) return formatTimeCardHours(hours);
    return auto.statusLabel || "";
  }
  const holidayHours = parseHours(auto.leaveHours?.holiday);
  if (holidayHours > 0) return String(holidayHours);
  if (auto.isHoliday && auto.holidayName) return auto.holidayName;
  if (auto.statusCode) return String(auto.statusCode);
  return "";
}

function resolveTimeCardDayDisplay(auto = {}, rosterOvertimeHours = 0, manualExtraHours = 0) {
  const actualWorked = resolveDayActualWorkedHours({
    ...auto,
    rosterOvertimeHours,
    manualExtraHours,
  });
  const holidayHours = parseHours(auto.leaveHours?.holiday);

  if (auto.onLeave) {
    return {
      cellMain: resolveTimeCardCellMain(auto),
      workHoursDisplay: actualWorked > 0 ? (formatTimeCardHours(actualWorked) || String(actualWorked)) : "",
    };
  }

  if (actualWorked > 0) {
    return {
      cellMain: formatTimeCardHours(actualWorked) || String(actualWorked),
      workHoursDisplay: "",
    };
  }

  if (holidayHours > 0) {
    return {
      cellMain: formatTimeCardHours(holidayHours) || String(holidayHours),
      workHoursDisplay: "",
    };
  }

  return {
    cellMain: resolveTimeCardCellMain(auto),
    workHoursDisplay: "",
  };
}

export function buildAutoTimeCardDay({
  dayId = "",
  myPerson = null,
  membership = {},
  rotation = defaultShiftRotation,
  scheduleDays = [],
  leaveRequests = [],
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  shiftTrades = [],
  payRules = {},
  workDayHours = null,
  shiftChangeTime = "07:00",
} = {}) {
  const normalizedPayRules = normalizePayRules(payRules);
  const resolvedWorkDayHours = workDayHours ?? normalizedPayRules.workDayHours ?? DEFAULT_WORK_DAY_HOURS;
  const resolvedRotation = resolveShiftRotation(rotation);
  const shift = myPerson?.shift || membership?.assignedShift || "";
  const date = parseDayId(dayId);
  const approvedLeave = resolveApprovedLeaveForDay(dayId, leaveRequests, myPerson, membership);
  const rosterLeave = approvedLeave.length
    ? null
    : resolveRosterMarkedLeaveForDay({
      dayId,
      myPerson,
      rotation,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      leaveRequests,
      shiftTrades,
    });
  const leaveSources = approvedLeave.length
    ? approvedLeave
    : (rosterLeave ? [rosterLeave] : []);
  const configuredHoliday = resolveConfiguredHolidayForDay(dayId, normalizedPayRules);
  const isScheduledWorkDay = Boolean(shift && isPlatoonWorkDay(date, shift, resolvedRotation));

  const leaveHours = {
    annualLeave: 0,
    sickLeave: 0,
    militaryLeave: 0,
    holiday: 0,
    workersComp: 0,
    otherLeave: 0,
  };

  leaveSources.forEach((request) => {
    const category = classifyLeaveCategory(request.type);
    const hours = parseHours(request.totalHours) || resolvedWorkDayHours;
    if (leaveHours[category] !== undefined) {
      leaveHours[category] += hours;
    } else {
      leaveHours.otherLeave += hours;
    }
  });

  const onLeave = leaveSources.length > 0;
  let regularHours = 0;
  let statusLabel = "";
  let statusCode = "";
  let holidayDisplay = false;

  if (onLeave) {
    const primary = leaveSources[0];
    statusCode = String(primary.type || "Leave").slice(0, 3).toUpperCase();
    statusLabel = primary.type || "Leave";
  } else {
    const holidayDecision = resolveHolidayPayDecision({
      configuredHoliday,
      shift,
      isScheduledWorkDay,
      payRules: normalizedPayRules,
    });

    if (holidayDecision.payHolidayHours > 0) {
      leaveHours.holiday = holidayDecision.payHolidayHours;
      statusLabel = configuredHoliday.name;
      statusCode = String(holidayDecision.payHolidayHours);
    }

    const shouldEarnRegularHours = isScheduledWorkDay
      && (!configuredHoliday || holidayDecision.earnRegularHours);

    if (shouldEarnRegularHours) {
      const unitOptions = buildSchedulingUnitOptions(apparatus, schedulingSettings);
      const dayShift = buildScheduleDayRecord(dayId, scheduleDays, resolvedRotation).shift
        || shiftForDate(date, resolvedRotation);
      const dayRoster = buildDayRoster({
        roster,
        personnel,
        selectedShift: dayShift,
        selectedDayId: dayId,
        leaveRequests,
        shiftTrades,
        knownUnits: unitOptions,
      });
      const member = myPerson?.id
        ? dayRoster.find((entry) => entry.personnelId === myPerson.id)
        : null;

      if (!member || member.status !== "Leave") {
        regularHours = resolvedWorkDayHours;
        if (holidayDecision.payHolidayHours <= 0) {
          statusLabel = "Regular";
          statusCode = String(regularHours);
        }
      }
    }

    holidayDisplay = holidayDecision.displayHoliday;
  }

  const holidayHours = parseHours(leaveHours.holiday);
  const paidLeaveHours = sumPaidLeaveDayHours(leaveHours);
  const rosterOvertime = resolveRosterOvertimeForPersonDay({
    dayId,
    myPerson,
    roster,
    workDayHours: resolvedWorkDayHours,
  });
  const hasConfiguredHoliday = Boolean(configuredHoliday) && holidayDisplay;
  const { defaultStartTime, defaultEndTime } = resolveDefaultDayShiftTimes({
    onLeave,
    approvedLeave: leaveSources,
    regularHours,
    holidayHours,
    paidLeaveHours,
    overtimeHours: rosterOvertime.hours,
    isScheduledWorkDay,
    shiftChangeTime,
    workDayHours: resolvedWorkDayHours,
  });

  return {
    dayId,
    regularHours,
    leaveHours,
    onLeave,
    statusLabel,
    statusCode,
    isHoliday: hasConfiguredHoliday || holidayHours > 0,
    holidayName: configuredHoliday?.name || "",
    holidayPaidHours: holidayHours > 0 ? (configuredHoliday?.paidHours || holidayHours) : 0,
    rosterOvertimeHours: rosterOvertime.hours,
    rosterOvertimeLabel: rosterOvertime.label,
    isWorkDay: regularHours > 0 || holidayHours > 0 || paidLeaveHours > 0 || rosterOvertime.hours > 0,
    defaultStartTime,
    defaultEndTime,
  };
}

export function buildTimeCardModel({
  referenceDayId = "",
  payPeriod = {},
  myPerson = null,
  membership = {},
  rotation = defaultShiftRotation,
  scheduleDays = [],
  leaveRequests = [],
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  shiftTrades = [],
  savedEntry = {},
  payRules = {},
  workDayHours = null,
  shiftChangeTime = "07:00",
} = {}) {
  const normalizedPayRules = normalizePayRules(payRules);
  const resolvedWorkDayHours = workDayHours ?? normalizedPayRules.workDayHours ?? DEFAULT_WORK_DAY_HOURS;
  const resolved = resolvePayPeriodForDay(referenceDayId || formatDayId(new Date()), payPeriod);
  const days = listPayPeriodDays(resolved.startDate, payPeriod);
  const savedDays = savedEntry?.days || {};
  const savedSummary = savedEntry?.summary || {};

  const dayModels = days.map((day) => {
    const auto = buildAutoTimeCardDay({
      dayId: day.id,
      myPerson,
      membership,
      rotation,
      scheduleDays,
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      shiftTrades,
      payRules: normalizedPayRules,
      workDayHours: resolvedWorkDayHours,
      shiftChangeTime,
    });
    const persisted = savedDays[day.id] || {};
    const medicUnitHoursRaw = persisted.medicUnitHours ?? "";
    const medicUnitHours = parseHours(medicUnitHoursRaw);
    const extraHoursRaw = persisted.extraHours ?? "";
    const manualExtraHours = parseHours(extraHoursRaw);
    const rosterOvertimeHours = auto.rosterOvertimeHours || 0;
    const extraHours = rosterOvertimeHours + manualExtraHours;
    const startTimeRaw = auto.defaultStartTime || "";
    const endTimeRaw = auto.defaultEndTime || "";
    const startTime = normalizeTimeCardTime(startTimeRaw, "");
    const endTime = normalizeTimeCardTime(endTimeRaw, "");
    const startTimeLabel = formatTimeCardShort(startTime);
    const endTimeLabel = formatTimeCardShort(endTime);
    const showShiftTimes = Boolean(startTimeLabel || endTimeLabel);
    const { cellMain, workHoursDisplay } = resolveTimeCardDayDisplay(
      auto,
      rosterOvertimeHours,
      manualExtraHours
    );
    const configuredHoliday = resolveConfiguredHolidayForDay(day.id, normalizedPayRules);
    const holidayHours = parseHours(auto.leaveHours?.holiday);
    const isHoliday = Boolean(configuredHoliday) || auto.isHoliday || holidayHours > 0;

    return {
      ...day,
      ...auto,
      medicUnitHours,
      medicUnitHoursRaw,
      extraHours,
      extraHoursRaw,
      manualExtraHours,
      rosterOvertimeHours,
      rosterOvertimeLabel: auto.rosterOvertimeLabel || "",
      startTime,
      endTime,
      startTimeRaw,
      endTimeRaw,
      startTimeLabel,
      endTimeLabel,
      showShiftTimes,
      displayHours: auto.onLeave ? auto.leaveHours : null,
      cellMain,
      workHoursDisplay,
      isHoliday,
      holidayName: configuredHoliday?.name || auto.holidayName || "",
      holidayPaidHours: auto.holidayPaidHours || configuredHoliday?.paidHours || 0,
      isWorkDay: auto.regularHours > 0
        || holidayHours > 0
        || sumPaidLeaveDayHours(auto.leaveHours) > 0
        || rosterOvertimeHours > 0,
    };
  });

  const allocatedDayModels = allocatePayPeriodWorkHours(
    dayModels,
    normalizedPayRules.overtimeThresholdHours
  );
  const totals = computeTimeCardTotals(allocatedDayModels, savedSummary, normalizedPayRules, {
    preAllocated: true,
  });

  return {
    payPeriodStart: resolved.startDate,
    payPeriodEnd: resolved.endDate,
    payPeriodLabel: formatPayPeriodRangeLabel(payPeriod, referenceDayId),
    weeks: splitPayPeriodWeeks(allocatedDayModels),
    days: allocatedDayModels,
    totals,
    isFireMedic: isFireMedicProvider(myPerson),
    employeeName: myPerson?.name || membership?.displayName || "",
  };
}

export function computeTimeCardTotals(days = [], summaryOverrides = {}, payRules = {}, options = {}) {
  const normalizedPayRules = normalizePayRules(payRules);
  const allocatedDays = options?.preAllocated
    ? (Array.isArray(days) ? days : [])
    : allocatePayPeriodWorkHours(days, normalizedPayRules.overtimeThresholdHours);
  const actualWorkedHours = sumActualWorkedHours(allocatedDays);
  const dayExtraOvertimeHours = sumDayExtraOvertimeHours(allocatedDays);
  const legacySummaryOvertime = sumAdminOvertimeHours(summaryOverrides);
  const allocatedOvertimeHours = sumAllocatedOvertimeHours(allocatedDays);
  const adminOvertimeHours = dayExtraOvertimeHours + legacySummaryOvertime;
  const totals = {
    regularHours: 0,
    annualLeave: 0,
    sickLeave: 0,
    militaryLeave: 0,
    medicUnitHours: 0,
    holidayHours: 0,
    overtimeHours: 0,
    overtimeThresholdHours: 0,
    overtimeThresholdLimit: normalizedPayRules.overtimeThresholdHours,
    actualWorkedHours,
    dayExtraOvertimeHours,
    legacySummaryOvertime,
    adminOvertimeHours,
    allocatedOvertimeHours,
    workersCompHours: 0,
  };

  const hasLegacyManualOvertime = summaryOverrides.overtimeHours !== undefined
    && summaryOverrides.overtimeHours !== null
    && String(summaryOverrides.overtimeHours).trim() !== "";

  const hasManualWorkersComp = summaryOverrides.workersCompHours !== undefined
    && summaryOverrides.workersCompHours !== null
    && String(summaryOverrides.workersCompHours).trim() !== "";

  totals.holidayHours = 0;
  totals.workersCompHours = hasManualWorkersComp ? parseHours(summaryOverrides.workersCompHours) : 0;

  allocatedDays.forEach((day) => {
    totals.regularHours += parseHours(day.countedRegularHours);
    totals.annualLeave += parseHours(day.leaveHours?.annualLeave);
    totals.sickLeave += parseHours(day.leaveHours?.sickLeave);
    totals.militaryLeave += parseHours(day.leaveHours?.militaryLeave);
    totals.medicUnitHours += parseHours(day.medicUnitHours);

    if (parseHours(day.leaveHours?.holiday)) {
      totals.holidayHours += parseHours(day.leaveHours.holiday);
    }
    if (!hasManualWorkersComp && parseHours(day.leaveHours?.workersComp)) {
      totals.workersCompHours += parseHours(day.leaveHours.workersComp);
    }
  });

  if (hasLegacyManualOvertime) {
    totals.overtimeThresholdHours = parseHours(summaryOverrides.overtimeHours);
    totals.overtimeHours = totals.overtimeThresholdHours + adminOvertimeHours;
  } else if (normalizedPayRules.autoCalculateOvertime) {
    totals.overtimeThresholdHours = allocatedOvertimeHours;
    totals.overtimeHours = allocatedOvertimeHours;
  } else {
    totals.overtimeThresholdHours = allocatedOvertimeHours + legacySummaryOvertime;
    totals.overtimeHours = allocatedOvertimeHours + legacySummaryOvertime;
  }

  totals.grandTotal = totals.regularHours
    + totals.annualLeave
    + totals.sickLeave
    + totals.militaryLeave
    + totals.holidayHours
    + totals.overtimeHours
    + totals.workersCompHours;

  return totals;
}

export function buildTimeCardRecordId(personnelId = "", payPeriodStart = "") {
  return `${personnelId}:${payPeriodStart}`;
}

export function resolveSavedTimeCardEntry(timeCards = [], personnelId = "", payPeriodStart = "") {
  const id = buildTimeCardRecordId(personnelId, payPeriodStart);
  return (Array.isArray(timeCards) ? timeCards : []).find((entry) => entry.id === id) || null;
}

export function upsertTimeCardEntry(timeCards = [], nextEntry = {}) {
  const id = nextEntry.id;
  if (!id) return timeCards;
  const existing = (Array.isArray(timeCards) ? timeCards : []).filter((entry) => entry.id !== id);
  return [{ ...nextEntry, updatedAt: new Date().toISOString() }, ...existing];
}

export function shiftPayPeriodReference(referenceDayId = "", payPeriod = {}, delta = 0) {
  const resolved = resolvePayPeriodForDay(referenceDayId || formatDayId(new Date()), payPeriod);
  const length = listPayPeriodDays(resolved.startDate, payPeriod).length;
  const anchor = parseDayId(resolved.startDate);
  anchor.setDate(anchor.getDate() + (delta * length));
  return formatDayId(anchor);
}
