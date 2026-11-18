/**
 * Fill the LOCAL emulators with the platform records the offline demo needs:
 * platform settings and plans, the forge-demo department (Enterprise, active,
 * every module), its gateway, the shared demo login and a local creator login.
 * The demo department's sample data seeds itself on the first demo sign-in,
 * exactly like production.
 *
 * Only runs against the emulators (project demo-forge-rms). Run by start.mjs.
 */
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { DEFAULT_SUBSCRIPTION_PLANS } from "../../src/data/platformSubscriptions.js";
import { defaultRoles } from "../../src/data/defaultRoles.js";

const require = createRequire(import.meta.url);
const entitlements = require("../../functions/lib/entitlements.js");

export const OFFLINE_PROJECT_ID = "demo-forge-rms";
const DEPARTMENT_ID = "forge-demo";
const CREATOR_EMAIL = "creator@forge.test";
// Same names as src/data/demoDepartment.js (that file imports images, so it cannot load here).
const demoDepartmentProfile = { name: "Riverside Fire & EMS", shortName: "Riverside Demo" };

function readEmulatorEnv(root) {
  const env = {};
  for (const line of readFileSync(join(root, ".env.emulator"), "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) env[match[1]] = match[2].trim();
  }
  return env;
}

export async function seedOfflineDemo({ root, dataDir }) {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Refusing to seed: the emulator hosts are not set (this only ever writes to the local emulators).");
  }
  const env = readEmulatorEnv(root);
  const demoEmail = env.VITE_DEMO_EMAIL || "demo@forge.demo";
  const demoPassword = env.VITE_DEMO_PASSWORD;
  if (!demoPassword) throw new Error("VITE_DEMO_PASSWORD is missing from .env.emulator");

  const app = initializeApp({ projectId: OFFLINE_PROJECT_ID }, "offline-demo-seed");
  const auth = getAuth(app);
  const db = getFirestore(app);
  const now = new Date().toISOString();
  const isoDay = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  async function ensureUser(email, password, displayName) {
    try {
      const user = await auth.getUserByEmail(email);
      if (password) await auth.updateUser(user.uid, { password });
      return { uid: user.uid, created: false };
    } catch {
      const user = await auth.createUser({ email, password, displayName, emailVerified: true });
      return { uid: user.uid, created: true };
    }
  }

  await db.doc("platformConfig/main").set({
    name: "FORGE Responder",
    platformTitle: "FORGE Responder",
    rmsAppUrl: "http://localhost:4173",
    updatedAt: now,
  }, { merge: true });

  for (const plan of DEFAULT_SUBSCRIPTION_PLANS) {
    const { id, ...data } = plan;
    await db.doc(`platformSubscriptionPlans/${id}`).set({ ...data, updatedAt: now, updatedBy: "offline-demo" }, { merge: true });
  }

  await db.doc(`platformDepartments/${DEPARTMENT_ID}`).set({
    id: DEPARTMENT_ID,
    name: demoDepartmentProfile.name,
    shortName: demoDepartmentProfile.shortName,
    status: "active",
    subscription: { planId: "enterprise", saasStatus: "active", startDate: isoDay(0), expirationDate: isoDay(3650) },
    updatedAt: now,
  }, { merge: true });
  await db.doc(`platformSubscriptions/${DEPARTMENT_ID}`).set({
    departmentId: DEPARTMENT_ID, departmentName: demoDepartmentProfile.name, planId: "enterprise", status: "active",
    billingCycle: "annual", currency: "USD", amountCents: 0, trialEndsAt: "",
    currentPeriodStart: isoDay(0), currentPeriodEnd: isoDay(3650), renewalDate: isoDay(3650),
    billingContactEmail: demoEmail, paymentMethod: "manual", autoRenew: true,
    createdAt: now, updatedAt: now, updatedBy: "offline-demo",
  }, { merge: true });
  await db.doc(`rmsGateways/${DEPARTMENT_ID}`).set({
    gatewayId: DEPARTMENT_ID, departmentId: DEPARTMENT_ID, label: "FORGE RMS Demo",
    departmentName: demoDepartmentProfile.name, departmentShortName: demoDepartmentProfile.shortName,
    logoUrl: "/forge-logo.png", status: "active", updatedAt: now, seededBy: "offline-demo",
  }, { merge: true });
  await entitlements.refreshDepartment(db, DEPARTMENT_ID);

  const demo = await ensureUser(demoEmail, demoPassword, "FORGE Demo");
  // Production's demo account has been a member for a long time; a fresh database
  // needs the membership and roles first (the demo's own setup writes need them).
  for (const role of defaultRoles) {
    await db.doc(`departments/${DEPARTMENT_ID}/roles/${role.id}`).set(JSON.parse(JSON.stringify(role)), { merge: true });
  }
  const memberRef = db.doc(`departments/${DEPARTMENT_ID}/users/${demo.uid}`);
  if (!(await memberRef.get()).exists) {
    await memberRef.set({
      uid: demo.uid, email: demoEmail, displayName: "Chief A. Sample", role: "fireChief", roleIds: ["fireChief"],
      personnelId: "DEMO-001", assignedShift: "Administration", assignedStation: "Station 1", status: "active",
      departmentId: DEPARTMENT_ID, isDemoUser: true, createdAt: now, updatedAt: now,
    });
  }

  // Forge AI is off by default for every department; the demo department starts
  // with it on. Only written once, so turning it off in the demo sticks.
  const forgeAiRef = db.doc(`departments/${DEPARTMENT_ID}/forgeAiSettings/main`);
  if (!(await forgeAiRef.get()).exists) {
    await forgeAiRef.set({ enabled: true, capabilities: {}, dailyLimit: 300, updatedAt: now, updatedBy: "offline-demo" });
  }

  // The local creator login (Creator Console). Its password is made once and kept with the demo data.
  mkdirSync(dataDir, { recursive: true });
  const loginFile = join(dataDir, "creator-login.txt");
  let creatorPassword = "";
  if (existsSync(loginFile)) creatorPassword = (readFileSync(loginFile, "utf8").match(/Password: (\S+)/) || [])[1] || "";
  if (!creatorPassword) creatorPassword = `Local-${randomBytes(6).toString("base64url")}`;
  const creator = await ensureUser(CREATOR_EMAIL, creatorPassword, "Local creator");
  await db.doc(`platformCreators/${creator.uid}`).set({ status: "active", email: CREATOR_EMAIL, updatedAt: now }, { merge: true });
  writeFileSync(loginFile, `Offline demo Creator Console login (this computer only)\nEmail: ${CREATOR_EMAIL}\nPassword: ${creatorPassword}\n`);

  return { loginFile };
}
