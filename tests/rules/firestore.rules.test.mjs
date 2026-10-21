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

describe("email-based access requires a verified email", () => {
  it("unverified bootstrap owner email gets no platform access", async () => {
    const db = as("imposter", { email: "admin@forgepublicsafety.com", email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, `departments/${A}/incidents/i1`)));
    await assertFails(setDoc(doc(db, `departments/${A}/users/imposter`), membership("imposter", A)));
  });

  it("verified bootstrap owner keeps access", async () => {
    const db = as("owner", { email: "admin@forgepublicsafety.com", email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(db, `departments/${A}/incidents/i1`)));
  });

  it("unverified @hornlake.org account cannot read horn-lake-fd", async () => {
    const db = as("hl-imposter", { email: "x@hornlake.org", email_verified: false }).firestore();
    await assertFails(getDoc(doc(db, "departments/horn-lake-fd/incidents/i1")));
  });

  it("verified @hornlake.org account can read horn-lake-fd (legacy, until back-fill)", async () => {
    const db = as("hl-user", { email: "ff@hornlake.org", email_verified: true }).firestore();
    await assertSucceeds(getDoc(doc(db, "departments/horn-lake-fd/incidents/i1")));
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
