/**
 * Give every department a subscription record (manual / check billing).
 *
 * DRY RUN by default. --apply writes. Never overwrites an existing
 * subscription; edit those in the Creator Console > Subscriptions tab.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/seed-subscriptions.mjs *> subscriptions.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/seed-subscriptions.mjs --apply *> subscriptions.txt
 *
 * Decided 2026-10-21: Horn Lake complimentary (Enterprise), Camden and
 * St. Charles 90-day Standard trials, demo complimentary (Pilot). Any other
 * active department gets a 90-day Standard trial.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");

const PLANS = [
  { id: "pilot", name: "Pilot", description: "Evaluation department with core RMS modules and limited seats.", monthlyPriceCents: 0, annualPriceCents: 0, maxPersonnel: 50, maxPortalUsers: 25, maxStations: 3, isActive: true, sortOrder: 10, highlight: "Pilot programs" },
  { id: "standard", name: "Standard", description: "Full RMS operations for a single fire/EMS department branch.", monthlyPriceCents: 49900, annualPriceCents: 499000, maxPersonnel: 250, maxPortalUsers: 150, maxStations: 12, isActive: true, sortOrder: 20, highlight: "Most customers" },
  { id: "enterprise", name: "Enterprise", description: "Multi-station deployments, higher limits, and priority onboarding support.", monthlyPriceCents: 149900, annualPriceCents: 1499000, maxPersonnel: 0, maxPortalUsers: 0, maxStations: 0, isActive: true, sortOrder: 30, highlight: "Unlimited scale" },
];

const COMPLIMENTARY = { status: "active", billingCycle: "complimentary", days: 365, amountCents: 0 };
const TRIAL_90 = { planId: "standard", status: "trial", billingCycle: "annual", days: 90, amountCents: 0, trial: true };
const DECISIONS = {
  "horn-lake-fd": { ...COMPLIMENTARY, planId: "enterprise", note: "Founding customer — complimentary" },
  camden: { ...TRIAL_90, note: "90-day trial" },
  "01002": { ...TRIAL_90, note: "90-day trial" },
  "forge-demo": { ...COMPLIMENTARY, planId: "pilot", note: "Demo department" },
};

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const today = new Date();
const iso = (date) => date.toISOString().slice(0, 10);
const addDays = (days) => iso(new Date(today.getTime() + days * 86400000));

async function main() {
  console.log(`\nProject ${PROJECT_ID}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  const writes = [];

  console.log("== Plans ==");
  for (const plan of PLANS) {
    const snap = await db.doc(`platformSubscriptionPlans/${plan.id}`).get();
    if (snap.exists) {
      console.log(`  ok ${plan.id} exists (maxPortalUsers=${snap.data().maxPortalUsers ?? "-"})`);
    } else {
      console.log(`  +  ${plan.id} will be created`);
      writes.push(() => db.doc(`platformSubscriptionPlans/${plan.id}`).set({ ...plan, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
    }
  }

  console.log("\n== Department subscriptions ==");
  const registry = await db.collection("platformDepartments").get();
  for (const dept of registry.docs) {
    const data = dept.data() || {};
    if (["disabled", "archived"].includes(data.status)) continue;
    const existing = await db.doc(`platformSubscriptions/${dept.id}`).get();
    if (existing.exists) {
      const e = existing.data();
      console.log(`  ok ${dept.id}: already has ${e.planId}/${e.status} (${e.billingCycle}) until ${e.renewalDate || e.currentPeriodEnd || "?"} — left unchanged`);
      continue;
    }
    const decision = DECISIONS[dept.id] || { ...TRIAL_90, note: "default 90-day trial" };
    const start = iso(today);
    const end = addDays(decision.days);
    const now = new Date().toISOString();
    const subscription = {
      departmentId: dept.id,
      departmentName: data.name || dept.id,
      planId: decision.planId,
      status: decision.status,
      billingCycle: decision.billingCycle,
      currency: "USD",
      amountCents: decision.amountCents,
      trialEndsAt: decision.trial ? end : "",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      renewalDate: end,
      billingContactEmail: data.contactEmail || "",
      paymentMethod: "manual",
      autoRenew: !decision.trial,
      notes: decision.note,
      createdAt: now,
      updatedAt: now,
      updatedBy: "seed-subscriptions",
    };
    const legacy = { startDate: start, expirationDate: end, saasStatus: decision.status, planId: decision.planId };
    console.log(`  +  ${dept.id} ("${subscription.departmentName}"): ${decision.planId}/${decision.status}, ${decision.billingCycle}, ${start} -> ${end}  [${decision.note}]`);
    writes.push(async () => {
      await db.doc(`platformSubscriptions/${dept.id}`).set(subscription);
      await db.doc(`platformDepartments/${dept.id}`).set({ subscription: legacy, updatedAt: now }, { merge: true });
      await db.doc(`departments/${dept.id}/settings/main`).set({ departmentId: dept.id, subscription: legacy, updatedAt: now }, { merge: true });
    });
  }

  console.log(`\nPlanned writes: ${writes.length}`);
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply.\n");
    return;
  }
  for (const write of writes) await write();
  console.log(`Applied ${writes.length} writes.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
