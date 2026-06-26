import { buildAutoTimeCardDay, buildTimeCardModel } from "../src/lib/timeCardWorkflow.js";
import { defaultPayRules, normalizePayRules } from "../src/lib/payRules.js";
import { defaultShiftRotation } from "../src/data/defaultShiftRotation.js";
import { isPlatoonWorkDay, shiftForDate, parseDayId } from "../src/lib/shiftCalendar.js";

const person = { id: "P1", name: "Test", shift: "A Shift" };
const membership = { personnelId: "P1" };

for (const dayId of ["2026-05-25", "2026-07-04", "2026-06-10"]) {
  const date = parseDayId(dayId);
  const dayShift = shiftForDate(date, defaultShiftRotation);
  const isWork = isPlatoonWorkDay(date, person.shift, defaultShiftRotation);
  const auto = buildAutoTimeCardDay({
    dayId,
    myPerson: person,
    membership,
    rotation: defaultShiftRotation,
    payRules: defaultPayRules,
  });
  console.log(dayId, { dayShift, isWork, holiday: auto.leaveHours?.holiday, regular: auto.regularHours, label: auto.statusLabel });
}

const model = buildTimeCardModel({
  referenceDayId: "2026-06-10",
  payPeriod: { startDate: "2026-06-07", endDate: "2026-06-20" },
  myPerson: person,
  membership,
  rotation: defaultShiftRotation,
  payRules: defaultPayRules,
});
console.log("Jun period holidays:", model.days.filter((d) => d.leaveHours?.holiday > 0).map((d) => d.id));
console.log("Empty holidays count:", normalizePayRules({ holidays: [] }).holidays.length);
console.log("Default holidays count:", normalizePayRules({}).holidays.length);
