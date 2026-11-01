// Station TV alert screens: only a valid display key opens them.
// Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const publicView = require("./lib/alertDashboardPublic.js");

const PROJECT_ID = "demo-forge-rms";
const D = "dept-a";
const KEY = "a".repeat(48);
let db;

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
  await db.doc(`rmsGateways/${D}`).set({ departmentId: D, departmentName: "Dept A" });
  await db.doc(`departments/${D}/lists/hlfd-rms-alert-dashboard-config`).set({ items: [{ id: "config", publicDisplayKey: KEY }] });
  await db.doc(`departments/${D}/lists/hlfd-rms-active911-alerts`).set({
    items: [{ id: "al1", description: "Structure fire", address: "1 Main St", responses: [{ name: "FF Smith" }], notes: "caller hysterical" }],
  });
});

describe("public alert dashboard", () => {
  it("refuses a missing or wrong key", async () => {
    await assert.rejects(publicView.loadPublicAlertDashboard(db, D, { sync: false }), (e) => e.code === "permission-denied");
    await assert.rejects(publicView.loadPublicAlertDashboard(db, D, { sync: false, displayKey: "b".repeat(48) }), (e) => e.code === "permission-denied");
  });

  it("with the key, returns alerts without responder names, notes, or the key itself", async () => {
    const data = await publicView.loadPublicAlertDashboard(db, D, { sync: false, displayKey: KEY });
    assert.equal(data.alerts.length, 1);
    assert.equal(data.alerts[0].description, "Structure fire");
    assert.equal(data.alerts[0].responses, undefined);
    assert.equal(data.alerts[0].notes, undefined);
    assert.equal(JSON.stringify(data).includes(KEY), false);
  });

  it("is off when the department turns TV links off", async () => {
    await db.doc(`departments/${D}/lists/hlfd-rms-alert-dashboard-config`).set({ items: [{ id: "config", publicDisplayKey: KEY, publicDashboardEnabled: false }] });
    await assert.rejects(publicView.loadPublicAlertDashboard(db, D, { sync: false, displayKey: KEY }), (e) => e.code === "permission-denied");
    assert.equal(await publicView.verifyPublicDisplayKey(db, D, KEY), false);
  });

  it("public map lookups need the same key", async () => {
    assert.equal(await publicView.verifyPublicDisplayKey(db, D, KEY), true);
    assert.equal(await publicView.verifyPublicDisplayKey(db, D, ""), false);
    assert.equal(await publicView.verifyPublicDisplayKey(db, "dept-b", KEY), false);
  });
});
