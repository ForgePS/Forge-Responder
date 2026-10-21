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
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from "firebase/firestore";
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
const memberB = () => as("member-b", { email: "ff@b.gov", email_verified: true });
const creator = () => as("creator-1", { email: "creator@forge.test", email_verified: true });
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

  it("member can link personnelId once, but not change it after", async () => {
    const db = memberA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/users/member-a`), { personnelId: "P1", updatedAt: "now" }, { merge: true }));
    await assertFails(setDoc(doc(db, `departments/${A}/users/member-a`), { personnelId: "P2", updatedAt: "now" }, { merge: true }));
  });

  it("member can read roles but not write them", async () => {
    const db = memberA().firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/roles/firefighter`)));
    await assertFails(setDoc(doc(db, `departments/${A}/roles/firefighter`), { name: "x", permissions: { manageUsers: true } }));
  });
});

describe("department admins", () => {
  it("can add and edit members", async () => {
    const db = adminA().firestore();
    await assertSucceeds(setDoc(doc(db, `departments/${A}/users/new-user`), membership("new-user", A)));
    await assertSucceeds(updateDoc(doc(db, `departments/${A}/users/member-a`), { roleIds: ["captain"] }));
    await assertSucceeds(setDoc(doc(db, `departments/${A}/roles/firefighter`), { name: "FF", permissions: {} }));
  });

  it("cannot grant platform-creator flags", async () => {
    const db = adminA().firestore();
    await assertFails(setDoc(doc(db, `departments/${A}/users/new-user`), membership("new-user", A, { role: "creator", roleIds: ["creator"] })));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { isPlatformCreator: true }));
    await assertFails(updateDoc(doc(db, `departments/${A}/users/member-a`), { roleIds: ["creator"] }));
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

  it("anyone can self-join the demo department, but not as a creator", async () => {
    const db = stranger().firestore();
    await assertSucceeds(setDoc(doc(db, "departments/forge-demo/users/stranger"), membership("stranger", "forge-demo", { roleIds: ["fireChief"] })));
    await assertFails(setDoc(doc(db, "departments/forge-demo/users/stranger"), { isPlatformCreator: true }, { merge: true }));
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
