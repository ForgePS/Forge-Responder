import { getPersonDisplayName } from "./personnelSchema.js";
import { buildScheduleDayRecord, formatDayId, parseDayId } from "./shiftCalendar.js";
import { buildDayRoster } from "./schedulingRoster.js";
import { buildSchedulingUnitOptions } from "./schedulingSettings.js";
import {
  matchesCallShiftGroup,
  matchesCallShiftPosition,
  rankCallShiftCandidates,
} from "./callShiftRanking.js";

export const DEFAULT_CALL_SHIFT_TIERS = [
  {
    tier: 1,
    label: "Same shift — seniority list",
    groupScope: "sameShift",
    waitMinutes: 15,
    channels: ["inApp"],
  },
  {
    tier: 2,
    label: "All qualified personnel",
    groupScope: "allQualified",
    waitMinutes: 30,
    channels: ["inApp"],
  },
];

export const CALL_SHIFT_POSITIONS = [
  "Any",
  "Firefighter",
  "Driver",
  "Lieutenant",
  "Captain",
  "Paramedic",
  "AEMT",
  "EMT",
];

function isActivePerson(person = {}) {
  const status = String(person.status || "Active").trim().toLowerCase();
  return !status || status === "active" || status === "on duty";
}

function normalizeShift(value = "") {
  return String(value || "").trim().toLowerCase();
}

function personOnLeaveForDay(personId = "", dayId = "", roster = [], dayRoster = []) {
  const rosterEntry = roster.find((entry) => (
    entry.personnelId === personId && entry.dayId === dayId
  ));
  if (rosterEntry && /leave|vacation|sick/i.test(String(rosterEntry.apparatus || rosterEntry.assignmentValue || ""))) {
    return true;
  }

  const member = dayRoster.find((entry) => entry.personnelId === personId);
  return member?.status === "Leave";
}

export function buildCallShiftId(existing = []) {
  const count = Array.isArray(existing) ? existing.length : 0;
  return `CS-${501 + count}`;
}

export function resolveCallShiftLengthHours(startTime = "", endTime = "", fallback = 24) {
  if (!startTime || !endTime) return fallback;
  const startDigits = String(startTime).replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const endDigits = String(endTime).replace(/\D/g, "").padStart(4, "0").slice(0, 4);
  const startMinutes = Number.parseInt(startDigits.slice(0, 2), 10) * 60 + Number.parseInt(startDigits.slice(2, 4), 10);
  let endMinutes = Number.parseInt(endDigits.slice(0, 2), 10) * 60 + Number.parseInt(endDigits.slice(2, 4), 10);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;
  const hours = (endMinutes - startMinutes) / 60;
  return Number.isFinite(hours) && hours > 0 ? hours : fallback;
}

export function buildCallShiftPreview({
  personnel = [],
  roster = [],
  leaveRequests = [],
  shiftTrades = [],
  schedulingSettings = {},
  apparatus = [],
  scheduleDays = [],
  rotation = {},
  rankOptions = [],
  dayId = "",
  shift = "",
  position = "Any",
  group = "All",
  positionsNeeded = 1,
  tieredEnabled = false,
  tiers = DEFAULT_CALL_SHIFT_TIERS,
} = {}) {
  const resolvedDayId = dayId || formatDayId(new Date());
  const dayShift = shift
    || buildScheduleDayRecord(resolvedDayId, scheduleDays, rotation).shift
    || "";
  const unitOptions = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: dayShift,
    selectedDayId: resolvedDayId,
    leaveRequests,
    shiftTrades,
    knownUnits: unitOptions,
  });
  const workingIds = new Set(dayRoster.filter((member) => member.status !== "Leave").map((m) => m.personnelId));

  const eligible = [];
  const excluded = [];

  (Array.isArray(personnel) ? personnel : []).forEach((person) => {
    if (!isActivePerson(person)) {
      excluded.push({ person, reason: "Inactive" });
      return;
    }
    if (!matchesCallShiftPosition(person, position)) {
      excluded.push({ person, reason: "Position / qualifier" });
      return;
    }
    if (group !== "All" && !matchesCallShiftGroup(person, group)) {
      excluded.push({ person, reason: "Shift group" });
      return;
    }
    if (personOnLeaveForDay(person.id, resolvedDayId, roster, dayRoster)) {
      excluded.push({ person, reason: "On leave" });
      return;
    }
    if (workingIds.has(person.id) && normalizeShift(person.shift) === normalizeShift(dayShift)) {
      excluded.push({ person, reason: "Already on duty" });
      return;
    }

    eligible.push({
      personnelId: person.id,
      name: getPersonDisplayName(person),
      rank: person.rank || "",
      shift: person.shift || "",
      position: person.position || person.rank || "",
      startDateRanking: person.startDateRanking || person.hireDate || "",
    });
  });

  const rankedEligible = rankCallShiftCandidates(
    eligible.map((entry) => ({ ...entry, person: personnel.find((p) => p.id === entry.personnelId) })),
    rankOptions
  );

  const tierPreviews = (tieredEnabled ? tiers : [tiers[0] || DEFAULT_CALL_SHIFT_TIERS[0]]).map((tier) => {
    const scoped = rankedEligible.filter((entry) => {
      if (tier.groupScope === "sameShift") {
        return normalizeShift(entry.shift) === normalizeShift(dayShift);
      }
      return true;
    });
    return {
      ...tier,
      candidates: scoped,
    };
  });

  const dateLabel = parseDayId(resolvedDayId).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return {
    dayId: resolvedDayId,
    dateLabel,
    shift: dayShift,
    group: group === "All" ? `${dayShift || "All shifts"}` : group,
    positionsNeeded: Math.max(1, Number.parseInt(String(positionsNeeded || 1), 10) || 1),
    eligible: rankedEligible,
    excluded,
    tierPreviews,
    summary: {
      requiredPersons: Math.max(1, Number.parseInt(String(positionsNeeded || 1), 10) || 1),
      group: group === "All" ? dayShift : group,
      eligibleCount: rankedEligible.length,
      excludedCount: excluded.length,
    },
  };
}

export function buildCallShiftRecord({
  form = {},
  preview = {},
  startedBy = "",
  startedByPersonnelId = "",
  existing = [],
} = {}) {
  const now = new Date().toISOString();
  const tiers = form.tieredEnabled
    ? (form.tiers || DEFAULT_CALL_SHIFT_TIERS)
    : [(form.tiers || DEFAULT_CALL_SHIFT_TIERS)[0]];

  return {
    id: buildCallShiftId(existing),
    status: "active",
    createdAt: now,
    updatedAt: now,
    startedBy,
    startedByPersonnelId,
    dayId: form.dayId || preview.dayId,
    dateLabel: preview.dateLabel || "",
    shift: preview.shift || form.shift || "",
    group: form.group || "All",
    position: form.position || "Any",
    positionsNeeded: preview.summary?.requiredPersons || 1,
    apparatus: form.apparatus || "",
    qualifier: form.qualifier || "",
    startDate: form.startDate || form.dayId || "",
    startTime: form.startTime || "0700",
    endDate: form.endDate || form.dayId || "",
    endTime: form.endTime || "0700",
    deadlineDate: form.deadlineDate || "",
    deadlineTime: form.deadlineTime || "",
    waitMinutes: Number.parseInt(String(form.waitMinutes || 15), 10) || 15,
    tieredEnabled: Boolean(form.tieredEnabled),
    tiers,
    currentTier: 1,
    message: String(form.message || "").trim(),
    lengthHours: resolveCallShiftLengthHours(form.startTime, form.endTime),
    previewSnapshot: {
      eligible: preview.eligible || [],
      excluded: (preview.excluded || []).map(({ person, reason }) => ({
        personnelId: person?.id || "",
        name: getPersonDisplayName(person),
        reason,
      })),
      tierPreviews: preview.tierPreviews || [],
    },
    responses: [],
    tierHistory: [{
      tier: 1,
      startedAt: now,
      notifiedPersonnelIds: [],
    }],
    assignedPersonnelId: "",
    assignedName: "",
    assignedAt: "",
  };
}

export function buildCallShiftNotificationMessage(record = {}, tier = {}) {
  const parts = [
    `Call shift for ${record.shift || "shift"} on ${record.dateLabel || record.dayId}.`,
    record.position && record.position !== "Any" ? `Position: ${record.position}.` : "",
    record.apparatus ? `Apparatus: ${record.apparatus}.` : "",
    tier.label ? `Tier: ${tier.label}.` : "",
    record.message ? record.message : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export function listCallShiftHistory(records = []) {
  return [...(Array.isArray(records) ? records : [])].sort((left, right) => (
    String(right.createdAt || "").localeCompare(String(left.createdAt || ""))
  ));
}

export function formatCallShiftStatus(record = {}) {
  if (record.status === "filled") return `Filled · ${record.assignedName || "Assigned"}`;
  if (record.status === "cancelled") return "Cancelled";
  if (record.status === "expired") return "Expired";
  return `Active · Tier ${record.currentTier || 1}`;
}
