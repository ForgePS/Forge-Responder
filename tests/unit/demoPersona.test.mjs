import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_PERSONAS, applyDemoPersona, setDemoPersona } from "../../src/lib/demoPersona.js";
import { mergeMembershipPermissions } from "../../src/lib/userPermissions.js";

// Minimal sessionStorage for node.
const store = new Map();
globalThis.window = { sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) } };

const demo = { isDemoUser: true, role: "fireChief", roleIds: ["fireChief"], personnelId: "DEMO-001", displayName: "Chief A. Sample" };

test("Fire Chief view and non-demo members are unchanged", () => {
  setDemoPersona("chief");
  assert.equal(applyDemoPersona(demo), demo);
  setDemoPersona("firefighter");
  const real = { role: "fireChief", roleIds: ["fireChief"] };
  assert.equal(applyDemoPersona(real), real);
});

test("each persona maps to its role, member and permissions", () => {
  for (const persona of DEMO_PERSONAS.filter((p) => p.id !== "chief")) {
    setDemoPersona(persona.id);
    const m = applyDemoPersona(demo);
    assert.deepEqual(m.roleIds, [persona.roleId]);
    assert.equal(m.personnelId, persona.personnelId);
    const perms = mergeMembershipPermissions(m, {});
    assert.equal(Boolean(perms.accessEmployeePortal), true, persona.id);
  }
  setDemoPersona("firefighter");
  assert.equal(Boolean(mergeMembershipPermissions(applyDemoPersona(demo), {}).accessAdminRms), false);
  setDemoPersona("captain");
  const captain = mergeMembershipPermissions(applyDemoPersona(demo), {});
  assert.equal(Boolean(captain.accessAdminRms), true);
  assert.equal(Boolean(captain.manageUsers), false);
  setDemoPersona("battalion");
  assert.equal(Boolean(mergeMembershipPermissions(applyDemoPersona(demo), {}).editSchedule), true);
});
