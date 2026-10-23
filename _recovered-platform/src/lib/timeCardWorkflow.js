import { buildDayRoster } from "./schedulingRoster.js";
import { buildSchedulingUnitOptions } from "./schedulingSettings.js";
import { recordBelongsToEmployee } from "./employeePortalUtils.js";
import {
  formatDayId,
  isPlatoonWorkDay,
  parseDayId,
  resolveShiftRotation,
} from "./shiftCalendar.js";
import { resolvePayPeriodForDay } from "./payPeriods.js";
import { defaultShiftRotation } from "../data/defaultShiftRotation.js";

export const DEFAULT_WORK_DAY_HOURS = 24;

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

export function formatPayPeriodRangeLabel(payPeriod = {}) {
  const resolved = resolvePayPeriodForDay(formatDayId(new Date()), payPeriod);
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
  const weeks = [];
  let current = [];

  days.forEach((day, index) => {
    current.push(day);
    const date = parseDayId(day.id);
    if (date.getDay() === 6 || index === days.length - 1) {
      weeks.push(current);
      current = [];
    }
  });

  return weeks;
}

function resolveApprovedLeaveForDay(dayId, leaveRequests = [], myPerson = null, membership = {}) {
  return (Array.isArray(leaveRequests) ? leaveRequests : []).filter((request) => {
    if (!/approved/i.test(String(request.status || ""))) return false;
    if (!recordBelongsToEmployee(request, membership, myPerson)) return false;
    const selectedDates = Array.isArray(request.selectedDates) ? request.selectedDates : [];
    return selectedDates.includes(dayId);
  });
}

function parseHours(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function buildAutoTimeCardDay({
  dayId = "",
  myPerson = null,
  membership = {},
  rotation = defaultShiftRotation,
  leaveRequests = [],
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  workDayHours = DEFAULT_WORK_DAY_HOURS,
} = {}) {
  const resolvedRotation = resolveShiftRotation(rotation);
  const shift = myPerson?.shift || membership?.assignedShift || "";
  const date = parseDayId(dayId);
  const approvedLeave = resolveApprovedLeaveForDay(dayId, leaveRequests, myPerson, membership);

  const leaveHours = {
    annualLeave: 0,
    sickLeave: 0,
    militaryLeave: 0,
    holiday: 0,
    workersComp: 0,
    otherLeave: 0,
  };

  approvedLeave.forEach((request) => {
    const category = classifyLeaveCategory(request.type);
    const hours = parseHours(request.totalHours) || workDayHours;
    if (leaveHours[category] !== undefined) {
      leaveHours[category] += hours;
    } else {
      leaveHours.otherLeave += hours;
    }
  });

  const onLeave = approvedLeave.length > 0;
  let regularHours = 0;
  let statusLabel = "";
  let statusCode = "";

  if (onLeave) {
    const primary = approvedLeave[0];
    statusCode = String(primary.type || "Leave").slice(0, 3).toUpperCase();
    statusLabel = primary.type || "Leave";
  } else if (shift && isPlatoonWorkDay(date, shift, resolvedRotation)) {
    const unitOptions = buildSchedulingUnitOptions(apparatus, schedulingSettings);
    const dayRecord = { shift: shiftForDateLabel(date, resolvedRotation) };
    const dayRoster = buildDayRoster({
      roster,
      personnel,
      selectedShift: dayRecord.shift,
      selectedDayId: dayId,
      leaveRequests,
      knownUnits: unitOptions,
    });
    const member = myPerson?.id
      ? dayRoster.find((entry) => entry.personnelId === myPerson.id)
      : null;

    if (!member || member.status !== "Leave") {
      regularHours = workDayHours;
      statusLabel = "Regular";
      statusCode = String(regularHours);
    }
  }

  return {
    dayId,
    regularHours,
    leaveHours,
    onLeave,
    statusLabel,
    statusCode,
    isWorkDay: regularHours > 0,
  };
}

function shiftForDateLabel(date, rotation) {
  const { shiftForDate } = requireShiftHelpers();
  return shiftForDate(date, rotation);
}

function requireShiftHelpers() {
  return require("./shiftCalendar.js");
}

// Avoid circular require in ESM - import at top instead
import { shiftForDate } from "./shiftCalendar.js";

export function buildTimeCardModel({
  referenceDayId = "",
  payPeriod = {},
  myPerson = null,
  membership = {},
  rotation = defaultShiftRotation,
  leaveRequests = [],
  roster = [],
  personnel = [],
  schedulingSettings = {},
  apparatus = [],
  savedEntry = {},
  workDayHours = DEFAULT_WORK_DAY_HOURS,
} = {}) {
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
      leaveRequests,
      roster,
      personnel,
      schedulingSettings,
      apparatus,
      workDayHours,
    });
    const persisted = savedDays[day.id] || {};
    const medicUnitHours = parseHours(persisted.medicUnitHours);

    return {
      ...day,
      ...auto,
      medicUnitHours,
      displayHours: auto.onLeave ? auto.leaveHours : null,
      cellMain: auto.onLeave
        ? auto.statusLabel
        : (auto.regularHours > 0 ? String(auto.regularHours) : ""),
    };
  });

  const totals = computeTimeCardTotals(dayModels, savedSummary);

  return {
    payPeriodStart: resolved.startDate,
    payPeriodEnd: resolved.endDate,
    payPeriodLabel: formatPayPeriodRangeLabel(payPeriod),
    weeks: splitPayPeriodWeeks(dayModels),
    days: dayModels,
    totals,
    isFireMedic: isFireMedicProvider(myPerson),
    employeeName: myPerson?.name || membership?.displayName || "",
  };
}

export function computeTimeCardTotals(days = [], summaryOverrides = {}) {
  const totals = {
    regularHours: 0,
    annualLeave: 0,
    sickLeave: 0,
    militaryLeave: 0,
    medicUnitHours: 0,
    holidayHours: parseHours(summaryOverrides.holidayHours),
    overtimeHours: parseHours(summaryOverrides.overtimeHours),
    workersCompHours: parseHours(summaryOverrides.workersCompHours),
  };

  days.forEach((day) => {
    totals.regularHours += parseHours(day.regularHours);
    totals.annualLeave += parseHours(day.leaveHours?.annualLeave);
    totals.sickLeave += parseHours(day.leaveHours?.sickLeave);
    totals.militaryLeave += parseHours(day.leaveHours?.militaryLeave);
    totals.medicUnitHours += parseHours(day.medicUnitHours);

    if (parseHours(day.leaveHours?.holiday)) {
      totals.holidayHours += parseHours(day.leaveHours.holiday);
    }
    if (parseHours(day.leaveHours?.workersComp)) {
      totals.workersCompHours += parseHours(day.leaveHours.workersComp);
    }
  });

  totals.grandTotal = totals.regularHours
    + totals.annualLeave
    + totals.sickLeave
    + totals.militaryLeave
    + totals.medicUnitHours
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
