import test from "node:test";
import assert from "node:assert/strict";
import { mergeMembershipPermissions } from "../../src/lib/userPermissions.js";

test("firefighters can open the Field App and report hydrant damage, but not edit hydrants", () => {
  const perms = mergeMembershipPermissions({ role: "firefighter", roleIds: ["firefighter"] }, {});
  assert.equal(Boolean(perms.viewHydrants), true);
  assert.equal(Boolean(perms.createHydrantDamageReports), true);
  assert.equal(Boolean(perms.editHydrants), false);
  assert.equal(Boolean(perms.accessAdminRms), false);
});
