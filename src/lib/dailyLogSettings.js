import { DEFAULT_SHIFT_CHANGE_TIME } from "./dailyLogLock.js";

export const defaultDailyLogSettings = {
  shiftChangeTime: DEFAULT_SHIFT_CHANGE_TIME,
};

export function normalizeDailyLogSettings(input = {}) {
  const raw = String(input?.shiftChangeTime || defaultDailyLogSettings.shiftChangeTime).trim();
  if (/^\d{4}$/.test(raw)) {
    return { shiftChangeTime: `${raw.slice(0, 2)}:${raw.slice(2, 4)}` };
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(":");
    return { shiftChangeTime: `${hours.padStart(2, "0")}:${minutes}` };
  }
  return { shiftChangeTime: defaultDailyLogSettings.shiftChangeTime };
}
