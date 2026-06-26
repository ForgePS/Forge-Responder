/**
 * One-time migration: prototype rmsData/* → departments/horn-lake-fd/lists/*
 *
 * Usage (from project root, with .env or VITE_FIREBASE_* vars set):
 *   node scripts/migrate-horn-lake-to-tenant.mjs
 *   node scripts/migrate-horn-lake-to-tenant.mjs --dry-run
 */
import { initializeApp } from "firebase/app";
import { collection, doc, getDoc, getDocs, getFirestore, setDoc } from "firebase/firestore";

const DEPARTMENT_ID = "horn-lake-fd";
const DRY_RUN = process.argv.includes("--dry-run");

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID
};

if (!Object.values(firebaseConfig).every(Boolean)) {
  console.error("Missing VITE_FIREBASE_* environment variables.");
  process.exit(1);
}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateRmsDataLists() {
  const snap = await getDocs(collection(db, "rmsData"));
  let migrated = 0;

  for (const legacyDoc of snap.docs) {
    const listKey = legacyDoc.id;
    const data = legacyDoc.data();
    const targetRef = doc(db, "departments", DEPARTMENT_ID, "lists", listKey);
    const existing = await getDoc(targetRef);

    if (existing.exists()) {
      console.log(`skip ${listKey} (tenant list already exists)`);
      continue;
    }

    const payload = {
      ...data,
      departmentId: DEPARTMENT_ID,
      migratedFrom: `rmsData/${listKey}`,
      migratedAt: new Date().toISOString()
    };

    if (DRY_RUN) {
      console.log(`[dry-run] would migrate rmsData/${listKey} → departments/${DEPARTMENT_ID}/lists/${listKey}`);
    } else {
      await setDoc(targetRef, payload, { merge: true });
      console.log(`migrated rmsData/${listKey}`);
    }
    migrated += 1;
  }

  return migrated;
}

async function seedDepartmentProfile() {
  const profileRef = doc(db, "departments", DEPARTMENT_ID, "profile", "main");
  const settingsRef = doc(db, "departments", DEPARTMENT_ID, "settings", "main");

  if (DRY_RUN) {
    console.log(`[dry-run] would ensure departments/${DEPARTMENT_ID}/profile/main and settings/main`);
    return;
  }

  await setDoc(profileRef, {
    id: DEPARTMENT_ID,
    name: "Horn Lake Fire Department",
    shortName: "Horn Lake FD",
    status: "active",
    seededAt: new Date().toISOString()
  }, { merge: true });

  await setDoc(settingsRef, {
    departmentId: DEPARTMENT_ID,
    enabledModules: ["dashboard", "personnel", "certifications", "training", "hydrants"],
    seededAt: new Date().toISOString()
  }, { merge: true });

  console.log(`seeded department profile/settings for ${DEPARTMENT_ID}`);
}

async function main() {
  console.log(`Starting migration for ${DEPARTMENT_ID}${DRY_RUN ? " (dry run)" : ""}`);
  await seedDepartmentProfile();
  const count = await migrateRmsDataLists();
  console.log(`Done. ${count} list document(s) processed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
