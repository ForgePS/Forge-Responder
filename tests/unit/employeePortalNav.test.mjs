import test from "node:test";
import assert from "node:assert/strict";
import { mergeMembershipPermissions } from "../../src/lib/userPermissions.js";

test("firefighters can open the Field App from the Employee Portal", () => {
  const perms = mergeMembershipPermissions({ role: "firefighter", roleIds: ["firefighter"] }, {});
  assert.equal(Boolean(perms.viewHydrants), true);
  assert.equal(Boolean(perms.accessAdminRms), false);
});
