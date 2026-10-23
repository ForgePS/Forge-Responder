import { defaultShiftRotation } from "../data/defaultShiftRotation.js";
import { DEFAULT_SHIFT_CHANGE_TIME } from "./dailyLogLock.js";
import { buildDayRoster } from "./schedulingRoster.js";
import {
  buildScheduleDayRecord,
  formatDayId,
  isPlatoonWorkDay,
  isSameDay,
  parseDayId,
  resolveShiftRotation,
  shiftForDate,
  shiftShortLabel,
} from "./shiftCalendar.js";

function buildDayCell(date, existingById, rotation, today, { inMonth = true } = {}) {
  const id = formatDayId(date);
  const shift = shiftForDate(date, rotation);
  const saved = existingById[id];
  const sequence = rotation.sequence?.length ? rotation.sequence : defaultShiftRotation.sequence;
  const capNumber = Math.max(sequence.indexOf(shift) + 1, 1);

  return {
    kind: "day",
    id,
    inMonth,
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    shift,
    capNumber,
    staffed: saved?.staffed ?? 0,
    minimum: saved?.minimum ?? 0,
    leave: saved?.leave ?? 0,
    status: saved?.status ?? "Complete",
    calendarDay: date.getDate(),
    isToday: isSameDay(date, today),
  };
}

export function buildExtendedMonthCells(year, month, existingDays = [], rotation = defaultShiftRotation) {
  const resolvedRotation = resolveShiftRotation(rotation);
  const existingById = Object.fromEntries(
    (Array.isArray(existingDays) ? existingDays : []).map((day) => [day.id, day])
  );
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingPad = firstOfMonth.getDay();
  const today = new Date();
  const cells = [];

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let index = 0; index < leadingPad; index += 1) {
    const dayNumber = prevMonthLastDay - leadingPad + index + 1;
    const date = new Date(year, month - 1, dayNumber);
    cells.push(buildDayCell(date, existingById, resolvedRotation, today, { inMonth: false }));
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(year, month, dayNumber);
    cells.push(buildDayCell(date, existingById, resolvedRotation, today, { inMonth: true }));
  }

  let trailingDay = 1;
  while (cells.length % 7 !== 0) {
    const date = new Date(year, month + 1, trailingDay);
    cells.push(buildDayCell(date, existingById, resolvedRotation, today, { inMonth: false }));
    trailingDay += 1;
  }

  return cells;
}

export function buildWeekCells(referenceDayId = "", existingDays = [], rotation = defaultShiftRotation) {
  const reference = referenceDayId ? parseDayId(referenceDayId) : new Date();
  const resolvedRotation = resolveShiftRotation(rotation);
  const existingById = Object.fromEntries(
    (Array.isArray(existingDays) ? existingDays : []).map((day) => [day.id, day])
  );
  const today = new Date();
  const start = new Date(reference);
  start.setDate(reference.getDate() - reference.getDay());

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return buildDayCell(date, existingById, resolvedRotation, today, { inMonth: true });
  });
}

export function resolveCapNumber(shiftLabel = "", rotation = defaultShiftRotation) {
  const resolved = resolveShiftRotation(rotation);
  const sequence = resolved.sequence?.length ? resolved.sequence : defaultShiftRotation.sequence;
  const index = sequence.indexOf(shiftLabel);
  return index >= 0 ? index + 1 : 1;
}

export function formatShiftDutyWindow(dayId = "", shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME) {
  const startDate = parseDayId(dayId);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 1);

  const normalized = String(shiftChangeTime || DEFAULT_SHIFT_CHANGE_TIME).trim();
  const startTime = normalized.length >= 5 ? normalized.slice(0, 5) : DEFAULT_SHIFT_CHANGE_TIME;
  const endWeekday = endDate.toLocaleDateString("en-US", { weekday: "short" });

  return `${startTime}–${endWeekday} ${startTime}`;
}

export function buildEmployeeScheduledBlock({
  myPerson = null,
  membership = {},
  dayId = "",
  rotation = defaultShiftRotation,
  roster = [],
  personnel = [],
  leaveRequests = [],
  knownUnits = [],
  shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME,
} = {}) {
  const shift = myPerson?.shift || membership?.assignedShift || "";
  if (!shift || !myPerson?.id) return null;

  const date = parseDayId(dayId);
  if (!isPlatoonWorkDay(date, shift, rotation)) return null;

  const dayRecord = buildScheduleDayRecord(dayId, [], rotation);
  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: dayRecord.shift,
    selectedDayId: dayId,
    leaveRequests,
    knownUnits,
  });
  const member = dayRoster.find((entry) => entry.personnelId === myPerson.id);
  if (member?.status === "Leave") return null;

  const unit = member?.apparatus || myPerson.assignment || myPerson.unit || "—";
  if (unit === "Leave" || unit === "Unassigned") return null;

  return {
    unit,
    station: myPerson.station || "—",
    position: member?.position || myPerson.rank || myPerson.position || "—",
    timeWindow: formatShiftDutyWindow(dayId, shiftChangeTime),
    shift: dayRecord.shift,
  };
}

export function buildEmployeeDayDecorators({
  myPerson = null,
  membership = {},
  rotation = defaultShiftRotation,
  roster = [],
  personnel = [],
  leaveRequests = [],
  knownUnits = [],
  shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME,
  vacancyDays = [],
} = {}) {
  const vacancyByDay = Object.fromEntries(
    (Array.isArray(vacancyDays) ? vacancyDays : []).map((day) => [day.id, day.vacancies?.length || 0])
  );

  return function decorateEmployeeDay(cell) {
    if (cell.kind !== "day") return {};

    const scheduled = buildEmployeeScheduledBlock({
      myPerson,
      membership,
      dayId: cell.id,
      rotation,
      roster,
      personnel,
      leaveRequests,
      knownUnits,
      shiftChangeTime,
    });

    return {
      scheduled,
      badgeCount: vacancyByDay[cell.id] || 0,
      showMegaphone: Boolean(scheduled || vacancyByDay[cell.id]),
    };
  };
}

export function buildAdminDayDecorators({ liveDayMetrics = {} } = {}) {
  return function decorateAdminDay(cell) {
    if (cell.kind !== "day") return {};

    const live = liveDayMetrics?.[cell.id];
    const staffed = live?.staffed ?? cell.staffed;
    const minimum = live?.minimum ?? cell.minimum;
    const leave = live?.leave ?? cell.leave;
    const status = live?.status ?? cell.status;
    const vacancies = Math.max(minimum - staffed, 0);
    const isDeficit = status === "Deficit" || vacancies > 0;

    return {
      staffed,
      minimum,
      leave,
      isDeficit,
      badgeCount: vacancies,
      showMegaphone: leave > 0,
      staffingLabel: `${staffed}/${minimum}`,
    };
  };
}

export { shiftShortLabel };
