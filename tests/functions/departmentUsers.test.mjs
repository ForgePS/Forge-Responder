// System Admin "Create account": Auth user + department membership + grants, two tenants.
// Run: npm run test:functions (Firestore + Auth emulators). A cross-tenant failure here blocks release.
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const departmentUsers = require("./lib/departmentUsers.js");
const { memberPermissions } = require("./lib/access.js");
const { repairUserRecords } = require("./lib/userRecordRepair.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
const B = "dept-b";

let db;
let authAdmin;
const ctx = (uid) => ({ uid, token: { email: `${uid}@example.test`, name: uid } });
const req = (uid, data) => ({ auth: uid ? ctx(uid) : undefined, data });
const create = (uid, data, options = { mailer: async () => "sent" }) =>
  departmentUsers.createDepartmentUser(db, authAdmin, req(uid, data), options);

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

async function authUserOrNull(email) {
  try {
    return await authAdmin.getUserByEmail(email);
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

const authHost = () => process.env.FIREBASE_AUTH_EMULATOR_HOST;
async function identityToolkit(method, body) {
  const res = await fetch(`http://${authHost()}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=fake-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method}: ${JSON.stringify(json)}`);
  return json;
}

/** Follow the setup link like the person would: choose a password, then sign in. */
async function finishSetupAndSignIn(setupLink, email, password = "Correct-Horse-9") {
  const oobCode = new URL(setupLink).searchParams.get("oobCode");
  assert.ok(oobCode, "setup link carries an oobCode");
  await identityToolkit("resetPassword", { oobCode, newPassword: password });
  const signedIn = await identityToolkit("signInWithPassword", { email, password, returnSecureToken: true });
  return admin.auth().verifyIdToken(signedIn.idToken);
}

async function seedDepartment(id, name) {
  await Promise.all([
    db.doc(`platformDepartments/${id}`).set({ name, status: "active" }),
    db.doc(`departments/${id}/profile/main`).set({ name }),
    db.doc(`departments/${id}/roles/firefighter`).set({ name: "Firefighter" }),
    db.doc(`departments/${id}/roles/fireChief`).set({ name: "Fire Chief" }),
    db.doc(`departments/${id}/roles/itAdmin`).set({ name: "IT Admin" }),
  ]);
}

const member = (departmentId, uid, roleIds, extra = {}) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({
    uid, status: "active", departmentId, roleIds, role: roleIds[0], email: `${uid}@example.test`, ...extra,
  });

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
  authAdmin = admin.auth();
});

after(async () => {
  await admin.app().delete();
});

beforeEach(async () => {
  await Promise.all([
    fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" }),
    fetch(`http://${authHost()}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" }),
  ]);
  await Promise.all([seedDepartment(A, "Dept A"), seedDepartment(B, "Dept B")]);
  await Promise.all([
    member(A, "chief-a", ["fireChief"], { role: "department_admin" }),
    member(A, "ff-a", ["firefighter"]),
    // manageUsers through a personal override, but not an administrator.
    member(A, "clerk-a", ["firefighter"], { permissions: { manageUsers: true } }),
    member(B, "chief-b", ["fireChief"], { role: "department_admin" }),
    db.doc("platformCreators/creator-1").set({ status: "active" }),
  ]);
});

describe("createDepartmentUser", () => {
  it("creates the Auth user, membership, grants and audit entry, and the account can sign in", async () => {
    const result = await create("chief-a", {
      departmentId: A, email: "  New.Person@A.gov ", displayName: "New Person", roleIds: ["firefighter"], sendEmail: false,
    });
    assert.equal(result.status, "created");
    assert.equal(result.emailStatus, "skipped");
    assert.ok(result.setupLink, "the admin gets the link when no email went out");

    const user = await authAdmin.getUserByEmail("new.person@a.gov");
    assert.equal(user.uid, result.uid);
    assert.equal(user.displayName, "New Person");

    const membership = (await db.doc(`departments/${A}/users/${result.uid}`).get()).data();
    assert.equal(membership.uid, result.uid);
    assert.equal(membership.email, "new.person@a.gov");
    assert.equal(membership.status, "active");
    assert.equal(membership.role, "firefighter");
    assert.deepEqual(membership.roleIds, ["firefighter"]);
    assert.equal(membership.departmentId, A);
    assert.equal(membership.createdBy, "chief-a");
    assert.ok(membership.createdAt);

    const grant = (await db.doc(`departments/${A}/memberGrants/${result.uid}`).get()).data();
    assert.deepEqual(grant.roleIds, ["firefighter"]);
    assert.equal(grant.permissions.manageUsers, undefined);
    assert.ok(Object.keys(grant.permissions).length > 0, "firefighter defaults are granted");

    const logs = await db.collection(`departments/${A}/auditLogs`).where("action", "==", "user.created").get();
    assert.equal(logs.size, 1);
    assert.equal(logs.docs[0].get("actorUid"), "chief-a");
    assert.equal(logs.docs[0].get("targetUid"), result.uid);

    // Nothing leaked into department B.
    assert.equal((await db.doc(`departments/${B}/users/${result.uid}`).get()).exists, false);

    // The person finishes setup and signs in; their token's uid is the member.
    const token = await finishSetupAndSignIn(result.setupLink, "new.person@a.gov");
    assert.equal(token.uid, result.uid);
    const perms = await memberPermissions(db, A, { uid: token.uid, token });
    assert.deepEqual(perms, grant.permissions);
  });

  it("emails the setup link and keeps it from the admin when the email was sent", async () => {
    const sent = [];
    const result = await create("chief-a", { departmentId: A, email: "mailed@a.gov", roleIds: ["firefighter"] }, {
      mailer: async (message) => { sent.push(message); return "sent"; },
    });
    assert.equal(result.emailStatus, "sent");
    assert.equal(result.setupLink, undefined);
    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0].to, ["mailed@a.gov"]);
    assert.match(sent[0].text, /oobCode=/);
  });

  it("does not let a member of department A create users in department B", async () => {
    await expectCode(
      create("chief-a", { departmentId: B, email: "intruder@b.gov", roleIds: ["firefighter"] }),
      "permission-denied"
    );
    assert.equal(await authUserOrNull("intruder@b.gov"), null);
    const members = await db.collection(`departments/${B}/users`).get();
    assert.deepEqual(members.docs.map((d) => d.id), ["chief-b"]);
  });

  it("denies members without manageUsers", async () => {
    await expectCode(
      create("ff-a", { departmentId: A, email: "nope@a.gov", roleIds: ["firefighter"] }),
      "permission-denied"
    );
    assert.equal(await authUserOrNull("nope@a.gov"), null);
  });

  it("denies signed-out callers", async () => {
    await expectCode(create(null, { departmentId: A, email: "nope@a.gov", roleIds: ["firefighter"] }), "unauthenticated");
  });

  it("lets manageUsers add ordinary roles but not administrators", async () => {
    const ok = await create("clerk-a", { departmentId: A, email: "rookie@a.gov", roleIds: ["firefighter"], sendEmail: false });
    assert.equal(ok.status, "created");
    for (const roleIds of [["fireChief"], ["itAdmin"], ["firefighter", "fireChief"]]) {
      await expectCode(
        create("clerk-a", { departmentId: A, email: "boss@a.gov", roleIds, sendEmail: false }),
        "permission-denied"
      );
    }
    assert.equal(await authUserOrNull("boss@a.gov"), null);
  });

  it("never assigns the creator role and rejects unknown roles", async () => {
    await expectCode(create("chief-a", { departmentId: A, email: "x@a.gov", roleIds: ["creator"] }), "permission-denied");
    await expectCode(create("chief-a", { departmentId: A, email: "x@a.gov", roleIds: ["ghost"] }), "invalid-argument");
    await expectCode(create("chief-a", { departmentId: A, email: "not-an-email", roleIds: ["firefighter"] }), "invalid-argument");
    assert.equal(await authUserOrNull("x@a.gov"), null);
  });

  it("links an existing Auth user instead of duplicating it, and leaves their account alone", async () => {
    // Already a member of B with a password of their own.
    const existing = await authAdmin.createUser({ email: "shared@example.test", password: "Their-Own-Pass-1", displayName: "Shared" });
    await member(B, existing.uid, ["firefighter"], { email: "shared@example.test" });

    const sent = [];
    const result = await create("chief-a", { departmentId: A, email: "SHARED@example.test", roleIds: ["firefighter"] }, {
      mailer: async (message) => { sent.push(message); return "not_configured"; },
    });
    assert.equal(result.status, "linked");
    assert.equal(result.uid, existing.uid);
    assert.equal(result.setupLink, undefined, "never hand an admin a password link for someone else's account");
    assert.doesNotMatch(sent[0].text, /oobCode/);

    const users = (await authAdmin.listUsers()).users.filter((u) => u.email === "shared@example.test");
    assert.equal(users.length, 1);
    assert.equal((await db.doc(`departments/${A}/users/${existing.uid}`).get()).get("status"), "active");
    assert.ok((await db.doc(`departments/${A}/memberGrants/${existing.uid}`).get()).exists);
    // Their B membership is untouched and their own password still works.
    assert.deepEqual((await db.doc(`departments/${B}/users/${existing.uid}`).get()).get("roleIds"), ["firefighter"]);
    const signedIn = await identityToolkit("signInWithPassword", { email: "shared@example.test", password: "Their-Own-Pass-1", returnSecureToken: true });
    assert.equal(signedIn.localId, existing.uid);

    const logs = await db.collection(`departments/${A}/auditLogs`).where("action", "==", "user.linked").get();
    assert.equal(logs.size, 1);
  });

  it("is a no-op for someone who is already an active member", async () => {
    const first = await create("chief-a", { departmentId: A, email: "twice@a.gov", roleIds: ["firefighter"], sendEmail: false });
    const second = await create("chief-a", { departmentId: A, email: "twice@a.gov", roleIds: ["fireChief"], sendEmail: false });
    assert.equal(second.status, "already_member");
    assert.equal(second.uid, first.uid);
    assert.deepEqual((await db.doc(`departments/${A}/users/${first.uid}`).get()).get("roleIds"), ["firefighter"]);
  });

  it("replaces a pending invite for the same email", async () => {
    await db.doc("invites/inv-1").set({ departmentId: A, email: "invited@a.gov", status: "pending", roleIds: ["firefighter"] });
    await create("chief-a", { departmentId: A, email: "invited@a.gov", roleIds: ["firefighter"], sendEmail: false });
    const invite = (await db.doc("invites/inv-1").get()).data();
    assert.equal(invite.status, "revoked");
    assert.equal(invite.revokedReason, "account_created");
  });

  it("respects the plan's user limit", async () => {
    await db.doc(`platformSubscriptions/${A}`).set({ status: "active", planId: "tiny" });
    await db.doc("platformSubscriptionPlans/tiny").set({ maxPortalUsers: 3 });
    await expectCode(
      create("chief-a", { departmentId: A, email: "fourth@a.gov", roleIds: ["firefighter"] }),
      "resource-exhausted"
    );
    assert.equal(await authUserOrNull("fourth@a.gov"), null);
  });

  it("removes the new Auth user again when the membership write fails", async () => {
    const failingDb = new Proxy(db, {
      get(target, prop) {
        if (prop === "runTransaction") return async () => { throw new Error("simulated Firestore outage"); };
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    await assert.rejects(
      departmentUsers.createDepartmentUser(failingDb, authAdmin, req("chief-a", {
        departmentId: A, email: "halfway@a.gov", roleIds: ["firefighter"], sendEmail: false,
      })),
      /simulated Firestore outage/
    );
    assert.equal(await authUserOrNull("halfway@a.gov"), null, "no Auth user without a membership");
  });

  it("platform creators can add users to any department", async () => {
    const result = await create("creator-1", { departmentId: B, email: "chief2@b.gov", roleIds: ["fireChief"], sendEmail: false });
    assert.equal(result.status, "created");
    const membership = (await db.doc(`departments/${B}/users/${result.uid}`).get()).data();
    assert.equal(membership.role, "department_admin");
    assert.equal((await db.doc(`departments/${B}/memberGrants/${result.uid}`).get()).get("permissions").manageUsers, true);
  });
});

describe("repairUserRecords", () => {
  async function seedGaps() {
    const accepted = await authAdmin.createUser({ email: "accepted@a.gov" });
    const misplaced = await authAdmin.createUser({ email: "misplaced@a.gov" });
    const loner = await authAdmin.createUser({ email: "loner@example.test" });
    const creator = await authAdmin.createUser({ uid: "creator-1", email: "staff@example.test" });
    const healthy = await authAdmin.createUser({ email: "healthy@a.gov" });
    await Promise.all([
      // Redeemed an invite, membership missing.
      db.doc("invites/inv-ok").set({ departmentId: A, email: "accepted@a.gov", status: "accepted", acceptedBy: accepted.uid, roleIds: ["firefighter"] }),
      // Added by hand under a made-up id instead of their uid.
      member(A, "user-1712345", ["firefighter"], { email: "Misplaced@a.gov" }),
      // A membership with no sign-in at all.
      member(B, "ghost-b", ["firefighter"], { email: "ghost@b.gov" }),
      // Healthy member, but the grant record is missing.
      member(A, healthy.uid, ["firefighter"], { email: "healthy@a.gov" }),
    ]);
    return { accepted, misplaced, loner, creator, healthy };
  }

  it("dry run reports every gap and changes nothing", async () => {
    const { misplaced } = await seedGaps();
    const { counts, findings } = await repairUserRecords(db, authAdmin);
    assert.deepEqual(counts, {
      accepted_invite_no_membership: 1,
      membership_wrong_uid: 1,
      membership_without_auth: 1 + 4, // ghost-b plus the four seeded test members with no Auth user
      missing_grant: 1,
      auth_without_membership: 1, // loner; the platform creator is not flagged
    });
    assert.ok(findings.every((f) => !f.fixed));
    assert.ok(findings.every((f) => !/misplaced@a\.gov|accepted@a\.gov/.test(f.email)), "emails are masked");
    assert.equal((await db.doc(`departments/${A}/users/${misplaced.uid}`).get()).exists, false);
    assert.equal((await db.doc(`departments/${A}/users/user-1712345`).get()).exists, true);
  });

  it("--apply fixes what it can and a second run finds only the report-only gaps", async () => {
    const { accepted, misplaced, healthy } = await seedGaps();
    await repairUserRecords(db, authAdmin, { apply: true });

    const restored = (await db.doc(`departments/${A}/users/${accepted.uid}`).get()).data();
    assert.equal(restored.status, "active");
    assert.deepEqual(restored.roleIds, ["firefighter"]);
    assert.ok((await db.doc(`departments/${A}/memberGrants/${accepted.uid}`).get()).exists);

    assert.equal((await db.doc(`departments/${A}/users/user-1712345`).get()).exists, false);
    const moved = (await db.doc(`departments/${A}/users/${misplaced.uid}`).get()).data();
    assert.equal(moved.uid, misplaced.uid);
    assert.equal(moved.email, "misplaced@a.gov");
    assert.ok((await db.doc(`departments/${A}/memberGrants/${misplaced.uid}`).get()).exists);
    assert.ok((await db.doc(`departments/${A}/memberGrants/${healthy.uid}`).get()).exists);

    const logs = await db.collection(`departments/${A}/auditLogs`).where("action", "==", "user.repaired").get();
    assert.equal(logs.size, 2);

    const again = await repairUserRecords(db, authAdmin);
    assert.deepEqual(again.counts, { membership_without_auth: 5, auth_without_membership: 1 });
  });
});
