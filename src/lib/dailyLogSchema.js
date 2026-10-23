import { restoreFromFirestore } from "./firestoreSanitize.js";

export const DAILY_LOG_FIELD_DEFAULTS = {
  id: "",
  date: "",
  shift: "",
  apparatus: "",
  crew: [],
  notes: "",
  locked: false,
  lockType: "",
  lockedAt: "",
  lockedBy: "",
  autoLockAt: "",
  unlockedAt: "",
  unlockedBy: "",
  createdAt: "",
  updatedAt: "",
  updatedBy: "",
};

export function buildDailyLogId(date = "", shift = "", apparatus = "") {
  const day = String(date || "").trim();
  const shiftKey = String(shift || "shift").replace(/[^a-zA-Z0-9]+/g, "-");
  const unitKey = String(apparatus || "unit").replace(/[^a-zA-Z0-9]+/g, "-");
  return `DL-${day}-${shiftKey}-${unitKey}`;
}

export function normalizeDailyLogRecord(record = {}, index = 0) {
  const restored = restoreFromFirestore(record);
  const date = String(restored.date || "").trim();
  const shift = String(restored.shift || "").trim();
  const apparatus = String(restored.apparatus || "").trim();
  const id = String(restored.id || "").trim() || buildDailyLogId(date, shift, apparatus) || `DL-${index + 1}`;

  let crew = restored.crew;
  if (typeof crew === "string") {
    crew = crew.split(",").map((name) => name.trim()).filter(Boolean);
  }
  if (!Array.isArray(crew)) crew = [];

  return {
    ...DAILY_LOG_FIELD_DEFAULTS,
    ...restored,
    id,
    date,
    shift,
    apparatus,
    crew,
    notes: String(restored.notes || ""),
    locked: Boolean(restored.locked),
    lockType: String(restored.lockType || ""),
    lockedAt: String(restored.lockedAt || ""),
    lockedBy: String(restored.lockedBy || ""),
    autoLockAt: String(restored.autoLockAt || ""),
    unlockedAt: String(restored.unlockedAt || ""),
    unlockedBy: String(restored.unlockedBy || ""),
    createdAt: String(restored.createdAt || ""),
    updatedAt: String(restored.updatedAt || ""),
    updatedBy: String(restored.updatedBy || ""),
  };
}

export function normalizeDailyLogList(items = []) {
  const seenIds = new Set();
  return items.map((item, index) => {
    const normalized = normalizeDailyLogRecord(item, index);
    let id = normalized.id;
    if (seenIds.has(id)) {
      id = `${id}-${index + 1}`;
    }
    seenIds.add(id);
    return id === normalized.id ? normalized : { ...normalized, id };
  });
}

export function createEmptyDailyLog(overrides = {}) {
  return normalizeDailyLogRecord({
    ...DAILY_LOG_FIELD_DEFAULTS,
    createdAt: new Date().toISOString(),
    ...overrides,
  });
}

export function dailyLogSummary(record = {}) {
  return [record.shift, record.apparatus, record.crew?.length ? `${record.crew.length} crew` : ""]
    .filter(Boolean)
    .join(" · ");
}
