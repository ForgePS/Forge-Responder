/**
 * Seed per-department RMS gateway URLs (rms.forgepublicsafety.com/{departmentId}).
 *
 * Usage:
 *   npm run seed:gateways
 */
import { initializeApp } from "firebase/app";
import { doc, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { loadProjectEnv, requireFirebaseConfig } from "./loadEnv.mjs";

loadProjectEnv();

const firebaseConfig = requireFirebaseConfig();
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const now = new Date().toISOString();

const gateways = [
  {
    gatewayId: "horn-lake-fd",
    departmentId: "horn-lake-fd",
    label: "Horn Lake Fire Department",
    departmentName: "Horn Lake Fire Department",
    departmentShortName: "Horn Lake FD",
    logoUrl: "/horn-lake-logo.png",
    status: "active"
  },
  {
    gatewayId: "forge-demo",
    departmentId: "forge-demo",
    label: "FORGE RMS Demo",
    departmentName: "Riverside Fire & EMS",
    departmentShortName: "Riverside Demo",
    logoUrl: "/forge-logo.png",
    status: "active"
  }
];

for (const gateway of gateways) {
  await setDoc(doc(db, "rmsGateways", gateway.gatewayId), {
    ...gateway,
    updatedAt: now,
    seededBy: "seed-rms-gateways.mjs"
  }, { merge: true });
  console.log(`Gateway: https://rms.forgepublicsafety.com/${gateway.gatewayId}`);
}

console.log("Done. Deploy firestore rules if rmsGateways read access is not live yet.");
