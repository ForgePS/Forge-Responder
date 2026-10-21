// Invite Cloud Function logic, run against the Firestore emulator with the Admin SDK.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

// Resolve modules from functions/ so we share its firebase-admin instance.
const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const invites = require("./lib/invites.js");

const PROJECT_ID = "demo-forge-rms";
const A = "dept-a";
let db;

const auth = (uid, email) => ({ uid, token: { email, name: uid } });
const req = (authCtx, data) => ({ auth: authCtx, data });
const ADMIN = auth("admin-a", "chief@a.gov");
const MEMBER = auth("member-a", "ff@a.gov");

async function expectHttpsError(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

function tokenFromUrl(url) {
  return new URL(url).searchParams.get("invite");
}

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await admin.app().delete();
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await Promise.all([
    db.doc(`platformDepartments/${A}`).set({ name: "Dept A", status: "active" }),
    db.doc(`departments/${A}/profile/main`).set({ name: "Dept A" }),
    db.doc(`departments/${A}/roles/firefighter`).set({ name: "Firefighter" }),
    db.doc(`departments/${A}/roles/fireChief`).set({ name: "Fire Chief" }),
    db.doc(`departments/${A}/users/admin-a`).set({ status: "active", role: "department_admin", roleIds: ["fireChief"] }),
    db.doc(`departments/${A}/users/member-a`).set({ status: "active", role: "firefighter", roleIds: ["firefighter"] }),
    db.doc("platformCreators/creator-1").set({ status: "active" }),
  ]);
});

describe("createInvite", () => {
  it("rejects non-admins", async () => {
    await expectHttpsError(
      invites.createInvite(db, req(MEMBER, { departmentId: A, email: "new@a.gov", roleIds: ["firefighter"] })),
      "permission-denied"
    );
  });

  it("rejects signed-out callers", async () => {
    await expectHttpsError(
      invites.createInvite(db, req(null, { departmentId: A, email: "new@a.gov", roleIds: ["firefighter"] })),
      "unauthenticated"
    );
  });

  it("creates a pending invite and stores only the token hash", async () => {
    const result = await invites.createInvite(db, req(ADMIN, {
      departmentId: A, email: "New@A.gov", roleIds: ["firefighter"], sendEmail: false, appOrigin: "http://localhost:5173",
    }));
    const token = tokenFromUrl(result.inviteUrl);
    assert.ok(token && token.length > 30);
    assert.equal(result.inviteId, invites.hashToken(token));
    assert.match(result.inviteUrl, /^http:\/\/localhost:5173\/dept-a\?invite=/);

    const stored = (await db.doc(`invites/${result.inviteId}`).get()).data();
    assert.equal(stored.status, "pending");
    assert.equal(stored.email, "new@a.gov");
    assert.deepEqual(stored.roleIds, ["firefighter"]);
    assert.ok(!JSON.stringify(stored).includes(token), "raw token must not be stored");
  });

  it("ignores untrusted app origins in invite links", async () => {
    const result = await invites.createInvite(db, req(ADMIN, {
      departmentId: A, email: "new@a.gov", roleIds: ["firefighter"], sendEmail: false, appOrigin: "https://evil.example.com",
    }));
    // Untrusted origin falls back to the platform host, i.e. the department subdomain.
    assert.match(result.inviteUrl, /^https:\/\/dept-a\.forgeresponder\.com\/\?invite=/);
  });

  it("keeps path-style links when created from web.app", async () => {
    const result = await invites.createInvite(db, req(ADMIN, {
      departmentId: A, email: "web@a.gov", roleIds: ["firefighter"], sendEmail: false, appOrigin: "https://rms-dashboard-7562e.web.app",
    }));
    assert.match(result.inviteUrl, /^https:\/\/rms-dashboard-7562e\.web\.app\/dept-a\?invite=/);
  });

  it("uses the department's subdomain when created from forgeresponder.com", async () => {
    const fromPlatform = await invites.createInvite(db, req(ADMIN, {
      departmentId: A, email: "sub@a.gov", roleIds: ["firefighter"], sendEmail: false, appOrigin: "https://app.forgeresponder.com",
    }));
    assert.match(fromPlatform.inviteUrl, /^https:\/\/dept-a\.forgeresponder\.com\/\?invite=/);
    const lookAlike = await invites.createInvite(db, req(ADMIN, {
      departmentId: A, email: "sub2@a.gov", roleIds: ["firefighter"], sendEmail: false, appOrigin: "https://forgeresponder.com.evil.com",
    }));
    // A look-alike host is not trusted: the link goes to the real department subdomain.
    assert.match(lookAlike.inviteUrl, /^https:\/\/dept-a\.forgeresponder\.com\/\?invite=/);
    assert.doesNotMatch(lookAlike.inviteUrl, /evil/);
  });

  it("refuses the creator role and unknown roles", async () => {
    await expectHttpsError(
      invites.createInvite(db, req(ADMIN, { departmentId: A, email: "x@a.gov", roleIds: ["creator"], sendEmail: false })),
      "permission-denied"
    );
    await expectHttpsError(
      invites.createInvite(db, req(ADMIN, { departmentId: A, email: "x@a.gov", roleIds: ["superuser"], sendEmail: false })),
      "invalid-argument"
    );
  });

  it("replaces an older pending invite for the same email", async () => {
    const first = await invites.createInvite(db, req(ADMIN, { departmentId: A, email: "x@a.gov", roleIds: ["firefighter"], sendEmail: false }));
    await invites.createInvite(db, req(ADMIN, { departmentId: A, email: "x@a.gov", roleIds: ["firefighter"], sendEmail: false }));
    assert.equal((await db.doc(`invites/${first.inviteId}`).get()).data().status, "revoked");
  });

  it("enforces the plan's user limit", async () => {
    await db.doc("platformSubscriptionPlans/tiny").set({ maxPortalUsers: 3 });
    await db.doc(`platformSubscriptions/${A}`).set({ status: "active", planId: "tiny" });
    // 2 active members + 1 pending invite = 3 seats used.
    await invites.createInvite(db, req(ADMIN, { departmentId: A, email: "one@a.gov", roleIds: ["firefighter"], sendEmail: false }));
    await expectHttpsError(
      invites.createInvite(db, req(ADMIN, { departmentId: A, email: "two@a.gov", roleIds: ["firefighter"], sendEmail: false })),
      "resource-exhausted"
    );
  });

  it("refuses invites for suspended departments", async () => {
    await db.doc(`platformSubscriptions/${A}`).set({ status: "suspended", planId: "pilot" });
    await expectHttpsError(
      invites.createInvite(db, req(auth("creator-1", "c@forge.test"), { departmentId: A, email: "x@a.gov", roleIds: ["firefighter"], sendEmail: false })),
      "failed-precondition"
    );
  });
});

describe("acceptInvite", () => {
  async function makeInvite(email = "new@a.gov", roleIds = ["firefighter"]) {
    const result = await invites.createInvite(db, req(ADMIN, { departmentId: A, email, roleIds, sendEmail: false }));
    return { ...result, token: tokenFromUrl(result.inviteUrl) };
  }

  it("creates an active membership for the invited email", async () => {
    const { token, inviteId } = await makeInvite();
    const result = await invites.acceptInvite(db, req(auth("new-uid", "NEW@a.gov"), { token }));
    assert.equal(result.departmentId, A);

    const membership = (await db.doc(`departments/${A}/users/new-uid`).get()).data();
    assert.equal(membership.status, "active");
    assert.deepEqual(membership.roleIds, ["firefighter"]);
    assert.equal(membership.email, "new@a.gov");
    assert.equal((await db.doc(`invites/${inviteId}`).get()).data().status, "accepted");
  });

  it("is idempotent for the same user", async () => {
    const { token } = await makeInvite();
    await invites.acceptInvite(db, req(auth("new-uid", "new@a.gov"), { token }));
    const again = await invites.acceptInvite(db, req(auth("new-uid", "new@a.gov"), { token }));
    assert.equal(again.alreadyAccepted, true);
  });

  it("rejects a different email address", async () => {
    const { token } = await makeInvite();
    await expectHttpsError(invites.acceptInvite(db, req(auth("other", "other@a.gov"), { token })), "permission-denied");
    assert.equal((await db.doc(`departments/${A}/users/other`).get()).exists, false);
  });

  it("rejects a second user after the invite is used", async () => {
    const { token } = await makeInvite();
    await invites.acceptInvite(db, req(auth("new-uid", "new@a.gov"), { token }));
    await expectHttpsError(invites.acceptInvite(db, req(auth("someone-else", "new@a.gov"), { token })), "failed-precondition");
  });

  it("rejects expired, revoked and unknown invites", async () => {
    const expired = await makeInvite("e@a.gov");
    await db.doc(`invites/${expired.inviteId}`).update({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await expectHttpsError(invites.acceptInvite(db, req(auth("e", "e@a.gov"), { token: expired.token })), "deadline-exceeded");

    const revoked = await makeInvite("r@a.gov");
    await invites.revokeInvite(db, req(ADMIN, { inviteId: revoked.inviteId }));
    await expectHttpsError(invites.acceptInvite(db, req(auth("r", "r@a.gov"), { token: revoked.token })), "failed-precondition");

    await expectHttpsError(invites.acceptInvite(db, req(auth("x", "x@a.gov"), { token: "not-a-real-token" })), "not-found");
  });

  it("requires sign-in", async () => {
    const { token } = await makeInvite();
    await expectHttpsError(invites.acceptInvite(db, req(null, { token })), "unauthenticated");
  });
});

describe("revokeInvite and previewInvite", () => {
  it("only admins of that department can revoke", async () => {
    const { inviteId } = await invites.createInvite(db, req(ADMIN, { departmentId: A, email: "x@a.gov", roleIds: ["firefighter"], sendEmail: false }));
    await expectHttpsError(invites.revokeInvite(db, req(MEMBER, { inviteId })), "permission-denied");
    assert.equal((await invites.revokeInvite(db, req(ADMIN, { inviteId }))).status, "revoked");
  });

  it("preview shows the department and a masked email only", async () => {
    const { inviteUrl } = await invites.createInvite(db, req(ADMIN, { departmentId: A, email: "jordan@a.gov", roleIds: ["firefighter"], sendEmail: false }));
    const preview = await invites.previewInvite(db, req(null, { token: tokenFromUrl(inviteUrl) }));
    assert.equal(preview.valid, true);
    assert.equal(preview.departmentName, "Dept A");
    assert.equal(preview.emailHint, "jo****@a.gov");
    assert.equal((await invites.previewInvite(db, req(null, { token: "nope" }))).valid, false);
  });
});
