// Department entitlements against the Firestore emulator. Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const entitlements = require("./lib/entitlements.js");
const { MODULE_KEYS } = require("./lib/moduleCatalog.js");

const PROJECT_ID = "demo-forge-rms";
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
  await Promise.all([
    db.doc("platformSubscriptionPlans/pilot").set({ name: "Pilot", maxPersonnel: 50, maxPortalUsers: 25, maxStations: 3 }),
    db.doc("platformSubscriptionPlans/enterprise").set({ name: "Enterprise", maxPersonnel: 0, maxPortalUsers: 0, maxStations: 0 }),
    db.doc("platformDepartments/camden").set({ name: "Camden" }),
    db.doc("platformDepartments/riverside").set({ name: "Riverside" }),
    db.doc("platformSubscriptions/camden").set({ planId: "pilot", status: "trial" }),
    db.doc("platformSubscriptions/riverside").set({ planId: "enterprise", status: "active" }),
    db.doc("departments/camden/profile/main").set({ stationDetails: [{ name: "1" }, { name: "2" }] }),
    db.doc("departments/camden/users/a").set({ status: "active" }),
    db.doc("departments/camden/users/b").set({ status: "active" }),
    db.doc("departments/camden/users/c").set({ status: "disabled" }),
    db.doc("departments/camden/users/creator").set({ status: "active", isPlatformCreator: true }),
    db.doc("departments/camden/lists/hlfd-rms-personnel").set({ storage: "items" }),
    db.doc("departments/camden/lists/hlfd-rms-personnel/items/P1").set({ id: "P1", _order: 1 }),
    db.doc("departments/camden/lists/hlfd-rms-personnel/items/P2").set({ id: "P2", _order: 2 }),
  ]);
});

const read = async (id) => (await db.doc(`platformEntitlements/${id}`).get()).data();

describe("entitlements", () => {
  it("records plan limits and current usage", async () => {
    await entitlements.refreshDepartment(db, "camden");
    const e = await read("camden");
    assert.equal(e.planId, "pilot");
    assert.equal(e.status, "trial");
    assert.deepEqual(e.limits, { maxPersonnel: 50, maxPortalUsers: 25, maxStations: 3 });
    assert.deepEqual(e.usage, { personnel: 2, portalUsers: 2, stations: 2 });
    assert.deepEqual(e.modules, MODULE_KEYS, "all plans start with every module");
  });

  it("narrows modules by the plan and the department's switched-off modules", async () => {
    // A stale enabledModules list from before enforcement is ignored.
    await db.doc("departments/camden/settings/main").set({ enabledModules: ["personnel"], disabledModules: ["training"] });
    await db.doc("platformSubscriptionPlans/pilot").set({ modules: ["personnel", "training", "scheduling"] }, { merge: true });
    await entitlements.refreshDepartment(db, "camden");
    assert.deepEqual((await read("camden")).modules, ["dashboard", "personnel", "scheduling", "administration"]);
  });

  it("refreshes every department on a plan, and all departments", async () => {
    assert.equal(await entitlements.refreshForPlan(db, "enterprise"), 1);
    assert.deepEqual((await read("riverside")).limits, { maxPersonnel: 0, maxPortalUsers: 0, maxStations: 0 });
    assert.equal(await read("camden"), undefined);
    const all = await entitlements.refreshAll(db);
    assert.deepEqual(all.map((e) => e.departmentId).sort(), ["camden", "riverside"]);
  });

  it("only reacts to changes that matter", () => {
    assert.equal(entitlements.modulesChanged({ disabledModules: ["a"] }, { disabledModules: ["a"], timezone: "x" }), false);
    assert.equal(entitlements.modulesChanged({ disabledModules: ["a"] }, { disabledModules: ["a", "b"] }), true);
    assert.equal(entitlements.stationsChanged({ stations: ["1"] }, { stations: ["1 HQ"] }), false);
    assert.equal(entitlements.stationsChanged({ stations: ["1"] }, { stations: ["1", "2"] }), true);
  });
});
