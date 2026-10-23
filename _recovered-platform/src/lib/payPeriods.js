import { formatDayId, parseDayId } from "./shiftCalendar.js";

export const defaultPayPeriod = {
  startDate: "2026-06-07",
  endDate: "2026-06-20",
};

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function normalizePayPeriod(input = {}) {
  const fallback = defaultPayPeriod;
  const startDate = String(input.startDate || fallback.startDate).slice(0, 10);
  let endDate = String(input.endDate || fallback.endDate).slice(0, 10);

  const start = parseDayId(startDate);
  const end = parseDayId(endDate);
  if (stripTime(end) < stripTime(start)) {
    endDate = startDate;
  }

  return { startDate, endDate };
}

export function payPeriodDayCount(payPeriod = {}) {
  const normalized = normalizePayPeriod(payPeriod);
  const start = stripTime(parseDayId(normalized.startDate));
  const end = stripTime(parseDayId(normalized.endDate));
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

export function isDayInPayPeriod(dayId = "", payPeriod = {}) {
  const normalized = normalizePayPeriod(payPeriod);
  if (!dayId) return false;
  const day = stripTime(parseDayId(dayId));
  const start = stripTime(parseDayId(normalized.startDate));
  const end = stripTime(parseDayId(normalized.endDate));
  return day >= start && day <= end;
}

export function formatPayPeriodLabel(payPeriod = {}) {
  const normalized = normalizePayPeriod(payPeriod);
  const start = parseDayId(normalized.startDate);
  const end = parseDayId(normalized.endDate);
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startLabel} – ${endLabel}`;
}

export function computePayPeriodEnd(startDate = "", lengthDays = 14) {
  const start = parseDayId(startDate);
  const end = new Date(start);
  end.setDate(end.getDate() + Math.max(1, lengthDays) - 1);
  return formatDayId(end);
}
