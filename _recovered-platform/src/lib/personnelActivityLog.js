import { formatTimeLabel } from "./employeePortalWorkflow.js";

export const ACTIVITY_LOG_CATEGORIES = [
  "Vacation",
  "Sick",
  "Military Leave",
  "Shift Trade",
];

function normalizeText(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function resolveLeaveActivityCategory(leaveType = "") {
  const normalized = normalizeText(leaveType);
  if (normalized.includes("vacation") || normalized.includes("vac")) return "Vacation";
  if (normalized.includes("sick")) return "Sick";
  if (normalized.includes("military")) return "Military Leave";
  return null;
}

export function buildLeaveActivitySummary(leaveRequest = {}) {
  const parts = [leaveRequest.dates].filter(Boolean);
  const hours = leaveRequest.totalHours
    ? `${leaveRequest.totalHours} hrs`
    : leaveRequest.hours;
  if (hours) parts.push(hours);
  if (leaveRequest.startTime) {
    const finish = leaveRequest.finishTimeLabel || formatTimeLabel(leaveRequest.finishTime || "");
    parts.push(`${formatTimeLabel(leaveRequest.startTime)}-${finish.replace(" (next day)", "")}`);
  }
  return parts.join(" · ");
}

export function buildLeaveActivityEntry(leaveRequest = {}) {
  const category = resolveLeaveActivityCategory(leaveRequest.type);
  if (!category) return null;

  return {
    id: leaveRequest.id,
    category,
    sourceType: "leave",
    approvedAt: leaveRequest.battalionApprovedAt || leaveRequest.approvedAt || new Date().toISOString(),
    dates: leaveRequest.dates || "",
    startTime: leaveRequest.startTime || "",
    finishTime: leaveRequest.finishTime || "",
    finishTimeLabel: leaveRequest.finishTimeLabel || "",
    totalHours: leaveRequest.totalHours || leaveRequest.hours || "",
    summary: buildLeaveActivitySummary(leaveRequest),
  };
}

export function buildShiftTradeActivitySummary(trade = {}) {
  const parts = [`${trade.give || "—"} → ${trade.receive || "—"}`];
  if (trade.coverage) parts.push(`Coverage: ${trade.coverage}`);
  return parts.join(" · ");
}

export function buildShiftTradeActivityEntry(trade = {}) {
  return {
    id: trade.id,
    category: "Shift Trade",
    sourceType: "shiftTrade",
    approvedAt: trade.approvedAt || new Date().toISOString(),
    give: trade.give || "",
    receive: trade.receive || "",
    coverage: trade.coverage || "",
    summary: buildShiftTradeActivitySummary(trade),
  };
}

export function normalizeActivityLogEntry(entry = {}) {
  if (!entry?.id || !entry?.category) return null;
  return {
    id: String(entry.id),
    category: String(entry.category),
    sourceType: entry.sourceType || "",
    approvedAt: entry.approvedAt || "",
    dates: entry.dates || "",
    startTime: entry.startTime || "",
    finishTime: entry.finishTime || "",
    finishTimeLabel: entry.finishTimeLabel || "",
    totalHours: entry.totalHours || "",
    give: entry.give || "",
    receive: entry.receive || "",
    coverage: entry.coverage || "",
    summary: entry.summary || "",
  };
}

export function normalizeActivityLog(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeActivityLogEntry)
    .filter(Boolean);
}

export function personHasActivityLogEntry(person = {}, entryId = "") {
  const target = String(entryId || "").trim();
  if (!target) return false;
  return normalizeActivityLog(person.activityLog).some((entry) => entry.id === target);
}

export function appendActivityLogEntry(person = {}, entry = null) {
  const normalizedEntry = normalizeActivityLogEntry(entry);
  if (!normalizedEntry) return person;
  const current = normalizeActivityLog(person.activityLog);
  if (current.some((item) => item.id === normalizedEntry.id)) return person;
  return {
    ...person,
    activityLog: [normalizedEntry, ...current],
  };
}

export function appendActivityLogToPersonnel(personnel = [], personnelId = "", entry = null) {
  const id = String(personnelId || "").trim();
  if (!id) return personnel;
  return personnel.map((person) => (
    person.id === id ? appendActivityLogEntry(person, entry) : person
  ));
}

export function sortActivityLogEntries(entries = [], direction = "desc") {
  const sorted = [...entries].sort((left, right) => {
    const leftTime = Date.parse(left.approvedAt || "") || 0;
    const rightTime = Date.parse(right.approvedAt || "") || 0;
    return direction === "asc" ? leftTime - rightTime : rightTime - leftTime;
  });
  return sorted;
}

export function groupActivityLogByCategory(entries = []) {
  const grouped = Object.fromEntries(ACTIVITY_LOG_CATEGORIES.map((category) => [category, []]));
  sortActivityLogEntries(entries).forEach((entry) => {
    if (grouped[entry.category]) grouped[entry.category].push(entry);
  });
  return grouped;
}

export function formatActivityLogDate(value = "") {
  const parsed = Date.parse(value);
  if (!parsed) return "—";
  return new Date(parsed).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
