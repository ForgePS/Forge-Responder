// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDepartmentAdminMembership, twoFactorRequirement } from "../../src/lib/twoFactor.js";

const DAY = 24 * 3600 * 1000;
const now = new Date("2026-11-01T12:00:00Z");
const chief = { role: "department_admin", roleIds: ["fireChief"] };
const ff = { role: "firefighter", roleIds: ["firefighter"] };

describe("who must use two-factor", () => {
  it("platform creators always", () => {
    assert.equal(twoFactorRequirement({ isCreator: true, now }).level, "required");
  });

  it("department admins: nothing until a deadline is set, then a countdown, then required", () => {
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "camden", now }).level, "none");
    const grace = twoFactorRequirement({ membership: chief, departmentId: "camden", deadline: new Date(now.getTime() + 3.5 * DAY), now });
    assert.deepEqual([grace.level, grace.daysLeft], ["grace", 4]);
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "camden", deadline: new Date(now.getTime() - DAY), now }).level, "required");
    // Firestore Timestamp-like values work too.
    const ts = { seconds: Math.floor((now.getTime() - DAY) / 1000) };
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "camden", deadline: ts, now }).level, "required");
  });

  it("never for other staff, the demo department, or demo mode", () => {
    const past = new Date(now.getTime() - DAY);
    assert.equal(twoFactorRequirement({ membership: ff, departmentId: "camden", deadline: past, now }).level, "none");
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "forge-demo", deadline: past, now }).level, "none");
    assert.equal(twoFactorRequirement({ isCreator: true, demo: true, now }).level, "none");
  });

  it("recognises admins the same way the rules do", () => {
    assert.equal(isDepartmentAdminMembership({ roleIds: ["itAdmin"] }), true);
    assert.equal(isDepartmentAdminMembership({ role: "department_admin" }), true);
    assert.equal(isDepartmentAdminMembership(ff), false);
  });
});
