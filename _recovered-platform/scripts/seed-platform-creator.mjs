/**
 * Grant FORGE platform Creator access (Firebase Admin SDK — bypasses Firestore rules).
 *
 * Setup (one time):
 *   1. Firebase Console → Project settings → Service accounts → Generate new private key
 *   2. Save the JSON file somewhere safe on your PC
 *   3. In PowerShell:
 *        $env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\service-account.json"
 *
 * Usage:
 *   npm run seed:creator -- --uid=YOUR_UID --email=admin@forgepublicsafety.com --name="Forge Admin"
 *   npm run seed:creator -- --email=admin@forgepublicsafety.com --name="Forge Admin"
 */
import fs from "node:fs/promises";
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const DEPARTMENT_ID = "horn-lake-fd";
const PLATFORM_SCOPE_ID = "__forge-platform__";

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

async function initAdmin() {
  const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccountPath) {
    console.error("Missing GOOGLE_APPLICATION_CREDENTIALS.");
    console.error("");
    console.error("1. Open https://console.firebase.google.com/project/rms-dashboard-7562e/settings/serviceaccounts/adminsdk");
    console.error("2. Click \"Generate new private key\" and save the JSON file");
    console.error("3. In PowerShell, run:");
    console.error('   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\service-account.json"');
    console.error("4. Re-run: npm run seed:creator -- --uid=YOUR_UID --email=admin@forgepublicsafety.com --name=\"Forge Admin\"");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, "utf8"));
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceAccount) });
  }
  return {
    db: getFirestore(),
    auth: getAuth()
  };
}

let uid = readArg("uid");
const email = readArg("email");
const displayName = readArg("name") || "Forge Admin";

const { db, auth } = await initAdmin();

if (!uid && email) {
  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    console.log(`Resolved ${email} → uid ${uid}`);
  } catch (error) {
    console.error(`Could not find Firebase Auth user for ${email}. Create the user in Authentication first.`);
    console.error(error?.message || error);
    process.exit(1);
  }
}

if (!uid) {
  console.error("Missing --uid=YOUR_FIREBASE_AUTH_UID (or pass --email=admin@forgepublicsafety.com)");
  process.exit(1);
}

const now = new Date().toISOString();
const creatorPayload = {
  uid,
  email: email || "",
  displayName,
  status: "active",
  role: "creator",
  updatedAt: now,
  seededBy: "seed-platform-creator.mjs"
};

const creatorRef = db.collection("platformCreators").doc(uid);
const existingCreator = await creatorRef.get();
if (!existingCreator.exists) {
  creatorPayload.createdAt = now;
}
await creatorRef.set(creatorPayload, { merge: true });

await db.collection("platformDepartments").doc(DEPARTMENT_ID).set({
  id: DEPARTMENT_ID,
  name: "Horn Lake Fire Department",
  shortName: "Horn Lake FD",
  status: "active",
  updatedAt: now
}, { merge: true });

const membershipPayload = {
  uid,
  email: email || "",
  displayName,
  role: "creator",
  roleIds: ["creator"],
  status: "active",
  departmentId: DEPARTMENT_ID,
  isPlatformCreator: true,
  updatedAt: now
};

const membershipRef = db.collection("departments").doc(DEPARTMENT_ID).collection("users").doc(uid);
const existingMembership = await membershipRef.get();
if (!existingMembership.exists) {
  membershipPayload.createdAt = now;
}
await membershipRef.set(membershipPayload, { merge: true });

await db.collection("departments").doc(PLATFORM_SCOPE_ID).collection("profile").doc("main").set({
  id: PLATFORM_SCOPE_ID,
  name: "FORGE PUBLIC SAFETY",
  shortName: "FORGE RMS",
  displayTitle: "FORGE RMS",
  status: "active",
  updatedAt: now
}, { merge: true });

console.log("");
console.log("Creator access granted.");
console.log(`  Email:        ${email || "(not provided)"}`);
console.log(`  UID:          ${uid}`);
console.log(`  Creator doc:  platformCreators/${uid}`);
console.log(`  Membership:   departments/${DEPARTMENT_ID}/users/${uid}`);
console.log("");
console.log("Sign in at: https://rms.forgepublicsafety.com/creator-console");
