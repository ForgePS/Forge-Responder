import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addDaysKey, dateKeyOf, localDateKey } from "../../src/lib/preplans/localDate.js";

describe("preplan local dates", () => {
  it("uses the local calendar day, not UTC", () => {
    // 10:48 PM local on Nov 24 is Nov 24, whatever the UTC date is.
    const lateEvening = new Date(2026, 10, 24, 22, 48);
    assert.equal(localDateKey(lateEvening), "2026-11-24");
    assert.equal(dateKeyOf(lateEvening.toISOString()), "2026-11-24");
  });

  it("keeps date-only values and adds days across month ends", () => {
    assert.equal(dateKeyOf("2026-11-24"), "2026-11-24");
    assert.equal(dateKeyOf(""), "");
    assert.equal(addDaysKey(7, new Date(2026, 10, 28, 23, 30)), "2026-12-05");
    assert.equal(localDateKey(new Date("not a date")), "");
  });
});
