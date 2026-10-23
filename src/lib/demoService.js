import { doc, getDoc, setDoc } from "firebase/firestore";
import { demoDepartmentProfile, demoDepartmentSettings, mapDemoDepartmentProfile } from "../data/demoDepartment.js";
import { DEMO_FORCE_RESEED_KEYS, DEMO_LIST_KEYS, DEMO_LIST_SEEDS } from "../data/demoSeeds.js";
import { defaultRoles } from "../data/defaultRoles.js";
import { getFirestoreDb } from "./firebaseClient.js";
import { ensureDepartmentRegistry } from "./platformService.js";
import { ensureDefaultRoles } from "./roleService.js";
import { seedInternalEmailsForScope } from "./internalEmailService.js";
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
  let seeded = 0;

  for (const listKey of DEMO_LIST_KEYS) {
    try {
      const existing = await readTenantList(db, DEMO_DEPARTMENT_ID, listKey);
      const forceReseed = DEMO_FORCE_RESEED_KEYS.includes(listKey);
      if (!forceReseed && existing.items.length) {
        continue;
      }

      await replaceTenantList(db, DEMO_DEPARTMENT_ID, listKey, DEMO_LIST_SEEDS[listKey] || [], {
        userId,
        headerFields: { seededBy: "demo-bootstrap" },
      });
      seeded += 1;
    } catch (error) {
      console.error(`Failed to seed demo list ${listKey}`, error);
    }
  }

  if (!seeded) return 0;

  for (const role of defaultRoles) {
    await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "roles", role.id), {
      ...role,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  }

  return seeded;
}

export async function ensureDemoAccess(user) {
  const db = getFirestoreDb();
  if (!db || !user?.uid) return null;

  await bootstrapDemoLists(user.uid);
  await seedInternalEmailsForScope(DEMO_DEPARTMENT_ID, user);

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

  const existing = await getDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "users", user.uid));
  if (!existing.exists()) {
    payload.createdAt = now;
  }

  await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "users", user.uid), payload, { merge: true });
  return { id: user.uid, ...payload };
}
