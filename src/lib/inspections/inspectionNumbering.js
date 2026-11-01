/**
 * Inspection numbers look like INS-2026-0042. The sequence is "highest number
 * already used this year + 1" (not "how many records exist + 1"), so deleting or
 * archiving records, or loading only part of the list, never hands out a
 * number that is already taken. Firebase-free so it can be unit tested.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function resolveNumberingFormat(settings = null, now = new Date()) {
  const numbering = settings?.numbering || {};
  const padding = Number(numbering.sequencePadding);
  return {
    prefix: numbering.prefix || "INS",
    separator: numbering.separator ?? "-",
    padding: Number.isFinite(padding) && padding > 0 ? Math.min(padding, 8) : 4,
    year: now.getFullYear(),
  };
}

/** The text every number for this year starts with, e.g. "INS-2026-". */
export function inspectionNumberYearPrefix({ prefix, separator, year }) {
  return `${prefix}${separator}${year}${separator}`;
}

/** Sequence part of a number for this prefix/year, or 0 if it doesn't match. */
export function parseInspectionSequence(number, format) {
  const head = escapeRegExp(inspectionNumberYearPrefix(format));
  const match = new RegExp(`^${head}(\\d+)`).exec(String(number || ""));
  return match ? Number(match[1]) : 0;
}

export function formatInspectionNumber(format, sequence) {
  return `${inspectionNumberYearPrefix(format)}${String(sequence).padStart(format.padding, "0")}`;
}

/**
 * Next free number given the numbers already in use.
 * @param {{prefix:string,separator:string,padding:number,year:number}} format
 * @param {string[]} existingNumbers
 */
export function nextInspectionNumber(format, existingNumbers = []) {
  const taken = new Set((existingNumbers || []).map((value) => String(value || "")));
  let highest = 0;
  for (const value of taken) {
    highest = Math.max(highest, parseInspectionSequence(value, format));
  }
  let sequence = highest + 1;
  let candidate = formatInspectionNumber(format, sequence);
  while (taken.has(candidate)) {
    sequence += 1;
    candidate = formatInspectionNumber(format, sequence);
  }
  return candidate;
}

/** Example for settings screens, e.g. "INS-2026-0001". */
export function describeNumberingFormat(settings = null, now = new Date()) {
  return formatInspectionNumber(resolveNumberingFormat(settings, now), 1);
}
