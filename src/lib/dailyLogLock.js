import { parseDayId } from "./shiftCalendar.js";

export const DEFAULT_SHIFT_CHANGE_TIME = "07:00";
export const AUTO_LOCK_HOURS_AFTER_SHIFT_CHANGE = 3;

export function parseShiftChangeTime(time = DEFAULT_SHIFT_CHANGE_TIME) {
  const normalized = String(time || DEFAULT_SHIFT_CHANGE_TIME).trim();
  if (/^\d{4}$/.test(normalized)) {
    return {
      hours: Number(normalized.slice(0, 2)),
      minutes: Number(normalized.slice(2, 4)),
    };
  }
  const [hours, minutes] = normalized.split(":").map((part) => Number(part));
  return {
    hours: Number.isFinite(hours) ? hours : 7,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
}

export function resolveAutoLockAt(logDate = "", shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME) {
  if (!logDate) return "";
  const endOfShift = parseDayId(logDate);
  endOfShift.setDate(endOfShift.getDate() + 1);
  const { hours, minutes } = parseShiftChangeTime(shiftChangeTime);
  endOfShift.setHours(hours + AUTO_LOCK_HOURS_AFTER_SHIFT_CHANGE, minutes, 0, 0);
  return endOfShift.toISOString();
}

export function formatAutoLockLabel(isoValue = "") {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function shouldAutoLockRecord(record = {}, shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME, now = new Date()) {
  if (record.locked) return false;
  const autoLockAt = record.autoLockAt || resolveAutoLockAt(record.date, shiftChangeTime);
  if (!autoLockAt) return false;
  return now.getTime() >= new Date(autoLockAt).getTime();
}

export function isDailyLogLocked(record = {}, shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME, now = new Date()) {
  if (record.locked) return true;
  return shouldAutoLockRecord(record, shiftChangeTime, now);
}

export function lockDailyLogRecord(record = {}, { actorName = "User", lockType = "manual", shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME } = {}) {
  const now = new Date().toISOString();
  return {
    ...record,
    locked: true,
    lockType,
    lockedAt: now,
    lockedBy: actorName,
    autoLockAt: record.autoLockAt || resolveAutoLockAt(record.date, shiftChangeTime),
    unlockedAt: "",
    unlockedBy: "",
    updatedAt: now,
    updatedBy: actorName,
  };
}

export function unlockDailyLogRecord(record = {}, { actorName = "Admin" } = {}) {
  const now = new Date().toISOString();
  return {
    ...record,
    locked: false,
    lockType: "",
    lockedAt: "",
    lockedBy: "",
    unlockedAt: now,
    unlockedBy: actorName,
    updatedAt: now,
    updatedBy: actorName,
  };
}

export function applyAutoLocksToDailyLogs(
  records = [],
  shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME,
  now = new Date(),
) {
  let changed = false;
  const next = records.map((record) => {
    if (shouldAutoLockRecord(record, shiftChangeTime, now)) {
      changed = true;
      return lockDailyLogRecord(record, {
        actorName: "System",
        lockType: "auto",
        shiftChangeTime,
      });
    }
    const autoLockAt = record.autoLockAt || resolveAutoLockAt(record.date, shiftChangeTime);
    if (autoLockAt && autoLockAt !== record.autoLockAt) {
      changed = true;
      return { ...record, autoLockAt };
    }
    return record;
  });
  return changed ? next : records;
}

export function dailyLogLockStatus(record = {}, shiftChangeTime = DEFAULT_SHIFT_CHANGE_TIME, now = new Date()) {
  if (!record?.date) return { locked: false, label: "Draft", tone: "neutral" };
  if (record.locked) {
    if (record.lockType === "auto") {
      return { locked: true, label: "Auto-locked", tone: "warning" };
    }
    return { locked: true, label: "Locked", tone: "critical" };
  }
  if (shouldAutoLockRecord(record, shiftChangeTime, now)) {
    return { locked: true, label: "Auto-locked", tone: "warning" };
  }
  const autoLockAt = record.autoLockAt || resolveAutoLockAt(record.date, shiftChangeTime);
  return {
    locked: false,
    label: `Auto-lock ${formatAutoLockLabel(autoLockAt)}`,
    tone: "info",
    autoLockAt,
  };
}
