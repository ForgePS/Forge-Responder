// Billing lifecycle against the Firestore emulator. Run: npm run test:functions
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const billing = require("./lib/billingLifecycle.js");

const PROJECT_ID = "demo-forge-rms";
let db;

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  delete process.env.SENDGRID_API_KEY; // never send real email from tests
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID });
  db = admin.firestore();
});

after(async () => {
  await Promise.all(admin.apps.map((app) => app.delete()));
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  await Promise.all([
    db.doc("platformSubscriptions/camden").set({ departmentName: "Camden", status: "trial", billingCycle: "annual", planId: "standard", trialEndsAt: "2027-01-19", renewalDate: "2027-01-19", currentPeriodStart: "2026-10-21", billingContactEmail: "chief@camden.gov" }),
    db.doc("platformSubscriptions/horn-lake-fd").set({ departmentName: "Horn Lake", status: "active", billingCycle: "complimentary", planId: "enterprise", currentPeriodStart: "2026-10-21", renewalDate: "2027-10-21" }),
    db.doc("platformSubscriptions/gone").set({ departmentName: "Gone", status: "suspended", billingCycle: "annual", renewalDate: "2026-01-01" }),
    db.doc("platformDepartments/camden").set({ name: "Camden", status: "active" }),
  ]);
});

const events = async () => (await db.collection("platformBillingEvents").get()).docs.map((d) => d.data());

describe("billing lifecycle", () => {
  it("dry run plans without writing", async () => {
    const { actions } = await billing.runBillingLifecycle(db, { today: "2027-01-20", dryRun: true });
    assert.deepEqual(actions.map((a) => `${a.departmentId}:${a.kind}`), ["camden:mark_past_due"]);
    assert.equal((await db.doc("platformSubscriptions/camden").get()).data().status, "trial");
    assert.equal((await events()).length, 0);
  });

  it("sends a reminder once and records it", async () => {
    await billing.runBillingLifecycle(db, { today: "2026-12-20" });
    const camden = (await db.doc("platformSubscriptions/camden").get()).data();
    assert.ok(camden.remindersSent["2027-01-19:30"]);
    assert.equal(camden.status, "trial");
    const [event] = await events();
    assert.equal(event.kind, "remind");
    assert.equal(event.emailStatus, "not_configured");

    await billing.runBillingLifecycle(db, { today: "2026-12-21" });
    assert.equal((await events()).length, 1, "no duplicate reminder");
  });

  it("marks past due after the trial, keeps access, and mirrors the status", async () => {
    await billing.runBillingLifecycle(db, { today: "2027-01-20" });
    const camden = (await db.doc("platformSubscriptions/camden").get()).data();
    assert.equal(camden.status, "past_due");
    assert.equal(camden.pastDueSince, "2027-01-20");
    assert.equal((await db.doc("platformDepartments/camden").get()).data().subscription.saasStatus, "past_due");
    assert.equal((await db.doc("departments/camden/settings/main").get()).data().subscription.saasStatus, "past_due");
    // Next day: already past due, nothing more happens.
    await billing.runBillingLifecycle(db, { today: "2027-01-21" });
    assert.equal((await events()).filter((e) => e.kind === "mark_past_due").length, 1);
  });

  it("renews complimentary subscriptions and leaves suspended ones alone", async () => {
    await billing.runBillingLifecycle(db, { today: "2027-10-21" });
    const hl = (await db.doc("platformSubscriptions/horn-lake-fd").get()).data();
    assert.equal(hl.renewalDate, "2028-10-20");
    assert.equal(hl.status, "active");
    assert.equal((await db.doc("platformSubscriptions/gone").get()).data().status, "suspended");
  });
});
