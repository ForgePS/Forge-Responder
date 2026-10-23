/**
 * Seed platformConfig/main in Firestore (requires Firebase Admin SDK).
 *
 * Usage:
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\service-account.json
 *   npm run seed:platform-config
 */
import fs from "node:fs/promises";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!serviceAccountPath) {
  console.error("Set GOOGLE_APPLICATION_CREDENTIALS to a Firebase service account JSON before running.");
  process.exit(1);
}

const serviceAccount = JSON.parse(await fs.readFile(serviceAccountPath, "utf8"));
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const availableModules = [
  "dashboard",
  "personnel",
  "certifications",
  "training",
  "scheduling",
  "shiftTrades",
  "apparatus",
  "assets",
  "maintenance",
  "hoseTesting",
  "occupancies",
  "inspections",
  "preplans",
  "hydrants",
  "documents",
  "analytics",
  "administration"
];

const now = new Date().toISOString();
const payload = {
  name: "FORGE PUBLIC SAFETY",
  platformTitle: "FORGE RMS",
  platformLabel: "FORGE RMS Platform",
  tagline: "ONE PLATFORM. EVERY MISSION.",
  description: "Multi-department public safety RMS platform. Each agency runs as its own branch with shared core modules.",
  logoUrl: "/forge-logo.png",
  poweredByLabel: "POWERED BY",
  version: "2.5.0",
  status: "active",
  availableModules,
  updatedAt: now,
  seededBy: "seed-platform-config.mjs"
};

const ref = db.collection("platformConfig").doc("main");
const existing = await ref.get();
if (!existing.exists) {
  payload.createdAt = now;
}

await ref.set(payload, { merge: true });
console.log("Seeded platformConfig/main");
console.log(JSON.stringify(payload, null, 2));
