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

export function getPayPeriodLengthDays(payPeriod = {}) {
  return payPeriodDayCount(normalizePayPeriod(payPeriod));
}

export function getPayPeriodBoundaryForDay(dayId = "", payPeriod = {}) {
  if (!dayId) return { isStart: false, isEnd: false };

  const normalized = normalizePayPeriod(payPeriod);
  const lengthDays = getPayPeriodLengthDays(normalized);
  const anchorTime = stripTime(parseDayId(normalized.startDate));
  const dayTime = stripTime(parseDayId(dayId));
  const diffDays = Math.round((dayTime - anchorTime) / 86400000);
  const mod = ((diffDays % lengthDays) + lengthDays) % lengthDays;

  return {
    isStart: mod === 0,
    isEnd: mod === lengthDays - 1,
  };
}

export function resolvePayPeriodForDay(dayId = "", payPeriod = {}) {
  const normalized = normalizePayPeriod(payPeriod);
  const lengthDays = getPayPeriodLengthDays(normalized);
  const anchor = parseDayId(normalized.startDate);
  const anchorTime = stripTime(anchor);
  const dayTime = stripTime(parseDayId(dayId || normalized.startDate));
  const diffDays = Math.round((dayTime - anchorTime) / 86400000);
  const periodIndex = Math.floor(diffDays / lengthDays);

  const start = new Date(anchor);
  start.setDate(start.getDate() + (periodIndex * lengthDays));
  const end = new Date(start);
  end.setDate(end.getDate() + lengthDays - 1);

  return {
    startDate: formatDayId(start),
    endDate: formatDayId(end),
  };
}

export function isDayInPayPeriod(dayId = "", payPeriod = {}) {
  const normalized = normalizePayPeriod(payPeriod);
  if (!dayId) return false;
  const containing = resolvePayPeriodForDay(dayId, normalized);
  const day = stripTime(parseDayId(dayId));
  const start = stripTime(parseDayId(containing.startDate));
  const end = stripTime(parseDayId(containing.endDate));
  return day >= start && day <= end;
}

export function isPayPeriodStart(dayId = "", payPeriod = {}) {
  return getPayPeriodBoundaryForDay(dayId, payPeriod).isStart;
}

export function isPayPeriodEnd(dayId = "", payPeriod = {}) {
  return getPayPeriodBoundaryForDay(dayId, payPeriod).isEnd;
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
