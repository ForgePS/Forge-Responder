// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isDepartmentAdminMembership, SECOND_FACTOR_ENFORCED, twoFactorRequirement } from "../../src/lib/twoFactor.js";

const DAY = 24 * 3600 * 1000;
const now = new Date("2026-11-01T12:00:00Z");
const chief = { role: "department_admin", roleIds: ["fireChief"] };

// Two-step sign-in codes are optional for everyone (2026-10-29).
describe("two-step sign-in is optional", () => {
  it("is switched off", () => {
    assert.equal(SECOND_FACTOR_ENFORCED, false);
  });

  it("nobody is required: creators, admins past a deadline, or anyone else", () => {
    const past = new Date(now.getTime() - DAY);
    assert.equal(twoFactorRequirement({ isCreator: true, now }).level, "none");
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "camden", deadline: past, now }).level, "none");
    assert.equal(twoFactorRequirement({ membership: chief, departmentId: "camden", deadline: new Date(now.getTime() + DAY), now }).level, "none");
  });

  it("still recognises admins the same way the rules do", () => {
    assert.equal(isDepartmentAdminMembership({ roleIds: ["itAdmin"] }), true);
    assert.equal(isDepartmentAdminMembership({ role: "department_admin" }), true);
    assert.equal(isDepartmentAdminMembership({ roleIds: ["firefighter"] }), false);
  });
});
