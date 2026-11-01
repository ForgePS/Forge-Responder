// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateYearNumber,
  counterKeyFor,
  formatYearNumber,
  highestYearSequence,
  nerisReportNumberFormat,
  nextCounterValue,
  nextLocalYearNumber,
  parseYearSequence,
  preplanNumberFormat,
} from "../../src/lib/recordNumbering.js";

const PP = { prefix: "PP", separator: "-", padding: 4, year: 2026 };
const NERIS = { prefix: "NERIS", separator: "-", padding: 3, year: 2026 };

describe("record number formatting", () => {
  it("formats and parses year-sequence numbers", () => {
    assert.equal(formatYearNumber(PP, 7), "PP-2026-0007");
    assert.equal(formatYearNumber(NERIS, 14), "NERIS-2026-014");
    assert.equal(parseYearSequence("PP-2026-0042", PP), 42);
    assert.equal(parseYearSequence("PP-2025-0042", PP), 0);
    assert.equal(parseYearSequence("PP-LX3K9-ABC", PP), 0);
    assert.equal(parseYearSequence("", PP), 0);
  });

  it("supports configurable separators with regex characters", () => {
    const f = { prefix: "FP", separator: ".", padding: 5, year: 2026 };
    assert.equal(formatYearNumber(f, 9), "FP.2026.00009");
    assert.equal(parseYearSequence("FPx2026x00009", f), 0);
    assert.equal(parseYearSequence("FP.2026.00009", f), 9);
  });

  it("finds the highest sequence, ignoring other years and junk", () => {
    assert.equal(highestYearSequence(PP, ["PP-2026-0003", "PP-2026-0010", "PP-2025-0999", null, "PP-301"]), 10);
    assert.equal(highestYearSequence(PP, []), 0);
  });

  it("builds counter keys with the year", () => {
    assert.equal(counterKeyFor("preplan", 2026), "preplan-2026");
    assert.equal(preplanNumberFormat(new Date(2027, 0, 1)).year, 2027);
    assert.equal(nerisReportNumberFormat(new Date(2026, 5, 1)).padding, 3);
  });
});

describe("shared counter value", () => {
  it("moves one past the higher of stored value and floor", () => {
    assert.equal(nextCounterValue(0, 0), 1);
    assert.equal(nextCounterValue(5, 0), 6);
    assert.equal(nextCounterValue(5, 12), 13);
    assert.equal(nextCounterValue(20, 12), 21);
  });

  it("treats a missing or bad stored value as 0", () => {
    assert.equal(nextCounterValue(undefined, 3), 4);
    assert.equal(nextCounterValue(Number.NaN, 0), 1);
    assert.equal(nextCounterValue(-4, -1), 1);
    assert.equal(nextCounterValue(2.5, 0), 1);
  });
});

describe("allocateYearNumber", () => {
  it("uses the shared counter and passes the highest loaded sequence as the floor", async () => {
    let seenFloor = null;
    const result = await allocateYearNumber(PP, ["PP-2026-0004", "PP-2026-0002"], async (floor) => {
      seenFloor = floor;
      return 9;
    });
    assert.equal(seenFloor, 4);
    assert.deepEqual(result, { number: "PP-2026-0009", shared: true });
  });

  it("gives two simultaneous creators different numbers when the counter is shared", async () => {
    let stored = 0;
    const claim = async (floor) => { stored = nextCounterValue(stored, floor); return stored; };
    const loaded = ["PP-2026-0003"];
    const [a, b] = await Promise.all([allocateYearNumber(PP, loaded, claim), allocateYearNumber(PP, loaded, claim)]);
    assert.notEqual(a.number, b.number);
    assert.deepEqual([a.number, b.number].sort(), ["PP-2026-0004", "PP-2026-0005"]);
  });

  it("falls back to highest loaded + 1 when the counter fails", async () => {
    const result = await allocateYearNumber(NERIS, ["NERIS-2026-013"], async () => { throw new Error("offline"); });
    assert.deepEqual(result, { number: "NERIS-2026-014", shared: false });
  });

  it("falls back when no claim is given or the claim returns nonsense", async () => {
    assert.equal((await allocateYearNumber(PP, [])).number, "PP-2026-0001");
    assert.equal((await allocateYearNumber(PP, ["PP-2026-0001"], async () => 0)).shared, false);
  });

  it("never returns a number already in the loaded list", async () => {
    // Odd padding history: "PP-2026-01" parses as 1, but "PP-2026-0002" is already taken.
    const loaded = ["PP-2026-01", "PP-2026-0002"];
    assert.equal(nextLocalYearNumber(PP, loaded), "PP-2026-0003");
    const viaCounter = await allocateYearNumber(PP, ["PP-2026-0005"], async () => 5);
    assert.equal(viaCounter.number, "PP-2026-0006");
  });
});
