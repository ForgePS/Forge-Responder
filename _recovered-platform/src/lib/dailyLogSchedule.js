import { resolveShiftRotation } from "../data/defaultShiftRotation.js";
import {
  buildScheduleDayRecord,
  formatDayId,
  isPlatoonWorkDay,
  resolveNextPlatoonWorkDay,
  resolveShiftRotation as resolveCalendarRotation,
} from "./shiftCalendar.js";

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolveDailyLogRotation(shiftRotation = {}, profileShifts = []) {
  return resolveCalendarRotation(shiftRotation, profileShifts);
}

export function resolveDailyLogShiftForDate({
  dayId = "",
  scheduleDays = [],
  shiftRotation = {},
  profileShifts = [],
  filterShift = "All",
} = {}) {
  const resolved = resolveDailyLogRotation(shiftRotation, profileShifts);
  const onDutyShift = buildScheduleDayRecord(dayId, scheduleDays, resolved).shift || resolved.sequence[0] || "";

  if (filterShift && filterShift !== "All") {
    if (normalizeShift(filterShift) === normalizeShift(onDutyShift)) {
      return onDutyShift;
    }
  }

  return onDutyShift;
}

export function resolveDailyLogDefaultDate({
  person = null,
  shiftRotation = {},
  profileShifts = [],
  fromDate = new Date(),
} = {}) {
  const todayId = formatDayId(fromDate);
  const resolved = resolveDailyLogRotation(shiftRotation, profileShifts);
  const personShift = person?.shift || "";

  if (!personShift) return todayId;

  const isRotationShift = resolved.sequence.some(
    (label) => normalizeShift(label) === normalizeShift(personShift)
  );
  if (!isRotationShift) return todayId;

  if (isPlatoonWorkDay(fromDate, personShift, resolved)) {
    return todayId;
  }

  return resolveNextPlatoonWorkDay(personShift, resolved, fromDate, { includeToday: false }) || todayId;
}

export function resolveDailyLogDefaultFilterShift({
  person = null,
  shiftRotation = {},
  profileShifts = [],
} = {}) {
  const personShift = person?.shift || "";
  if (!personShift) return "All";

  const resolved = resolveDailyLogRotation(shiftRotation, profileShifts);
  const isRotationShift = resolved.sequence.some(
    (label) => normalizeShift(label) === normalizeShift(personShift)
  );

  return isRotationShift ? personShift : "All";
}
