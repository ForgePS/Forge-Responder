const admin = require("firebase-admin");

const departmentId = process.argv[2] || "horn-lake-fd";
const listKey = "hlfd-rms-active911-alerts";

function buildTestAlert() {
  const sentAt = new Date().toISOString();
  return {
    id: `forge-test-${Date.now()}`,
    cadCode: "603",
    description: "TEST — Structure Fire",
    address: "6530 Hise Parkway",
    city: "Horn Lake",
    state: "MS",
    units: "UNIT1 613C 614C",
    sentAt,
    syncedAt: sentAt,
    latitude: 34.9551,
    longitude: -90.0423,
    crossStreet: "Church Rd",
    source: "forge-test",
    responses: [],
  };
}

admin.initializeApp();
const db = admin.firestore();

async function main() {
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
    updatedBy: "pushTestAlert.js",
  }, { merge: true });

  console.log(`Test alert pushed for ${departmentId}.`);
  console.log(`  ${testAlert.description} @ ${testAlert.address}, ${testAlert.city}, ${testAlert.state}`);
  console.log(`  Open: https://rms.forgepublicsafety.com/${departmentId}/alerts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
