// Two-factor requirements on the server, against the Firestore emulator. Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");
const access = require("./lib/access.js");
const twoFactor = require("./lib/twoFactor.js");
const invites = require("./lib/invites.js");

const PROJECT_ID = "demo-forge-rms";
let db;

const withCode = (uid) => ({ uid, token: { email: `${uid}@x.gov`, firebase: { sign_in_second_factor: "totp" } } });
const withoutCode = (uid) => ({ uid, token: { email: `${uid}@x.gov` } });
const setDeadline = (date) => db.doc("platformConfig/main").set({ mfaAdminDeadline: date ? Timestamp.fromDate(date) : null }, { merge: true });
const DAY = 24 * 60 * 60 * 1000;

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await Promise.all([
    db.doc("platformCreators/creator-1").set({ status: "active" }),
    db.doc("departments/camden/users/chief").set({ status: "active", role: "department_admin", roleIds: ["fireChief"] }),
    db.doc("departments/forge-demo/users/demo").set({ status: "active", role: "fireChief", roleIds: ["fireChief"] }),
    db.doc("platformDepartments/camden").set({ name: "Camden" }),
    db.doc("departments/camden/roles/firefighter").set({ name: "Firefighter", permissions: {} }),
    db.doc("platformDepartments/forge-demo").set({ name: "Demo" }),
  ]);
});

const invite = (auth, departmentId = "camden") => invites.createInvite(db, {
  auth,
  data: { departmentId, email: "new@x.gov", roleIds: ["firefighter"], sendEmail: false },
  rawRequest: { headers: {} },
});

describe("two-factor login", () => {
  it("creator powers need a session signed in with a code", async () => {
    assert.equal(await access.isPlatformCreator(db, withCode("creator-1")), true);
    assert.equal(await access.isPlatformCreator(db, withoutCode("creator-1")), false);
    assert.equal(twoFactor.hasSecondFactor(withCode("x")), true);
    assert.equal(twoFactor.hasSecondFactor(withoutCode("x")), false);
  });

  it("department admins have no requirement until a deadline is set", async () => {
    await setDeadline(null);
    assert.equal(await twoFactor.adminSecondFactorRequired(db, "camden"), false);
    const result = await invite(withoutCode("chief"));
    assert.ok(result.inviteId);
  });

  it("department admins keep working during the grace period", async () => {
    await setDeadline(new Date(Date.now() + 14 * DAY));
    assert.equal(await twoFactor.adminSecondFactorRequired(db, "camden"), false);
    assert.ok((await invite(withoutCode("chief"))).inviteId);
  });

  it("after the deadline, admin tools need a code; with one they work", async () => {
    await setDeadline(new Date(Date.now() - DAY));
    assert.equal(await twoFactor.adminSecondFactorRequired(db, "camden"), true);
    await assert.rejects(invite(withoutCode("chief")), (e) => e.code === "permission-denied");
    assert.ok((await invite(withCode("chief"))).inviteId);
  });

  it("the shared demo is never required", async () => {
    await setDeadline(new Date(Date.now() - DAY));
    assert.equal(await twoFactor.adminSecondFactorRequired(db, "forge-demo"), false);
  });
});
