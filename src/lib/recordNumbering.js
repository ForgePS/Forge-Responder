/**
 * Record numbers like PP-2026-0001, INS-2026-0042 or NERIS-2026-014.
 *
 * The real number comes from a shared counter in Firestore (see recordCounters.js),
 * so two people creating at the same moment never get the same number. This file
 * holds the pure parts — formatting, parsing and choosing the number — so it can be
 * unit tested without Firebase.
 */

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The text every number for this year starts with, e.g. "INS-2026-". */
export function yearNumberPrefix({ prefix, separator = "-", year }) {
  return `${prefix}${separator}${year}${separator}`;
}

/** Sequence part of a number for this prefix/year, or 0 if it doesn't match. */
export function parseYearSequence(number, format) {
  const head = escapeRegExp(yearNumberPrefix(format));
  const match = new RegExp(`^${head}(\\d+)`).exec(String(number || "").trim());
  return match ? Number(match[1]) : 0;
}

export function formatYearNumber(format, sequence) {
  return `${yearNumberPrefix(format)}${String(sequence).padStart(format.padding || 1, "0")}`;
}

/** Highest sequence already used this year among the given numbers (0 if none). */
export function highestYearSequence(format, existingNumbers = []) {
  let highest = 0;
  for (const value of existingNumbers || []) {
    const sequence = parseYearSequence(value, format);
    if (sequence > highest) highest = sequence;
  }
  return highest;
}

/** Counter document id, e.g. "preplan-2026". */
export function counterKeyFor(kind, year) {
  return `${kind}-${year}`;
}

/** What the shared counter moves to: one past whichever is higher, the stored value or the floor. */
export function nextCounterValue(storedValue, floor = 0) {
  const stored = Number.isInteger(storedValue) && storedValue > 0 ? storedValue : 0;
  const base = Number.isInteger(floor) && floor > 0 ? floor : 0;
  return Math.max(stored, base) + 1;
}

/** Format the sequence, stepping past any number already in the taken set. */
function firstFreeNumber(format, sequence, taken) {
  let next = sequence;
  let candidate = formatYearNumber(format, next);
  while (taken.has(candidate)) {
    next += 1;
    candidate = formatYearNumber(format, next);
  }
  return candidate;
}

/** Offline/fallback choice: highest loaded + 1, skipping anything already taken. */
export function nextLocalYearNumber(format, existingNumbers = []) {
  const taken = new Set((existingNumbers || []).map((value) => String(value || "")));
  return firstFreeNumber(format, highestYearSequence(format, existingNumbers) + 1, taken);
}

/**
 * Pick the number for a new record.
 * `claim(floor)` should reserve and return the next sequence from the shared counter
 * (recordCounters.claimNextNumber). If it fails (offline, no permission), fall back
 * to "highest loaded + 1" so creating a record never breaks.
 *
 * @param {{prefix:string,separator?:string,padding:number,year:number}} format
 * @param {string[]} existingNumbers numbers already loaded on this screen
 * @param {(floor:number) => Promise<number>} [claim]
 * @returns {Promise<{ number: string, shared: boolean }>}
 */
export async function allocateYearNumber(format, existingNumbers = [], claim = null) {
  const taken = new Set((existingNumbers || []).map((value) => String(value || "")));
  const floor = highestYearSequence(format, existingNumbers);
  if (typeof claim === "function") {
    try {
      const sequence = await claim(floor);
      if (Number.isInteger(sequence) && sequence > 0) {
        return { number: firstFreeNumber(format, sequence, taken), shared: true };
      }
    } catch {
      // Fall back to the local choice below.
    }
  }
  return { number: firstFreeNumber(format, floor + 1, taken), shared: false };
}

/** Preplan numbers: PP-2026-0001. */
export function preplanNumberFormat(now = new Date()) {
  return { prefix: "PP", separator: "-", padding: 4, year: now.getFullYear() };
}

/** NERIS report numbers: NERIS-2026-014. */
export function nerisReportNumberFormat(now = new Date()) {
  return { prefix: "NERIS", separator: "-", padding: 3, year: now.getFullYear() };
}
