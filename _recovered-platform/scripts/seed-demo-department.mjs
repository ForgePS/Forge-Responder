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
  { id: "RV-001", name: "Alex Morgan", rank: "Fire Chief", status: "Active", email: "chief@riverside-demo.demo" },
  { id: "RV-002", name: "Jordan Ellis", rank: "Deputy Chief", status: "Active", email: "deputy@riverside-demo.demo" }
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
  if (existing.exists() && existing.data()?.items?.length) {
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
console.log("Demo URL: https://rms-dashboard-7562e.web.app/demo");
console.log("Demo login: demo@forge.demo / ForgeDemo2026!");
