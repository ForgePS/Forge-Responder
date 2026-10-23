/**
 * Fill the STAGING project (forge-rms-staging) with fake data to test against:
 * plans, platform settings, two test departments with sample lists, test
 * logins, and entitlements. Refuses to run against any other project.
 *
 * Test logins are created with random passwords printed once in this script's
 * output (keep the file private; it is gitignored by name below). Emails use
 * the reserved .test domain, so nothing is ever sent to a real person.
 * --creator-email is your own address: it becomes a platform creator on staging
 * (a separate account from production; set a password with "Forgot password").
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/seed-staging.mjs '--creator-email=you@example.com' *> staging-seed.txt
 *
 * Safe to run again: records are updated in place; existing logins keep their passwords.
 */
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { DEFAULT_SUBSCRIPTION_PLANS } from "../src/data/platformSubscriptions.js";
import { DEMO_LIST_SEEDS } from "../src/data/demoSeeds.js";
import { defaultRoles } from "../src/data/defaultRoles.js";
import { sanitizeItemsForFirestore } from "../src/lib/firestoreSanitize.js";

const require = createRequire(import.meta.url);
const plan = require("../functions/lib/listItemsPlan.js");
const entitlements = require("../functions/lib/entitlements.js");

const STAGING_PROJECT = "forge-rms-staging";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "";
if (PROJECT_ID !== STAGING_PROJECT) {
  console.error(`Refusing to run: GOOGLE_CLOUD_PROJECT is "${PROJECT_ID}". This script only seeds ${STAGING_PROJECT}.`);
  process.exit(1);
}
const CREATOR_EMAIL = (process.argv.find((a) => a.startsWith("--creator-email=")) || "").split("=")[1]?.trim().toLowerCase();
if (!CREATOR_EMAIL) {
  console.error("Name your own email as the staging creator: '--creator-email=you@example.com'");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();
const now = new Date().toISOString();
const isoDay = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const DEPARTMENTS = [
  {
    id: "staging-east", name: "Eastside Test Fire Department", shortName: "Eastside Test FD",
    planId: "standard", status: "active", billingCycle: "annual",
    stations: ["Station 1", "Station 2"],
    users: [
      { email: "chief@east.test", name: "Chief East (test)", role: "department_admin", roleIds: ["fireChief"] },
      { email: "ff@east.test", name: "Firefighter East (test)", role: "firefighter", roleIds: ["firefighter"] },
    ],
  },
  {
    id: "staging-west", name: "Westfield Test Fire Department", shortName: "Westfield Test FD",
    planId: "pilot", status: "trial", billingCycle: "monthly",
    stations: ["Station 1"],
    users: [
      { email: "chief@west.test", name: "Chief West (test)", role: "department_admin", roleIds: ["fireChief"] },
    ],
  },
];

const createdLogins = [];

/** Creates the login if missing (random password, reported once); returns its uid. */
async function ensureUser(email, displayName) {
  try {
    return (await auth.getUserByEmail(email)).uid;
  } catch {
    const password = `Stg-${randomBytes(9).toString("base64url")}`;
    const user = await auth.createUser({ email, password, displayName, emailVerified: true });
    createdLogins.push({ email, password });
    return user.uid;
  }
}

/** Writes a list in the per-item format the app uses. */
async function writeList(departmentId, listKey, items) {
  const ref = db.doc(`departments/${departmentId}/lists/${listKey}`);
  // Same cleaning the app does before saving (e.g. table rows nested in a record).
  const { items: withIds } = plan.ensureItemIds(sanitizeItemsForFirestore(JSON.parse(JSON.stringify(items || []))));
  const writes = plan.planListWrites(new Map(), withIds);
  const batch = db.batch();
  for (const u of writes.upserts) batch.set(ref.collection(plan.ITEMS_SUBCOLLECTION).doc(u.docId), u.data);
  batch.set(ref, { storage: plan.ITEMS_STORAGE, items: FieldValue.delete(), itemCount: withIds.length, departmentId, updatedAt: now, updatedBy: "seed-staging" }, { merge: true });
  await batch.commit();
}

async function main() {
  console.log(`\nSeeding ${PROJECT_ID}\n`);

  await db.doc("platformConfig/main").set({
    name: "FORGE Responder (Staging)",
    platformTitle: "FORGE Responder",
    tagline: "Staging: test data only",
    rmsAppUrl: "https://forge-rms-staging.web.app",
    updatedAt: now,
  }, { merge: true });

  for (const p of DEFAULT_SUBSCRIPTION_PLANS) {
    const { id, ...data } = p;
    await db.doc(`platformSubscriptionPlans/${id}`).set({ ...data, updatedAt: now, updatedBy: "seed-staging" }, { merge: true });
  }
  console.log(`plans: ${DEFAULT_SUBSCRIPTION_PLANS.map((p) => p.id).join(", ")}`);

  const creatorUid = await ensureUser(CREATOR_EMAIL, "Staging creator");
  await db.doc(`platformCreators/${creatorUid}`).set({ status: "active", email: CREATOR_EMAIL, updatedAt: now }, { merge: true });
  console.log(`creator: ${CREATOR_EMAIL} (two-factor is required for creators; switch codes on with scripts/two-factor.mjs --enable-totp)`);

  for (const d of DEPARTMENTS) {
    await db.doc(`platformDepartments/${d.id}`).set({
      id: d.id, name: d.name, shortName: d.shortName, status: "active",
      subscription: { planId: d.planId, saasStatus: d.status, startDate: isoDay(0), expirationDate: isoDay(365) },
      updatedAt: now,
    }, { merge: true });
    await db.doc(`platformSubscriptions/${d.id}`).set({
      departmentId: d.id, departmentName: d.name, planId: d.planId, status: d.status, billingCycle: d.billingCycle,
      currency: "USD", amountCents: 0, trialEndsAt: d.status === "trial" ? isoDay(30) : "",
      currentPeriodStart: isoDay(0), currentPeriodEnd: isoDay(365), renewalDate: isoDay(365),
      billingContactEmail: d.users[0].email, paymentMethod: "manual", autoRenew: true,
      createdAt: now, updatedAt: now, updatedBy: "seed-staging",
    }, { merge: true });
    await db.doc(`departments/${d.id}/profile/main`).set({
      id: d.id, name: d.name, shortName: d.shortName, displayTitle: d.name,
      stations: d.stations, stationDetails: d.stations.map((name, i) => ({ id: `st-${i + 1}`, name })),
      timezone: "America/Chicago", updatedAt: now,
    }, { merge: true });
    for (const role of defaultRoles) {
      await db.doc(`departments/${d.id}/roles/${role.id}`).set(JSON.parse(JSON.stringify(role)), { merge: true });
    }
    for (const u of d.users) {
      const uid = await ensureUser(u.email, u.name);
      await db.doc(`departments/${d.id}/users/${uid}`).set({
        uid, email: u.email, displayName: u.name, role: u.role, roleIds: u.roleIds,
        status: "active", departmentId: d.id, personnelId: "", createdAt: now, updatedAt: now,
      }, { merge: true });
    }
    for (const [listKey, items] of Object.entries(DEMO_LIST_SEEDS)) {
      await writeList(d.id, listKey, items);
    }
    await entitlements.refreshDepartment(db, d.id);
    console.log(`department: ${d.id} (${d.planId}, ${d.status}) -> https://forge-rms-staging.web.app/${d.id}`);
  }

  console.log("\nNew test logins (shown once; existing logins keep their passwords):");
  if (!createdLogins.length) console.log("  (none new)");
  for (const l of createdLogins) console.log(`  ${l.email.padEnd(28)} ${l.password}`);
  console.log("\nDone. Open https://forge-rms-staging.web.app\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
