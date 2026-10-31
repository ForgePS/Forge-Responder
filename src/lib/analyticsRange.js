/**
 * Date-range helpers for the general Analytics page (30 / 60 / 90 days / year to date).
 *
 * Pure functions, no Firebase or React, so they can be unit tested.
 *
 * Honesty rules:
 * - A date without a year ("Jun 7") is not guessed; that record has no usable date.
 * - Records without a usable date are left out of a date-filtered view and counted,
 *   so the page can say how many were left out.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export const ANALYTICS_RANGES = [
  { id: "30", label: "30 days" },
  { id: "60", label: "60 days" },
  { id: "90", label: "90 days" },
  { id: "YTD", label: "Year to date" },
];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Parse a record date. Accepts ISO dates ("2026-06-07", "2026-06-07T14:00") and
 * written dates that include a year ("Jun 7, 2026"). Returns null otherwise.
 * @param {unknown} value
 * @returns {Date | null}
 */
export function parseRecordDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/.exec(text);
  if (iso) {
    if (text.length > 10) {
      const full = new Date(text);
      if (!Number.isNaN(full.getTime())) return full;
    }
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d.getMonth() === Number(iso[2]) - 1 ? d : null;
  }
  // Written dates must carry a 4-digit year; "Jun 7" would otherwise parse as 2001.
  if (!/\b\d{4}\b/.test(text)) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * @param {string} range "30" | "60" | "90" | "YTD"
 * @param {Date} [today]
 * @returns {{ start: Date, end: Date, label: string }}
 */
export function rangeWindow(range, today = new Date()) {
  const day = startOfDay(today);
  const end = new Date(day.getTime() + DAY_MS - 1);
  if (range === "YTD") {
    return { start: new Date(day.getFullYear(), 0, 1), end, label: `since Jan 1, ${day.getFullYear()}` };
  }
  const days = Number(range) || 30;
  // "Last 30 days" = today and the 29 days before it.
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - (days - 1));
  return { start, end, label: `last ${days} days` };
}

/**
 * Keep records whose date falls inside the range window.
 * @template T
 * @param {T[]} records
 * @param {(record: T) => unknown} getDate
 * @param {string} range
 * @param {Date} [today]
 * @returns {{ rows: T[], undated: number, total: number }}
 */
export function filterByRange(records = [], getDate, range, today = new Date()) {
  const { start, end } = rangeWindow(range, today);
  const rows = [];
  let undated = 0;
  for (const record of records) {
    const date = parseRecordDate(getDate(record));
    if (!date) {
      undated += 1;
      continue;
    }
    if (date >= start && date <= end) rows.push(record);
  }
  return { rows, undated, total: records.length };
}

/**
 * Whole days from today until the given date (negative = past). Null when the date isn't usable.
 * @param {unknown} value
 * @param {Date} [today]
 */
export function daysFromToday(value, today = new Date()) {
  const date = parseRecordDate(value);
  if (!date) return null;
  return Math.round((startOfDay(date) - startOfDay(today)) / DAY_MS);
}
