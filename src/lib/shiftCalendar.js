import {
  defaultShiftRotation,
  normalizeShiftRotation,
} from "../data/defaultShiftRotation.js";

function stripTime(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatDayId(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDayId(id) {
  const [year, month, day] = String(id).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function isSameDay(a, b) {
  return stripTime(a) === stripTime(b);
}

export function resolveShiftRotation(input, profileShifts = []) {
  return normalizeShiftRotation(input || defaultShiftRotation, profileShifts);
}

export function shiftForDate(date, rotation = defaultShiftRotation) {
  const sequence = rotation.sequence?.length ? rotation.sequence : defaultShiftRotation.sequence;
  const anchor = parseDayId(rotation.anchorDate || defaultShiftRotation.anchorDate);
  const anchorShift = sequence.includes(rotation.anchorShift) ? rotation.anchorShift : sequence[0];
  const anchorIndex = sequence.indexOf(anchorShift);
  const offset = Math.round((stripTime(date) - stripTime(anchor)) / 86400000);
  const index = ((anchorIndex + offset) % sequence.length + sequence.length) % sequence.length;
  return sequence[index];
}

function normalizeShiftLabel(value = "") {
  return String(value).trim().toLowerCase();
}

export function isPlatoonWorkDay(date, shiftLabel = "", rotation = defaultShiftRotation) {
  const shift = normalizeShiftLabel(shiftLabel);
  if (!shift) return false;
  const resolved = resolveShiftRotation(rotation);
  return normalizeShiftLabel(shiftForDate(date, resolved)) === shift;
}

export function resolveNextPlatoonWorkDay(
  shiftLabel = "",
  rotation = defaultShiftRotation,
  fromDate = new Date(),
  { includeToday = true } = {}
) {
  const shift = normalizeShiftLabel(shiftLabel);
  if (!shift) return null;

  const resolved = resolveShiftRotation(rotation);
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const startOffset = includeToday ? 0 : 1;

  for (let offset = startOffset; offset < 366; offset += 1) {
    const candidate = new Date(start);
    candidate.setDate(start.getDate() + offset);
    if (normalizeShiftLabel(shiftForDate(candidate, resolved)) === shift) {
      return formatDayId(candidate);
    }
  }

  return null;
}

export function buildScheduleDayRecord(dayId = "", scheduleDays = [], rotation = defaultShiftRotation) {
  const date = parseDayId(dayId);
  const resolved = resolveShiftRotation(rotation);
  const shift = shiftForDate(date, resolved);
  const defaults = defaultCoverage(shift, resolved);
  const saved = (Array.isArray(scheduleDays) ? scheduleDays : []).find((day) => day.id === dayId);

  if (saved) {
    return {
      ...saved,
      id: dayId,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shift,
      staffed: saved.staffed ?? defaults.staffed,
      minimum: saved.minimum ?? defaults.minimum,
      leave: saved.leave ?? defaults.leave,
      status: saved.status ?? defaults.status,
    };
  }

  return {
    id: dayId,
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    shift,
    staffed: defaults.staffed,
    minimum: defaults.minimum,
    leave: defaults.leave,
    status: defaults.status,
  };
}

export function isDarkShiftColor(color = "") {
  const normalized = String(color).toLowerCase();
  return normalized === "#000" || normalized === "#000000" || normalized.startsWith("rgb(0");
}

function parseHexColor(color = "") {
  const normalized = String(color).trim().toLowerCase();
  if (isDarkShiftColor(normalized)) {
    return { r: 0, g: 0, b: 0 };
  }

  const hex = normalized.replace("#", "");
  if (hex.length === 3) {
    return {
      r: parseInt(hex[0] + hex[0], 16),
      g: parseInt(hex[1] + hex[1], 16),
      b: parseInt(hex[2] + hex[2], 16),
    };
  }

  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }

  return { r: 100, g: 116, b: 139 };
}

function textColorForBackground(color = "") {
  const { r, g, b } = parseHexColor(color);
  const luminance = (0.299 * r) + (0.587 * g) + (0.114 * b);
  return luminance > 168 ? "#0f172a" : "#ffffff";
}

export function shiftCalendarStyle(shiftLabel, rotation = defaultShiftRotation) {
  const color = rotation.shiftColors?.[shiftLabel] || "#64748b";
  const fill = isDarkShiftColor(color) ? "#000000" : color;
  const text = textColorForBackground(fill);

  return {
    "--shift-fill": fill,
    "--shift-text": text,
    "--shift-muted": text === "#ffffff" ? "rgba(255, 255, 255, 0.78)" : "rgba(15, 23, 42, 0.72)",
  };
}

export function staffingPercent(staffed = 0, minimum = 1) {
  if (!minimum) return 100;
  return Math.min(100, Math.round((staffed / minimum) * 100));
}

export function shiftShortLabel(shiftLabel) {
  return String(shiftLabel).replace(/\s*shift\s*$/i, "").trim() || shiftLabel;
}

const SHIFT_LEGEND_RANK = {
  a: 0,
  b: 1,
  c: 2,
};

export function orderShiftLegendSequence(sequence = []) {
  return [...new Set((Array.isArray(sequence) ? sequence : []).filter(Boolean))].sort((left, right) => {
    const leftRank = SHIFT_LEGEND_RANK[shiftShortLabel(left).toLowerCase()] ?? 99;
    const rightRank = SHIFT_LEGEND_RANK[shiftShortLabel(right).toLowerCase()] ?? 99;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return shiftShortLabel(left).localeCompare(shiftShortLabel(right), undefined, { sensitivity: "base" });
  });
}

export const STAFFING_DEFICIT_LEGEND_LABEL = "Staffing Deficit";

function defaultCoverage(shift, rotation) {
  const sequence = rotation?.sequence || defaultShiftRotation.sequence;
  const index = sequence.indexOf(shift);
  if (index === 1 || sequence.length === 2) {
    return { staffed: 20, minimum: 21, leave: 2, status: "Deficit" };
  }
  return { staffed: 21, minimum: 21, leave: 1, status: "Complete" };
}

export function buildMonthCalendar(year, month, existingDays = [], rotation = defaultShiftRotation) {
  const resolvedRotation = resolveShiftRotation(rotation);
  const existingById = Object.fromEntries(
    (Array.isArray(existingDays) ? existingDays : []).map((day) => [day.id, day])
  );
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells = [];

  for (let index = 0; index < firstOfMonth.getDay(); index += 1) {
    cells.push({ kind: "padding", key: `pad-start-${index}` });
  }

  for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber += 1) {
    const date = new Date(year, month, dayNumber);
    const id = formatDayId(date);
    const shift = shiftForDate(date, resolvedRotation);
    const saved = existingById[id];
    const defaults = defaultCoverage(shift, resolvedRotation);

    cells.push({
      kind: "day",
      id,
      weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      shift,
      staffed: saved?.staffed ?? defaults.staffed,
      minimum: saved?.minimum ?? defaults.minimum,
      leave: saved?.leave ?? defaults.leave,
      status: saved?.status ?? defaults.status,
      calendarDay: dayNumber,
      isToday: isSameDay(date, today),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ kind: "padding", key: `pad-end-${cells.length}` });
  }

  return cells;
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}
