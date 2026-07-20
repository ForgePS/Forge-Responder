import { canonicalApparatusUnitName } from "./apparatusSchema.js";
import {
  findApparatusRecord,
  isAmbulanceUnit,
  isBattalionUnit,
  resolveApparatusCrewSlotRoles,
  STANDARD_APPARATUS_CREW_ROLES,
  AMBULANCE_CREW_ROLES,
} from "./apparatusCrewSlots.js";
import { resolvePersonEmsLevel } from "./personnelEmsCredentials.js";
import { findPersonnelForLeaveRequest } from "./leaveAccrualIntegration.js";
import { getPersonDisplayName } from "./personnelSchema.js";
import {
  resolveShiftTradeLabel,
  resolveShiftTradeRosterAdjustments,
} from "./shiftTradeRoster.js";
import {
  buildScheduleDayRecord,
  formatDayId,
  parseDayId,
  resolveShiftRotation,
} from "./shiftCalendar.js";
import {
  buildSchedulingUnitOptions,
  resolveSchedulingDisplayUnits,
} from "./schedulingSettings.js";

const INACTIVE_STATUSES = new Set(["inactive", "terminated"]);
const LEAVE_STATUSES = new Set(["leave", "off", "vacation", "sick"]);
export const ROSTER_LEAVE_ASSIGNMENTS = ["Vacation", "Sick"];

function isLeaveAssignment(value = "") {
  const normalized = String(value || "").trim();
  return normalized === "Leave" || ROSTER_LEAVE_ASSIGNMENTS.includes(normalized);
}

function normalizeShift(value = "") {
  return String(value || "").trim();
}

function normalizeStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

function extractApparatusFromText(text = "", knownUnits = []) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";

  const canonical = canonicalApparatusUnitName(trimmed);
  if (knownUnits.includes(canonical)) return canonical;

  for (const unit of knownUnits) {
    if (trimmed.includes(unit)) return unit;
  }

  const match = trimmed.match(/(Battalion|Engine|Truck|Rescue|Brush|FD|Ladder|Aerial|Ambulance|Medic)\s*[-]?\s*\d+/i);
  if (match) return canonicalApparatusUnitName(match[0].replace(/\s+/g, " "));

  return canonical;
}

function resolvePersonApparatus(person = {}, knownUnits = []) {
  const raw = String(person.unit || person.assignment || person.apparatus || "").trim();
  const canonical = extractApparatusFromText(raw, knownUnits);
  return canonical || "Unassigned";
}

function resolvePersonPosition(person = {}) {
  const rank = String(person.rank || "").trim();
  if (isCommandRank(rank) || isCompanyOfficerRank(rank)) return rank;
  if (String(person.position || "").trim()) return person.position.trim();
  if (person.driver === "Approved") return "Driver";
  const emsLevel = resolvePersonEmsLevel(person);
  if (emsLevel) return emsLevel;
  if (rank) return rank;
  return "Firefighter";
}

export {
  AMBULANCE_CREW_ROLES,
  isAmbulanceUnit,
  isBattalionUnit,
  resolveApparatusCrewSlotRoles,
  STANDARD_APPARATUS_CREW_ROLES,
} from "./apparatusCrewSlots.js";

export function resolveApparatusVacancyPosition(unit = "", slotIndex = 0, apparatus = [], schedulingSettings = null) {
  const roles = resolveApparatusCrewSlotRoles(unit, {
    apparatusRecord: findApparatusRecord(apparatus, unit),
    schedulingSettings,
  });
  return roles[slotIndex] || roles[roles.length - 1] || "Firefighter";
}

export function resolveEmsRoleSuffix(person = {}) {
  const ems = String(resolvePersonEmsLevel(person) || person.ems || "").trim();
  if (!ems || /^none$/i.test(ems)) return "";
  if (/paramedic|\bmedic\b|\bals\b/i.test(ems)) return "/Paramedic";
  if (/aemt|\bemt\b/i.test(ems)) return "/EMT";
  return "";
}

export const DEFAULT_SHIFT_DURATION_HOURS = 24;

export function parseDurationHours(value, fallback = DEFAULT_SHIFT_DURATION_HOURS) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, DEFAULT_SHIFT_DURATION_HOURS);
}

export function formatDurationLabel(hours = DEFAULT_SHIFT_DURATION_HOURS) {
  const parsed = parseDurationHours(hours, 0);
  if (!parsed) return "";
  if (parsed === 1) return "1 Hour";
  return Number.isInteger(parsed) ? `${parsed} Hours` : `${parsed.toFixed(1)} Hours`;
}

export function normalizeShiftTime(value, fallback = "07:00") {
  const raw = String(value ?? fallback).trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return normalizeShiftTime(fallback, "07:00");
  const hours = Math.min(23, Math.max(0, Number.parseInt(match[1], 10)));
  const minutes = Math.min(59, Math.max(0, Number.parseInt(match[2], 10)));
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function shiftTimeToMinutes(value = "07:00") {
  const normalized = normalizeShiftTime(value);
  const [hours, minutes] = normalized.split(":").map((part) => Number.parseInt(part, 10));
  return hours * 60 + minutes;
}

function minutesToShiftTime(totalMinutes = 0) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function calculateShiftDurationHours(
  shiftStartTime = "07:00",
  shiftEndTime = "07:00",
  shiftEndDayOffset = 0
) {
  const startMinutes = shiftTimeToMinutes(shiftStartTime);
  let endMinutes = shiftTimeToMinutes(shiftEndTime) + (Number(shiftEndDayOffset) || 0) * 1440;
  if (endMinutes <= startMinutes) endMinutes += 1440;
  const hours = (endMinutes - startMinutes) / 60;
  if (!Number.isFinite(hours) || hours <= 0) return DEFAULT_SHIFT_DURATION_HOURS;
  return Math.min(hours, DEFAULT_SHIFT_DURATION_HOURS);
}

export function resolveMemberShiftTimes(entry = {}, shiftChangeTime = "07:00") {
  const defaultStart = normalizeShiftTime(shiftChangeTime);
  const hasCustomStart = Boolean(entry.shiftStartTime);
  const hasCustomEnd = Boolean(entry.shiftEndTime);

  if (!hasCustomStart && !hasCustomEnd) {
    return {
      shiftStartTime: defaultStart,
      shiftEndTime: defaultStart,
      shiftEndDayOffset: 1,
    };
  }

  const shiftStartTime = normalizeShiftTime(entry.shiftStartTime, defaultStart);
  const shiftEndTime = normalizeShiftTime(entry.shiftEndTime, defaultStart);
  let shiftEndDayOffset = Number.isInteger(entry.shiftEndDayOffset) ? entry.shiftEndDayOffset : null;

  if (shiftEndDayOffset == null) {
    if (entry.durationHours && entry.durationHours < DEFAULT_SHIFT_DURATION_HOURS) {
      const endMinutes = shiftTimeToMinutes(shiftStartTime) + Math.round(entry.durationHours * 60);
      shiftEndDayOffset = endMinutes >= 1440 ? 1 : 0;
    } else if (shiftTimeToMinutes(shiftEndTime) <= shiftTimeToMinutes(shiftStartTime)) {
      shiftEndDayOffset = 1;
    } else {
      shiftEndDayOffset = 0;
    }
  }

  return { shiftStartTime, shiftEndTime, shiftEndDayOffset };
}

export function resolveMemberDurationHours(entry = {}, shiftChangeTime = "07:00") {
  const times = resolveMemberShiftTimes(entry, shiftChangeTime);
  return calculateShiftDurationHours(
    times.shiftStartTime,
    times.shiftEndTime,
    times.shiftEndDayOffset
  );
}

export function formatMemberShiftTimeWindow(
  dayId = "",
  shiftStartTime = "07:00",
  shiftEndTime = "07:00",
  shiftEndDayOffset = 0
) {
  const start = normalizeShiftTime(shiftStartTime);
  const end = normalizeShiftTime(shiftEndTime);

  if (shiftEndDayOffset === 0 && shiftTimeToMinutes(end) > shiftTimeToMinutes(start)) {
    return `${start}–${end}`;
  }

  const endDate = parseDayId(dayId);
  endDate.setDate(endDate.getDate() + (Number(shiftEndDayOffset) || 0));
  const endWeekday = endDate.toLocaleDateString("en-US", { weekday: "short" });
  return `${start}–${endWeekday} ${end}`;
}

export function resolvePartialSlotShiftTimes(shiftChangeTime = "07:00", slotMembers = []) {
  const defaultStart = normalizeShiftTime(shiftChangeTime);
  const slotStart = shiftTimeToMinutes(defaultStart);
  const slotEnd = slotStart + 1440;

  let coveredEnd = slotStart;
  slotMembers.forEach((member) => {
    const times = resolveMemberShiftTimes(member, shiftChangeTime);
    const memberEnd = shiftTimeToMinutes(times.shiftEndTime) + times.shiftEndDayOffset * 1440;
    coveredEnd = Math.max(coveredEnd, memberEnd);
  });

  if (coveredEnd >= slotEnd) return null;

  const remainingMinutes = slotEnd - coveredEnd;
  const partialEndMinutes = slotEnd;

  return {
    shiftStartTime: minutesToShiftTime(coveredEnd),
    shiftEndTime: minutesToShiftTime(partialEndMinutes),
    shiftEndDayOffset: partialEndMinutes >= 1440 ? 1 : 0,
    remainingHours: remainingMinutes / 60,
  };
}

export function buildDefaultShiftTimes(shiftChangeTime = "07:00") {
  const defaultStart = normalizeShiftTime(shiftChangeTime);
  return {
    shiftStartTime: defaultStart,
    shiftEndTime: defaultStart,
    shiftEndDayOffset: 1,
  };
}

export function buildPartialSlotRosterId(personnelId = "", dayId = "", unit = "", slotIndex = 0) {
  const personId = String(personnelId || "").trim();
  const day = String(dayId || "").trim();
  const normalizedUnit = canonicalApparatusUnitName(unit);
  if (!personId || !day || !normalizedUnit) return "";
  return `P-${personId}:${day}:${normalizedUnit}:S${slotIndex}`;
}

function rosterEntryToCrewMember(entry = {}, personnelById = {}, dayRosterMember = null, shiftChangeTime = "07:00") {
  const person = personnelById[entry.personnelId] || {};
  const resolvedShift = entry.shift || person.shift || "";
  return {
    id: entry.id,
    personnelId: entry.personnelId,
    name: entry.name || getPersonDisplayName(person),
    rank: entry.rank || person.rank || "",
    shift: resolvedShift,
    homeShift: resolvedShift,
    apparatus: canonicalApparatusUnitName(entry.apparatus),
    position: entry.position || resolvePersonPosition(person),
    status: entry.status === "Leave" ? "Leave" : "On Duty",
    isOvertime: Boolean(entry.isOvertime),
    overtimeLabel: entry.isOvertime ? `${resolvedShift || "Other"} Shift OT` : "",
    tradeLabel: dayRosterMember?.tradeLabel || "",
    leaveLabel: dayRosterMember?.leaveLabel || "",
    durationHours: resolveMemberDurationHours(entry, shiftChangeTime),
    slotRole: entry.slotRole ?? null,
    slotIndex: Number.isInteger(entry.slotIndex) ? entry.slotIndex : null,
    assignmentValue: entry.apparatus,
    ...resolveMemberShiftTimes(entry, shiftChangeTime),
  };
}

export function resolveApparatusCrewMembers(
  roster = [],
  dayId = "",
  unit = "",
  dayRoster = [],
  personnel = [],
  shiftChangeTime = "07:00"
) {
  const normalizedUnit = canonicalApparatusUnitName(unit);
  const personnelById = Object.fromEntries(
    (Array.isArray(personnel) ? personnel : [])
      .filter((person) => person && person.id)
      .map((person) => [person.id, person])
  );
  const dayRosterByPerson = Object.fromEntries(
    (Array.isArray(dayRoster) ? dayRoster : [])
      .filter((member) => member.personnelId)
      .map((member) => [member.personnelId, member])
  );

  const crewFromRoster = (Array.isArray(roster) ? roster : [])
    .filter((entry) => {
      if (String(entry.dayId || "") !== String(dayId || "")) return false;
      if (canonicalApparatusUnitName(entry.apparatus) !== normalizedUnit) return false;
      if (isLeaveAssignment(entry.apparatus) || entry.status === "Leave") return false;
      return true;
    })
    .map((entry) => rosterEntryToCrewMember(
      entry,
      personnelById,
      dayRosterByPerson[entry.personnelId],
      shiftChangeTime
    ));

  const coveredIds = new Set(crewFromRoster.map((member) => member.id));
  const coveredPeople = new Set(crewFromRoster.map((member) => member.personnelId));

  const legacyCrew = (Array.isArray(dayRoster) ? dayRoster : [])
    .filter((member) => (
      member.personnelId
      && canonicalApparatusUnitName(member.apparatus) === normalizedUnit
      && member.status !== "Leave"
      && !coveredPeople.has(member.personnelId)
    ))
    .map((member) => ({
      ...member,
      ...buildDefaultShiftTimes(shiftChangeTime),
      durationHours: DEFAULT_SHIFT_DURATION_HOURS,
      slotRole: member.slotRole ?? null,
      slotIndex: Number.isInteger(member.slotIndex) ? member.slotIndex : null,
    }));

  return [...crewFromRoster, ...legacyCrew.filter((member) => !coveredIds.has(member.id))];
}

export function formatDailyRosterRoleLabel(slotRole = "", person = null) {
  const base = String(slotRole || "Firefighter").trim() || "Firefighter";
  if (!person) return base;
  if (base === "Paramedic" || base === "EMT/Driver") return base;
  const suffix = resolveEmsRoleSuffix(person);
  return suffix ? `${base}${suffix}` : base;
}

function isParamedicSlotCandidate(member = {}, person = {}) {
  const ems = String(resolvePersonEmsLevel(person) || person.ems || member.ems || "").trim();
  if (/paramedic|\bmedic\b|\bals\b/i.test(ems)) return true;
  const position = String(member.position || person.position || "").trim();
  return /paramedic|\bmedic\b|\bals\b/i.test(position);
}

function isEmtDriverSlotCandidate(member = {}, person = {}) {
  if (isDriverSlotCandidate(member, person)) return true;
  const ems = String(resolvePersonEmsLevel(person) || person.ems || member.ems || "").trim();
  if (/aemt|\bemt\b/i.test(ems)) return true;
  const position = String(member.position || person.position || "").trim();
  return /driver|\bemt\b|\baemt\b/i.test(position);
}

function resolveAmbulanceOverflowRole(member = {}, person = {}) {
  if (isParamedicSlotCandidate(member, person)) return "Paramedic";
  if (isEmtDriverSlotCandidate(member, person)) return "EMT/Driver";
  return "Crew";
}

function isLieutenantSlotCandidate(member = {}, person = {}) {
  const rank = String(member.rank || person.rank || "").trim();
  const position = String(member.position || person.position || "").trim();
  return isCompanyOfficerRank(rank) || /lieutenant|^lt\.?|\bcaptain\b|officer/i.test(position);
}

function isDriverSlotCandidate(member = {}, person = {}) {
  return isDriverMember(member, person) || /driver/i.test(String(member.position || person.position || ""));
}

export function buildApparatusCrewSlotRows({
  unit = "",
  crew = [],
  personnel = [],
  apparatus = [],
  schedulingSettings = null,
  dayId = "",
  shiftChangeTime = "07:00",
  timeWindow = "",
} = {}) {
  const defaultShiftTimes = buildDefaultShiftTimes(shiftChangeTime);
  const defaultTimeWindow = timeWindow || formatMemberShiftTimeWindow(
    dayId,
    defaultShiftTimes.shiftStartTime,
    defaultShiftTimes.shiftEndTime,
    defaultShiftTimes.shiftEndDayOffset
  );
  const apparatusRecord = findApparatusRecord(apparatus, unit);
  const slotRoles = resolveApparatusCrewSlotRoles(unit, { apparatusRecord, schedulingSettings });
  const isAmbulance = isAmbulanceUnit(unit, apparatusRecord);
  const personnelById = Object.fromEntries((Array.isArray(personnel) ? personnel : []).map((person) => [person.id, person]));
  const pool = [...(Array.isArray(crew) ? crew : [])];

  function takeMatch(matcher) {
    const index = pool.findIndex((member) => {
      const person = personnelById[member.personnelId] || {};
      return matcher(member, person);
    });
    if (index < 0) return null;
    return pool.splice(index, 1)[0];
  }

  function takePinnedSlot(slotRole, slotIndex) {
    const index = pool.findIndex((member) => (
      Number.isInteger(member.slotIndex)
      && member.slotIndex === slotIndex
      && (!member.slotRole || member.slotRole === slotRole)
    ));
    if (index < 0) return null;
    return pool.splice(index, 1)[0];
  }

  function buildFilledRow(member, slotRole, slotIndex) {
    const person = personnelById[member.personnelId] || {};
    const onLeave = member.status === "Leave";
    const shiftTimes = resolveMemberShiftTimes(member, shiftChangeTime);
    const parsedDuration = resolveMemberDurationHours({ ...member, ...shiftTimes }, shiftChangeTime);
    return {
      id: member.id || `${dayId}-${unit}-slot-${slotIndex}`,
      personnelId: member.personnelId,
      name: member.name,
      role: formatDailyRosterRoleLabel(slotRole, person),
      slotRole,
      slotIndex,
      ...shiftTimes,
      durationHours: parsedDuration,
      durationLabel: formatDurationLabel(parsedDuration),
      isOpen: false,
      isPartialOpen: false,
      isOvertime: Boolean(member.isOvertime),
      status: onLeave
        ? (member.leaveLabel || "On Leave")
        : member.isOvertime
          ? (member.overtimeLabel || `${member.shift || member.homeShift || "Other"} Shift OT`)
          : (member.tradeLabel || "Scheduled"),
      assignmentValue: member.assignmentValue || member.apparatus,
      apparatus: member.apparatus || unit,
      timeWindow: formatMemberShiftTimeWindow(
        dayId,
        shiftTimes.shiftStartTime,
        shiftTimes.shiftEndTime,
        shiftTimes.shiftEndDayOffset
      ),
      rosterEntryId: member.id,
    };
  }

  function buildPartialOpenRow(slotRole, slotIndex, slotMembers = []) {
    const partialTimes = resolvePartialSlotShiftTimes(shiftChangeTime, slotMembers);
    if (!partialTimes) return null;

    const parsedRemaining = parseDurationHours(partialTimes.remainingHours, 0);
    return {
      id: `${dayId}-${unit}-partial-${slotIndex}`,
      personnelId: "",
      name: "Open",
      role: slotRole,
      slotRole,
      slotIndex,
      shiftStartTime: partialTimes.shiftStartTime,
      shiftEndTime: partialTimes.shiftEndTime,
      shiftEndDayOffset: partialTimes.shiftEndDayOffset,
      durationHours: parsedRemaining,
      remainingHours: parsedRemaining,
      durationLabel: formatDurationLabel(parsedRemaining),
      isOpen: true,
      isPartialOpen: true,
      status: `${formatDurationLabel(parsedRemaining)} open — any member`,
      apparatus: unit,
      timeWindow: formatMemberShiftTimeWindow(
        dayId,
        partialTimes.shiftStartTime,
        partialTimes.shiftEndTime,
        partialTimes.shiftEndDayOffset
      ),
    };
  }

  function buildFullOpenRow(slotRole, slotIndex) {
    return {
      id: `${dayId}-${unit}-open-${slotIndex}`,
      personnelId: "",
      name: "Open",
      role: slotRole,
      slotRole,
      slotIndex,
      ...defaultShiftTimes,
      durationHours: DEFAULT_SHIFT_DURATION_HOURS,
      durationLabel: formatDurationLabel(DEFAULT_SHIFT_DURATION_HOURS),
      isOpen: true,
      isPartialOpen: false,
      status: "Open Shift",
      apparatus: unit,
      timeWindow: defaultTimeWindow,
    };
  }

  function resolveSlotFilledHours(slotIndex, members = []) {
    return members.reduce(
      (total, entry) => total + resolveMemberDurationHours(entry, shiftChangeTime),
      0
    );
  }

  function collectSlotMembers(slotIndex, primaryMember = null) {
    const slotCrew = crew.filter((entry) => (
      Number.isInteger(entry.slotIndex)
      && entry.slotIndex === slotIndex
      && entry.personnelId
    ));
    const seen = new Set();
    const members = [];

    if (primaryMember?.personnelId) {
      seen.add(primaryMember.id || primaryMember.personnelId);
      members.push(primaryMember);
    }

    slotCrew.forEach((entry) => {
      const key = entry.id || entry.personnelId;
      if (seen.has(key)) return;
      if (primaryMember && key === (primaryMember.id || primaryMember.personnelId)) return;
      seen.add(key);
      members.push(entry);
    });

    return members;
  }

  const slotAssignments = slotRoles.map((slotRole, slotIndex) => {
    const pinned = takePinnedSlot(slotRole, slotIndex);
    if (pinned) return { slotRole, member: pinned, slotIndex };

    let member = null;
    if (slotRole === "Lieutenant") {
      member = takeMatch(isLieutenantSlotCandidate);
    } else if (slotRole === "Driver") {
      member = takeMatch(isDriverSlotCandidate);
    } else if (slotRole === "Battalion Chief") {
      member = takeMatch((memberRow, person) => isCommandRank(memberRow.rank || person.rank))
        || takeMatch(isLieutenantSlotCandidate)
        || takeMatch(() => true);
    } else if (slotRole === "Paramedic") {
      member = takeMatch(isParamedicSlotCandidate);
    } else if (slotRole === "EMT/Driver") {
      member = takeMatch(isEmtDriverSlotCandidate) || takeMatch(() => true);
    } else if (slotRole === "Firefighter") {
      member = takeMatch(() => true);
    } else {
      member = takeMatch((memberRow, person) => {
        const position = String(memberRow.position || person.position || "").trim();
        const rank = String(memberRow.rank || person.rank || "").trim();
        const target = String(slotRole || "").trim().toLowerCase();
        return position.toLowerCase() === target
          || rank.toLowerCase() === target
          || position.toLowerCase().includes(target)
          || rank.toLowerCase().includes(target);
      }) || takeMatch(() => true);
    }
    return { slotRole, member, slotIndex };
  });

  const rows = [];
  slotAssignments.forEach(({ slotRole, member, slotIndex }) => {
    if (member) {
      const slotMembers = collectSlotMembers(slotIndex, member);
      slotMembers.forEach((slotMember) => {
        rows.push(buildFilledRow(slotMember, slotRole, slotIndex));
        const memberKey = slotMember.id || slotMember.personnelId;
        const poolIndex = pool.findIndex((entry) => (entry.id || entry.personnelId) === memberKey);
        if (poolIndex >= 0) pool.splice(poolIndex, 1);
      });

      const filledHours = resolveSlotFilledHours(slotIndex, slotMembers);
      if (filledHours < DEFAULT_SHIFT_DURATION_HOURS) {
        const partialRow = buildPartialOpenRow(slotRole, slotIndex, slotMembers);
        if (partialRow) rows.push(partialRow);
      }
      return;
    }

    rows.push(buildFullOpenRow(slotRole, slotIndex));
  });

  pool.forEach((member, overflowIndex) => {
    const person = personnelById[member.personnelId] || {};
    const overflowRole = isAmbulance
      ? resolveAmbulanceOverflowRole(member, person)
      : "Firefighter";
    const slotIndex = slotRoles.length + overflowIndex;
    rows.push({
      ...buildFilledRow(member, overflowRole, slotIndex),
      role: formatDailyRosterRoleLabel(overflowRole, person),
      isOverflow: true,
    });
    const slotMembers = collectSlotMembers(slotIndex, member);
    const filledHours = resolveSlotFilledHours(slotIndex, slotMembers);
    if (filledHours < DEFAULT_SHIFT_DURATION_HOURS) {
      const partialRow = buildPartialOpenRow(overflowRole, slotIndex, slotMembers);
      if (partialRow) rows.push(partialRow);
    }
  });

  const openCount = rows.filter((row) => row.isOpen).length;
  return { rows, openCount, slotRoles };
}

export function resolveRosterMemberRole(member = {}, unit = "") {
  const rank = String(member.rank || "").trim();
  const position = String(member.position || "").trim();

  if (isBattalionUnit(unit) && rank) return rank;
  if (isCommandRank(rank)) return rank;
  if (isCompanyOfficerRank(rank)) return rank;
  return position || rank || "Firefighter";
}

function isPersonOnLeaveForDay(person, selectedDayId, leaveRequests = []) {
  if (LEAVE_STATUSES.has(normalizeStatus(person.status))) return true;
  if (!selectedDayId) return false;

  return leaveRequests.some((request) => {
    if (!/approved/i.test(String(request.status || ""))) return false;
    const match = findPersonnelForLeaveRequest([person], request);
    if (!match) return false;
    const dayIds = Array.isArray(request.selectedDates) ? request.selectedDates : [];
    return dayIds.includes(selectedDayId);
  });
}

function resolveLeaveLabel(person, selectedDayId, leaveRequests = [], apparatusOverride = "", overrideLeaveType = "") {
  if (apparatusOverride === "Vacation" || overrideLeaveType === "Vacation") return "Vacation";
  if (apparatusOverride === "Sick" || overrideLeaveType === "Sick") return "Sick";
  if (apparatusOverride === "Leave") return "Leave";

  const request = (Array.isArray(leaveRequests) ? leaveRequests : []).find((entry) => {
    if (!/approved/i.test(String(entry.status || ""))) return false;
    if (!findPersonnelForLeaveRequest([person], entry)) return false;
    const dayIds = Array.isArray(entry.selectedDates) ? entry.selectedDates : [];
    return dayIds.includes(selectedDayId);
  });

  if (!request) return "";
  const type = String(request.type || "");
  if (/vacation|annual/i.test(type)) return "Vacation";
  if (/sick/i.test(type)) return "Sick";
  if (/military/i.test(type)) return "Military Leave";
  return type || "Leave";
}

function resolveRosterStatus(person, selectedDayId, leaveRequests = [], apparatusOverride = "") {
  if (isLeaveAssignment(apparatusOverride) || isPersonOnLeaveForDay(person, selectedDayId, leaveRequests)) {
    return "Leave";
  }
  return "On Duty";
}

function rosterOverrideForPerson(roster = [], personId = "", dayId = "") {
  const dayScopedId = dayId ? `P-${personId}:${dayId}` : "";
  if (dayScopedId) {
    const dayMatch = roster.find((member) => (
      member.id === dayScopedId
      || (member.personnelId === personId && member.dayId === dayId)
    ));
    if (dayMatch) return dayMatch;
  }

  const prefixedId = `P-${personId}`;
  return roster.find((member) => (
    (member.id === prefixedId || member.id === personId)
    && !member.dayId
  )) || null;
}

function isActivePerson(person = {}) {
  if (!person || typeof person !== "object") return false;
  const status = normalizeStatus(person.status);
  if (INACTIVE_STATUSES.has(status)) return false;
  if (!normalizeShift(person.shift)) return false;
  return true;
}

function isCommandRank(rank = "") {
  return /battalion|chief|command/i.test(String(rank));
}

function isCompanyOfficerRank(rank = "") {
  return /captain|lieutenant|lt\.?/i.test(String(rank));
}

function isDriverMember(member = {}, person = {}) {
  if (/driver/i.test(String(member.position || ""))) return true;
  return person.driver === "Approved";
}

function isParamedicProvider(person = {}) {
  const ems = String(resolvePersonEmsLevel(person) || person.ems || "").trim();
  if (!ems || /^none$/i.test(ems)) return false;
  return /paramedic|\bmedic\b|\bals\b/i.test(ems);
}

function isEmtProvider(person = {}) {
  if (isParamedicProvider(person)) return false;
  const ems = String(resolvePersonEmsLevel(person) || person.ems || "").trim();
  if (!ems || /^none$/i.test(ems)) return false;
  return /aemt|\bemt\b/i.test(ems);
}

export function buildDayRoster({
  roster = [],
  personnel = [],
  selectedShift = "",
  selectedDayId = "",
  leaveRequests = [],
  shiftTrades = [],
  knownUnits = [],
} = {}) {
  const shift = normalizeShift(selectedShift);
  if (!shift) return [];

  const { excluded, included } = resolveShiftTradeRosterAdjustments(selectedDayId, shiftTrades);

  return (personnel || [])
    .filter(Boolean)
    .filter((person) => {
      if (!isActivePerson(person)) return false;
      if (excluded.has(person.id)) return false;
      if (included.has(person.id)) return true;
      return normalizeShift(person.shift) === shift;
    })
    .map((person) => {
      const override = rosterOverrideForPerson(roster, person.id, selectedDayId);
      const apparatusOverride = override?.apparatus;
      const baseApparatus = resolvePersonApparatus(person, knownUnits);
      const status = resolveRosterStatus(person, selectedDayId, leaveRequests, apparatusOverride);
      const leaveLabel = resolveLeaveLabel(
        person,
        selectedDayId,
        leaveRequests,
        apparatusOverride,
        override?.leaveType
      );
      const apparatus = status === "Leave" && isLeaveAssignment(apparatusOverride)
        ? baseApparatus
        : (apparatusOverride && !isLeaveAssignment(apparatusOverride)
          ? canonicalApparatusUnitName(apparatusOverride)
          : baseApparatus);
      const tradeLabel = resolveShiftTradeLabel(selectedDayId, person.id, shiftTrades);

      return {
        id: `P-${person.id}`,
        personnelId: person.id,
        name: getPersonDisplayName(person),
        rank: person.rank || "",
        shift: person.shift,
        apparatus,
        position: override?.position || resolvePersonPosition(person),
        status,
        leaveLabel,
        tradeLabel,
        assignmentValue: isLeaveAssignment(apparatusOverride)
          ? apparatusOverride
          : (apparatusOverride && !isLeaveAssignment(apparatusOverride)
            ? canonicalApparatusUnitName(apparatusOverride)
            : apparatus),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function resolveApprovedLeaveCountForDay({
  dayId = "",
  shift = "",
  roster = [],
  personnel = [],
  leaveRequests = [],
  knownUnits = [],
} = {}) {
  if (!dayId || !shift) return 0;

  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: shift,
    selectedDayId: dayId,
    leaveRequests,
    knownUnits,
  });

  return dayRoster.filter((member) => member.status === "Leave").length;
}

export function computeDayStaffingMetrics(dayRoster = [], personnel = []) {
  const personnelById = Object.fromEntries(
    (Array.isArray(personnel) ? personnel : [])
      .filter((person) => person && person.id)
      .map((person) => [person.id, person])
  );
  const onDuty = dayRoster.filter((member) => member.status !== "Leave");

  const command = onDuty.filter((member) => isCommandRank(member.rank)).length;
  const officers = onDuty.filter((member) => isCompanyOfficerRank(member.rank)).length;
  const drivers = onDuty.filter((member) => isDriverMember(member, personnelById[member.personnelId])).length;
  const paramedics = onDuty.filter((member) => isParamedicProvider(personnelById[member.personnelId] || {})).length;
  const emt = onDuty.filter((member) => isEmtProvider(personnelById[member.personnelId] || {})).length;
  const leave = dayRoster.filter((member) => member.status === "Leave").length;

  return {
    staffed: onDuty.length,
    leave,
    command,
    officers,
    drivers,
    paramedics,
    emt,
  };
}

export function resolveDayCoverageMetrics({
  dayRoster = [],
  personnel = [],
  minimum = 0,
} = {}) {
  const metrics = computeDayStaffingMetrics(dayRoster, personnel);
  const resolvedMinimum = minimum > 0 ? minimum : Math.max(metrics.staffed, 1);
  const vacancies = Math.max(resolvedMinimum - metrics.staffed, 0);

  return {
    ...metrics,
    minimum: resolvedMinimum,
    vacancies,
    status: vacancies > 0 ? "Deficit" : "Complete",
  };
}

export function resolveDailyLogApparatusOptions({
  schedulingSettings = {},
  apparatus = [],
  roster = [],
  personnel = [],
  leaveRequests = [],
  date = "",
  shift = "",
} = {}) {
  const knownUnits = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const displayUnits = resolveSchedulingDisplayUnits(schedulingSettings, apparatus);
  if (displayUnits.length) {
    return displayUnits;
  }

  const normalizedShift = normalizeShift(shift);
  if (!normalizedShift || normalizedShift.toLowerCase() === "all") {
    return knownUnits;
  }

  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: normalizedShift,
    selectedDayId: date,
    leaveRequests,
    knownUnits,
  });

  const rosterUnits = [...new Set(
    dayRoster
      .map((member) => canonicalApparatusUnitName(member.apparatus))
      .filter((unit) => unit && unit !== "Unassigned" && unit !== "Leave")
  )];

  return rosterUnits.length ? rosterUnits : knownUnits;
}

export function resolveDailyLogCrewForApparatus({
  schedulingSettings = {},
  apparatus = [],
  roster = [],
  personnel = [],
  leaveRequests = [],
  shiftTrades = [],
  date = "",
  shift = "",
  unit = "",
} = {}) {
  const knownUnits = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const normalizedShift = normalizeShift(shift);
  const normalizedUnit = canonicalApparatusUnitName(unit);
  if (!normalizedShift || !normalizedUnit) return [];

  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: normalizedShift,
    selectedDayId: date,
    leaveRequests,
    shiftTrades,
    knownUnits,
  });

  return dayRoster
    .filter((member) => (
      member.status !== "Leave"
      && canonicalApparatusUnitName(member.apparatus) === normalizedUnit
    ))
    .map((member) => ({
      id: member.personnelId || member.id,
      name: member.name,
      rank: member.rank,
      unit: normalizedUnit,
      assignment: normalizedUnit,
    }));
}

export function resolvePersonScheduledApparatus({
  personnelId = "",
  schedulingSettings = {},
  apparatus = [],
  roster = [],
  personnel = [],
  leaveRequests = [],
  shiftTrades = [],
  date = "",
  shift = "",
} = {}) {
  const normalizedShift = normalizeShift(shift);
  if (!personnelId || !date || !normalizedShift) return "";

  const knownUnits = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: normalizedShift,
    selectedDayId: date,
    leaveRequests,
    shiftTrades,
    knownUnits,
  });

  const member = dayRoster.find((entry) => (
    entry.personnelId === personnelId && entry.status !== "Leave"
  ));
  if (!member) return "";

  const unit = canonicalApparatusUnitName(member.apparatus);
  if (!unit || unit === "Unassigned" || unit === "Leave") return "";
  return unit;
}

export function resolveDailyLogScheduleDefaults({
  personnelId = "",
  unit = "",
  date = "",
  shift = "",
  schedulingSettings = {},
  apparatus = [],
  roster = [],
  personnel = [],
  leaveRequests = [],
  shiftTrades = [],
} = {}) {
  const normalizedShift = normalizeShift(shift);
  const preferredUnit = canonicalApparatusUnitName(unit);
  let resolvedApparatus = preferredUnit;

  if (!resolvedApparatus && personnelId) {
    resolvedApparatus = resolvePersonScheduledApparatus({
      personnelId,
      schedulingSettings,
      apparatus,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      date,
      shift: normalizedShift,
    });
  }

  if (!resolvedApparatus) {
    const options = resolveDailyLogApparatusOptions({
      schedulingSettings,
      apparatus,
      roster,
      personnel,
      leaveRequests,
      date,
      shift: normalizedShift,
    });
    resolvedApparatus = options[0] || "";
  }

  const crew = resolvedApparatus && normalizedShift
    ? resolveDailyLogCrewForApparatus({
      schedulingSettings,
      apparatus,
      roster,
      personnel,
      leaveRequests,
      shiftTrades,
      date,
      shift: normalizedShift,
      unit: resolvedApparatus,
    }).map((member) => member.name).filter(Boolean)
    : [];

  return {
    apparatus: resolvedApparatus,
    crew,
  };
}

const DEFAULT_APPARATUS_MINIMUM = 4;
const DEFAULT_BATTALION_MINIMUM = 1;

export function resolveApparatusMinimumCrew(unit = "", schedulingSettings = {}, apparatus = []) {
  const overrides = schedulingSettings?.minimumCrewByUnit || {};
  const canonical = canonicalApparatusUnitName(unit);
  const configured = overrides[canonical] ?? overrides[unit];
  const parsed = Number(configured);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  const apparatusRecord = findApparatusRecord(apparatus, unit);
  return isBattalionUnit(unit)
    ? DEFAULT_BATTALION_MINIMUM
    : resolveApparatusCrewSlotRoles(unit, { apparatusRecord, schedulingSettings }).length || DEFAULT_APPARATUS_MINIMUM;
}

export function groupRosterByApparatus(dayRoster = [], displayUnits = [], options = {}) {
  const { roster = [], dayId = "", personnel = [], shiftChangeTime = "07:00" } = options;
  const units = [...displayUnits];
  const grouped = units.map((unit) => ({
    unit,
    crew: resolveApparatusCrewMembers(roster, dayId, unit, dayRoster, personnel, shiftChangeTime),
  }));

  const crewPersonnelIds = new Set(
    grouped.flatMap(({ crew }) => crew.map((member) => member.personnelId).filter(Boolean))
  );

  const unassigned = dayRoster.filter((member) => {
    const apparatus = canonicalApparatusUnitName(member.apparatus);
    if (member.personnelId && crewPersonnelIds.has(member.personnelId)) {
      const onKnownUnit = units.includes(apparatus);
      if (onKnownUnit) return false;
    }
    return !units.includes(apparatus) || apparatus === "Unassigned";
  });

  return { grouped, unassigned };
}

export function buildApparatusVacancies(dayRoster = [], displayUnits = [], schedulingSettings = {}, personnel = [], apparatus = []) {
  const { grouped } = groupRosterByApparatus(dayRoster, displayUnits);
  const vacancies = [];

  grouped.forEach(({ unit, crew }) => {
    const { rows } = buildApparatusCrewSlotRows({
      unit,
      crew,
      personnel,
      apparatus,
      schedulingSettings,
      dayId: "vacancy",
    });

    rows.filter((row) => row.isOpen).forEach((row) => {
      vacancies.push({
        id: `VAC-${unit}-${row.slotIndex}`,
        type: "apparatus",
        apparatus: unit,
        position: row.slotRole,
        label: `${unit} — ${row.slotRole}`,
        openSlots: 1,
      });
    });
  });

  return vacancies;
}

export function buildShiftVacancies(coverage = {}) {
  const openSlots = Math.max(Number(coverage.vacancies) || 0, 0);
  if (!openSlots) return [];

  return [{
    id: "VAC-SHIFT-0",
    type: "shift",
    apparatus: "",
    position: "Any",
    label: `Shift staffing deficit (${openSlots} position${openSlots === 1 ? "" : "s"})`,
    openSlots,
  }];
}

export function buildOpenVacanciesForDay(snapshot = {}) {
  const apparatusVacancies = (snapshot.apparatusVacancies || []).map((vacancy) => ({
    ...vacancy,
    dayId: snapshot.id,
    date: snapshot.date,
    shift: snapshot.shift,
    id: `${snapshot.id}-${vacancy.id}`,
  }));

  const shiftVacancies = buildShiftVacancies(snapshot.coverage || {}).map((vacancy) => ({
    ...vacancy,
    dayId: snapshot.id,
    date: snapshot.date,
    shift: snapshot.shift,
    id: `${snapshot.id}-${vacancy.id}`,
  }));

  return [...apparatusVacancies, ...shiftVacancies];
}

export function buildRosterAssignmentOptions(unitOptions = []) {
  const units = [...new Set((Array.isArray(unitOptions) ? unitOptions : []).filter(Boolean))];
  return [...units, "Unassigned", ...ROSTER_LEAVE_ASSIGNMENTS];
}

/** Resolve a personnel id from roster row ids like P-HL-033 or P-HL-033:2026-06-10 */
export function resolveRosterPersonnelId(memberId = "", personnelId = "") {
  const explicit = String(personnelId || "").trim();
  if (explicit) return explicit;

  const raw = String(memberId || "").trim();
  if (!raw) return "";

  if (raw.startsWith("P-")) {
    const withoutPrefix = raw.slice(2);
    const colonIndex = withoutPrefix.indexOf(":");
    return colonIndex >= 0 ? withoutPrefix.slice(0, colonIndex) : withoutPrefix;
  }

  return raw;
}

export function buildDayScopedRosterId(personnelId = "", dayId = "") {
  const personId = String(personnelId || "").trim();
  const day = String(dayId || "").trim();
  if (!personId || !day) return "";
  return `P-${personId}:${day}`;
}

export function buildOvertimeRosterId(personnelId = "", dayId = "", unit = "") {
  const personId = String(personnelId || "").trim();
  const day = String(dayId || "").trim();
  const normalizedUnit = canonicalApparatusUnitName(unit);
  if (!personId || !day || !normalizedUnit) return "";
  return `P-${personId}:${day}:OT:${normalizedUnit}`;
}

export function resolveOvertimeRosterEntries(roster = [], dayId = "") {
  const day = String(dayId || "").trim();
  if (!day) return [];

  return (Array.isArray(roster) ? roster : []).filter((entry) => (
    entry?.isOvertime === true
    && String(entry.dayId || "").trim() === day
  ));
}

export function buildOvertimeRosterMembers({
  roster = [],
  personnel = [],
  selectedDayId = "",
  dutyShift = "",
  knownUnits = [],
} = {}) {
  const duty = normalizeShift(dutyShift);
  const personnelById = Object.fromEntries(
    (Array.isArray(personnel) ? personnel : [])
      .filter((person) => person && person.id)
      .map((person) => [person.id, person])
  );

  return resolveOvertimeRosterEntries(roster, selectedDayId)
    .map((entry) => {
      const person = personnelById[entry.personnelId];
      if (!person || !isActivePerson(person)) return null;

      const homeShift = normalizeShift(person.shift || entry.shift);
      if (duty && homeShift === duty) return null;

      const unit = canonicalApparatusUnitName(entry.apparatus);
      if (!unit || unit === "Unassigned" || unit === "Leave") return null;
      if (knownUnits.length && !knownUnits.includes(unit)) return null;

      return {
        id: entry.id || buildOvertimeRosterId(entry.personnelId, selectedDayId, unit),
        personnelId: entry.personnelId,
        name: getPersonDisplayName(person),
        rank: person.rank || entry.rank || "",
        shift: homeShift,
        homeShift,
        apparatus: unit,
        position: entry.position || resolvePersonPosition(person),
        status: "On Duty",
        isOvertime: true,
        overtimeLabel: `${homeShift || "Other"} Shift OT`,
        assignmentValue: unit,
        leaveLabel: "",
        tradeLabel: "",
      };
    })
    .filter(Boolean);
}

export function buildDayScheduleSnapshot({
  dayId = "",
  scheduleDays = [],
  rotation = {},
  roster = [],
  personnel = [],
  leaveRequests = [],
  shiftTrades = [],
  schedulingSettings = {},
  apparatus = [],
  minimumStaffing = 0,
  shiftChangeTime = "07:00",
} = {}) {
  const resolvedRotation = resolveShiftRotation(rotation);
  const dayRecord = buildScheduleDayRecord(dayId, scheduleDays, resolvedRotation);
  const unitOptions = buildSchedulingUnitOptions(apparatus, schedulingSettings);
  const displayUnits = resolveSchedulingDisplayUnits(schedulingSettings, apparatus);
  const dayRoster = buildDayRoster({
    roster,
    personnel,
    selectedShift: dayRecord.shift,
    selectedDayId: dayId,
    leaveRequests,
    shiftTrades,
    knownUnits: unitOptions,
  });
  const overtimeMembers = buildOvertimeRosterMembers({
    roster,
    personnel,
    selectedDayId: dayId,
    dutyShift: dayRecord.shift,
    knownUnits: unitOptions,
  });
  const combinedDayRoster = [...dayRoster, ...overtimeMembers];
  const configuredMinimum = minimumStaffing > 0
    ? minimumStaffing
    : Math.max(Number(dayRecord.minimum) || 0, 0);
  const coverage = resolveDayCoverageMetrics({
    dayRoster: combinedDayRoster,
    personnel,
    minimum: configuredMinimum || dayRecord.minimum,
  });
  const apparatusVacancies = buildApparatusVacancies(combinedDayRoster, displayUnits, schedulingSettings, personnel, apparatus);
  const date = parseDayId(dayId);
  const snapshot = {
    ...dayRecord,
    id: dayId,
    weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
    date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    shift: dayRecord.shift,
    staffed: coverage.staffed,
    minimum: coverage.minimum,
    leave: coverage.leave,
    status: coverage.status,
    roster: combinedDayRoster,
    coverage,
    displayUnits,
    apparatusVacancies,
    apparatusGroups: groupRosterByApparatus(combinedDayRoster, displayUnits, {
      roster,
      dayId,
      personnel,
      shiftChangeTime,
    }),
  };

  return {
    ...snapshot,
    openVacancies: buildOpenVacanciesForDay(snapshot),
  };
}

export function getWeekDayIds(referenceDayId = "", { dayCount = 7 } = {}) {
  const start = referenceDayId ? parseDayId(referenceDayId) : new Date();

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return formatDayId(date);
  });
}

export function buildWeekScheduleSnapshots(options = {}) {
  const referenceDayId = options.referenceDayId || formatDayId(new Date());
  const dayIds = getWeekDayIds(referenceDayId, options);
  return dayIds.map((dayId) => buildDayScheduleSnapshot({ ...options, dayId }));
}

export function buildLiveScheduleDayMetrics(options = {}) {
  const snapshots = buildWeekScheduleSnapshots(options);
  return Object.fromEntries(snapshots.map((snapshot) => [snapshot.id, {
    staffed: snapshot.staffed,
    minimum: snapshot.minimum,
    leave: snapshot.leave,
    status: snapshot.status,
  }]));
}
