import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { defaultRoles } from "../data/defaultRoles.js";
import {
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
import { DEMO_DEPARTMENT_ID, isDemoDepartment, isPlatformScope } from "./tenantPaths.js";
import { ensureDefaultRoles } from "./roleService.js";
import { defaultSubscriptionDates, normalizeSubscription } from "./subscriptionUtils.js";
import { normalizeDepartmentStateId } from "./departmentBranchUtils.js";
import { GHOST_DEPARTMENT_IDS, RESERVED_GATEWAY_PATHS } from "./gatewayRouting.js";

async function resolveDepartmentRegistryProfile(departmentId) {
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

// No built-in customer: an empty or unreadable registry is just empty.
function defaultDepartmentRegistry() {
  return [];
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

/**
 * Soft-disables accidental ghost branches (e.g. /admin, /api, mistyped Horn Lake IDs)
 * that were auto-seeded as "Fire Department".
 */
export async function pruneGhostDepartmentBranches() {
  const db = getFirestoreDb();
  if (!db) return { pruned: [] };

  const snap = await getDocs(collection(db, "platformDepartments"));
  const now = new Date().toISOString();
  const keptIds = new Set([DEMO_DEPARTMENT_ID]);
  const pruned = [];

  for (const item of snap.docs) {
    const data = item.data() || {};
    if (data.status === "disabled") continue;
    if (keptIds.has(item.id)) continue;

    const isReservedGhost = RESERVED_GATEWAY_PATHS.has(item.id) || GHOST_DEPARTMENT_IDS.has(item.id);
    const looksDefaultNamed = slugifyDepartmentId(data.name || "") === "fire-department"
      && slugifyDepartmentId(data.shortName || data.name || "") === "fire-department"
      && isReservedGhost;

    if (!isReservedGhost && !looksDefaultNamed) continue;

    await setDoc(doc(db, "platformDepartments", item.id), {
      status: "disabled",
      disabledReason: "ghost-department-branch",
      updatedAt: now,
    }, { merge: true });

    await setDoc(doc(db, "rmsGateways", item.id), {
      status: "disabled",
      disabledReason: "ghost-department-branch",
      updatedAt: now,
    }, { merge: true }).catch(() => null);

    pruned.push(item.id);
  }

  if (pruned.length) {
    notifyDepartmentsChanged();
  }

  return { pruned };
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

  // Never mint registry rows for reserved / ghost URL paths.
  if (RESERVED_GATEWAY_PATHS.has(departmentId) || GHOST_DEPARTMENT_IDS.has(departmentId)) {
    return null;
  }

  const registrySnap = await getDoc(doc(db, "platformDepartments", departmentId));
  const isKnownSeed = isDemoDepartment(departmentId);
  if (!registrySnap.exists() && !isKnownSeed) {
    // Visiting an unknown gateway path as a creator must not invent a "Fire Department" branch.
    return null;
  }
  if (registrySnap.exists() && registrySnap.data()?.status === "disabled") {
    return null;
  }

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

  // One atomic batch: either the whole tenant shell (profile, settings, registry,
  // gateway, default roles) is created, or nothing is — no half-built departments.
  const batch = writeBatch(db);
  batch.set(doc(db, "departments", departmentId, "profile", "main"), {
    ...departmentProfile,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  batch.set(doc(db, "departments", departmentId, "settings", "main"), {
    ...departmentSettings,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  for (const role of defaultRoles) {
    batch.set(doc(db, "departments", departmentId, "roles", role.id), {
      ...role,
      createdAt: now,
      updatedAt: now
    }, { merge: true });
  }
  batch.set(doc(db, "platformDepartments", departmentId), {
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
    }, { merge: true });
  batch.set(doc(db, "rmsGateways", departmentId), {
    ...gatewayRecord,
    createdAt: now,
    updatedAt: now
  }, { merge: true });
  await batch.commit();

  if (user?.uid) {
    await ensureCreatorDepartmentAccess(user, departmentId);
  }

  try {
    const { ensureCustomerSubscription } = await import("./platformSubscriptionService.js");
    await ensureCustomerSubscription(departmentId, user?.uid || "", {
      billingContactEmail: departmentProfile.contactEmail,
      legacySubscription: subscription,
    });
  } catch (error) {
    console.warn("Failed to provision department subscription", error);
  }

  notifyDepartmentsChanged();
  return departmentProfile;
}
