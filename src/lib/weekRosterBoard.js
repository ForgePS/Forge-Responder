import { APPARATUS_UNASSIGNED_STATION, groupApparatusByStation } from "./apparatusGrouping.js";
import { formatShiftDutyWindow } from "./scheduleCalendarView.js";
import { buildApparatusCrewSlotRows } from "./schedulingRoster.js";
import { DEFAULT_ROSTER_COMMAND_UNIT } from "./schedulingSettings.js";
import { parseDayId } from "./shiftCalendar.js";

export function formatDepartmentRosterTitle(name = "") {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "Fire Department";
  if (/department$/i.test(trimmed)) return trimmed;
  const withoutEms = trimmed.replace(/\s*\/\s*EMS$/i, "").trim();
  if (/fire/i.test(withoutEms)) return `${withoutEms} Department`;
  return `${withoutEms} Fire Department`;
}

export function formatStationRosterLabel(stationName = "", departmentName = "") {
  const station = String(stationName || "").trim();
  if (!station || /^unassigned$/i.test(station)) return station;

  if (/fire station/i.test(station)) return station;

  const dept = String(departmentName || "")
    .replace(/\s*\/\s*EMS$/i, "")
    .replace(/\s+department$/i, "")
    .trim();

  const numberMatch = station.match(/(\d+)/);
  if (dept && numberMatch) {
    return `${dept} Fire Station ${numberMatch[1]}`;
  }

  if (dept && !/^station/i.test(station)) {
    return `${dept} ${station}`;
  }

  if (dept) {
    return `${dept} ${station.replace(/^station/i, "Fire Station")}`;
  }

  return station.replace(/^station/i, "Fire Station");
}

export function buildUnitStationMap(apparatus = []) {
  return Object.fromEntries(
    (Array.isArray(apparatus) ? apparatus : []).map((unit) => [
      unit.unit,
      String(unit.station || "").trim(),
    ])
  );
}

export function organizeDailyRosterBoard(stationGroups = [], commandUnit = DEFAULT_ROSTER_COMMAND_UNIT) {
  const commandUnits = [];
  const normalizedCommand = String(commandUnit || "").trim();

  const stationGroupsFiltered = stationGroups
    .map((group) => ({
      ...group,
      units: group.units.filter((unitEntry) => {
        if (normalizedCommand && unitEntry.unit === normalizedCommand) {
          commandUnits.push(unitEntry);
          return false;
        }
        return true;
      }),
    }))
    .filter((group) => group.units.length > 0)
    .filter((group) => group.station !== APPARATUS_UNASSIGNED_STATION);

  return { commandUnits, stationGroups: stationGroupsFiltered };
}

export function buildWeekRosterDayBoard({
  daySnapshot = {},
  displayUnits = [],
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
  personnel = [],
  schedulingSettings = null,
} = {}) {
  const unitStationMap = buildUnitStationMap(apparatus);
  const rosterUnits = (Array.isArray(displayUnits) ? displayUnits : [])
    .map(String)
    .filter(Boolean);

  const pseudoUnits = rosterUnits.map((unit) => ({
    unit,
    station: unitStationMap[unit] || "",
  }));

  const stationGroups = groupApparatusByStation(pseudoUnits, stationNames);
  const timeWindow = formatShiftDutyWindow(daySnapshot.id, shiftChangeTime);
  const endWeekday = parseDayId(daySnapshot.id);
  endWeekday.setDate(endWeekday.getDate() + 1);
  const endWeekdayLabel = endWeekday.toLocaleDateString("en-US", { weekday: "short" });
  const startTime = String(shiftChangeTime || "07:00").slice(0, 5);

  const stationGroupsWithUnits = stationGroups.map(({ station, units }) => ({
    station,
    stationLabel: formatStationRosterLabel(station, departmentName),
    units: units
      .map(({ unit }) => unit)
      .filter((unit) => rosterUnits.includes(unit))
      .map((unit) => {
        const group = daySnapshot.apparatusGroups?.grouped?.find((entry) => entry.unit === unit);
        const { rows } = buildApparatusCrewSlotRows({
          unit,
          crew: group?.crew || [],
          personnel,
          apparatus,
          schedulingSettings,
          dayId: daySnapshot.id,
          shiftChangeTime,
          timeWindow,
        });
        const crew = rows
          .filter((row) => !row.isOpen && row.status !== "Leave" && !/leave/i.test(row.status))
          .map((row) => ({
            id: row.id,
            personnelId: row.personnelId,
            name: row.name,
            role: row.role,
            status: row.status,
            assignmentValue: row.assignmentValue,
            apparatus: row.apparatus,
            timeWindow,
            timeStart: startTime,
            timeEndLabel: endWeekdayLabel,
          }));
        const vacancies = rows
          .filter((row) => row.isOpen)
          .map((row, index) => ({
            id: row.id,
            role: row.role,
            tone: index % 2 === 0 ? "warning" : "critical",
          }));

        return {
          unit,
          crew,
          vacancies,
          hasVacancy: vacancies.length > 0,
          isStaffed: crew.length > 0 && vacancies.length === 0,
        };
      }),
  })).filter((group) => group.units.length > 0);

  const { commandUnits, stationGroups: orderedStationGroups } = organizeDailyRosterBoard(
    stationGroupsWithUnits
  );

  return {
    dayId: daySnapshot.id,
    weekday: daySnapshot.weekday || parseDayId(daySnapshot.id).toLocaleDateString("en-US", { weekday: "long" }),
    weekdayShort: parseDayId(daySnapshot.id).toLocaleDateString("en-US", { weekday: "short" }),
    calendarDay: parseDayId(daySnapshot.id).getDate(),
    dateLabel: daySnapshot.date,
    shift: daySnapshot.shift,
    departmentTitle: formatDepartmentRosterTitle(departmentName),
    timeWindow,
    timeStart: startTime,
    timeEndLabel: endWeekdayLabel,
    commandUnits,
    stationGroups: orderedStationGroups,
  };
}

export function buildDailyRosterDayBoard({
  daySnapshot = {},
  displayUnits = [],
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
  personnel = [],
  schedulingSettings = null,
} = {}) {
  const unitStationMap = buildUnitStationMap(apparatus);
  const rosterUnits = (Array.isArray(displayUnits) ? displayUnits : [])
    .map(String)
    .filter(Boolean);

  const pseudoUnits = rosterUnits.map((unit) => ({
    unit,
    station: unitStationMap[unit] || "",
  }));

  const stationGroups = groupApparatusByStation(pseudoUnits, stationNames);
  const timeWindow = formatShiftDutyWindow(daySnapshot.id, shiftChangeTime);
  const endWeekday = parseDayId(daySnapshot.id);
  endWeekday.setDate(endWeekday.getDate() + 1);
  const endWeekdayLabel = endWeekday.toLocaleDateString("en-US", { weekday: "short" });
  const startTime = String(shiftChangeTime || "07:00").slice(0, 5);

  const stationGroupsWithUnits = stationGroups.map(({ station, units }) => ({
    station,
    stationLabel: formatStationRosterLabel(station, departmentName),
    units: units
      .map(({ unit }) => unit)
      .filter((unit) => rosterUnits.includes(unit))
      .map((unit) => {
        const group = daySnapshot.apparatusGroups?.grouped?.find((entry) => entry.unit === unit);
        const crew = group?.crew || [];
        const { rows, openCount } = buildApparatusCrewSlotRows({
          unit,
          crew,
          personnel,
          apparatus,
          schedulingSettings,
          dayId: daySnapshot.id,
          shiftChangeTime,
          timeWindow,
        });

        return {
          unit,
          crew: rows.filter((row) => !row.isOpen),
          vacancies: rows.filter((row) => row.isOpen),
          members: rows,
          hasVacancy: openCount > 0,
          staffingLabel: openCount > 0
            ? `${openCount} open slot${openCount === 1 ? "" : "s"}`
            : "Fully Staffed",
        };
      }),
  })).filter((group) => group.units.length > 0);

  const { commandUnits, stationGroups: orderedStationGroups } = organizeDailyRosterBoard(
    stationGroupsWithUnits
  );

  return {
    dayId: daySnapshot.id,
    dateLabel: daySnapshot.date,
    shift: daySnapshot.shift,
    timeWindow,
    commandUnits,
    stationGroups: orderedStationGroups,
  };
}

export function buildWeekRosterBoardModel({
  weekSnapshots = [],
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
  personnel = [],
  schedulingSettings = null,
} = {}) {
  if (!weekSnapshots.length) return [];

  const displayUnits = weekSnapshots[0]?.displayUnits || [];

  return weekSnapshots.map((daySnapshot) => buildWeekRosterDayBoard({
    daySnapshot,
    displayUnits,
    apparatus,
    stationNames,
    departmentName,
    shiftChangeTime,
    personnel,
    schedulingSettings,
  }));
}
