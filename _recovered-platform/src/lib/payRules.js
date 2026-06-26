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

function normalizeHoliday(entry = {}, index = 0) {
  const date = String(entry.date || "").slice(0, 10);
  const name = String(entry.name || "Holiday").trim() || "Holiday";
  const id = String(entry.id || `${date || "holiday"}-${index}`).trim();
  return { id, date, name };
}

export const defaultPayRules = {
  workDayHours: 24,
  overtimeThresholdHours: 96,
  overtimeMultiplier: 1.5,
  holidayPayMultiplier: 1.5,
  autoCalculateOvertime: true,
  holidays: [
    { id: "hol-2026-ny", date: "2026-01-01", name: "New Year's Day" },
    { id: "hol-2026-mem", date: "2026-05-25", name: "Memorial Day" },
    { id: "hol-2026-jul", date: "2026-07-04", name: "Independence Day" },
    { id: "hol-2026-lab", date: "2026-09-07", name: "Labor Day" },
    { id: "hol-2026-thx", date: "2026-11-26", name: "Thanksgiving Day" },
    { id: "hol-2026-xmas", date: "2026-12-25", name: "Christmas Day" },
  ],
};

export function normalizePayRules(input = {}) {
  const holidays = (Array.isArray(input.holidays) ? input.holidays : defaultPayRules.holidays)
    .map(normalizeHoliday)
    .filter((entry) => entry.date)
    .sort((left, right) => left.date.localeCompare(right.date));

  const seen = new Set();
  const uniqueHolidays = holidays.filter((entry) => {
    if (seen.has(entry.date)) return false;
    seen.add(entry.date);
    return true;
  });

  return {
    workDayHours: clampNumber(input.workDayHours, 1, 24, defaultPayRules.workDayHours),
    overtimeThresholdHours: clampNumber(
      input.overtimeThresholdHours,
      0,
      500,
      defaultPayRules.overtimeThresholdHours
    ),
    overtimeMultiplier: clampNumber(
      input.overtimeMultiplier,
      1,
      3,
      defaultPayRules.overtimeMultiplier
    ),
    holidayPayMultiplier: clampNumber(
      input.holidayPayMultiplier,
      1,
      3,
      defaultPayRules.holidayPayMultiplier
    ),
    autoCalculateOvertime: input.autoCalculateOvertime !== false,
    holidays: uniqueHolidays.length ? uniqueHolidays : [...defaultPayRules.holidays],
  };
}

export function isConfiguredHoliday(dayId = "", payRules = {}) {
  const normalizedDay = String(dayId || "").slice(0, 10);
  if (!normalizedDay) return false;
  return normalizePayRules(payRules).holidays.some((entry) => entry.date === normalizedDay);
}

export function resolveHolidayName(dayId = "", payRules = {}) {
  const normalizedDay = String(dayId || "").slice(0, 10);
  const match = normalizePayRules(payRules).holidays.find((entry) => entry.date === normalizedDay);
  return match?.name || "Holiday";
}

export function listUpcomingHolidays(payRules = {}, fromDayId = "", limit = 5) {
  const from = String(fromDayId || "").slice(0, 10);
  return normalizePayRules(payRules).holidays
    .filter((entry) => !from || entry.date >= from)
    .slice(0, limit);
}
