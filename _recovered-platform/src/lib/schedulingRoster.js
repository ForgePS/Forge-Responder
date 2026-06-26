import { canonicalApparatusUnitName } from "./apparatusSchema.js";
import { findPersonnelForLeaveRequest } from "./leaveAccrualIntegration.js";
import { getPersonDisplayName } from "./personnelSchema.js";

const INACTIVE_STATUSES = new Set(["inactive", "terminated"]);
const LEAVE_STATUSES = new Set(["leave", "off", "vacation", "sick"]);

function normalizeShift(value = "") {
  return String(value || "").trim();
}

function normalizeStatus(value = "") {
  return String(value || "").trim().toLowerCase();
}

function resolvePersonApparatus(person = {}, knownUnits = []) {
  const raw = String(person.unit || person.assignment || person.apparatus || "").trim();
  const canonical = canonicalApparatusUnitName(raw);
  if (!canonical) return "Unassigned";
  if (knownUnits.length && !knownUnits.includes(canonical)) {
    return canonical;
  }
  return canonical;
}

function resolvePersonPosition(person = {}) {
  if (String(person.position || "").trim()) return person.position.trim();
  if (person.driver === "Approved") return "Driver";
  if (String(person.rank || "").trim()) return person.rank.trim();
  if (person.ems && person.ems !== "None") return person.ems;
  return "Firefighter";
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

function resolveRosterStatus(person, selectedDayId, leaveRequests = [], apparatusOverride = "") {
  if (apparatusOverride === "Leave" || isPersonOnLeaveForDay(person, selectedDayId, leaveRequests)) {
    return "Leave";
  }
  return "On Duty";
}

function rosterOverrideForPerson(roster = [], personId = "") {
  const prefixedId = `P-${personId}`;
  return roster.find((member) => member.id === prefixedId || member.id === personId) || null;
}

function isActivePerson(person = {}) {
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

function isAlsProvider(person = {}) {
  const ems = String(person.ems || "").trim();
  if (!ems || /^none$/i.test(ems)) return false;
  return /paramedic|als|emt|medic/i.test(ems) || /paramedic|als|emt|medic/i.test(String(person.position || ""));
}

export function buildDayRoster({
  roster = [],
  personnel = [],
  selectedShift = "",
  selectedDayId = "",
  leaveRequests = [],
  knownUnits = [],
} = {}) {
  const shift = normalizeShift(selectedShift);
  if (!shift) return [];

  return (personnel || [])
    .filter((person) => normalizeShift(person.shift) === shift && isActivePerson(person))
    .map((person) => {
      const override = rosterOverrideForPerson(roster, person.id);
      const apparatusOverride = override?.apparatus;
      const apparatus = apparatusOverride && apparatusOverride !== "Leave"
        ? canonicalApparatusUnitName(apparatusOverride)
        : resolvePersonApparatus(person, knownUnits);
      const status = resolveRosterStatus(person, selectedDayId, leaveRequests, apparatusOverride);

      return {
        id: `P-${person.id}`,
        personnelId: person.id,
        name: getPersonDisplayName(person),
        rank: person.rank || "",
        shift: person.shift,
        apparatus: status === "Leave" ? (apparatusOverride === "Leave" ? "Leave" : apparatus) : apparatus,
        position: override?.position || resolvePersonPosition(person),
        status,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function computeDayStaffingMetrics(dayRoster = [], personnel = []) {
  const personnelById = Object.fromEntries(
    (Array.isArray(personnel) ? personnel : []).map((person) => [person.id, person])
  );
  const onDuty = dayRoster.filter((member) => member.status !== "Leave");

  const command = onDuty.filter((member) => isCommandRank(member.rank)).length;
  const officers = onDuty.filter((member) => isCompanyOfficerRank(member.rank)).length;
  const drivers = onDuty.filter((member) => isDriverMember(member, personnelById[member.personnelId])).length;
  const als = onDuty.filter((member) => isAlsProvider(personnelById[member.personnelId] || {})).length;
  const leave = dayRoster.filter((member) => member.status === "Leave").length;

  return {
    staffed: onDuty.length,
    leave,
    command,
    officers,
    drivers,
    als,
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
