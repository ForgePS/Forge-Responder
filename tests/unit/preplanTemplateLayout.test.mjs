// Preplan template layout: moving sections and fields.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addField,
  addSectionAtTop,
  moveField,
  moveSection,
  removeField,
  updateField,
} from "../../src/lib/inspections/preplanTemplateLayout.js";

const sections = () => [
  { id: "a", title: "A", fields: [{ key: "a1" }, { key: "a2" }, { key: "a3" }] },
  { id: "b", title: "B", fields: [{ key: "b1" }] },
  { id: "c", title: "C", fields: [] },
];
const keys = (list) => list.map((s) => `${s.id}:${(s.fields || []).map((f) => f.key).join(",")}`);

describe("moveSection", () => {
  it("moves a section up and down", () => {
    assert.deepEqual(moveSection(sections(), 2, 0).map((s) => s.id), ["c", "a", "b"]);
    assert.deepEqual(moveSection(sections(), 0, 2).map((s) => s.id), ["b", "c", "a"]);
  });
  it("ignores an out-of-range move", () => {
    assert.deepEqual(moveSection(sections(), 5, 0).map((s) => s.id), ["a", "b", "c"]);
  });
});

describe("moveField", () => {
  it("reorders within a section", () => {
    assert.deepEqual(keys(moveField(sections(), { section: 0, index: 2 }, { section: 0, index: 0 }))[0], "a:a3,a1,a2");
  });
  it("moves into another section, including an empty one", () => {
    const moved = moveField(sections(), { section: 0, index: 1 }, { section: 1, index: 0 });
    assert.deepEqual(keys(moved).slice(0, 2), ["a:a1,a3", "b:a2,b1"]);
    assert.deepEqual(keys(moveField(sections(), { section: 1, index: 0 }, { section: 2, index: 0 })).slice(1), ["b:", "c:b1"]);
  });
  it("keeps field keys", () => {
    const moved = moveField(sections(), { section: 0, index: 0 }, { section: 2, index: 0 });
    assert.equal(moved[2].fields[0].key, "a1");
  });
});

describe("editing", () => {
  it("adds a field with a key no other field uses", () => {
    const next = addField(sections(), 1, 1000);
    assert.equal(next[1].fields.length, 2);
    const twice = addField(next, 1, 1000);
    assert.notEqual(twice[1].fields[1].key, twice[1].fields[2].key);
  });
  it("updates and removes a field", () => {
    assert.equal(updateField(sections(), 0, 1, { label: "X" })[0].fields[1].label, "X");
    assert.deepEqual(keys(removeField(sections(), 0, 0))[0], "a:a2,a3");
  });
  it("adds new sections at the top", () => {
    assert.equal(addSectionAtTop(sections(), 1)[0].title, "New section");
  });
});
