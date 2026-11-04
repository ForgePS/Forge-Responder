import { doc, getDoc, setDoc } from "firebase/firestore";
import { demoDepartmentProfile, demoDepartmentSettings, mapDemoDepartmentProfile } from "../data/demoDepartment.js";
import { DEMO_FORCE_RESEED_KEYS, DEMO_LIST_KEYS, DEMO_LIST_SEEDS, DEMO_SEED_VERSION } from "../data/demoSeeds.js";
import { defaultRoles } from "../data/defaultRoles.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { ensureDepartmentRegistry } from "./platformService.js";
import { ensureDefaultRoles } from "./roleService.js";
import { seedInternalEmailsForScope } from "./internalEmailService.js";
import { refreshDemoPreventionRecords } from "./demoPrevention.js";
import { refreshDemoPreventionExtras } from "./demoPreventionExtras.js";
import { refreshDemoFleetRecords } from "./demoFleet.js";
import { refreshDemoHydrantRecords } from "./demoHydrants.js";
import { sanitizeItemsForFirestore } from "./firestoreSanitize.js";
import { DEMO_DEPARTMENT_ID, departmentListSegments } from "./tenantPaths.js";
import { readTenantList, replaceTenantList } from "./tenantListStore.js";

export async function ensureDemoDepartmentShell() {
  const db = getFirestoreDb();
  if (!db) return false;

  const now = new Date().toISOString();
  try {
    await ensureDepartmentRegistry(DEMO_DEPARTMENT_ID, demoDepartmentProfile);
  } catch (error) {
    console.warn("Demo department registry update skipped", error);
  }
  await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "profile", "main"), {
    ...mapDemoDepartmentProfile(),
    updatedAt: now
  }, { merge: true });
  // Never write `subscription`: only platform creators may change it (rules), and
  // the demo's default dates change daily, so including it blocked every demo
  // login after the first day.
  const { subscription: _subscription, ...demoSettings } = demoDepartmentSettings;
  await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "settings", "main"), {
    ...demoSettings,
    updatedAt: now
  }, { merge: true });
  await ensureDefaultRoles(DEMO_DEPARTMENT_ID);
  return true;
}

export async function bootstrapDemoLists(userId = "demo-bootstrap") {
  const db = getFirestoreDb();
  if (!db) return 0;

  await ensureDemoDepartmentShell();

  // Lists are independent: seed them side by side, not one after another.
  const results = await Promise.all(DEMO_LIST_KEYS.map(async (listKey) => {
    try {
      const forceReseed = DEMO_FORCE_RESEED_KEYS.includes(listKey);
      if (!forceReseed) {
        const existing = await readTenantList(db, DEMO_DEPARTMENT_ID, listKey);
        if (existing.items.length) return 0;
      }
      await replaceTenantList(db, DEMO_DEPARTMENT_ID, listKey, DEMO_LIST_SEEDS[listKey] || [], {
        userId,
        headerFields: { seededBy: "demo-bootstrap" },
      });
      return 1;
    } catch (error) {
      console.error(`Failed to seed demo list ${listKey}`, error);
      return 0;
    }
  }));
  const seeded = results.reduce((sum, count) => sum + count, 0);

  if (!seeded) return 0;

  const now = new Date().toISOString();
  await Promise.all(defaultRoles.map((role) => setDoc(
    doc(db, "departments", DEMO_DEPARTMENT_ID, "roles", role.id),
    { ...role, updatedAt: now },
    { merge: true },
  )));

  return seeded;
}

// The sandbox is reset at most this often; sign-ins in between skip the reseed.
const DEMO_RESEED_INTERVAL_MS = 6 * 60 * 60 * 1000;

function demoSeedIsFresh(profile) {
  const seed = profile?.demoSeed;
  if (!seed || seed.version !== DEMO_SEED_VERSION) return false;
  const seededAt = Date.parse(seed.at || "");
  return Number.isFinite(seededAt) && Date.now() - seededAt < DEMO_RESEED_INTERVAL_MS;
}

/**
 * Put the demo sandbox back to its sample data: lists, messages, prevention,
 * fleet and hydrant records. Used on sign-in when the data is stale, and by the
 * banner's "Reset demo data" button before a meeting.
 */
export async function resetDemoData(user) {
  const db = getFirestoreDb();
  if (!db || !user?.uid) return false;
  await Promise.all([
    bootstrapDemoLists(user.uid),
    seedInternalEmailsForScope(DEMO_DEPARTMENT_ID, user),
    // Preplans and systems link to the buildings, so they go after the buildings are refreshed.
    refreshDemoPreventionRecords()
      .then(() => refreshDemoPreventionExtras())
      .catch((error) => console.warn("Demo prevention refresh skipped", error)),
    refreshDemoFleetRecords().catch((error) => console.warn("Demo fleet refresh skipped", error)),
    refreshDemoHydrantRecords().catch((error) => console.warn("Demo hydrant refresh skipped", error)),
  ]);
  await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "profile", "main"), {
    demoSeed: { version: DEMO_SEED_VERSION, at: new Date().toISOString() },
  }, { merge: true }).catch((error) => console.warn("Demo seed stamp skipped", error));
  return true;
}

export async function ensureDemoAccess(user) {
  const db = getFirestoreDb();
  if (!db || !user?.uid) return null;

  const userRef = doc(db, "departments", DEMO_DEPARTMENT_ID, "users", user.uid);
  const profileRef = doc(db, "departments", DEMO_DEPARTMENT_ID, "profile", "main");
  const [existing, profileSnap] = await Promise.all([
    getDoc(userRef),
    getDoc(profileRef).catch(() => null),
  ]);

  // Reseeding takes several seconds, so only do it when the sample data is
  // missing, out of date, or hasn't been reset for a while.
  if (!demoSeedIsFresh(profileSnap?.exists() ? profileSnap.data() : null)) {
    await resetDemoData(user);
  }

  const now = new Date().toISOString();
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: "Chief A. Sample",
    role: "fireChief",
    roleIds: ["fireChief"],
    personnelId: "DEMO-001",
    assignedShift: "Administration",
    assignedStation: "Station 1",
    status: "active",
    departmentId: DEMO_DEPARTMENT_ID,
    isDemoUser: true,
    updatedAt: now
  };

  if (!existing.exists()) {
    payload.createdAt = now;
  }

  await setDoc(userRef, payload, { merge: true });
  return { id: user.uid, ...payload };
}
