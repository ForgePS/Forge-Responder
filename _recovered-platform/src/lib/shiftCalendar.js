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

export function shiftCalendarStyle(shiftLabel, rotation = defaultShiftRotation) {
  const color = rotation.shiftColors?.[shiftLabel] || "#64748b";
  const normalized = String(color).toLowerCase();
  const isDark = normalized === "#000" || normalized === "#000000" || normalized.startsWith("rgb(0");

  if (isDark) {
    return {
      borderTopColor: "#000000",
      background: "linear-gradient(to bottom, rgba(0, 0, 0, 0.55) 0%, #071827 32%)",
    };
  }

  return {
    borderTopColor: color,
    background: "#071827",
  };
}

export function shiftShortLabel(shiftLabel) {
  return String(shiftLabel).replace(/\s*shift\s*$/i, "").trim() || shiftLabel;
}

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
