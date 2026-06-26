import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import {
  hornLakeDepartmentProfile,
  resolveDepartmentProfileDefaults,
  resolveDepartmentSettingsDefaults,
} from "../data/tenants/index.js";
import { demoDepartmentProfile } from "../data/demoDepartment.js";
import { defaultPlatformConfig } from "../data/platformBrand.js";
import { getFirestoreDb } from "./firebaseClient.js";
import {
  buildDepartmentGatewayRecord,
  buildNewDepartmentProfile,
  notifyDepartmentsChanged,
  slugifyDepartmentId
} from "./departmentProvisioning.js";
import {
  applyPlatformToDepartmentProfile,
  applyPlatformToDepartmentSettings,
  normalizePlatformConfig,
} from "./platformInheritance.js";
import { DEFAULT_DEPARTMENT_ID, DEMO_DEPARTMENT_ID, isDemoDepartment, isPlatformScope } from "./tenantPaths.js";
import { ensureDefaultRoles } from "./roleService.js";
import { defaultSubscriptionDates, normalizeSubscription } from "./subscriptionUtils.js";
import { normalizeDepartmentStateId } from "./departmentBranchUtils.js";

function isHornLakeRegistryEntry(department = {}) {
  const keys = [department.docId, department.id, department.name, department.shortName]
    .map((value) => slugifyDepartmentId(String(value || "")));
  return keys.some((key) => key.includes("horn-lake"));
}

async function resolveDepartmentRegistryProfile(departmentId) {
  if (departmentId === DEFAULT_DEPARTMENT_ID) {
    return hornLakeDepartmentProfile;
  }
  if (isDemoDepartment(departmentId)) {
    return demoDepartmentProfile;
  }

  const db = getFirestoreDb();
  if (!db) {
    return { name: departmentId, shortName: departmentId, status: "active" };
  }

  const [registrySnap, profileSnap] = await Promise.all([
    getDoc(doc(db, "platformDepartments", departmentId)),
    getDoc(doc(db, "departments", departmentId, "profile", "main"))
  ]);

  if (registrySnap.exists()) {
    const data = registrySnap.data();
    const address = data.address || "";
    return {
      name: data.name || departmentId,
      shortName: data.shortName || data.name || departmentId,
      status: data.status || "active",
      address,
      stateId: normalizeDepartmentStateId(data.stateId, address),
    };
  }

  if (profileSnap.exists()) {
    const data = profileSnap.data();
    const address = data.address || "";
    return {
      name: data.name || departmentId,
      shortName: data.shortName || data.name || departmentId,
      status: data.status || "active",
      address,
      stateId: normalizeDepartmentStateId(data.stateId, address),
    };
  }

  return { name: departmentId, shortName: departmentId, status: "active" };
}

export async function loadPlatformCreator(uid) {
  const db = getFirestoreDb();
  if (!db || !uid) return null;
  try {
    const snap = await getDoc(doc(db, "platformCreators", uid));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (error) {
    if (error?.code === "permission-denied") {
      console.warn("Unable to read platformCreators record. Check that the document ID matches your Auth UID.", error);
      return null;
    }
    throw error;
  }
}

function defaultDepartmentRegistry() {
  return [{
    id: DEFAULT_DEPARTMENT_ID,
    name: hornLakeDepartmentProfile.name,
    shortName: hornLakeDepartmentProfile.shortName,
    status: "active"
  }];
}

export async function listPlatformDepartments() {
  const db = getFirestoreDb();
  if (!db) return defaultDepartmentRegistry();

  try {
    const snap = await getDocs(collection(db, "platformDepartments"));
    const departments = snap.docs
      .map((item) => {
        const data = item.data();
        const subscription = normalizeSubscription(data.subscription || {});
        return {
          id: item.id,
          ...data,
          subscription: subscription.expirationDate ? subscription : null,
        };
      })
      .filter((item) => item.status !== "disabled")
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)));

    if (departments.length) return departments;
    return defaultDepartmentRegistry();
  } catch (error) {
    console.error("Failed to list platform departments", error);
    return defaultDepartmentRegistry();
  }
}

/** Ensures the default Horn Lake branch appears in the creator registry. */
export async function bootstrapDefaultDepartmentRegistry() {
  return ensureDepartmentRegistry(DEFAULT_DEPARTMENT_ID, hornLakeDepartmentProfile);
}

/** Restores demo/other branches that were mislabeled with Horn Lake names. */
export async function repairMislabeledDepartmentRegistry() {
  const db = getFirestoreDb();
  if (!db) return { repaired: [] };

  const repaired = [];
  const checks = [
    [DEMO_DEPARTMENT_ID, demoDepartmentProfile],
    [DEFAULT_DEPARTMENT_ID, hornLakeDepartmentProfile]
  ];

  for (const [departmentId, expectedProfile] of checks) {
    const snap = await getDoc(doc(db, "platformDepartments", departmentId));
    if (!snap.exists()) continue;

    const data = snap.data();
    const wrongDemoLabel = departmentId === DEMO_DEPARTMENT_ID
      && slugifyDepartmentId(data.name || "").includes("horn-lake");
    const wrongDefaultLabel = departmentId === DEFAULT_DEPARTMENT_ID
      && !slugifyDepartmentId(data.name || "").includes("horn-lake");

    if (wrongDemoLabel || wrongDefaultLabel) {
      await ensureDepartmentRegistry(departmentId, expectedProfile);
      repaired.push(departmentId);
    }
  }

  if (repaired.length) {
    notifyDepartmentsChanged();
  }

  return { repaired };
}

/** Disables extra Horn Lake registry rows that share the same agency label. */
export async function pruneDuplicateHornLakeBranches() {
  const db = getFirestoreDb();
  if (!db) return { pruned: [], kept: DEFAULT_DEPARTMENT_ID };

  const snap = await getDocs(collection(db, "platformDepartments"));
  const departments = snap.docs.map((item) => ({ docId: item.id, ...item.data() }));
  const hornLakeMatches = departments.filter((item) => item.status !== "disabled" && isHornLakeRegistryEntry(item));

  if (hornLakeMatches.length <= 1) {
    return { pruned: [], kept: hornLakeMatches[0]?.docId || DEFAULT_DEPARTMENT_ID };
  }

  const keeper = hornLakeMatches.find((item) => item.docId === DEFAULT_DEPARTMENT_ID)
    || hornLakeMatches.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")))[0];
  const pruned = [];
  const now = new Date().toISOString();

  for (const branch of hornLakeMatches) {
    if (branch.docId === keeper.docId) continue;
    await setDoc(doc(db, "platformDepartments", branch.docId), {
      status: "disabled",
      disabledReason: "duplicate-horn-lake-branch",
      mergedInto: keeper.docId,
      updatedAt: now
    }, { merge: true });
    pruned.push(branch.docId);
  }

  if (pruned.length) {
    notifyDepartmentsChanged();
  }

  return { pruned, kept: keeper.docId };
}

export async function ensureDepartmentRegistry(departmentId, profile = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;

  const payload = {
    id: departmentId,
    name: profile.name || departmentId,
    shortName: profile.shortName || departmentId,
    status: profile.status || "active",
    stateId: normalizeDepartmentStateId(profile.stateId, profile.address),
    updatedAt: new Date().toISOString()
  };

  if (profile.address) {
    payload.address = profile.address;
  }

  await setDoc(doc(db, "platformDepartments", departmentId), payload, { merge: true });
  return payload;
}

export async function loadPlatformConfig() {
  const db = getFirestoreDb();
  if (!db) return normalizePlatformConfig();

  const snap = await getDoc(doc(db, "platformConfig", "main"));
  if (!snap.exists()) return normalizePlatformConfig();
  return normalizePlatformConfig(snap.data());
}

/** Creates platformConfig/main when missing. Platform creators only (Firestore rules). */
export async function ensurePlatformConfig() {
  const db = getFirestoreDb();
  if (!db) return normalizePlatformConfig();

  const ref = doc(db, "platformConfig", "main");
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return normalizePlatformConfig(snap.data());
  }

  const now = new Date().toISOString();
  const payload = normalizePlatformConfig({
    logoUrl: "/forge-logo.png",
    createdAt: now,
    updatedAt: now,
    seededBy: "ensurePlatformConfig"
  });
  await setDoc(ref, payload);
  return payload;
}

export async function loadDepartmentProfile(departmentId) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return {};

  const snap = await getDoc(doc(db, "departments", departmentId, "profile", "main"));
  return snap.exists() ? snap.data() : {};
}

export async function loadDepartmentSettings(departmentId) {
  const db = getFirestoreDb();
  const settingsDefaults = resolveDepartmentSettingsDefaults(departmentId);
  if (!db || !departmentId || isPlatformScope(departmentId)) {
    return { ...settingsDefaults };
  }

  const snap = await getDoc(doc(db, "departments", departmentId, "settings", "main"));
  if (!snap.exists()) return { ...settingsDefaults, departmentId };
  return { ...settingsDefaults, ...snap.data(), departmentId };
}

export async function saveDepartmentSubscription(departmentId, subscription = {}) {
  const db = getFirestoreDb();
  if (!db || !departmentId || isPlatformScope(departmentId)) return null;

  const normalized = normalizeSubscription(subscription);
  if (!normalized.expirationDate) {
    throw new Error("Subscription expiration date is required.");
  }
  if (!normalized.startDate) {
    normalized.startDate = new Date().toISOString().slice(0, 10);
  }
  const now = new Date().toISOString();
  const payload = {
    departmentId,
    subscription: normalized,
    updatedAt: now,
  };

  await Promise.all([
    setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true }),
    setDoc(doc(db, "platformDepartments", departmentId), {
      subscription: normalized,
      updatedAt: now,
    }, { merge: true }),
  ]);

  notifyDepartmentsChanged();
  return normalized;
}

export async function saveDepartmentModules(departmentId, enabledModules = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId || isPlatformScope(departmentId)) return null;

  const payload = {
    departmentId,
    enabledModules,
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  return payload;
}

export async function saveCallShiftRules(departmentId, callShiftRules = []) {
  const db = getFirestoreDb();
  if (!db || !departmentId || isPlatformScope(departmentId)) return null;

  const payload = {
    departmentId,
    callShiftRules: Array.isArray(callShiftRules) ? callShiftRules : [],
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "departments", departmentId, "settings", "main"), payload, { merge: true });
  notifyDepartmentsChanged();
  return payload;
}

export async function propagatePlatformConfigToDepartments(platformConfig = {}) {
  const db = getFirestoreDb();
  if (!db) return { updated: 0 };

  const departments = await listPlatformDepartments();
  let updated = 0;

  await Promise.all(departments.map(async (department) => {
    const departmentId = department.id;
    if (!departmentId || isPlatformScope(departmentId)) return;

    const [profileSnap, settingsSnap] = await Promise.all([
      getDoc(doc(db, "departments", departmentId, "profile", "main")),
      getDoc(doc(db, "departments", departmentId, "settings", "main"))
    ]);

    const profileDefaults = resolveDepartmentProfileDefaults(departmentId);
    const settingsDefaults = resolveDepartmentSettingsDefaults(departmentId);

    const currentProfile = profileSnap.exists()
      ? { ...profileDefaults, ...profileSnap.data(), id: departmentId }
      : { ...profileDefaults, id: departmentId };
    const currentSettings = settingsSnap.exists()
      ? { ...settingsDefaults, ...settingsSnap.data(), departmentId }
      : { ...settingsDefaults, departmentId };

    const profilePayload = {
      ...applyPlatformToDepartmentProfile(currentProfile, platformConfig, departmentId),
      updatedAt: new Date().toISOString()
    };
    const settingsPayload = {
      ...applyPlatformToDepartmentSettings(currentSettings, platformConfig, departmentId),
      updatedAt: new Date().toISOString()
    };

    await Promise.all([
      setDoc(doc(db, "departments", departmentId, "profile", "main"), profilePayload, { merge: true }),
      setDoc(doc(db, "departments", departmentId, "settings", "main"), settingsPayload, { merge: true })
    ]);
    updated += 1;
  }));

  return { updated, total: departments.length };
}

export async function savePlatformConfig(config = {}, options = {}) {
  const { propagate = true } = options;
  const db = getFirestoreDb();
  if (!db) return null;

  const payload = {
    ...defaultPlatformConfig,
    ...config,
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, "platformConfig", "main"), payload, { merge: true });

  if (propagate) {
    await propagatePlatformConfigToDepartments(payload);
  }

  return payload;
}

export async function ensureCreatorDepartmentAccess(user, departmentId) {
  const db = getFirestoreDb();
  if (!db || !user?.uid || !departmentId || isPlatformScope(departmentId)) return null;

  await ensureDefaultRoles(departmentId);
  const registryProfile = await resolveDepartmentRegistryProfile(departmentId);
  await ensureDepartmentRegistry(departmentId, registryProfile);

  const now = new Date().toISOString();
  const payload = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "Creator",
    role: "creator",
    roleIds: ["creator"],
    status: "active",
    departmentId,
    isPlatformCreator: true,
    updatedAt: now
  };

  const existing = await getDoc(doc(db, "departments", departmentId, "users", user.uid));
  const existingData = existing.exists() ? existing.data() : {};
  if (!existing.exists()) {
    payload.createdAt = now;
  }

  const merged = {
    ...existingData,
    ...payload,
    personnelId: payload.personnelId || existingData.personnelId || "",
    assignedShift: existingData.assignedShift || "",
    assignedStation: existingData.assignedStation || "",
  };

  await setDoc(doc(db, "departments", departmentId, "users", user.uid), merged, { merge: true });
  return { id: user.uid, ...merged };
}

export async function registerPlatformDepartment(departmentId, profile = {}, options = {}) {
  const { user = null } = options;
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;

  const now = new Date().toISOString();
  const platformConfig = await loadPlatformConfig();
  const profileSubscription = normalizeSubscription(profile.subscription);
  const subscription = profileSubscription.startDate && profileSubscription.expirationDate
    ? profileSubscription
    : defaultSubscriptionDates();
  const departmentProfile = buildNewDepartmentProfile(departmentId, profile, platformConfig);
  const departmentSettings = applyPlatformToDepartmentSettings(
    {
      ...resolveDepartmentSettingsDefaults(departmentId),
      departmentId,
      subscription,
    },
    platformConfig,
    departmentId
  );
  const gatewayRecord = buildDepartmentGatewayRecord(departmentId, departmentProfile);

  await Promise.all([
    setDoc(doc(db, "departments", departmentId, "profile", "main"), {
      ...departmentProfile,
      createdAt: now,
      updatedAt: now
    }, { merge: true }),
    setDoc(doc(db, "departments", departmentId, "settings", "main"), {
      ...departmentSettings,
      createdAt: now,
      updatedAt: now
    }, { merge: true }),
    setDoc(doc(db, "platformDepartments", departmentId), {
      id: departmentId,
      name: departmentProfile.name,
      shortName: departmentProfile.shortName,
      branchLabel: departmentProfile.branchLabel,
      status: departmentProfile.status || "active",
      stateId: normalizeDepartmentStateId(departmentProfile.stateId, departmentProfile.address),
      address: departmentProfile.address || "",
      city: departmentProfile.city || "",
      zip: departmentProfile.zip || "",
      subscription: departmentSettings.subscription,
      createdAt: now,
      updatedAt: now
    }, { merge: true }),
    setDoc(doc(db, "rmsGateways", departmentId), {
      ...gatewayRecord,
      createdAt: now,
      updatedAt: now
    }, { merge: true })
  ]);

  await ensureDefaultRoles(departmentId);

  if (user?.uid) {
    await ensureCreatorDepartmentAccess(user, departmentId);
  }

  notifyDepartmentsChanged();
  return departmentProfile;
}
