/**
 * Seed the FORGE demo/training department (forge-demo).
 *
 * Prerequisites:
 *   1. Firebase Auth user: demo@forge.demo / ForgeDemo2026!
 *   2. Deployed firestore rules allowing forge-demo sandbox access
 *
 * Usage:
 *   npm run seed:demo
 */
import { initializeApp } from "firebase/app";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { loadProjectEnv, requireFirebaseConfig } from "./loadEnv.mjs";

loadProjectEnv();

const DEMO_DEPARTMENT_ID = "forge-demo";
const firebaseConfig = requireFirebaseConfig();
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const demoDepartmentProfile = {
  id: DEMO_DEPARTMENT_ID,
  name: "Riverside Fire & EMS",
  shortName: "Riverside Demo",
  displayTitle: "Riverside Fire & EMS",
  status: "active",
  isDemo: true
};

const demoDepartmentSettings = {
  departmentId: DEMO_DEPARTMENT_ID,
  enabledModules: [
    "dashboard", "personnel", "certifications", "training", "scheduling", "shiftTrades",
    "apparatus", "assets", "maintenance", "hoseTesting", "occupancies", "inspections",
    "preplans", "hydrants", "documents", "analytics", "administration"
  ],
  isDemo: true
};

const demoPersonnel = [
  { id: "DEMO-001", name: "Chief A. Sample", rank: "Fire Chief", status: "Active", email: "chief@demo.forge.demo" },
  { id: "DEMO-002", name: "Deputy B. Example", rank: "Deputy Chief", status: "Active", email: "deputy@demo.forge.demo" },
  { id: "DEMO-003", name: "Battalion C. Demo", rank: "Battalion Chief", status: "Active", email: "battalion@demo.forge.demo" },
  { id: "DEMO-004", name: "Captain D. Trainee", rank: "Captain", status: "Active", email: "captain@demo.forge.demo" },
  { id: "DEMO-005", name: "Firefighter E. Member", rank: "Firefighter", status: "Active", email: "ff-emt@demo.forge.demo" },
  { id: "DEMO-006", name: "Firefighter F. Roster", rank: "Firefighter", status: "Leave", email: "ff-medic@demo.forge.demo" }
];

const demoApparatus = [
  { id: "APP-D01", unit: "Engine 1", type: "Pumper", station: "Station 1", status: "In Service" },
  { id: "APP-D02", unit: "Engine 2", type: "Pumper", station: "Station 2", status: "Out of Service" }
];

const listSeeds = {
  "hlfd-rms-personnel": demoPersonnel,
  "hlfd-rms-apparatus": demoApparatus
};

const now = new Date().toISOString();

await setDoc(doc(db, "platformDepartments", DEMO_DEPARTMENT_ID), {
  id: DEMO_DEPARTMENT_ID,
  name: demoDepartmentProfile.name,
  shortName: demoDepartmentProfile.shortName,
  status: "active",
  isDemo: true,
  updatedAt: now
}, { merge: true });

await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "profile", "main"), {
  ...demoDepartmentProfile,
  updatedAt: now
}, { merge: true });

await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "settings", "main"), {
  ...demoDepartmentSettings,
  updatedAt: now
}, { merge: true });

for (const [listKey, items] of Object.entries(listSeeds)) {
  const ref = doc(db, "departments", DEMO_DEPARTMENT_ID, "lists", listKey);
  const existing = await getDoc(ref);
  const forcePersonnelReseed = listKey === "hlfd-rms-personnel";
  if (!forcePersonnelReseed && existing.exists() && existing.data()?.items?.length) {
    console.log(`skip ${listKey} (already seeded)`);
    continue;
  }
  await setDoc(ref, {
    items,
    departmentId: DEMO_DEPARTMENT_ID,
    updatedAt: now,
    updatedBy: "seed-demo-department.mjs"
  }, { merge: true });
  console.log(`seeded departments/${DEMO_DEPARTMENT_ID}/lists/${listKey}`);
}

console.log("Demo department shell seeded.");
console.log("Demo URL: https://rms.forgepublicsafety.com/demo");
console.log("Demo login: demo@forge.demo / ForgeDemo2026!");
