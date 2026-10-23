/**
 * Add or update a department membership record.
 *
 * Usage:
 *   node scripts/seed-department-user.mjs --uid=ABC123 --role=department_admin --email=you@hornlake.org --name="Jeremy Powell"
 */
import { initializeApp } from "firebase/app";
import { doc, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { loadProjectEnv, requireFirebaseConfig } from "./loadEnv.mjs";

loadProjectEnv();

const DEPARTMENT_ID = "horn-lake-fd";
const firebaseConfig = requireFirebaseConfig();
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function readArg(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

const uid = readArg("uid");
const role = readArg("role") || "department_admin";
const email = readArg("email");
const displayName = readArg("name") || "Department User";

if (!uid) {
  console.error("Missing --uid=YOUR_FIREBASE_AUTH_UID");
  process.exit(1);
}

const now = new Date().toISOString();
const payload = {
  uid,
  email,
  displayName,
  role,
  status: "active",
  departmentId: DEPARTMENT_ID,
  createdAt: now,
  updatedAt: now,
  seededBy: "seed-department-user.mjs"
};

await setDoc(doc(db, "departments", DEPARTMENT_ID, "users", uid), payload, { merge: true });
console.log(`Seeded departments/${DEPARTMENT_ID}/users/${uid} as ${role}`);
