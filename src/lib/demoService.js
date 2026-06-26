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
import { withTenantListPayload } from "./tenantRecord.js";

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
  await setDoc(doc(db, "departments", DEMO_DEPARTMENT_ID, "settings", "main"), {
    ...demoDepartmentSettings,
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
      const ref = doc(db, ...departmentListSegments(DEMO_DEPARTMENT_ID, listKey));
      const existing = await getDoc(ref);
      const forceReseed = DEMO_FORCE_RESEED_KEYS.includes(listKey);
      if (
        !forceReseed
        && existing.exists()
        && Array.isArray(existing.data()?.items)
        && existing.data().items.length
      ) {
        continue;
      }

      const items = sanitizeItemsForFirestore(DEMO_LIST_SEEDS[listKey] || []);
      await setDoc(ref, {
        ...withTenantListPayload(items, {
          departmentId: DEMO_DEPARTMENT_ID,
          userId
        }),
        seededBy: "demo-bootstrap"
      }, { merge: true });
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
