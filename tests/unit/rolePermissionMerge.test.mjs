// The browser's role permissions (src/lib/permissions.js) match the server's
// (functions/lib/memberGrants.js): a department's saved role sits on top of the
// built-in defaults, so permissions added after the role was saved still apply.
// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mergeRolePermissions } from "../../src/lib/permissions.js";

const require = createRequire(import.meta.url);
const { computeMemberPermissions } = require("../../functions/lib/memberGrants.js");

const truthy = (map) => Object.keys(map).filter((k) => map[k] === true).sort();

describe("role permissions with a saved department role", () => {
  const saved = { firefighter: { permissions: { viewSchedule: true, viewEmsEquipment: false } } };

  it("keeps the saved choices and fills permissions the saved role doesn't mention", () => {
    const merged = mergeRolePermissions(["firefighter"], saved);
    assert.equal(merged.viewEmsEquipment, false, "a permission the department turned off stays off");
    assert.equal(merged.viewEmsCheckoffs, true, "a newer permission gets its built-in default");
    assert.equal(merged.viewSchedule, true);
  });

  it("gives the same permissions as the server for built-in roles", () => {
    for (const roleId of ["fireChief", "battalionChief", "companyOfficer", "firefighter", "readOnly", "itAdmin"]) {
      const browser = truthy(mergeRolePermissions([roleId], saved));
      const server = truthy(computeMemberPermissions({ roleIds: [roleId] }, saved));
      assert.deepEqual(browser, server, roleId);
    }
  });
});
