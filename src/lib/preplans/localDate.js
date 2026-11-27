/**
 * Calendar dates for preplan verification and alert review. A date-only value
 * ("2026-11-24") is the day as the department sees it, so it is taken from the
 * local clock, not from UTC: an approval at 10:48 PM Central on Nov 24 is Nov 24.
 */

/** "YYYY-MM-DD" for a Date in local time. */
export function localDateKey(date = new Date()) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** Local date `days` from `from`, as "YYYY-MM-DD". */
export function addDaysKey(days = 0, from = new Date()) {
  const value = new Date(from.getTime());
  value.setDate(value.getDate() + Number(days || 0));
  return localDateKey(value);
}

/**
 * Normalize a stored value to "YYYY-MM-DD": a date-only string is kept as is;
 * a timestamp ("2026-11-25T04:48:00.000Z") becomes its local calendar date.
 */
export function dateKeyOf(value) {
  const textValue = String(value || "").trim();
  if (!textValue) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(textValue)) return textValue;
  return localDateKey(new Date(textValue)) || textValue.slice(0, 10);
}
