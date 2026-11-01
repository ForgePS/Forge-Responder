import { test } from "node:test";
import assert from "node:assert/strict";
import { checkProblems, checkProgress, passAnswer, readinessLabel } from "../../src/lib/fleet/checkProgress.js";

const sections = [
  { id: "s1", title: "Exterior", fields: [
    { key: "intro", type: "instruction", label: "Walk around" },
    { key: "lights", type: "pass_fail", label: "Lights", required: true, noteRequiredOnFail: true },
    { key: "tires", type: "pass_fail_na", label: "Tires" },
  ] },
  { id: "s2", title: "Readings", fields: [
    { key: "fuel", type: "fuel_level", label: "Fuel", required: true },
  ] },
];

test("progress counts only answerable items", () => {
  assert.deepEqual(checkProgress(sections, {}), { answered: 0, total: 3, percent: 0 });
  assert.deepEqual(checkProgress(sections, { lights: "Pass", fuel: "75" }), { answered: 2, total: 3, percent: 67 });
});

test("required blanks and missing fail notes are reported", () => {
  const blank = checkProblems(sections, { tires: "Pass" }, {});
  assert.deepEqual(blank.missing.map((f) => f.key), ["lights", "fuel"]);
  const failedNoNote = checkProblems(sections, { lights: "Fail", fuel: "0" }, {});
  assert.equal(failedNoNote.missing.length, 0, "0 counts as an answer");
  assert.deepEqual(failedNoNote.missingNotes.map((f) => f.key), ["lights"]);
  assert.equal(checkProblems(sections, { lights: "Fail", fuel: "50" }, { lights: "Left headlight out" }).missingNotes.length, 0);
});

test("quick-pass answer and readiness wording", () => {
  assert.equal(passAnswer({ type: "pass_fail_na" }), "Pass");
  assert.equal(passAnswer({ type: "yes_no" }), "Yes");
  assert.equal(passAnswer({ type: "fuel_level" }), null);
  assert.equal(readinessLabel("available_restricted"), "In service with restrictions");
});
