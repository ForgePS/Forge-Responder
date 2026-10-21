// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nextPersonnelIds } from "../../src/lib/personnelImport.js";

describe("personnel IDs use the department's prefix", () => {
  it("numbers new IDs after the highest existing ID with that prefix", () => {
    const existing = [{ id: "CA-104" }, { id: "CA-101" }, { id: "HL-900" }];
    assert.deepEqual(nextPersonnelIds(existing, 2, "CA"), ["CA-105", "CA-106"]);
  });

  it("starts at 101 for a new department and ignores other prefixes", () => {
    assert.deepEqual(nextPersonnelIds([{ id: "HL-500" }], 1, "CA"), ["CA-101"]);
  });
});
