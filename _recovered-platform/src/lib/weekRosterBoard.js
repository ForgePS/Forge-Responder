import { groupApparatusByStation } from "./apparatusGrouping.js";
import { formatShiftDutyWindow } from "./scheduleCalendarView.js";
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

export function buildWeekRosterDayBoard({
  daySnapshot = {},
  displayUnits = [],
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
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
    stationGroups: stationGroups.map(({ station, units }) => ({
      station,
      stationLabel: formatStationRosterLabel(station, departmentName),
      units: units
        .map(({ unit }) => unit)
        .filter((unit) => rosterUnits.includes(unit))
        .map((unit) => {
          const group = daySnapshot.apparatusGroups?.grouped?.find((entry) => entry.unit === unit);
          const crew = (group?.crew || [])
            .filter((member) => member.status !== "Leave")
            .map((member) => ({
              id: member.id,
              name: member.name,
              role: member.position || member.rank || "Firefighter",
              timeWindow,
              timeStart: startTime,
              timeEndLabel: endWeekdayLabel,
            }));
          const vacancies = (daySnapshot.apparatusVacancies || [])
            .filter((vacancy) => vacancy.apparatus === unit)
            .map((vacancy, index) => ({
              id: `${daySnapshot.id}-${unit}-vac-${index}`,
              role: vacancy.position || "Firefighter",
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
    })).filter((group) => group.units.length > 0),
  };
}

export function buildWeekRosterBoardModel({
  weekSnapshots = [],
  apparatus = [],
  stationNames = [],
  departmentName = "",
  shiftChangeTime = "07:00",
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
  }));
}
