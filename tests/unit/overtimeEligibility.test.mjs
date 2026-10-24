import { test } from "node:test";
import assert from "node:assert/strict";
import { checkOvertimeEligibility } from "../../src/lib/overtimeEligibility.js";
import { defaultShiftRotation } from "../../src/data/defaultShiftRotation.js";

// 2026-06-07 is an A Shift day in the default rotation.
const DAY = "2026-06-07";
const personnel = [
  { id: "A1", firstName: "Alex", lastName: "Able", shift: "A Shift", status: "Active", rank: "Firefighter" },
  { id: "A2", firstName: "Ana", lastName: "Avery", shift: "A Shift", status: "Active", rank: "Firefighter" },
  { id: "B1", firstName: "Ben", lastName: "Baker", shift: "B Shift", status: "Active", rank: "Firefighter" },
  { id: "C1", firstName: "Cara", lastName: "Cole", shift: "C Shift", status: "Active", rank: "Firefighter" },
];
const base = { dayId: DAY, unit: "Engine 1", personnel, rotation: defaultShiftRotation, knownUnits: ["Engine 1", "Truck 3"] };
const person = (id) => personnel.find((p) => p.id === id);

test("an off-platoon member who isn't rostered can take overtime on a real unit", () => {
  const result = checkOvertimeEligibility({ ...base, person: person("B1"), roster: [] });
  assert.equal(result.ok, true);
  assert.equal(result.unit, "Engine 1");
});

test("overtime needs a real unit", () => {
  for (const unit of ["", "Unassigned", "Leave"]) {
    const result = checkOvertimeEligibility({ ...base, unit, person: person("B1"), roster: [] });
    assert.equal(result.ok, false);
    assert.match(result.reason, /unit/i);
  }
});

test("someone on the working platoon is already working", () => {
  const result = checkOvertimeEligibility({ ...base, person: person("A1"), roster: [] });
  assert.equal(result.ok, false);
  assert.match(result.reason, /already working/i);
});

test("someone on the working platoon who is on leave is told to change the leave first", () => {
  const roster = [{ id: `P-A2:${DAY}`, personnelId: "A2", dayId: DAY, apparatus: "Leave" }];
  const result = checkOvertimeEligibility({ ...base, person: person("A2"), roster });
  assert.equal(result.ok, false);
  assert.match(result.reason, /on leave/i);
});

test("an off-platoon member already covering a partial slot can't be booked again", () => {
  const roster = [{ id: `P-C1:${DAY}:Truck 3:slot-0`, personnelId: "C1", dayId: DAY, apparatus: "Truck 3", status: "On Duty" }];
  const result = checkOvertimeEligibility({ ...base, person: person("C1"), roster });
  assert.equal(result.ok, false);
  assert.match(result.reason, /already on the roster/i);
});
