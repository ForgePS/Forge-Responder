import { getPersonDisplayName } from "./personnelSchema.js";
import { buildScheduleDayRecord, formatDayId, parseDayId } from "./shiftCalendar.js";
import { buildDayRoster } from "./schedulingRoster.js";
import { buildSchedulingUnitOptions } from "./schedulingSettings.js";
import {
  matchesCallShiftGroups,
  matchesCallShiftQualifiers,
  matchesCallShiftPreviewRank,
  matchesCallShiftRanks,
  rankCallShiftCandidates,
  resolveCallShiftPreviewPositions,
  resolvePersonPosition,
} from "./callShiftRanking.js";
import { resolveCallShiftRule } from "./callShiftRules.js";

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

function normalizeSelectionList(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return list
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .filter((value) => !/^any$/i.test(value) && !/^all$/i.test(value));
}

function formatSelectionLabel(values = [], fallback = "All") {
  const list = normalizeSelectionList(values);
  if (!list.length) return fallback;
  return list.join(", ");
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
  positionOptions = rankOptions,
  dayId = "",
  shift = "",
  position = "Any",
  group = "All",
  groups = group,
  positionsNeeded = 1,
  tieredEnabled = false,
  tiers = DEFAULT_CALL_SHIFT_TIERS,
  callShiftRules = [],
  qualifier = "",
  qualifiers = qualifier ? [qualifier] : [],
  ranks = [],
  targetRotation = "",
  rotations = targetRotation ? [targetRotation] : [],
} = {}) {
  const normalizedQualifiers = normalizeSelectionList(qualifiers.length ? qualifiers : (position !== "Any" ? [position] : []));
  const normalizedGroups = normalizeSelectionList(groups);
  const normalizedRotations = normalizeSelectionList(rotations);
  const activeRule = resolveCallShiftRule(callShiftRules, { qualifiers: normalizedQualifiers });
  const useGlobalRanking = Boolean(activeRule.useGlobalRanking);
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
    if (!matchesCallShiftQualifiers(person, normalizedQualifiers)) {
      excluded.push({ person, reason: "Qualifier" });
      return;
    }
    if (!matchesCallShiftRanks(person, ranks)) {
      excluded.push({ person, reason: "Position" });
      return;
    }
    if (!matchesCallShiftGroups(person, normalizedRotations)) {
      excluded.push({ person, reason: "Rotation" });
      return;
    }
    if (!useGlobalRanking && !matchesCallShiftGroups(person, normalizedGroups)) {
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

    const broadcastPosition = resolvePersonPosition(person);

    eligible.push({
      personnelId: person.id,
      name: getPersonDisplayName(person),
      rank: broadcastPosition,
      position: broadcastPosition,
      shift: person.shift || "",
      startDateRanking: person.startDateRanking || person.hireDate || "",
    });
  });

  const rankedEligible = rankCallShiftCandidates(
    eligible.map((entry) => ({ ...entry, person: personnel.find((p) => p.id === entry.personnelId) })),
    positionOptions,
    activeRule,
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

  const previewPositions = resolveCallShiftPreviewPositions(positionOptions, ranks);
  const rankPreviews = previewPositions.map((tabPosition) => ({
    rank: tabPosition,
    eligible: rankedEligible.filter((entry) => matchesCallShiftPreviewRank(entry.position || entry.rank, tabPosition)),
  }));

  const dateLabel = parseDayId(resolvedDayId).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  return {
    dayId: resolvedDayId,
    dateLabel,
    shift: dayShift,
    group: formatSelectionLabel(normalizedGroups, dayShift || "All shifts"),
    positionsNeeded: Math.max(1, Number.parseInt(String(positionsNeeded || 1), 10) || 1),
    eligible: rankedEligible,
    excluded,
    tierPreviews,
    rankPreviews,
    summary: {
      requiredPersons: Math.max(1, Number.parseInt(String(positionsNeeded || 1), 10) || 1),
      group: formatSelectionLabel(normalizedGroups, dayShift || "All"),
      eligibleCount: rankedEligible.length,
      excludedCount: excluded.length,
      ruleName: activeRule.name,
      useGlobalRanking,
      ranksSelected: ranks.length,
      qualifiersSelected: normalizedQualifiers.length,
      groupsSelected: normalizedGroups.length,
      rotationsSelected: normalizedRotations.length,
      rotation: formatSelectionLabel(normalizedRotations, dayShift || "All"),
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
  const notifyChannels = [
    form.notifyInApp !== false ? "inApp" : "",
    form.notifySms ? "sms" : "",
  ].filter(Boolean);

  return {
    id: buildCallShiftId(existing),
    status: "active",
    createdAt: now,
    updatedAt: now,
    startedBy,
    startedByPersonnelId,
    dayId: form.dayId || preview.dayId,
    dateLabel: preview.dateLabel || "",
    shift: preview?.shift || form?.shift || "",
    group: formatSelectionLabel(form.groups, form.group || "All"),
    groups: normalizeSelectionList(form.groups),
    position: (normalizeSelectionList(form.qualifiers)[0] || form.position || "Any"),
    positionsNeeded: preview.summary?.requiredPersons || 1,
    apparatus: form.apparatus || "",
    qualifiers: normalizeSelectionList(form.qualifiers),
    qualifier: normalizeSelectionList(form.qualifiers)[0] || "",
    ranks: form.ranks || [],
    rotations: normalizeSelectionList(form.rotations),
    rotation: formatSelectionLabel(form.rotations, form.rotation || ""),
    tierConfig: form.tierConfig || {},
    startDate: form.startDate || form.dayId || "",
    startTime: form.startTime || "0700",
    endDate: form.endDate || form.dayId || "",
    endTime: form.endTime || "0700",
    deadlineDate: form.deadlineDate || "",
    deadlineTime: form.deadlineTime || "",
    waitMinutes: Number.parseInt(String(form.waitMinutes || 15), 10) || 15,
    tieredEnabled: Boolean(form.tieredEnabled),
    tiers,
    notifyChannels,
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
    `Shift broadcast for ${record.shift || "shift"} on ${record.dateLabel || record.dayId}.`,
    record.position && record.position !== "Any" ? `Position: ${record.position}.` : "",
    record.qualifiers?.length ? `Qualifiers: ${record.qualifiers.join(", ")}.` : "",
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

// ---- Responses from members (Employee Portal) and assignment (scheduler) ----

/** Whether this member was sent this broadcast and it's still open. */
export function isCallShiftOpenFor(record = {}, personnelId = "") {
  if (!personnelId || record.status !== "active") return false;
  const eligible = record.previewSnapshot?.eligible || [];
  return eligible.some((entry) => entry.personnelId === personnelId);
}

export function callShiftResponseFor(record = {}, personnelId = "") {
  return (record.responses || []).find((entry) => entry.personnelId === personnelId) || null;
}

/** Record a member's accept/decline (replaces an earlier answer). */
export function withCallShiftResponse(record = {}, { personnelId, name, response }) {
  const responses = (record.responses || []).filter((entry) => entry.personnelId !== personnelId);
  responses.push({ personnelId, name: name || "", response, respondedAt: new Date().toISOString() });
  return { ...record, responses, updatedAt: new Date().toISOString() };
}

/** Members assigned so far (older records only have assignedPersonnelId). */
export function callShiftAssignments(record = {}) {
  if (Array.isArray(record.assignments) && record.assignments.length) return record.assignments;
  return record.assignedPersonnelId ? [{ personnelId: record.assignedPersonnelId, name: record.assignedName || "", assignedAt: record.assignedAt || "" }] : [];
}

export function isAssignedToCallShift(record = {}, personnelId = "") {
  return Boolean(personnelId) && callShiftAssignments(record).some((entry) => entry.personnelId === personnelId);
}

/** Assign one member; the broadcast is filled once every needed seat has someone. */
export function withCallShiftAssigned(record = {}, { personnelId, name, assignedBy = "" }) {
  const now = new Date().toISOString();
  const assignments = callShiftAssignments(record).filter((entry) => entry.personnelId !== personnelId);
  assignments.push({ personnelId, name: name || "", assignedAt: now, assignedBy });
  const needed = Math.max(1, Number(record.positionsNeeded) || 1);
  return {
    ...record,
    assignments,
    status: assignments.length >= needed ? "filled" : record.status || "active",
    assignedPersonnelId: personnelId,
    assignedName: assignments.map((entry) => entry.name).filter(Boolean).join(", "),
    assignedAt: now,
    assignedBy,
    updatedAt: now,
  };
}
