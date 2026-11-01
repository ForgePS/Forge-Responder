/**
 * Can this member be put on a given day's roster as overtime?
 * Used by overtime offers, approved vacancy pickups and call-shift assignments,
 * so all three follow the same rules as the roster itself.
 */
import { buildDayRoster, resolveRosterPersonnelId } from "./schedulingRoster.js";
import { canonicalApparatusUnitName } from "./apparatusSchema.js";
import { parseDayId, shiftForDate } from "./shiftCalendar.js";
import { getPersonDisplayName } from "./personnelSchema.js";

/**
 * @returns {{ ok: true, unit: string } | { ok: false, reason: string }}
 */
export function checkOvertimeEligibility({
  person,
  dayId,
  unit = "",
  roster = [],
  personnel = [],
  rotation,
  leaveRequests = [],
  shiftTrades = [],
  knownUnits = [],
} = {}) {
  if (!person || !dayId) return { ok: false, reason: "Choose a member and a day." };
  const name = getPersonDisplayName(person) || "This member";

  // Overtime has to sit on a real unit, or the roster can't show or count it.
  const normalizedUnit = canonicalApparatusUnitName(unit || "");
  if (!normalizedUnit || normalizedUnit === "Unassigned" || normalizedUnit === "Leave") {
    return { ok: false, reason: "Choose the unit they'll ride on first." };
  }

  const dutyShift = String(shiftForDate(parseDayId(dayId), rotation) || "").trim();
  const thatDay = buildDayRoster({
    roster,
    personnel,
    selectedShift: dutyShift,
    selectedDayId: dayId,
    leaveRequests,
    shiftTrades,
    knownUnits,
  });
  const onDutyList = thatDay.find((member) => member.personnelId === person.id);

  // Their own platoon works that day.
  if (onDutyList) {
    if (/leave/i.test(onDutyList.status || "")) {
      return { ok: false, reason: `${name} is on leave that day. Cancel or change their leave first, then put them back on the daily roster.` };
    }
    return { ok: false, reason: `${name} is already working that day.` };
  }
  const homeShift = String(person.shift || "").trim();
  if (homeShift && dutyShift && homeShift === dutyShift) {
    // Their platoon works but they're not listed: they traded the shift away.
    return { ok: false, reason: `${name} traded this shift away. Change the trade first if they're working after all.` };
  }

  // Any assignment already saved for that day (partial slot, overtime, manual add).
  const alreadyAssigned = roster.some((member) => (
    member.dayId === dayId
    && resolveRosterPersonnelId(member.id, member.personnelId) === person.id
    && canonicalApparatusUnitName(member.apparatus || "") !== "Leave"
  ));
  if (alreadyAssigned) return { ok: false, reason: `${name} is already on the roster that day.` };

  return { ok: true, unit: normalizedUnit };
}
