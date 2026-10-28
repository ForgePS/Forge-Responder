import { test } from "node:test";
import assert from "node:assert/strict";
import { isAdminMembershipRoles, isLockedAdminPermission, withLockedAdminPermissions, saveErrorMessage } from "../../src/lib/adminGuards.js";
import { isValidTimezone } from "../../src/lib/timezone.js";

test("admin roles match the rules' definition", () => {
  assert.equal(isAdminMembershipRoles({ roleIds: ["fireChief"] }), true);
  assert.equal(isAdminMembershipRoles({ roleIds: ["itAdmin", "firefighter"] }), true);
  assert.equal(isAdminMembershipRoles({ role: "department_admin", roleIds: [] }), true);
  assert.equal(isAdminMembershipRoles({ roleIds: ["firefighter"] }), false);
  assert.equal(isAdminMembershipRoles(null), false);
});

test("Fire Chief and IT Admin always keep System Admin access", () => {
  assert.equal(isLockedAdminPermission("fireChief", "manageUsers"), true);
  assert.equal(isLockedAdminPermission("firefighter", "manageUsers"), false);
  assert.equal(isLockedAdminPermission("itAdmin", "viewPersonnel"), false);
  assert.deepEqual(withLockedAdminPermissions("itAdmin", { manageUsers: false, viewPersonnel: true }),
    { manageUsers: true, manageSystemSettings: true, viewPersonnel: true });
  assert.deepEqual(withLockedAdminPermissions("captain", { manageUsers: false }), { manageUsers: false });
});

test("save errors are explained in plain words", () => {
  assert.match(saveErrorMessage({ code: "permission-denied" }), /Fire Chief or IT Admin/);
  assert.match(saveErrorMessage({ code: "unavailable" }), /offline/);
  assert.match(saveErrorMessage(new Error("x")), /Nothing was changed/);
});

test("only real timezones are accepted", () => {
  assert.equal(isValidTimezone("America/Chicago"), true);
  assert.equal(isValidTimezone("Central"), false);
  assert.equal(isValidTimezone(""), false);
});
