// Security rules tests (Firestore + Storage) against the local emulators.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, deleteDoc, where } from "firebase/firestore";
import { ref, uploadString, getBytes } from "firebase/storage";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const STORAGE_RULES = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");

let env;

const A = "dept-a";
const B = "dept-b";

// Auth contexts
const as = (uid, token = {}) => env.authenticatedContext(uid, token);
const stranger = () => as("stranger", { email: "stranger@example.com", email_verified: true });
const adminA = () => as("admin-a", { email: "chief@a.gov", email_verified: true });
const memberA = () => as("member-a", { email: "ff@a.gov", email_verified: true });
// Officer-level member (custom role) and a firefighter linked to personnel record P-FF.
const editorA = () => as("editor-a", { email: "capt@a.gov", email_verified: true });
const ffA = () => as("ff-a", { email: "ff2@a.gov", email_verified: true });
const memberB = () => as("member-b", { email: "ff@b.gov", email_verified: true });
// Creators sign in with a two-factor code (creator powers need one).
const SECOND_FACTOR = { firebase: { sign_in_provider: "password", sign_in_second_factor: "totp" } };
const creator = () => as("creator-1", { email: "creator@forge.test", email_verified: true, ...SECOND_FACTOR });
const creatorNo2fa = () => as("creator-1", { email: "creator@forge.test", email_verified: true });
const adminA2fa = () => as("admin-a", { email: "chief@a.gov", email_verified: true, ...SECOND_FACTOR });
const disabledAdminA = () => as("disabled-admin-a", { email: "old@a.gov", email_verified: true });

function membership(uid, departmentId, extra = {}) {
  return {
    uid,
    email: `${uid}@example.com`,
    role: "firefighter",
    roleIds: ["firefighter"],
    status: "active",
    departmentId,
    personnelId: "",
    ...extra,
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES, host: "127.0.0.1", port: 8080 },
    storage: { rules: STORAGE_RULES, host: "127.0.0.1", port: 9199 },
  });
});

after(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "platformCreators/creator-1"), { status: "active" });
    await setDoc(doc(db, `departments/${A}/users/admin-a`), membership("admin-a", A, { role: "department_admin", roleIds: ["fireChief"] }));
    await setDoc(doc(db, `departments/${A}/users/member-a`), membership("member-a", A));
    await setDoc(doc(db, `departments/${A}/users/disabled-admin-a`), membership("disabled-admin-a", A, { roleIds: ["fireChief"], status: "disabled" }));
    await setDoc(doc(db, `departments/${B}/users/member-b`), membership("member-b", B));
    await setDoc(doc(db, `departments/${A}/users/editor-a`), membership("editor-a", A, { role: "captain", roleIds: ["captain"] }));
    await setDoc(doc(db, `departments/${A}/users/ff-a`), membership("ff-a", A, { personnelId: "P-FF" }));
    // Grants as functions/lib/memberGrants.js writes them.
    const ffGrant = { viewCertifications: true, viewTraining: true, viewSchedule: true, viewDailyLog: true, editDailyLog: true,
      viewDocuments: true, accessEmployeePortal: true, submitLeaveRequests: true, submitShiftTrades: true,
      submitVacancyPickups: true, submitMaintenanceIssues: true, viewInternalEmail: true, sendInternalEmail: true,
      viewHydrants: true, createHydrantDamageReports: true };
    await setDoc(doc(db, `departments/${A}/memberGrants/member-a`), { permissions: ffGrant });
    await setDoc(doc(db, `departments/${A}/memberGrants/ff-a`), { permissions: ffGrant });
    await setDoc(doc(db, `departments/${A}/memberGrants/editor-a`), { permissions: {
      editPersonnel: true, editTraining: true, editSchedule: true, editPreplans: true, createPreplans: true,
      editInspections: true, conductInspections: true, editApparatus: true, editFleetDefects: true } });
    await setDoc(doc(db, `departments/${A}/lists/hlfd-rms-personnel`), { items: [{ id: "P1", name: "Secret Person" }] });
    await setDoc(doc(db, `departments/${A}/incidents/i1`), { summary: "fire" });
    await setDoc(doc(db, `departments/${A}/roles/firefighter`), { name: "Firefighter", permissions: {} });
    await setDoc(doc(db, `departments/${A}/integrations/twilio`), { authToken: "secret" });
    await setDoc(doc(db, `departments/${A}/auditLogs/log1`), { action: "login" });
    await setDoc(doc(db, `departments/horn-lake-fd/incidents/i1`), { summary: "fire" });
  });
});

describe("tenant membership cannot be self-granted", () => {
  it("stranger cannot create an active admin membership in another department", async () => {
    const db = stranger().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/users/stranger`), membership("stranger", A, { role: "department_admin", roleIds: ["fireChief"] })));
  });

  it("stranger cannot create even a read-only membership", async () => {
    const db = stranger().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/users/stranger`), membership("stranger", A, { role: "read_only", roleIds: ["readOnly"] })));
  });

  it("stranger cannot read tenant data", async () => {
    const db = stranger().firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/lists/hlfd-rms-personnel`)));
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
  });

  it("member of another department cannot read or write department A", async () => {
    const db = memberB().firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
    await assertFails(setDoc(doc(db, `departments/${A}/incidents/i2`), { summary: "x" }));
  });

  it("member cannot promote themselves or change their status", async () => {
    const db = memberA().firestore();
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { roleIds: ["fireChief"] }));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { role: "department_admin" }));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { isPlatformCreator: true }));
  });

  it("disabled admin cannot reactivate themselves", async () => {
    const db = disabledAdminA().firestore();
    await assertFails(updateDoc(doc(db, `departments/${A}/users/disabled-admin-a`), { status: "active" }));
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
  });
});

describe("members keep normal access", () => {
  it("member can read and write ordinary tenant data", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/incidents/i1`)));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/incidents/i2`), { summary: "x" }));
    await assertSucceeds(getDoc(doc(db, `departments/${A}/lists/hlfd-rms-personnel`)));
  });

  it("member can save their own preferences", async () => {
    const db = memberA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/users/member-a`), { uid: "member-a", preferences: { theme: "dark" }, updatedAt: "now" }, { merge: true }));
  });

  it("member can't link themselves to a personnel record (the server does it by verified email)", async () => {
    const db = memberA().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/users/member-a`), { personnelId: "P1", updatedAt: "now" }, { merge: true }));
  });

  it("member can read roles but not write them", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/roles/firefighter`)));
    await assertFails(setDoc(doc(db, `departments/${A}/roles/firefighter`), { name: "x", permissions: { manageUsers: true } }));
  });
});

describe("per-item lists", () => {
  const header = `departments/${A}/lists/hlfd-rms-training`;
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, header), { storage: "items", departmentId: A });
      await setDoc(doc(db, `${header}/items/T1`), { id: "T1", title: "Live fire", _order: 1024 });
      await setDoc(doc(db, `departments/${A}/lists/hlfd-rms-active911-alerts`), { storage: "items" });
      await setDoc(doc(db, `departments/${A}/lists/hlfd-rms-active911-alerts/items/a1`), { id: "a1", _order: 1024 });
    });
  });

  it("members read items; people with the list's permission change them", async () => {
    await assertSucceeds(getDoc(doc(memberA().firestore(), `${header}/items/T1`)));
    await assertFails(setDoc(doc(memberA().firestore(), `${header}/items/T2`), { id: "T2", _order: 2048 }));
    await assertFails(deleteDoc(doc(memberA().firestore(), `${header}/items/T1`)));
    const db = editorA().firestore();
    await assertSucceeds(getDoc(doc(db, `${header}/items/T1`)));
    await assertSucceeds(setDoc(doc(db, `${header}/items/T2`), { id: "T2", _order: 2048 }));
    await assertSucceeds(deleteDoc(doc(db, `${header}/items/T1`)));
  });

  it("other departments can't read or write them", async () => {
    const db = memberB().firestore();
    await assertFails(getDoc(doc(db, `${header}/items/T1`)));
    await assertFails(setDoc(doc(db, `${header}/items/T9`), { id: "T9", _order: 1 }));
  });

  it("an items array can't be written onto a per-item list's header", async () => {
    const db = memberA().firestore();
    await assertFails(setDoc(doc(db, header), { items: [{ id: "X" }] }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, header), { updatedAt: "now" }, { merge: true }));
  });

  it("an older array list can still be saved by people who manage it", async () => {
    await assertFails(setDoc(doc(memberA().firestore(), `departments/${A}/lists/hlfd-rms-personnel`), { items: [{ id: "P2" }] }, { merge: true }));
    const db = editorA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/lists/hlfd-rms-personnel`), { items: [{ id: "P2" }] }, { merge: true }));
  });

  it("dispatch alerts are not readable without signing in (TV screens use the keyed server call)", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/lists/hlfd-rms-active911-alerts/items/a1`)));
    await assertFails(getDoc(doc(db, `departments/${A}/lists/hlfd-rms-active911-alerts`)));
    await assertFails(getDoc(doc(db, `${header}/items/T1`)));
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/lists/hlfd-rms-active911-alerts/items/a1`)));
  });
});

// Two-step sign-in codes are optional for everyone (2026-10-29).
describe("two-factor login (optional)", () => {
  const setDeadline = (date) => env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "platformConfig/main"), { mfaAdminDeadline: date }, { merge: true });
  });

  it("creators have their powers with or without a code", async () => {
    await assertSucceeds(getDoc(doc(creator().firestore(), `departments/${B}/incidents/i9`)));
    await assertSucceeds(getDoc(doc(creatorNo2fa().firestore(), `departments/${A}/incidents/i1`)));
    await assertSucceeds(setDoc(doc(creatorNo2fa().firestore(), `departments/${A}/users/new-user`), membership("new-user", A)));
  });

  it("a removed creator has no creator powers", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "platformCreators/ex-creator"), { status: "removed" });
    });
    const db = as("ex-creator", { email: "ex@forge.test", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
  });

  it("department admins keep admin powers until the deadline", async () => {
    await setDeadline(new Date(Date.now() + 14 * 24 * 3600 * 1000));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/users/member-a`), { roleIds: ["captain"] }));
  });

  it("an old deadline no longer locks admins out", async () => {
    await setDeadline(new Date(Date.now() - 24 * 3600 * 1000));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/users/member-a`), { roleIds: ["captain"] }));
    await assertSucceeds(setDoc(doc(adminA().firestore(), `departments/${A}/roles/firefighter`), { name: "FF", permissions: {} }));
    await assertSucceeds(getDoc(doc(adminA().firestore(), `departments/${A}/incidents/i1`)));
  });

  it("the shared demo is exempt", async () => {
    await setDeadline(new Date(Date.now() - 24 * 3600 * 1000));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "departments/forge-demo/users/demo-chief"), membership("demo-chief", "forge-demo", { role: "department_admin", roleIds: ["fireChief"] }));
    });
    const db = as("demo-chief", { email: "demo@forge.demo", email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(db, "departments/forge-demo/roles/firefighter"), { name: "FF", permissions: {} }));
  });
});

describe("plan entitlements", () => {
  const ent = (extra = {}) => ({
    departmentId: A,
    modules: ["dashboard", "personnel", "training", "administration"],
    limits: { maxPersonnel: 2, maxPortalUsers: 0, maxStations: 1 },
    usage: { personnel: 1, portalUsers: 2, stations: 1 },
    ...extra,
  });
  const people = `departments/${A}/lists/hlfd-rms-personnel`;
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `platformEntitlements/${A}`), ent());
      await setDoc(doc(db, people), { storage: "items" });
      await setDoc(doc(db, `${people}/items/P1`), { id: "P1", _order: 1 });
      await setDoc(doc(db, `departments/${A}/lists/hlfd-rms-apparatus`), { storage: "items" });
      await setDoc(doc(db, `departments/${A}/lists/hlfd-rms-apparatus/items/E1`), { id: "E1", _order: 1 });
      await setDoc(doc(db, `departments/${A}/hydrants/h1`), { id: "h1" });
      await setDoc(doc(db, `departments/${A}/profile/main`), { name: "A", stationDetails: [{ name: "Station 1" }] });
      await setDoc(doc(db, `departments/${A}/settings/main`), { enabledModules: ["personnel"] });
    });
  });

  it("switched-off modules can be read but not changed", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/lists/hlfd-rms-apparatus/items/E1`)));
    await assertFails(setDoc(doc(db, `departments/${A}/lists/hlfd-rms-apparatus/items/E2`), { id: "E2", _order: 2 }));
    await assertFails(deleteDoc(doc(db, `departments/${A}/lists/hlfd-rms-apparatus/items/E1`)));
    await assertSucceeds(getDoc(doc(db, `departments/${A}/hydrants/h1`)));
    await assertFails(setDoc(doc(db, `departments/${A}/hydrants/h2`), { id: "h2" }));
    await assertFails(setDoc(doc(db, `departments/${A}/fleetAssets/f1`), { id: "f1" }));
    await assertFails(setDoc(doc(db, `departments/${A}/inspections/i9`), { id: "i9" }));
  });

  it("switched-on modules work as normal", async () => {
    const db = memberA().firestore();
    await assertSucceeds(setDoc(doc(editorA().firestore(), `departments/${A}/lists/hlfd-rms-training/items/T1`), { id: "T1", _order: 1 }));
    // Collections that belong to no module are not gated.
    await assertSucceeds(setDoc(doc(db, `departments/${A}/auditLogs/l2`), { action: "x" }));
    // Incidents belong to NERIS Fire Reports, which is off here.
    await assertFails(setDoc(doc(db, `departments/${A}/incidents/i2`), { summary: "x" }));
  });

  it("platform creators are not limited", async () => {
    const db = creator().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/hydrants/h3`), { id: "h3" }));
    await assertSucceeds(setDoc(doc(db, `${people}/items/P9`), { id: "P9", _order: 9 }));
  });

  it("personnel can be added up to the plan limit, never past it", async () => {
    const db = editorA().firestore();
    await assertSucceeds(setDoc(doc(db, `${people}/items/P2`), { id: "P2", _order: 2 }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformEntitlements/${A}`), ent({ usage: { personnel: 2 } }));
    });
    await assertFails(setDoc(doc(db, `${people}/items/P3`), { id: "P3", _order: 3 }));
    // Existing records stay editable and removable at the limit.
    await assertSucceeds(setDoc(doc(db, `${people}/items/P1`), { id: "P1", _order: 1, rank: "Captain" }));
    await assertSucceeds(deleteDoc(doc(db, `${people}/items/P1`)));
  });

  it("an older array personnel list cannot grow past the limit", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), people), { items: [{ id: "P1" }, { id: "P2" }] });
    });
    const db = editorA().firestore();
    await assertFails(setDoc(doc(db, people), { items: [{ id: "P1" }, { id: "P2" }, { id: "P3" }] }));
    await assertSucceeds(setDoc(doc(db, people), { items: [{ id: "P1" }, { id: "P2", rank: "FF" }] }));
  });

  it("stations cannot grow past the plan limit", async () => {
    const db = adminA().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/profile/main`), { stationDetails: [{ name: "1" }, { name: "2" }] }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/profile/main`), { stationDetails: [{ name: "Station 1 (HQ)" }] }, { merge: true }));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/profile/main`), { name: "Renamed" }, { merge: true }));
  });

  it("only platform creators change a department's module list", async () => {
    await assertFails(setDoc(doc(adminA().firestore(), `departments/${A}/settings/main`), { enabledModules: ["personnel", "hydrants"] }, { merge: true }));
    await assertSucceeds(setDoc(doc(adminA().firestore(), `departments/${A}/settings/main`), { timezone: "America/Chicago" }, { merge: true }));
    await assertSucceeds(setDoc(doc(creator().firestore(), `departments/${A}/settings/main`), { enabledModules: ["personnel", "hydrants"] }, { merge: true }));
  });

  it("nobody but the server writes entitlements; the department can read its own", async () => {
    await assertFails(setDoc(doc(adminA().firestore(), `platformEntitlements/${A}`), ent({ modules: ["hydrants"] })));
    await assertFails(setDoc(doc(creator().firestore(), `platformEntitlements/${A}`), ent()));
    await assertSucceeds(getDoc(doc(memberA().firestore(), `platformEntitlements/${A}`)));
    await assertFails(getDoc(doc(memberB().firestore(), `platformEntitlements/${A}`)));
  });

  it("departments without an entitlements record are not restricted yet", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => deleteDoc(doc(ctx.firestore(), `platformEntitlements/${A}`)));
    const db = memberA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/hydrants/h4`), { id: "h4" }));
    await assertSucceeds(setDoc(doc(editorA().firestore(), `${people}/items/P5`), { id: "P5", _order: 5 }));
  });
});

describe("department admins", () => {
  it("edit members, but add people only by invite", async () => {
    const db = adminA().firestore();
    // Invites check the plan's portal-user limit; direct creation would skip it.
    await assertFails(setDoc(doc(db, `departments/${A}/users/new-user`), membership("new-user", A)));
    await assertSucceeds(updateDoc(doc(db, `departments/${A}/users/member-a`), { roleIds: ["captain"] }));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/roles/firefighter`), { name: "FF", permissions: {} }));
  });

  it("platform creators can still add members directly", async () => {
    const db = creator().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/users/new-user`), membership("new-user", A)));
  });

  it("can change someone's role, including promoting to Fire Chief", async () => {
    const db = adminA().firestore();
    await assertSucceeds(updateDoc(doc(db, `departments/${A}/users/member-a`), { role: "department_admin", roleIds: ["fireChief"] }));
    await assertSucceeds(updateDoc(doc(db, `departments/${A}/users/member-a`), { role: "captain", roleIds: ["captain"] }));
  });

  it("cannot grant platform-creator flags", async () => {
    const db = adminA().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/users/new-user`), membership("new-user", A, { role: "creator", roleIds: ["creator"] })));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { isPlatformCreator: true }));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { roleIds: ["creator"] }));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { role: "creator" }));
  });

  it("are the only ones who change department settings", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `departments/${A}/settings/main`), { payRules: { overtimeMultiplier: 1.5 } });
      await setDoc(doc(ctx.firestore(), `departments/${A}/settings/fieldApp`), { appName: "Field" });
    });
    const member = memberA().firestore();
    await assertSucceeds(getDoc(doc(member, `departments/${A}/settings/main`)));
    await assertFails(setDoc(doc(member, `departments/${A}/settings/main`), { payRules: { overtimeMultiplier: 3 } }, { merge: true }));
    await assertFails(setDoc(doc(member, `departments/${A}/settings/fieldApp`), { appName: "Hacked" }, { merge: true }));
    await assertFails(setDoc(doc(member, `departments/${A}/settings/other`), { anything: true }));
    // Distribution groups are the one thing members may save (the app checks the permission).
    await assertSucceeds(setDoc(doc(member, `departments/${A}/settings/main`), { internalEmailGroups: [], updatedAt: "now" }, { merge: true }));
    await assertSucceeds(setDoc(doc(adminA().firestore(), `departments/${A}/settings/main`), { payRules: { overtimeMultiplier: 2 } }, { merge: true }));
  });

  it("can delete notifications; members can't", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `departments/${A}/notifications/n1`), { title: "x" });
    });
    await assertFails(deleteDoc(doc(memberA().firestore(), `departments/${A}/notifications/n1`)));
    await assertSucceeds(deleteDoc(doc(adminA().firestore(), `departments/${A}/notifications/n1`)));
  });

  it("cannot manage another department's members", async () => {
    const db = adminA().firestore();
    await assertFails(setDoc(doc(db, `departments/${B}/users/x`), membership("x", B)));
    await assertFails(deleteDoc(doc(db, `departments/${B}/users/member-b`)));
  });
});

describe("explicit rules are no longer overridden by the catch-all", () => {
  it("members cannot read integration secrets", async () => {
    await assertFails(getDoc(doc(memberA().firestore(), `departments/${A}/integrations/twilio`)));
    await assertFails(getDoc(doc(adminA().firestore(), `departments/${A}/integrations/twilio`)));
  });

  it("audit logs cannot be edited or deleted", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/auditLogs/log1`)));
    await assertFails(updateDoc(doc(db, `departments/${A}/auditLogs/log1`), { action: "tampered" }));
    await assertFails(deleteDoc(doc(db, `departments/${A}/auditLogs/log1`)));
  });

  it("hasExplicitTenantRule lists every explicitly matched tenant collection", () => {
    const rules = FIRESTORE_RULES.replace(/\r\n/g, "\n");
    const block = rules.slice(rules.indexOf("match /departments/{departmentId} {"));
    const explicit = new Set([...block.matchAll(/^ {6}match \/([A-Za-z0-9_]+)\//gm)].map((m) => m[1]));
    const fnBody = rules.slice(rules.indexOf("function hasExplicitTenantRule"), rules.indexOf("match /departments/{departmentId} {"));
    const listed = new Set([...fnBody.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1]));
    const missing = [...explicit].filter((name) => !listed.has(name));
    assert.deepEqual(missing, [], `Add these to hasExplicitTenantRule(): ${missing.join(", ")}`);
  });
});

describe("no email-based access", () => {
  it("owner email without a platformCreators record gets no access, even verified", async () => {
    const db = as("imposter", { email: "admin@forgepublicsafety.com", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
    await assertFails(setDoc(doc(db, `departments/${A}/users/imposter`), membership("imposter", A)));
  });

  it("@hornlake.org email without a membership cannot read horn-lake-fd", async () => {
    const db = as("hl-user", { email: "ff@hornlake.org", email_verified: true }).firestore();
    await assertFails(getDoc(doc(db, "departments/horn-lake-fd/incidents/i1")));
  });
});

describe("subscription enforcement", () => {
  async function setSubscription(departmentId, status) {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformSubscriptions/${departmentId}`), { status, planId: "pilot" });
    });
  }

  it("members of an active or trial department keep access", async () => {
    await setSubscription(A, "trial");
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/incidents/i1`)));
    await setSubscription(A, "past_due");
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/incidents/i1`)));
  });

  it("members of a suspended department lose data access", async () => {
    await setSubscription(A, "suspended");
    await assertFails(getDoc(doc(memberA().firestore(), `departments/${A}/incidents/i1`)));
    await assertFails(setDoc(doc(memberA().firestore(), `departments/${A}/incidents/i2`), { summary: "x" }));
  });

  it("admins of a cancelled department cannot manage users", async () => {
    await setSubscription(A, "cancelled");
    await assertFails(setDoc(doc(adminA().firestore(), `departments/${A}/users/new-user`), membership("new-user", A)));
  });

  it("suspended members can still read the profile and their own membership", async () => {
    await setSubscription(A, "suspended");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `departments/${A}/profile/main`), { name: "Dept A" });
    });
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/profile/main`)));
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/users/member-a`)));
  });

  it("disabled or archived departments lose access", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformDepartments/${A}`), { status: "archived" });
    });
    await assertFails(getDoc(doc(memberA().firestore(), `departments/${A}/incidents/i1`)));
  });

  it("platform creators keep access to suspended departments", async () => {
    await setSubscription(A, "suspended");
    await assertSucceeds(getDoc(doc(creator().firestore(), `departments/${A}/incidents/i1`)));
  });

  it("members cannot change their department's subscription", async () => {
    await assertFails(setDoc(doc(adminA().firestore(), `platformSubscriptions/${A}`), { status: "active" }));
  });
});

describe("legacy top-level collections", () => {
  const HL = "horn-lake-fd";
  const hornLakeMember = () => as("hl-member", { email: "ff@hornlake.org", email_verified: true });

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `departments/${HL}/users/hl-member`), membership("hl-member", HL));
      await setDoc(doc(db, "rmsData/hlfd-rms-personnel"), { items: [{ name: "Secret" }] });
      await setDoc(doc(db, "hydrants/h1"), { id: "h1" });
      await setDoc(doc(db, "preFirePlans/p1"), { id: "p1" });
      await setDoc(doc(db, "fireCodesFull/c1"), { text: "code" });
      await setDoc(doc(db, "fireSogsFull/s1"), { text: "sog" });
      await setDoc(doc(db, "appData/x"), { collection: "fireCodesFull" });
      await setDoc(doc(db, "integrationSettings/x"), { secret: "s" });
    });
  });

  it("rmsData is not readable by the public or other departments", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "rmsData/hlfd-rms-personnel")));
    await assertFails(getDoc(doc(stranger().firestore(), "rmsData/hlfd-rms-personnel")));
    await assertFails(getDoc(doc(memberA().firestore(), "rmsData/hlfd-rms-personnel")));
  });

  it("rmsData is closed to every client, including Horn Lake and creators", async () => {
    await assertFails(getDoc(doc(hornLakeMember().firestore(), "rmsData/hlfd-rms-personnel")));
    await assertFails(getDoc(doc(creator().firestore(), "rmsData/hlfd-rms-personnel")));
    await assertFails(setDoc(doc(creator().firestore(), "rmsData/x"), { items: [] }));
  });

  it("Horn Lake members and creators can still read other Horn Lake legacy data", async () => {
    await assertSucceeds(getDoc(doc(hornLakeMember().firestore(), "hydrants/h1")));
    await assertSucceeds(getDoc(doc(hornLakeMember().firestore(), "fireSogsFull/s1")));
    await assertSucceeds(getDoc(doc(creator().firestore(), "preFirePlans/p1")));
  });

  it("legacy collections are not writable by members", async () => {
    await assertFails(setDoc(doc(hornLakeMember().firestore(), "rmsData/hlfd-rms-personnel"), { items: [] }));
    await assertFails(setDoc(doc(hornLakeMember().firestore(), "hydrants/h2"), { id: "h2" }));
    await assertFails(setDoc(doc(memberA().firestore(), "appData/y"), { x: 1 }));
    await assertFails(setDoc(doc(memberA().firestore(), "fireCodesFull/c2"), { text: "x" }));
  });

  it("shared reference libraries need sign-in, and other departments cannot read Horn Lake SOGs", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "fireCodesFull/c1")));
    await assertSucceeds(getDoc(doc(memberA().firestore(), "fireCodesFull/c1")));
    await assertFails(getDoc(doc(memberA().firestore(), "fireSogsFull/s1")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "preFirePlans/p1")));
  });

  it("unused collections are closed", async () => {
    await assertFails(getDoc(doc(creator().firestore(), "integrationSettings/x")));
    await assertFails(setDoc(doc(memberA().firestore(), "integrationSettings/y"), { a: 1 }));
  });
});

describe("billing events", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "platformBillingEvents/e1"), { departmentId: A, kind: "remind" });
    });
  });

  it("only platform creators can read billing events; nobody writes from the client", async () => {
    await assertSucceeds(getDoc(doc(creator().firestore(), "platformBillingEvents/e1")));
    await assertFails(getDoc(doc(adminA().firestore(), "platformBillingEvents/e1")));
    await assertFails(setDoc(doc(creator().firestore(), "platformBillingEvents/e2"), { kind: "x" }));
  });

  it("platform audit log: creators append and read; nobody edits; others can't see it", async () => {
    await assertSucceeds(setDoc(doc(creator().firestore(), "platformAuditLogs/l1"), { action: "x" }));
    await assertSucceeds(getDoc(doc(creator().firestore(), "platformAuditLogs/l1")));
    await assertFails(updateDoc(doc(creator().firestore(), "platformAuditLogs/l1"), { action: "tampered" }));
    await assertFails(deleteDoc(doc(creator().firestore(), "platformAuditLogs/l1")));
    await assertFails(getDoc(doc(adminA().firestore(), "platformAuditLogs/l1")));
    await assertFails(setDoc(doc(adminA().firestore(), "platformAuditLogs/l2"), { action: "x" }));
  });

  it("department admins can save settings like the shift rotation, but not the subscription term", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `departments/${A}/settings/main`), { subscription: { saasStatus: "trial", expirationDate: "2027-01-19" } });
    });
    const db = adminA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/settings/main`), { shiftRotation: { preset: "24/48-abc" }, updatedAt: "now" }, { merge: true }));
    await assertFails(setDoc(doc(db, `departments/${A}/settings/main`), { subscription: { saasStatus: "active", expirationDate: "2099-01-01" } }, { merge: true }));
  });

  it("department admins cannot mark their own subscription paid", async () => {
    await assertFails(setDoc(doc(adminA().firestore(), `platformSubscriptions/${A}`), { status: "active", renewalDate: "2099-01-01" }));
  });
});

describe("invites", () => {
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "invites/inv-a"), { departmentId: A, email: "new@a.gov", status: "pending" });
    });
  });

  it("department admins can read their own invites", async () => {
    await assertSucceeds(getDoc(doc(adminA().firestore(), "invites/inv-a")));
  });

  it("members, other departments and strangers cannot read invites", async () => {
    await assertFails(getDoc(doc(memberA().firestore(), "invites/inv-a")));
    await assertFails(getDoc(doc(memberB().firestore(), "invites/inv-a")));
    await assertFails(getDoc(doc(stranger().firestore(), "invites/inv-a")));
  });

  it("nobody can create or edit invites from the client", async () => {
    await assertFails(setDoc(doc(adminA().firestore(), "invites/forged"), { departmentId: A, email: "x@x.com", status: "pending" }));
    await assertFails(updateDoc(doc(adminA().firestore(), "invites/inv-a"), { status: "accepted" }));
  });
});

describe("platform creators and demo", () => {
  it("platform creator can create memberships anywhere", async () => {
    const db = creator().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${B}/users/creator-1`), membership("creator-1", B, { role: "creator", roleIds: ["creator"], isPlatformCreator: true })));
  });

  it("only the shared demo account can self-join the demo department, and never as a creator", async () => {
    const demo = as("demo-user", { email: "demo@forge.demo", email_verified: true }).firestore();
    await assertSucceeds(setDoc(doc(demo, "departments/forge-demo/users/demo-user"), membership("demo-user", "forge-demo", { roleIds: ["fireChief"] })));
    await assertFails(setDoc(doc(demo, "departments/forge-demo/users/demo-user"), { isPlatformCreator: true }, { merge: true }));
    const db = stranger().firestore();
    await assertFails(setDoc(doc(db, "departments/forge-demo/users/stranger"), membership("stranger", "forge-demo", { roleIds: ["fireChief"] })));
  });

  it("other signed-in users can't read or write the demo department", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "departments/forge-demo/incidents/d1"), { title: "x" });
    });
    const db = stranger().firestore();
    await assertFails(getDoc(doc(db, "departments/forge-demo/incidents/d1")));
    await assertFails(setDoc(doc(db, "platformDepartments/forge-demo"), { name: "Vandalised" }, { merge: true }));
  });
});

describe("storage", () => {
  beforeEach(async () => {
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadString(ref(ctx.storage(), `departments/${A}/personnel-photos/P1/photo.jpg`), "img");
      await uploadString(ref(ctx.storage(), `old-uploads/file.pdf`), "pdf");
    });
  });

  it("signed-out users cannot read or write department files", async () => {
    const storage = env.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, `departments/${A}/personnel-photos/P1/photo.jpg`)));
    await assertFails(uploadString(ref(storage, `departments/${A}/x.txt`), "x"));
  });

  it("non-members cannot read or upload department files", async () => {
    const storage = memberB().storage();
    await assertFails(getBytes(ref(storage, `departments/${A}/personnel-photos/P1/photo.jpg`)));
    await assertFails(uploadString(ref(storage, `departments/${A}/x.txt`), "x"));
  });

  it("members can read and upload their department's files", async () => {
    const storage = memberA().storage();
    await assertSucceeds(getBytes(ref(storage, `departments/${A}/personnel-photos/P1/photo.jpg`)));
    await assertSucceeds(uploadString(ref(storage, `departments/${A}/document-library/x.txt`), "x"));
  });

  it("only people with an editing permission delete files", async () => {
    const { deleteObject } = await import("firebase/storage");
    await assertFails(deleteObject(ref(memberA().storage(), `departments/${A}/personnel-photos/P1/photo.jpg`)));
    await assertSucceeds(deleteObject(ref(editorA().storage(), `departments/${A}/personnel-photos/P1/photo.jpg`)));
  });

  it("members can't replace someone else's file; uploaders and editors can", async () => {
    const path = `departments/${A}/document-library/mine.txt`;
    const mine = { customMetadata: { uploadedBy: "member-a" } };
    await assertSucceeds(uploadString(ref(memberA().storage(), path), "v1", "raw", mine));
    await assertSucceeds(uploadString(ref(memberA().storage(), path), "v2", "raw", mine));
    await assertFails(uploadString(ref(ffA().storage(), path), "hijack", "raw", { customMetadata: { uploadedBy: "ff-a" } }));
    await assertFails(uploadString(ref(ffA().storage(), `departments/${A}/personnel-photos/P1/photo.jpg`), "hijack"));
    await assertSucceeds(uploadString(ref(editorA().storage(), path), "fixed", "raw", { customMetadata: { uploadedBy: "editor-a" } }));
    // A new upload can't claim to be someone else's.
    await assertFails(uploadString(ref(ffA().storage(), `departments/${A}/document-library/fake.txt`), "x", "raw", mine));
  });

  it("legacy paths are closed to new reads and writes", async () => {
    const storage = memberA().storage();
    await assertFails(getBytes(ref(storage, "old-uploads/file.pdf")));
    await assertFails(uploadString(ref(storage, "old-uploads/new.pdf"), "x"));
  });

  it("only platform creators can upload platform branding", async () => {
    await assertFails(uploadString(ref(memberA().storage(), "platform/branding/logo.png"), "x"));
    await assertSucceeds(uploadString(ref(creator().storage(), "platform/branding/logo.png"), "x"));
  });
});

// Batch 5: writes need the member's permissions (departments/<id>/memberGrants/<uid>).
describe("role-aware rules", () => {
  const lists = `departments/${A}/lists`;
  const put = (ctx, path, data) => setDoc(doc(ctx.firestore(), path), data);
  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      for (const key of ["hlfd-rms-leave-requests", "hlfd-rms-shift-trades", "hlfd-rms-time-cards",
        "hlfd-rms-documents", "hlfd-rms-call-shifts", "hlfd-rms-personnel"]) {
        await setDoc(doc(db, `${lists}/${key}`), { storage: "items" });
      }
      await setDoc(doc(db, `${lists}/hlfd-rms-leave-requests/items/L-OTHER`), { id: "L-OTHER", personnelId: "P-X", status: "Pending Officer Approval", _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-leave-requests/items/L-MINE`), { id: "L-MINE", personnelId: "P-FF", status: "Pending Officer Approval", _order: 2 });
      await setDoc(doc(db, `${lists}/hlfd-rms-leave-requests/items/L-TOAPPROVE`), { id: "L-TOAPPROVE", personnelId: "P-X", assignedOfficerId: "P-FF", assignedBattalionChiefId: "P-BC", approvalStage: "officer", status: "Pending Officer Approval", _order: 3 });
      await setDoc(doc(db, `${lists}/hlfd-rms-leave-requests/items/L-ATBC`), { id: "L-ATBC", personnelId: "P-X", assignedOfficerId: "P-OFF", assignedBattalionChiefId: "P-FF", approvalStage: "battalionChief", status: "Pending Battalion Chief", _order: 4 });
      await setDoc(doc(db, `${lists}/hlfd-rms-time-cards/items/P-FF-SIGNED`), { id: "P-FF-SIGNED", personnelId: "P-FF", employeeSignature: "Me", departmentHeadSignature: "Chief", _order: 3 });
      await setDoc(doc(db, `${lists}/hlfd-rms-shift-trades/items/TR-1`), { id: "TR-1", personnelId: "P-X", coveragePersonnelId: "P-Y", assignedBattalionChiefIds: ["P-FF"], status: "Pending Battalion Chief", _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-time-cards/items/P-X-1`), { id: "P-X-1", personnelId: "P-X", employeeSignature: "", _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-time-cards/items/P-FF-1`), { id: "P-FF-1", personnelId: "P-FF", employeeSignature: "", departmentHeadSignature: "", _order: 2 });
      await setDoc(doc(db, `${lists}/hlfd-rms-documents/items/D1`), { id: "D1", title: "SOG 1", acknowledgements: {}, _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-call-shifts/items/C1`), { id: "C1", status: "active", responses: [], _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-personnel/items/P-X`), { id: "P-X", name: "Pat", activityLog: [], _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-certifications`), { storage: "items" });
      await setDoc(doc(db, `${lists}/hlfd-rms-certifications/items/C-FF`), { id: "C-FF", personnelId: "P-FF", type: "EMT", expires: "2027-01-01", _order: 1 });
      await setDoc(doc(db, `${lists}/hlfd-rms-certifications/items/C-X`), { id: "C-X", personnelId: "P-X", type: "EMT", expires: "2027-01-01", _order: 2 });
      await setDoc(doc(db, `${lists}/hlfd-rms-personnel/items/P-FF`), { id: "P-FF", name: "Fran", rank: "FF", phone: "1", _order: 2 });
      await setDoc(doc(db, `departments/${A}/personnelPrivate/P-FF`), { socialSecurityNumber: "x" });
      await setDoc(doc(db, `departments/${A}/personnelPrivate/P-X`), { socialSecurityNumber: "y" });
      await setDoc(doc(db, `departments/${A}/preplans/PP1`), { status: "ready_for_review" });
      await setDoc(doc(db, `departments/${A}/preplanRevisions/RV1`), { sectionAnswers: { address: "1 Main" } });
      await setDoc(doc(db, `departments/${A}/preplanRestricted/R1`), { answers: { gatesCodes: "1234" } });
      await setDoc(doc(db, `departments/${A}/inspections/I1`), { status: "awaiting_approval" });
      await setDoc(doc(db, `departments/${A}/fleetDefects/FD1`), { status: "submitted" });
      await setDoc(doc(db, `departments/${A}/fleetClasses/FC1`), { name: "Engine" });
      await setDoc(doc(db, `departments/${A}/counters/preplan-2026`), { value: 5 });
      await setDoc(doc(db, `departments/${A}/internalEmails/M1`), { fromUid: "editor-a", recipients: ["all"], readBy: {}, subject: "Hi" });
      await setDoc(doc(db, `departments/${A}/notifications/N1`), { userId: "all", status: "unread", message: "x" });
      await setDoc(doc(db, `departments/${A}/profile/main`), { name: "A" });
      await setDoc(doc(db, `departments/${A}/dropdowns/ranks`), { options: ["FF"] });
    });
  });

  it("firefighters can't change personnel or read others' private records", async () => {
    await assertFails(put(ffA(), `${lists}/hlfd-rms-personnel/items/P-X`, { id: "P-X", name: "Changed", _order: 1 }));
    await assertFails(getDoc(doc(ffA().firestore(), `departments/${A}/personnelPrivate/P-X`)));
    await assertSucceeds(getDoc(doc(ffA().firestore(), `departments/${A}/personnelPrivate/P-FF`)));
    await assertFails(put(ffA(), `departments/${A}/personnelPrivate/P-FF`, { socialSecurityNumber: "z" }));
    await assertSucceeds(getDoc(doc(editorA().firestore(), `departments/${A}/personnelPrivate/P-X`)));
    await assertSucceeds(put(editorA(), `departments/${A}/personnelPrivate/P-X`, { socialSecurityNumber: "z" }));
  });

  it("private fields can't go back into the shared personnel list", async () => {
    await assertFails(put(editorA(), `${lists}/hlfd-rms-personnel/items/P-X`, { id: "P-X", name: "Pat", socialSecurityNumber: "1", _order: 1 }));
    await assertSucceeds(put(editorA(), `${lists}/hlfd-rms-personnel/items/P-X`, { id: "P-X", name: "Pat R", _order: 1 }));
  });

  it("members edit their own contact details on My Profile, nothing else", async () => {
    const mine = `${lists}/hlfd-rms-personnel/items/P-FF`;
    const base = { id: "P-FF", name: "Fran", rank: "FF", phone: "1", _order: 2 };
    await assertSucceeds(put(ffA(), mine, { ...base, phone: "2", phones: [{ number: "2", primary: true }], city: "Town", emergencyFirstName: "Sam", updatedAt: "now" }));
    await assertFails(put(ffA(), mine, { ...base, rank: "Captain" }));
    await assertFails(put(ffA(), mine, { ...base, issuedEquipment: [{ item: "Coat" }] }));
    await assertFails(put(ffA(), mine, { ...base, socialSecurityNumber: "1" }));
    await assertFails(put(ffA(), `${lists}/hlfd-rms-personnel/items/P-X`, { id: "P-X", name: "Pat", activityLog: [], city: "Town", _order: 1 }));
    await assertSucceeds(put(editorA(), mine, { ...base, rank: "Captain", issuedEquipment: [{ item: "Coat" }] }));
  });

  it("members attach copies of their own certificates only", async () => {
    const certs = `${lists}/hlfd-rms-certifications/items`;
    const copy = { document: "emt.pdf", documentUrl: "https://x", documentStoragePath: "departments/a/certifications/C-FF/1-emt.pdf", documentUploadedAt: "now" };
    await assertSucceeds(put(ffA(), `${certs}/C-FF`, { id: "C-FF", personnelId: "P-FF", type: "EMT", expires: "2027-01-01", _order: 1, ...copy }));
    await assertFails(put(ffA(), `${certs}/C-FF`, { id: "C-FF", personnelId: "P-FF", type: "EMT", expires: "2030-01-01", _order: 1, ...copy }));
    await assertFails(put(ffA(), `${certs}/C-X`, { id: "C-X", personnelId: "P-X", type: "EMT", expires: "2027-01-01", _order: 2, ...copy }));
    await assertSucceeds(put(ffA(), `${lists}/hlfd-rms-personnel/items/P-FF`, { id: "P-FF", name: "Fran", rank: "FF", phone: "1", _order: 2, nrCertificate: { name: "nr.pdf", url: "https://x" } }));
  });

  it("a battalion chief's trade approval may note it on the requester's record", async () => {
    await assertSucceeds(put(ffA(), `${lists}/hlfd-rms-personnel/items/P-X`, { id: "P-X", name: "Pat", activityLog: [{ id: "a" }], _order: 1 }));
  });

  it("leave: members file their own, approvers decide, nobody approves their own", async () => {
    const ff = ffA();
    await assertSucceeds(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-NEW`, { id: "L-NEW", personnelId: "P-FF", status: "Pending Officer Approval", _order: 0 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-NEW2`, { id: "L-NEW2", personnelId: "P-X", status: "Pending Officer Approval", _order: 0 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-NEW3`, { id: "L-NEW3", personnelId: "P-FF", status: "Approved", _order: 0 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-MINE`, { id: "L-MINE", personnelId: "P-FF", status: "Approved", _order: 2 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-OTHER`, { id: "L-OTHER", personnelId: "P-X", status: "Approved", _order: 1 }));
    await assertSucceeds(put(ff, `${lists}/hlfd-rms-leave-requests/items/L-TOAPPROVE`, { id: "L-TOAPPROVE", personnelId: "P-X", assignedOfficerId: "P-FF", assignedBattalionChiefId: "P-BC", approvalStage: "battalionChief", status: "Pending Battalion Chief", _order: 3 }));
    await assertFails(deleteDoc(doc(ff.firestore(), `${lists}/hlfd-rms-leave-requests/items/L-OTHER`)));
    await assertSucceeds(deleteDoc(doc(ff.firestore(), `${lists}/hlfd-rms-leave-requests/items/L-MINE`)));
    // Schedulers decide any request.
    await assertSucceeds(put(editorA(), `${lists}/hlfd-rms-leave-requests/items/L-OTHER`, { id: "L-OTHER", personnelId: "P-X", status: "Denied", _order: 1 }));
  });

  it("leave: each approver acts only at their own step", async () => {
    const ff = ffA();
    const leave = (id) => `${lists}/hlfd-rms-leave-requests/items/${id}`;
    const atOfficer = { id: "L-TOAPPROVE", personnelId: "P-X", assignedOfficerId: "P-FF", assignedBattalionChiefId: "P-BC", _order: 3 };
    // The officer can't skip the Battalion Chief or reroute the request.
    await assertFails(put(ff, leave("L-TOAPPROVE"), { ...atOfficer, approvalStage: "complete", status: "Approved" }));
    await assertFails(put(ff, leave("L-TOAPPROVE"), { ...atOfficer, assignedBattalionChiefId: "P-FF", approvalStage: "battalionChief", status: "Pending Battalion Chief" }));
    await assertSucceeds(put(ff, leave("L-TOAPPROVE"), { ...atOfficer, approvalStage: "complete", status: "Denied" }));
    // The Battalion Chief decides at their step, but can't act at the officer's step.
    await assertSucceeds(put(ff, leave("L-ATBC"), { id: "L-ATBC", personnelId: "P-X", assignedOfficerId: "P-OFF", assignedBattalionChiefId: "P-FF", approvalStage: "complete", status: "Approved", _order: 4 }));
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), leave("L-EARLY")),
      { id: "L-EARLY", personnelId: "P-X", assignedOfficerId: "P-OFF", assignedBattalionChiefId: "P-FF", approvalStage: "officer", status: "Pending Officer Approval", _order: 5 }));
    await assertFails(put(ff, leave("L-EARLY"), { id: "L-EARLY", personnelId: "P-X", assignedOfficerId: "P-OFF", assignedBattalionChiefId: "P-FF", approvalStage: "complete", status: "Approved", _order: 5 }));
    // The requester can't move their own request along or pick their approver.
    const mine = { id: "L-MINE2", personnelId: "P-FF", assignedOfficerId: "P-OFF", assignedBattalionChiefId: "P-BC", approvalStage: "officer", status: "Pending Officer Approval", _order: 6 };
    await env.withSecurityRulesDisabled(async (ctx) => setDoc(doc(ctx.firestore(), leave("L-MINE2")), mine));
    await assertFails(put(ff, leave("L-MINE2"), { ...mine, approvalStage: "battalionChief", status: "Pending Battalion Chief" }));
    await assertFails(put(ff, leave("L-MINE2"), { ...mine, assignedOfficerId: "P-FRIEND" }));
    await assertSucceeds(put(ff, leave("L-MINE2"), { ...mine, notes: "Family trip" }));
  });

  it("leave: a member not linked to a personnel record can't file as someone else", async () => {
    await assertFails(put(memberA(), `${lists}/hlfd-rms-leave-requests/items/L-UNLINKED`, { id: "L-UNLINKED", personnelId: "P-X", status: "Pending Officer Approval", _order: 0 }));
  });

  it("trades: the assigned battalion chief can act on someone else's trade", async () => {
    await assertSucceeds(put(ffA(), `${lists}/hlfd-rms-shift-trades/items/TR-1`, { id: "TR-1", personnelId: "P-X", coveragePersonnelId: "P-Y", assignedBattalionChiefIds: ["P-FF"], status: "Approved", _order: 1 }));
    await assertFails(put(memberA(), `${lists}/hlfd-rms-shift-trades/items/TR-1`, { id: "TR-1", personnelId: "P-X", status: "Denied", _order: 1 }));
  });

  it("time cards: your own card, never the department head's signature", async () => {
    const ff = ffA();
    await assertSucceeds(put(ff, `${lists}/hlfd-rms-time-cards/items/P-FF-1`, { id: "P-FF-1", personnelId: "P-FF", employeeSignature: "Me", departmentHeadSignature: "", _order: 2 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-time-cards/items/P-FF-1`, { id: "P-FF-1", personnelId: "P-FF", employeeSignature: "Me", departmentHeadSignature: "Chief", _order: 2 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-time-cards/items/P-X-1`, { id: "P-X-1", personnelId: "P-X", employeeSignature: "Forged", _order: 1 }));
    await assertSucceeds(put(editorA(), `${lists}/hlfd-rms-time-cards/items/P-X-1`, { id: "P-X-1", personnelId: "P-X", departmentHeadSignature: "Chief", _order: 1 }));
  });

  it("time cards: once the department head signs, only schedulers change it", async () => {
    await assertFails(put(ffA(), `${lists}/hlfd-rms-time-cards/items/P-FF-SIGNED`, { id: "P-FF-SIGNED", personnelId: "P-FF", employeeSignature: "Me", departmentHeadSignature: "Chief", hours: 99, _order: 3 }));
    await assertSucceeds(put(editorA(), `${lists}/hlfd-rms-time-cards/items/P-FF-SIGNED`, { id: "P-FF-SIGNED", personnelId: "P-FF", employeeSignature: "Me", departmentHeadSignature: "", _order: 3 }));
  });

  it("documents: members acknowledge but don't edit; call shifts: members reply", async () => {
    const ff = ffA();
    await assertSucceeds(put(ff, `${lists}/hlfd-rms-documents/items/D1`, { id: "D1", title: "SOG 1", acknowledgements: { "P-FF": { at: "now" } }, _order: 1 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-documents/items/D1`, { id: "D1", title: "Changed", acknowledgements: {}, _order: 1 }));
    await assertSucceeds(put(ff, `${lists}/hlfd-rms-call-shifts/items/C1`, { id: "C1", status: "active", responses: [{ personnelId: "P-FF" }], _order: 1 }));
    await assertFails(put(ff, `${lists}/hlfd-rms-call-shifts/items/C1`, { id: "C1", status: "filled", responses: [], _order: 1 }));
  });

  it("preplans: approving needs approvePreplans; restricted answers need a preplan role", async () => {
    await assertFails(updateDoc(doc(ffA().firestore(), `departments/${A}/preplans/PP1`), { status: "draft" }));
    await assertSucceeds(updateDoc(doc(editorA().firestore(), `departments/${A}/preplans/PP1`), { status: "returned_for_revision" }));
    await assertFails(updateDoc(doc(editorA().firestore(), `departments/${A}/preplans/PP1`), { status: "approved" }));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/preplans/PP1`), { status: "approved" }));
    await assertFails(getDoc(doc(ffA().firestore(), `departments/${A}/preplanRestricted/R1`)));
    await assertSucceeds(getDoc(doc(editorA().firestore(), `departments/${A}/preplanRestricted/R1`)));
    // Gate codes and shutoffs never go into the revision everyone can read.
    await assertFails(setDoc(doc(editorA().firestore(), `departments/${A}/preplanRevisions/RV1`), { sectionAnswers: { address: "1 Main", gatesCodes: "1234" } }));
    await assertSucceeds(setDoc(doc(editorA().firestore(), `departments/${A}/preplanRevisions/RV1`), { sectionAnswers: { address: "2 Main" } }));
  });

  it("inspections: signing off one awaiting approval needs approveInspections", async () => {
    await assertFails(updateDoc(doc(editorA().firestore(), `departments/${A}/inspections/I1`), { status: "completed" }));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/inspections/I1`), { status: "completed" }));
    await assertFails(setDoc(doc(ffA().firestore(), `departments/${A}/inspections/I2`), { status: "draft" }));
  });

  it("fleet: anyone can run a check and report a defect; setup needs fleet permissions", async () => {
    const ff = ffA();
    await assertSucceeds(put(ff, `departments/${A}/fleetChecks/C1`, { status: "in_progress", operatorId: "ff-a" }));
    await assertSucceeds(put(ff, `departments/${A}/fleetDefects/FD2`, { status: "submitted" }));
    await assertFails(updateDoc(doc(ff.firestore(), `departments/${A}/fleetDefects/FD1`), { status: "closed" }));
    await assertSucceeds(updateDoc(doc(editorA().firestore(), `departments/${A}/fleetDefects/FD1`), { status: "closed" }));
    await assertSucceeds(put(ff, `departments/${A}/fleetClasses/FC2`, { name: "Default" }));
    await assertFails(updateDoc(doc(ff.firestore(), `departments/${A}/fleetClasses/FC1`), { name: "Changed" }));
    await assertFails(deleteDoc(doc(ff.firestore(), `departments/${A}/fleetAssets/anything`)));
  });

  it("record counters only count up", async () => {
    const db = ffA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/counters/preplan-2026`), { value: 6, updatedAt: "now" }));
    await assertFails(setDoc(doc(db, `departments/${A}/counters/preplan-2026`), { value: 3, updatedAt: "now" }));
    await assertFails(setDoc(doc(db, `departments/${A}/counters/preplan-2026`), { value: 9, other: true }));
    await assertFails(deleteDoc(doc(db, `departments/${A}/counters/preplan-2026`)));
  });

  it("messages: send as yourself, mark only your own read, don't edit others'", async () => {
    const db = ffA().firestore();
    await assertSucceeds(put(ffA(), `departments/${A}/internalEmails/M2`, { fromUid: "ff-a", recipients: ["all"], readBy: {} }));
    await assertFails(put(ffA(), `departments/${A}/internalEmails/M3`, { fromUid: "editor-a", recipients: ["all"], readBy: {} }));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/internalEmails/M1`), { readBy: { "ff-a": "now" }, updatedAt: "now" }, { merge: true }));
    await assertFails(setDoc(doc(db, `departments/${A}/internalEmails/M1`), { readBy: { "someone-else": "now" } }, { merge: true }));
    await assertFails(setDoc(doc(db, `departments/${A}/internalEmails/M1`), { subject: "Edited" }, { merge: true }));
    await assertFails(deleteDoc(doc(db, `departments/${A}/internalEmails/M1`)));
    await assertSucceeds(deleteDoc(doc(editorA().firestore(), `departments/${A}/internalEmails/M1`)));
  });

  it("messages: each member reads only what they sent or were sent", async () => {
    const msgs = `departments/${A}/internalEmails`;
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `${msgs}/TO-ALL`), { fromUid: "editor-a", toAll: true, recipientUids: [], createdAt: "2026-01-03" });
      await setDoc(doc(db, `${msgs}/TO-FF`), { fromUid: "editor-a", toAll: false, recipientUids: ["ff-a"], createdAt: "2026-01-02" });
      await setDoc(doc(db, `${msgs}/TO-OTHER`), { fromUid: "editor-a", toAll: false, recipientUids: ["member-a"], createdAt: "2026-01-01" });
      await setDoc(doc(db, `${msgs}/FROM-FF`), { fromUid: "ff-a", toAll: false, recipientUids: ["editor-a"], createdAt: "2026-01-04" });
      await setDoc(doc(db, `${msgs}/UNRESOLVED`), { fromUid: "editor-a", recipients: ["person:P-X"], createdAt: "2026-01-05" });
    });
    const db = ffA().firestore();
    await assertSucceeds(getDoc(doc(db, `${msgs}/TO-ALL`)));
    await assertSucceeds(getDoc(doc(db, `${msgs}/TO-FF`)));
    await assertSucceeds(getDoc(doc(db, `${msgs}/FROM-FF`)));
    await assertFails(getDoc(doc(db, `${msgs}/TO-OTHER`)));
    await assertFails(getDoc(doc(db, `${msgs}/UNRESOLVED`)));
    // The inbox queries the app runs.
    const recent = (...clauses) => getDocs(query(collection(db, msgs), ...clauses, orderBy("createdAt", "desc"), limit(500)));
    const ids = async (promise) => (await assertSucceeds(promise)).docs.map((d) => d.id).sort();
    assert.deepEqual(await ids(recent(where("fromUid", "==", "ff-a"))), ["FROM-FF"]);
    assert.deepEqual(await ids(recent(where("toAll", "==", true))), ["TO-ALL"]);
    assert.deepEqual(await ids(recent(where("recipientUids", "array-contains", "ff-a"))), ["TO-FF"]);
    await assertFails(recent());
    // Message managers (department admins here) read the whole board.
    await assertSucceeds(getDocs(query(collection(adminA().firestore(), msgs), orderBy("createdAt", "desc"), limit(500))));
    await assertSucceeds(getDoc(doc(adminA().firestore(), `${msgs}/TO-OTHER`)));
  });

  it("notifications are only marked read; department settings need admin permissions", async () => {
    const db = ffA().firestore();
    await assertSucceeds(updateDoc(doc(db, `departments/${A}/notifications/N1`), { status: "read", updatedAt: "now" }));
    await assertFails(updateDoc(doc(db, `departments/${A}/notifications/N1`), { message: "changed" }));
    await assertFails(updateDoc(doc(db, `departments/${A}/profile/main`), { name: "Hijacked" }));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/profile/main`), { name: "Renamed" }));
    await assertFails(updateDoc(doc(db, `departments/${A}/dropdowns/ranks`), { options: [] }));
    await assertFails(setDoc(doc(db, `departments/${A}/public/alert-dashboard`), { x: 1 }));
  });

  it("member grants: read your own, nobody writes them from the app", async () => {
    await assertSucceeds(getDoc(doc(ffA().firestore(), `departments/${A}/memberGrants/ff-a`)));
    await assertFails(getDoc(doc(ffA().firestore(), `departments/${A}/memberGrants/editor-a`)));
    await assertFails(setDoc(doc(ffA().firestore(), `departments/${A}/memberGrants/ff-a`), { permissions: { editPersonnel: true } }));
    await assertFails(setDoc(doc(adminA().firestore(), `departments/${A}/memberGrants/ff-a`), { permissions: {} }));
  });
});

describe("FORGE FIELD settings and records", () => {
  it("only department admins change FORGE FIELD settings; members can read them", async () => {
    await assertSucceeds(setDoc(doc(adminA().firestore(), `departments/${A}/settings/fieldApp`), { appName: "Field", workflows: {} }));
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/settings/fieldApp`)));
    await assertFails(setDoc(doc(memberA().firestore(), `departments/${A}/settings/fieldApp`), { appName: "Hacked" }));
    await assertFails(setDoc(doc(memberB().firestore(), `departments/${A}/settings/fieldApp`), { appName: "Other dept" }));
  });

  it("members keep editing other settings docs as before", async () => {
    await assertSucceeds(setDoc(doc(memberA().firestore(), `departments/${A}/settings/main`), { dailyLogSettings: { shiftChangeTime: "07:00" } }, { merge: true }));
  });

  it("check-off lists are admin-only to write, readable by members", async () => {
    await assertSucceeds(setDoc(doc(adminA().firestore(), `departments/${A}/fieldCheckoffLists/EMS-1`), { name: "Jump bag", items: [] }));
    await assertSucceeds(getDoc(doc(memberA().firestore(), `departments/${A}/fieldCheckoffLists/EMS-1`)));
    await assertFails(setDoc(doc(memberA().firestore(), `departments/${A}/fieldCheckoffLists/EMS-2`), { name: "Mine", items: [] }));
    await assertFails(deleteDoc(doc(adminA().firestore(), `departments/${A}/fieldCheckoffLists/EMS-1`)));
  });

  it("members submit check-offs as themselves; admins mark them restocked", async () => {
    const member = memberA().firestore();
    await assertSucceeds(setDoc(doc(member, `departments/${A}/fieldCheckoffs/CO-1`), { performedByUid: "member-a", result: "Needs restock" }));
    await assertSucceeds(setDoc(doc(member, `departments/${A}/fieldCheckoffs/CO-1`), { performedByUid: "member-a", result: "Needs restock", notes: "retry" }, { merge: true }));
    await assertFails(setDoc(doc(member, `departments/${A}/fieldCheckoffs/CO-2`), { performedByUid: "someone-else" }));
    await assertFails(updateDoc(doc(member, `departments/${A}/fieldCheckoffs/CO-1`), { restockedAt: "now" }));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/fieldCheckoffs/CO-1`), { restockedAt: "now", restockedBy: "Chief" }));
    await assertFails(updateDoc(doc(adminA().firestore(), `departments/${A}/fieldCheckoffs/CO-1`), { result: "All OK" }));
    await assertFails(getDoc(doc(memberB().firestore(), `departments/${A}/fieldCheckoffs/CO-1`)));
  });

  it("plan updates are submitted as pending by the sender and reviewed by plan editors", async () => {
    const member = memberA().firestore();
    await assertSucceeds(setDoc(doc(member, `departments/${A}/fieldPlanUpdates/PFU-1`), { submittedByUid: "member-a", status: "pending", note: "Knox box moved" }));
    await assertFails(setDoc(doc(member, `departments/${A}/fieldPlanUpdates/PFU-2`), { submittedByUid: "member-a", status: "applied" }));
    await assertFails(setDoc(doc(member, `departments/${A}/fieldPlanUpdates/PFU-3`), { submittedByUid: "someone-else", status: "pending" }));
    await assertSucceeds(updateDoc(doc(adminA().firestore(), `departments/${A}/fieldPlanUpdates/PFU-1`), { status: "applied", reviewedBy: "Chief", reviewedAt: "now" }));
    await assertFails(updateDoc(doc(adminA().firestore(), `departments/${A}/fieldPlanUpdates/PFU-1`), { note: "rewritten" }));
    await assertFails(deleteDoc(doc(adminA().firestore(), `departments/${A}/fieldPlanUpdates/PFU-1`)));
  });
});

describe("hydrant and fleet records follow permissions", () => {
  const readOnlyA = () => as("readonly-a", { email: "ro@a.gov", email_verified: true });
  const put = (ctx, path, data) => setDoc(doc(ctx.firestore(), path), data);

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `departments/${A}/users/readonly-a`), membership("readonly-a", A, { roleIds: ["readOnly"] }));
      await setDoc(doc(db, `departments/${A}/memberGrants/readonly-a`), { permissions: { viewDocuments: true } });
      await setDoc(doc(db, `departments/${A}/hydrants/h1`), { id: "h1" });
      await setDoc(doc(db, `departments/${A}/hydrantInspections/i1`), { id: "i1" });
      await setDoc(doc(db, `departments/${A}/hydrantDamageReports/r1`), { id: "r1", status: "draft" });
      await setDoc(doc(db, `departments/${A}/fleetChecks/c1`), { status: "done" });
    });
  });

  it("a member without hydrant access can read but not change hydrant records", async () => {
    const ro = readOnlyA();
    await assertSucceeds(getDoc(doc(ro.firestore(), `departments/${A}/hydrants/h1`)));
    await assertFails(put(ro, `departments/${A}/hydrants/h1`, { id: "h1", status: "Out of Service" }));
    await assertFails(put(ro, `departments/${A}/hydrantInspections/i2`, { id: "i2" }));
    await assertFails(deleteDoc(doc(ro.firestore(), `departments/${A}/hydrants/h1`)));
    await assertFails(put(ro, `departments/${A}/hydrantDamageReports/r2`, { id: "r2" }));
  });

  it("crews record hydrant tests and damage reports, but only admins delete", async () => {
    const ff = ffA();
    await assertSucceeds(put(ff, `departments/${A}/hydrants/h1`, { id: "h1", last_tested: "2026-11-03" }));
    await assertSucceeds(put(ff, `departments/${A}/hydrantInspections/i2`, { id: "i2" }));
    await assertSucceeds(put(ff, `departments/${A}/hydrantFlowTests/f1`, { id: "f1" }));
    await assertSucceeds(put(ff, `departments/${A}/dailyActivity/a1`, { id: "a1" }));
    await assertSucceeds(put(ff, `departments/${A}/hydrantDamageReports/r2`, { id: "r2", status: "draft" }));
    await assertFails(deleteDoc(doc(ff.firestore(), `departments/${A}/hydrants/h1`)));
    await assertFails(deleteDoc(doc(ff.firestore(), `departments/${A}/hydrantInspections/i1`)));
    await assertFails(deleteDoc(doc(ff.firestore(), `departments/${A}/hydrantDamageReports/r1`)));
    await assertSucceeds(deleteDoc(doc(adminA().firestore(), `departments/${A}/hydrants/h1`)));
    await assertSucceeds(deleteDoc(doc(adminA().firestore(), `departments/${A}/hydrantDamageReports/r1`)));
  });

  it("anyone records fleet checks; only fleet staff delete them", async () => {
    await assertSucceeds(put(ffA(), `departments/${A}/fleetChecks/c2`, { status: "in_progress" }));
    await assertFails(deleteDoc(doc(ffA().firestore(), `departments/${A}/fleetChecks/c1`)));
    await assertSucceeds(deleteDoc(doc(adminA().firestore(), `departments/${A}/fleetChecks/c1`)));
  });
});

describe("public platform look", () => {
  it("anyone can read it (sign-in page); only platform creators change it", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "platformBranding/public"), { logoUrl: "https://example.com/logo.png", name: "FORGE Responder" });
      await setDoc(doc(ctx.firestore(), "platformConfig/main"), { name: "FORGE", integrationNotes: "private" });
    });
    await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), "platformBranding/public")));
    // The full platform settings stay private.
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "platformConfig/main")));
    await assertFails(setDoc(doc(adminA().firestore(), "platformBranding/public"), { logoUrl: "https://evil.example/x.png" }));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), "platformBranding/public"), { logoUrl: "x" }));
    await assertSucceeds(setDoc(doc(creator().firestore(), "platformBranding/public"), { logoUrl: "https://example.com/new.png", name: "FORGE Responder" }));
  });
});

describe("heat zone analytics data", () => {
  const analystA = () => as("analyst-a", { email: "analyst@a.gov", email_verified: true });
  const analystB = () => as("analyst-b", { email: "analyst@b.gov", email_verified: true });
  const HZ = ["heatZoneCalls/c1", "heatZoneZones/z1", "heatZoneSettings/main", "heatZoneAccess/analyst-a", "heatZoneEvents/e1", "heatZoneGeocodes/g1", "heatZoneSettings/geocoding"];

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, `departments/${A}/users/analyst-a`), membership("analyst-a", A));
      await setDoc(doc(db, `departments/${B}/users/analyst-b`), membership("analyst-b", B));
      await setDoc(doc(db, `departments/${A}/memberGrants/analyst-a`), { permissions: { viewHeatZoneAnalytics: true } });
      await setDoc(doc(db, `departments/${B}/memberGrants/analyst-b`), { permissions: { viewHeatZoneAnalytics: true } });
      for (const dept of [A, B]) {
        await setDoc(doc(db, `departments/${dept}/heatZoneMeta/state`), { version: 3 });
        for (const path of HZ) await setDoc(doc(db, `departments/${dept}/${path}`), { departmentId: dept, lat: 32.3, lng: -89.4 });
      }
    });
  });

  it("members with Heat Zone access can listen to their own department's change counter", async () => {
    await assertSucceeds(getDoc(doc(analystA().firestore(), `departments/${A}/heatZoneMeta/state`)));
    await assertSucceeds(getDoc(doc(adminA().firestore(), `departments/${A}/heatZoneMeta/state`)));
  });

  it("the change counter is closed to other departments and to members without access", async () => {
    await assertFails(getDoc(doc(analystB().firestore(), `departments/${A}/heatZoneMeta/state`)));
    await assertFails(getDoc(doc(analystA().firestore(), `departments/${B}/heatZoneMeta/state`)));
    await assertFails(getDoc(doc(memberA().firestore(), `departments/${A}/heatZoneMeta/state`)));
    await assertFails(getDoc(doc(stranger().firestore(), `departments/${A}/heatZoneMeta/state`)));
  });

  it("call projections, boundaries, settings, access and events are never readable from the browser", async () => {
    for (const ctx of [analystA(), adminA(), analystB(), creator()]) {
      for (const path of HZ) await assertFails(getDoc(doc(ctx.firestore(), `departments/${A}/${path}`)));
    }
    await assertFails(getDocs(collection(analystA().firestore(), `departments/${A}/heatZoneCalls`)));
  });

  it("no browser can write Heat Zone data, in any department", async () => {
    for (const ctx of [analystA(), adminA(), creator(), analystB()]) {
      const db = ctx.firestore();
      await assertFails(setDoc(doc(db, `departments/${A}/heatZoneMeta/state`), { version: 99 }));
      for (const path of HZ) await assertFails(setDoc(doc(db, `departments/${A}/${path}`), { departmentId: B }));
      await assertFails(deleteDoc(doc(db, `departments/${A}/heatZoneCalls/c1`)));
    }
  });
});
