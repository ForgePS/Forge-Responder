// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { defaultRoles } from "../../src/data/defaultRoles.js";
import { mergeMembershipPermissions } from "../../src/lib/userPermissions.js";

const require = createRequire(import.meta.url);
const defaults = require("../../functions/lib/defaultRolePermissions.json");
const { computeMemberPermissions, rolePermissionsChanged } = require("../../functions/lib/memberGrants.js");

function trueKeys(map = {}) {
  return Object.keys(map).filter((key) => map[key] === true).sort();
}

describe("member grants", () => {
  it("server copy of the built-in roles matches the app", () => {
    const fromApp = Object.fromEntries(defaultRoles.map((role) => [role.id,
      Object.fromEntries(Object.entries(role.permissions || {}).map(([k, v]) => [k, Boolean(v)]))]));
    assert.deepEqual(defaults, fromApp, "run the generator in functions/lib/memberGrants.js header notes to refresh defaultRolePermissions.json");
  });

  const rolesById = {
    firefighter: { permissions: { ...defaults.firefighter, editTraining: true } },
    captain: { permissions: { editSchedule: true, viewSchedule: true } },
  };
  // The app fills stored roles with built-in defaults before merging (roleService).
  const appRoles = Object.fromEntries(Object.entries(rolesById).map(([id, role]) =>
    [id, { permissions: { ...(defaults[id] || {}), ...role.permissions } }]));

  const cases = [
    { roleIds: ["firefighter"], status: "active" },
    { roleIds: ["firefighter", "captain"], status: "active" },
    { roleIds: ["readOnly"], status: "active", permissions: { editPersonnel: true, viewPersonnel: false } },
    { role: "department_admin", status: "active" },
    { roleIds: '["itAdmin"]', status: "active" },
    { roleIds: ["unknownRole"], status: "active" },
  ];

  for (const membership of cases) {
    it(`matches the app for ${JSON.stringify(membership.roleIds || membership.role)}`, () => {
      const server = computeMemberPermissions(membership, rolesById);
      const app = mergeMembershipPermissions(membership, appRoles);
      assert.deepEqual(trueKeys(server), trueKeys(app));
    });
  }

  it("stores only granted keys", () => {
    const out = computeMemberPermissions({ roleIds: ["readOnly"] }, {});
    assert.ok(Object.values(out).every((value) => value === true));
    assert.equal(out.editPersonnel, undefined);
    assert.equal(out.viewPersonnel, true);
  });

  it("creator membership gets everything", () => {
    const out = computeMemberPermissions({ isPlatformCreator: true, roleIds: ["readOnly"] }, {});
    assert.equal(out.manageDepartments, true);
  });

  it("notices role permission changes only", () => {
    assert.equal(rolePermissionsChanged({ permissions: { a: true } }, { permissions: { a: true }, name: "x" }), false);
    assert.equal(rolePermissionsChanged({ permissions: { a: true } }, { permissions: { a: false } }), true);
    assert.equal(rolePermissionsChanged(undefined, { permissions: {} }), true);
  });
});
