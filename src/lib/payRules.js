import { formatDayId } from "./shiftCalendar.js";

function clampNumber(value, min, max, fallback) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function clampInt(value, min, max, fallback) {
  const parsed = parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeHolidayDate(value = "") {
  if (!value) return "";
  if (typeof value === "object" && typeof value.toDate === "function") {
    return formatDayId(value.toDate());
  }
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return formatDayId(parsed);
  }
  return raw.slice(0, 10);
}

export const HOLIDAY_NON_WORK_DAY_OPTIONS = [
  {
    value: "payHolidayHours",
    label: "Pay configured holiday hours",
    description: "Members receive holiday hours when the holiday is not a scheduled platoon work day.",
  },
  {
    value: "none",
    label: "No automatic holiday pay",
    description: "The holiday appears on time sheets but no holiday hours are added automatically.",
  },
];

export const HOLIDAY_WORK_DAY_OPTIONS = [
  {
    value: "holidayOnly",
    label: "Holiday hours only",
    description: "Scheduled work on a holiday is paid as holiday hours instead of regular shift hours.",
  },
  {
    value: "regularOnly",
    label: "Regular shift hours only",
    description: "Members who are scheduled to work receive regular hours; holiday pay applies on off days only.",
  },
  {
    value: "regularAndHoliday",
    label: "Regular plus holiday hours",
    description: "Members scheduled to work receive both regular shift hours and holiday hours (double benefit).",
  },
];

export function normalizeHolidayPayPolicy(input = {}) {
  const source = input?.holidayPayPolicy && typeof input.holidayPayPolicy === "object"
    ? input.holidayPayPolicy
    : input;

  const nonWorkDay = HOLIDAY_NON_WORK_DAY_OPTIONS.some((option) => option.value === source.nonWorkDay)
    ? source.nonWorkDay
    : defaultPayRules.holidayPayPolicy.nonWorkDay;

  const workDay = HOLIDAY_WORK_DAY_OPTIONS.some((option) => option.value === source.workDay)
    ? source.workDay
    : defaultPayRules.holidayPayPolicy.workDay;

  return {
    nonWorkDay,
    workDay,
    requireShiftAssignment: source.requireShiftAssignment !== false,
  };
}

/**
 * Decide holiday vs regular pay for a calendar day.
 * Returns payHolidayHours, whether regular shift hours should accrue, and calendar display flag.
 */
export function resolveHolidayPayDecision({
  configuredHoliday = null,
  shift = "",
  isScheduledWorkDay = false,
  payRules = {},
} = {}) {
  const policy = normalizeHolidayPayPolicy(payRules);

  if (!configuredHoliday) {
    return { payHolidayHours: 0, earnRegularHours: false, displayHoliday: false };
  }

  if (policy.requireShiftAssignment && !String(shift || "").trim()) {
    return { payHolidayHours: 0, earnRegularHours: false, displayHoliday: true };
  }

  const paidHours = configuredHoliday.paidHours;

  if (!isScheduledWorkDay) {
    return {
      payHolidayHours: policy.nonWorkDay === "payHolidayHours" ? paidHours : 0,
      earnRegularHours: false,
      displayHoliday: true,
    };
  }

  switch (policy.workDay) {
    case "regularOnly":
      return { payHolidayHours: 0, earnRegularHours: true, displayHoliday: true };
    case "regularAndHoliday":
      return { payHolidayHours: paidHours, earnRegularHours: true, displayHoliday: true };
    case "holidayOnly":
    default:
      return { payHolidayHours: paidHours, earnRegularHours: false, displayHoliday: true };
  }
}

function normalizeHoliday(entry = {}, index = 0, fallbackPaidHours = 24) {
  const date = normalizeHolidayDate(entry.date);
  const name = String(entry.name || "Holiday").trim() || "Holiday";
  const id = String(entry.id || `${date || "holiday"}-${index}`).trim();
  return {
    id,
    date,
    name,
    paidHours: clampNumber(entry.paidHours, 0, 24, fallbackPaidHours),
  };
}

export const defaultPayRules = {
  workDayHours: 24,
  defaultHolidayPaidHours: 24,
  overtimeThresholdHours: 106,
  overtimeMultiplier: 1.5,
  holidayPayMultiplier: 1,
  autoCalculateOvertime: true,
  holidayPayPolicy: {
    nonWorkDay: "payHolidayHours",
    workDay: "holidayOnly",
    requireShiftAssignment: true,
  },
  holidays: [
    { id: "hol-2026-ny", date: "2026-01-01", name: "New Year's Day", paidHours: 24 },
    { id: "hol-2026-mem", date: "2026-05-25", name: "Memorial Day", paidHours: 24 },
    { id: "hol-2026-jul", date: "2026-07-04", name: "Independence Day", paidHours: 24 },
    { id: "hol-2026-lab", date: "2026-09-07", name: "Labor Day", paidHours: 24 },
    { id: "hol-2026-thx", date: "2026-11-26", name: "Thanksgiving Day", paidHours: 24 },
    { id: "hol-2026-xmas", date: "2026-12-25", name: "Christmas Day", paidHours: 24 },
  ],
};

/** Horn Lake: OT begins after 106 actual worked hours. Migrate legacy 96 default on read. */
function resolveOvertimeThresholdHours(input = {}) {
  const raw = input.overtimeThresholdHours;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return defaultPayRules.overtimeThresholdHours;
  }
  const parsed = clampNumber(raw, 0, 500, defaultPayRules.overtimeThresholdHours);
  if (parsed === 96) return defaultPayRules.overtimeThresholdHours;
  return parsed;
}

export function normalizePayRules(input = {}) {
  const workDayHours = clampNumber(input.workDayHours, 1, 24, defaultPayRules.workDayHours);
  const defaultHolidayPaidHours = (
    input.defaultHolidayPaidHours === undefined
    || input.defaultHolidayPaidHours === null
    || String(input.defaultHolidayPaidHours).trim() === ""
  )
    ? workDayHours
    : clampNumber(input.defaultHolidayPaidHours, 0, 24, workDayHours);

  const holidaysSource = Array.isArray(input.holidays) ? input.holidays : defaultPayRules.holidays;
  const holidays = holidaysSource
    .map((entry, index) => normalizeHoliday(entry, index, defaultHolidayPaidHours))
    .filter((entry) => entry.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  const seen = new Set();
  const uniqueHolidays = holidays.filter((entry) => {
    if (seen.has(entry.date)) return false;
    seen.add(entry.date);
    return true;
  });

  return {
    workDayHours,
    defaultHolidayPaidHours,
    overtimeThresholdHours: resolveOvertimeThresholdHours(input),
    overtimeMultiplier: clampNumber(
      input.overtimeMultiplier,
      1,
      3,
      defaultPayRules.overtimeMultiplier
    ),
    holidayPayMultiplier: 1,
    autoCalculateOvertime: input.autoCalculateOvertime !== false,
    holidayPayPolicy: normalizeHolidayPayPolicy(input),
    holidays: uniqueHolidays.length > 0
      ? uniqueHolidays
      : [...defaultPayRules.holidays],
  };
}

export function isConfiguredHoliday(dayId = "", payRules = {}) {
  const normalizedDay = normalizeHolidayDate(dayId);
  if (!normalizedDay) return false;
  return normalizePayRules(payRules).holidays.some((entry) => entry.date === normalizedDay);
}

export function resolveHolidayName(dayId = "", payRules = {}) {
  const normalizedDay = normalizeHolidayDate(dayId);
  const match = normalizePayRules(payRules).holidays.find((entry) => entry.date === normalizedDay);
  return match?.name || "Holiday";
}

export function resolveHolidayPaidHours(dayId = "", payRules = {}) {
  const normalizedDay = normalizeHolidayDate(dayId);
  const normalized = normalizePayRules(payRules);
  const match = normalized.holidays.find((entry) => entry.date === normalizedDay);
  return match?.paidHours ?? normalized.defaultHolidayPaidHours ?? normalized.workDayHours;
}

export function resolveConfiguredHolidayForDay(dayId = "", payRules = {}) {
  const normalizedDay = normalizeHolidayDate(dayId);
  if (!normalizedDay || !isConfiguredHoliday(normalizedDay, payRules)) return null;

  const normalized = normalizePayRules(payRules);
  const match = normalized.holidays.find((entry) => entry.date === normalizedDay);
  if (!match) return null;

  return {
    date: match.date,
    name: match.name,
    paidHours: resolveHolidayPaidHours(normalizedDay, normalized),
  };
}

export function listUpcomingHolidays(payRules = {}, fromDayId = "", limit = 5) {
  const from = String(fromDayId || "").slice(0, 10);
  return normalizePayRules(payRules).holidays
    .filter((entry) => !from || entry.date >= from)
    .slice(0, limit);
}
