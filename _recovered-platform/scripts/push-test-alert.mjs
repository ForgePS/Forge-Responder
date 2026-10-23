/**
 * Push a synthetic test alert into the department alert list for dashboard QA.
 *
 * Usage:
 *   npm run push:test-alert
 *   npm run push:test-alert -- forge-demo
 */
import admin from "firebase-admin";

const departmentId = process.argv[2] || "horn-lake-fd";
const listKey = "hlfd-rms-active911-alerts";

function buildTestAlert() {
  const sentAt = new Date().toISOString();
  return {
    id: `forge-test-${Date.now()}`,
    description: "TEST — Structure Fire",
    address: "6530 Hise Parkway",
    city: "Horn Lake",
    state: "MS",
    units: "Engine 1, Ladder 1, Battalion 1",
    priority: "1",
    cadCode: "FORGE-TEST",
    sentAt,
    syncedAt: sentAt,
    latitude: 34.9551,
    longitude: -90.0423,
    crossStreet: "Church Rd",
    source: "forge-test",
    responses: [],
  };
}

admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "rms-dashboard-7562e" });
const db = admin.firestore();
const ref = db.doc(`departments/${departmentId}/lists/${listKey}`);

const snap = await ref.get();
const existing = snap.exists ? (Array.isArray(snap.data()?.items) ? snap.data().items : []) : [];
const testAlert = buildTestAlert();
const items = [
  testAlert,
  ...existing.filter((alert) => !String(alert?.id || "").startsWith("forge-test-")),
];

await ref.set({
  items,
  departmentId,
  updatedAt: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  updatedBy: "push-test-alert.mjs",
}, { merge: true });

console.log(`Test alert pushed for ${departmentId}.`);
console.log(`  ${testAlert.description} @ ${testAlert.address}, ${testAlert.city}, ${testAlert.state}`);
console.log(`  Open: https://rms.forgepublicsafety.com/${departmentId}/alerts`);
