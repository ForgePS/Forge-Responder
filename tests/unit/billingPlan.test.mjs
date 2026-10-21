// Run: npm run test:unit
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { planBillingActions, planForSubscription } = require("../../functions/lib/billingPlan.js");

const trial = (extra = {}) => ({ status: "trial", billingCycle: "annual", trialEndsAt: "2027-01-19", renewalDate: "2027-01-19", ...extra });
const paid = (extra = {}) => ({ status: "active", billingCycle: "annual", renewalDate: "2027-06-01", ...extra });
const kinds = (actions) => actions.map((a) => a.kind);

describe("reminders", () => {
  it("does nothing far from the due date", () => {
    assert.deepEqual(planForSubscription("camden", trial(), "2026-11-01"), []);
  });

  it("sends the 30-day reminder inside the 30-day window", () => {
    const [a] = planForSubscription("camden", trial(), "2026-12-20");
    assert.equal(a.kind, "remind");
    assert.equal(a.window, 30);
    assert.equal(a.key, "2027-01-19:30");
    assert.equal(a.daysLeft, 30);
  });

  it("still sends the 30-day reminder if the exact day was missed", () => {
    const [a] = planForSubscription("camden", trial(), "2026-12-26");
    assert.equal(a.window, 30);
  });

  it("does not repeat a reminder already sent", () => {
    const sub = trial({ remindersSent: { "2027-01-19:30": "2026-12-20T13:00:00Z" } });
    assert.deepEqual(planForSubscription("camden", sub, "2026-12-27"), []);
  });

  it("sends the 7-day reminder once inside 7 days", () => {
    const sub = trial({ remindersSent: { "2027-01-19:30": "x" } });
    const [a] = planForSubscription("camden", sub, "2027-01-12");
    assert.equal(a.window, 7);
    assert.deepEqual(planForSubscription("camden", { ...sub, remindersSent: { ...sub.remindersSent, "2027-01-19:7": "y" } }, "2027-01-15"), []);
  });

  it("reminders for a new due date start fresh after renewal", () => {
    const sub = paid({ renewalDate: "2028-06-01", remindersSent: { "2027-06-01:30": "x", "2027-06-01:7": "y" } });
    const [a] = planForSubscription("x", sub, "2028-05-05");
    assert.equal(a.key, "2028-06-01:30");
  });
});

describe("past due", () => {
  it("marks a trial past due the day after it ends, with one notice", () => {
    const [a] = planForSubscription("camden", trial(), "2027-01-20");
    assert.equal(a.kind, "mark_past_due");
    assert.deepEqual(a.update, { status: "past_due", pastDueSince: "2027-01-20" });
    assert.equal(a.notify, true);
  });

  it("does not mark past due on the due date itself", () => {
    const actions = planForSubscription("camden", trial(), "2027-01-19");
    assert.ok(!kinds(actions).includes("mark_past_due"));
  });

  it("marks a paid annual subscription past due after its renewal date", () => {
    assert.deepEqual(kinds(planForSubscription("x", paid(), "2027-06-02")), ["mark_past_due"]);
  });

  it("never touches past_due, suspended or cancelled subscriptions", () => {
    for (const status of ["past_due", "suspended", "cancelled"]) {
      assert.deepEqual(planForSubscription("x", paid({ status }), "2030-01-01"), [], status);
    }
  });
});

describe("complimentary", () => {
  it("renews for a year once the period ends, without reminders", () => {
    const sub = { status: "active", billingCycle: "complimentary", renewalDate: "2027-10-21" };
    assert.deepEqual(planForSubscription("horn-lake-fd", sub, "2027-09-25"), []);
    const [a] = planForSubscription("horn-lake-fd", sub, "2027-10-21");
    assert.equal(a.kind, "renew_complimentary");
    assert.deepEqual(a.update, { currentPeriodStart: "2027-10-21", currentPeriodEnd: "2028-10-20", renewalDate: "2028-10-20" });
  });
});

describe("planBillingActions", () => {
  it("plans across departments and validates the date", () => {
    const all = planBillingActions({ camden: trial(), "01002": trial(), hl: { status: "active", billingCycle: "complimentary", renewalDate: "2027-10-21" } }, "2027-01-20");
    assert.deepEqual(kinds(all), ["mark_past_due", "mark_past_due"]);
    assert.throws(() => planBillingActions({}, "Jan 20"));
  });
});
