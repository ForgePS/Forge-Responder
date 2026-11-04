// Newer default dropdown options reach departments set up earlier.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { upgradeDropdownOptions } from "../../src/lib/dropdownUpgrade.js";
import { DEFAULT_OPTION_RENAMES, defaultDropdowns } from "../../src/data/defaultDropdowns.js";

const defaults = (id) => defaultDropdowns.find((item) => item.id === id);
const labels = (options) => options.map((option) => option.label);

describe("dropdown upgrade", () => {
  it("adds the new ranks after the department's own", () => {
    const record = { id: "ranks", options: [
      { id: "fireChief", label: "Fire Chief", active: true, sortOrder: 1 },
      { id: "captain", label: "Captain", active: true, sortOrder: 2 },
      { id: "custom", label: "Probationary", active: true, sortOrder: 3 },
    ] };
    const next = upgradeDropdownOptions(record, defaults("ranks"), DEFAULT_OPTION_RENAMES);
    for (const label of ["Paramedic", "EMT", "Firefighter/EMT", "Driver/Engineer"]) assert.ok(labels(next).includes(label), label);
    assert.deepEqual(labels(next).slice(0, 3), ["Fire Chief", "Captain", "Probationary"]);
    assert.ok(next.slice(3).every((option, index) => option.sortOrder === 4 + index));
  });

  it("adds Paid Per Call to shifts and EMT to positions, renames Medic", () => {
    const shifts = upgradeDropdownOptions({ id: "shifts", options: [{ id: "aShift", label: "A Shift", active: true, sortOrder: 1 }] }, defaults("shifts"), DEFAULT_OPTION_RENAMES);
    assert.ok(labels(shifts).includes("Paid Per Call"));
    const positions = upgradeDropdownOptions({ id: "personnelPositions", options: [{ id: "medic", label: "Medic", active: true, sortOrder: 6 }] }, defaults("personnelPositions"), DEFAULT_OPTION_RENAMES);
    assert.equal(positions.find((option) => option.id === "medic").label, "Paramedic");
    assert.ok(labels(positions).includes("EMT"));
  });

  it("leaves a department's own wording and switched-off options alone", () => {
    const record = { id: "personnelPositions", options: [
      { id: "medic", label: "Medic I", active: true, sortOrder: 1 },
      { id: "x", label: "emt", active: false, sortOrder: 2 },
    ] };
    const next = upgradeDropdownOptions(record, { options: [{ id: "emt", label: "EMT" }] }, DEFAULT_OPTION_RENAMES);
    assert.equal(next, null);
  });

  it("does nothing once up to date", () => {
    const record = { id: "ranks", options: defaults("ranks").options };
    assert.equal(upgradeDropdownOptions(record, defaults("ranks"), DEFAULT_OPTION_RENAMES), null);
  });
});
