import { resolveShiftBattalionChief } from "./employeePortalWorkflow.js";
import { getPersonDisplayName } from "./personnelSchema.js";
import { formatDayId, parseDayId, shiftForDate } from "./shiftCalendar.js";
import {
  buildDayScheduleSnapshot,
  buildOpenVacanciesForDay,
} from "./schedulingRoster.js";

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function shiftsMatch(left = "", right = "") {
  return normalizeShift(left) === normalizeShift(right);
}

export function isOppositeShiftVacancyDay(personShift = "", dayShift = "") {
  const normalizedPersonShift = normalizeShift(personShift);
  const normalizedDayShift = normalizeShift(dayShift);
  if (!normalizedPersonShift || !normalizedDayShift) return false;
  return normalizedPersonShift !== normalizedDayShift;
}

export function buildVacancyPickupId(existing = []) {
  const base = 700 + (Array.isArray(existing) ? existing.length : 0);
  return `PU-${base}`;
}

export function buildVacancyPickupMeta(person = {}, personnel = [], vacancyShift = "") {
  const targetShift = String(vacancyShift || "").trim();
  const battalionChief = resolveShiftBattalionChief(personnel, targetShift);
  return {
    status: "Pending Battalion Chief",
    approvalStage: "battalionChief",
    assignedBattalionChief: battalionChief?.name || `${targetShift || "Shift"} Battalion Chief`,
    assignedBattalionChiefId: battalionChief?.id || "",
    vacancyShift: targetShift,
    requesterShift: person.shift || "",
  };
}

export function buildVacancyPickupRecord({
  person = {},
  personnel = [],
  vacancy = {},
  message = "",
  existingPickups = [],
  rotation = {},
} = {}) {
  const dayId = vacancy.dayId || "";
  const date = vacancy.date || (dayId
    ? parseDayId(dayId).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "");
  const vacancyShift = vacancy.shift
    || (dayId ? shiftForDate(parseDayId(dayId), rotation) : "")
    || "";

  return {
    id: buildVacancyPickupId(existingPickups),
    person: getPersonDisplayName(person),
    personnelId: person.id || "",
    requesterShift: person.shift || "",
    dayId,
    date,
    shift: vacancyShift,
    vacancyId: vacancy.id || "",
    vacancyType: vacancy.type || "apparatus",
    apparatus: vacancy.apparatus || "",
    position: vacancy.position || "Firefighter",
    vacancyLabel: vacancy.label || vacancy.apparatus || "Open shift",
    message: String(message || "").trim(),
    submittedAt: new Date().toISOString(),
    ...buildVacancyPickupMeta(person, personnel, vacancyShift),
  };
}

export function buildVacancyPickupNotificationMessage(record = {}) {
  const requesterShift = record.requesterShift ? ` (${record.requesterShift})` : "";
  const chiefLabel = record.assignedBattalionChief || "Battalion Chief";
  const base = `${record.person}${requesterShift} requested to pick up ${record.vacancyLabel} on ${record.date} for ${record.shift}.`;
  const messageSuffix = record.message ? ` Message: ${record.message}` : "";
  return `${base} Awaiting ${chiefLabel} approval.${messageSuffix}`;
}

export function vacancyPickupStatusDetail(item = {}) {
  if (item.approvalStage === "battalionChief") {
    return `${item.status} · ${item.assignedBattalionChief || "Battalion Chief"}`;
  }
  return item.status || "Pending";
}

export function pickupTargetsBattalionChief(record = {}, chiefPerson = {}) {
  if (!record.assignedBattalionChiefId || !chiefPerson?.id) {
    return normalizeName(record.assignedBattalionChief) === normalizeName(chiefPerson?.name);
  }
  return record.assignedBattalionChiefId === chiefPerson.id;
}

function normalizeName(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function formatVacancyPickupSummary(record = {}) {
  const parts = [
    record.person,
    "requested",
    record.vacancyLabel,
    `on ${record.date || record.dayId}`,
    record.shift ? `(${record.shift})` : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export function resolveEmployeeVacancyDays({
  personnel = [],
  person = {},
  rotation = {},
  leaveRequests = [],
  roster = [],
  schedulingSettings = {},
  apparatus = [],
  scheduleDays = [],
  fromDate = new Date(),
  horizonDays = 42,
} = {}) {
  const shift = String(person?.shift || "").trim();
  if (!shift) return [];

  const days = [];
  const start = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + offset);
    const dayId = formatDayId(date);
    const dayShift = shiftForDate(date, rotation);

    if (!isOppositeShiftVacancyDay(shift, dayShift)) continue;

    const snapshot = buildDayScheduleSnapshot({
      dayId,
      scheduleDays,
      rotation,
      roster,
      personnel,
      leaveRequests,
      schedulingSettings,
      apparatus,
    });

    const vacancies = buildOpenVacanciesForDay(snapshot);
    if (!vacancies.length) continue;

    days.push({
      ...snapshot,
      vacancies,
    });
  }

  return days;
}

export function hasExistingPickupRequest(pickups = [], person = {}, vacancy = {}) {
  if (!person?.id || !vacancy?.id) return false;
  return pickups.some((item) => (
    item.personnelId === person.id
    && item.vacancyId === vacancy.id
    && /pending/i.test(item.status || "")
  ));
}
