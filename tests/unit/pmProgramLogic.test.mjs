import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildScheduleSyncPatch,
  describeAmount,
  describeInterval,
  distributeHours,
  programAppliesToAsset,
  triggerOptions,
  triggerWording,
  validatePmDraft,
} from "../../src/lib/fleet/pmProgramLogic.js";

const NOW = "2026-10-28T12:00:00.000Z";

test("interval is described in plain words", () => {
  assert.equal(describeInterval({ triggerType: "calendar_months", intervalValue: 12 }), "Every 12 months");
  assert.equal(describeInterval({ triggerType: "mileage", intervalValue: 5000 }), "Every 5,000 miles");
  assert.equal(describeInterval({ triggerType: "engine_hours", intervalValue: 1 }), "Every 1 engine hour");
  assert.equal(describeAmount(1, "days"), "1 day");
  assert.equal(describeAmount(0, "days"), "");
});

test("calendar triggers warn and grace in days; meters in their own unit", () => {
  assert.equal(triggerWording("calendar_months").warnUnit, "days");
  assert.equal(triggerWording("pump_hours").warnUnit, "pump hours");
  assert.ok(!triggerOptions().some((row) => row.id === "manual"));
  assert.ok(triggerOptions("manual").some((row) => row.id === "manual"));
});

test("applies to all vehicle types when no classes chosen", () => {
  assert.equal(programAppliesToAsset({ applicableClassIds: [] }, { fleetClassId: "engine" }), true);
  assert.equal(programAppliesToAsset({ applicableClassIds: ["engine"] }, { fleetClassId: "engine" }), true);
  assert.equal(programAppliesToAsset({ applicableClassIds: ["engine"] }, { fleetClassId: "tanker" }), false);
});

const calendarSchedule = {
  id: "s1", programId: "p1", programName: "Annual", fleetAssetId: "a1",
  triggerType: "calendar_months", intervalValue: 12, graceValue: 14, dueSoonValue: 30,
  priority: "high", lastCompletedAt: "2026-01-15T12:00:00.000Z", lastCompletedMeter: "",
  nextDueAt: "2027-01-15T00:00:00.000Z", nextDueMeter: "", status: "ok", active: true,
};
const calendarProgram = {
  id: "p1", name: "Annual", triggerType: "calendar_months", intervalValue: 12,
  graceValue: 14, dueSoonValue: 30, priority: "high", applicableClassIds: [], active: true,
};

test("sync is a no-op when nothing changed", () => {
  assert.equal(buildScheduleSyncPatch(calendarProgram, calendarSchedule, { id: "a1" }, NOW), null);
});

test("interval change recalculates next due from last completion, keeping history", () => {
  const patch = buildScheduleSyncPatch({ ...calendarProgram, intervalValue: 6 }, calendarSchedule, { id: "a1" }, NOW);
  assert.equal(patch.intervalValue, 6);
  assert.equal(patch.nextDueAt.slice(0, 10), "2026-07-15");
  assert.equal(patch.status, "overdue");
  assert.equal("lastCompletedAt" in patch, false);
  // applying the patch makes the next sync a no-op
  assert.equal(buildScheduleSyncPatch({ ...calendarProgram, intervalValue: 6 }, { ...calendarSchedule, ...patch }, { id: "a1" }, NOW), null);
});

test("rename and warning changes update without moving the due date", () => {
  const patch = buildScheduleSyncPatch({ ...calendarProgram, name: "Annual service", dueSoonValue: 60 }, calendarSchedule, { id: "a1" }, NOW);
  assert.equal(patch.programName, "Annual service");
  assert.equal(patch.dueSoonValue, 60);
  assert.equal("nextDueAt" in patch, false);
});

test("meter interval change keeps the recorded reading", () => {
  const schedule = {
    ...calendarSchedule, triggerType: "mileage", intervalValue: 5000, graceValue: 250, dueSoonValue: 500,
    lastCompletedMeter: 10000, nextDueMeter: 15000, nextDueAt: "",
  };
  const program = { ...calendarProgram, triggerType: "mileage", intervalValue: 3000, graceValue: 250, dueSoonValue: 500 };
  const patch = buildScheduleSyncPatch(program, schedule, { id: "a1", mileage: "12000" }, NOW);
  assert.equal(patch.nextDueMeter, 13000);
  assert.equal(patch.status, "ok");
});

test("turning off, removing, or excluding the class deactivates; re-including reactivates", () => {
  assert.equal(buildScheduleSyncPatch({ ...calendarProgram, active: false }, calendarSchedule, { id: "a1" }, NOW).active, false);
  assert.equal(buildScheduleSyncPatch({ ...calendarProgram, archived: true }, calendarSchedule, { id: "a1" }, NOW).active, false);
  assert.equal(buildScheduleSyncPatch({ ...calendarProgram, applicableClassIds: ["tanker"] }, calendarSchedule, { id: "a1", fleetClassId: "engine" }, NOW).active, false);
  assert.equal(buildScheduleSyncPatch(calendarProgram, calendarSchedule, null, NOW).active, false);
  const back = buildScheduleSyncPatch(calendarProgram, { ...calendarSchedule, active: false }, { id: "a1" }, NOW);
  assert.equal(back.active, true);
});

test("estimated hours split across tasks keeps the total", () => {
  assert.deepEqual(distributeHours(8, 2), [4, 4]);
  assert.deepEqual(distributeHours(2, 3), [0.66, 0.66, 0.68]);
  assert.deepEqual(distributeHours(5, 0), []);
  assert.deepEqual(distributeHours(0, 2), [0, 0]);
});

test("draft validation uses plain language", () => {
  assert.match(validatePmDraft({ name: "", intervalValue: 5 }), /name/);
  assert.match(validatePmDraft({ name: "Oil", triggerType: "mileage", intervalValue: 0 }), /How often/);
  assert.equal(validatePmDraft({ name: "Oil", triggerType: "mileage", intervalValue: 5000, dueSoonValue: 500, graceValue: 0 }), "");
});
