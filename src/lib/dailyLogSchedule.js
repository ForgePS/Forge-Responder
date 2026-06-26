import {
  buildScheduleDayRecord,
  formatDayId,
  isPlatoonWorkDay,
  resolveNextPlatoonWorkDay,
  resolveShiftRotation,
} from "./shiftCalendar.js";

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolveDailyLogRotation(shiftRotation = {}, profileShifts = []) {
  return resolveShiftRotation(shiftRotation, profileShifts);
}

export function resolveDailyLogShiftForDate({
  dayId = "",
  scheduleDays = [],
  shiftRotation = {},
  profileShifts = [],
} = {}) {
  const resolved = resolveDailyLogRotation(shiftRotation, profileShifts);
  return buildScheduleDayRecord(dayId, scheduleDays, resolved).shift || resolved.sequence[0] || "";
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
