import { test } from "node:test";
import assert from "node:assert/strict";
import { daysUntil, dutyDayId, parseLooseDate, withLiveCertDays } from "../../src/lib/liveDates.js";

const now = new Date(2026, 9, 31, 10, 0); // Oct 31, 2026 10:00

test("reads the date formats certifications use", () => {
  assert.equal(parseLooseDate("Dec 18, 2026").getDate(), 18);
  assert.equal(parseLooseDate("2026-12-18").getMonth(), 11);
  assert.equal(parseLooseDate("not a date"), null);
});

test("days until counts whole days from today", () => {
  assert.equal(daysUntil("2026-11-01", now), 1);
  assert.equal(daysUntil("Oct 31, 2026", now), 0);
  assert.equal(daysUntil("2026-10-30", now), -1);
});

test("certification status follows the expiration date", () => {
  assert.deepEqual(
    [withLiveCertDays({ expires: "2026-11-10", status: "Active", days: 460 }, now)].map((c) => [c.days, c.status])[0],
    [10, "Due Soon"],
  );
  assert.equal(withLiveCertDays({ expires: "2026-10-01", status: "Active" }, now).status, "Expired");
  assert.equal(withLiveCertDays({ expires: "2027-10-01", status: "Due Soon" }, now).status, "Active");
  assert.equal(withLiveCertDays({ expires: "2026-10-01", status: "Revoked" }, now).status, "Revoked");
  assert.equal(withLiveCertDays({ status: "Active", days: 5 }, now).days, 5, "no expiration date: left alone");
});

test("the on-duty day changes at shift change, not midnight", () => {
  assert.equal(dutyDayId(new Date(2026, 9, 31, 6, 59), "07:00"), "2026-10-30");
  assert.equal(dutyDayId(new Date(2026, 9, 31, 7, 0), "07:00"), "2026-10-31");
  assert.equal(dutyDayId(new Date(2026, 9, 31, 0, 30), "08:00"), "2026-10-30");
});
