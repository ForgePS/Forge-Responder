/**
 * Per-department entitlements: what a department may use, kept by the server
 * at platformEntitlements/<departmentId> (only Cloud Functions write it; the
 * Firestore rules read it to block writes to switched-off modules and adds
 * past a plan limit).
 *
 *   { departmentId, planId, status,
 *     modules: [...module keys],
 *     limits: { maxPersonnel, maxPortalUsers, maxStations },   // 0 = unlimited
 *     usage:  { personnel, portalUsers, stations },
 *     updatedAt }
 *
 * modules = the plan's `modules` (all modules when the plan lists none), minus
 * the department's `disabledModules` (settings/main, set by platform
 * creators). Storing what is switched OFF means new modules appear for
 * everyone automatically. Dashboard and System Admin are always on.
 */
const { countListItems } = require("./listStore");
const { ALWAYS_ON_MODULES, MODULE_KEYS } = require("./moduleCatalog");

const PERSONNEL_LIST = "hlfd-rms-personnel";

function knownModules(list) {
  return Array.isArray(list) ? list.filter((key) => MODULE_KEYS.includes(key)) : [];
}

/** Effective module list (pure, for tests and the app). */
function effectiveModules({ planModules, disabledModules } = {}) {
  const planned = knownModules(planModules);
  const off = knownModules(disabledModules);
  return MODULE_KEYS.filter((key) => ALWAYS_ON_MODULES.includes(key)
    || ((!planned.length || planned.includes(key)) && !off.includes(key)));
}

function limitValue(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** Stations a department has configured (station details, else station names). */
function stationCount(profile = {}) {
  if (Array.isArray(profile.stationDetails) && profile.stationDetails.length) return profile.stationDetails.length;
  return Array.isArray(profile.stations) ? profile.stations.length : 0;
}

async function computeEntitlements(db, departmentId) {
  const [subSnap, settingsSnap, profileSnap, membersSnap] = await Promise.all([
    db.doc(`platformSubscriptions/${departmentId}`).get(),
    db.doc(`departments/${departmentId}/settings/main`).get(),
    db.doc(`departments/${departmentId}/profile/main`).get(),
    db.collection(`departments/${departmentId}/users`).where("status", "==", "active").get(),
  ]);
  const sub = subSnap.exists ? subSnap.data() || {} : {};
  const planId = String(sub.planId || "");
  const plan = planId ? (await db.doc(`platformSubscriptionPlans/${planId}`).get()).data() || {} : {};
  const settings = settingsSnap.exists ? settingsSnap.data() || {} : {};

  return {
    departmentId,
    planId,
    status: String(sub.status || ""),
    modules: effectiveModules({ planModules: plan.modules, disabledModules: settings.disabledModules }),
    limits: {
      maxPersonnel: limitValue(plan.maxPersonnel ?? plan.maxStudents),
      maxPortalUsers: limitValue(plan.maxPortalUsers),
      maxStations: limitValue(plan.maxStations ?? plan.maxAcademyTenants),
    },
    usage: {
      personnel: await countListItems(db, departmentId, PERSONNEL_LIST),
      portalUsers: membersSnap.docs.filter((d) => !d.data().isPlatformCreator).length,
      stations: stationCount(profileSnap.exists ? profileSnap.data() : {}),
    },
  };
}

async function refreshDepartment(db, departmentId) {
  if (!departmentId) return null;
  const entitlements = await computeEntitlements(db, departmentId);
  await db.doc(`platformEntitlements/${departmentId}`).set({ ...entitlements, updatedAt: new Date().toISOString() });
  return entitlements;
}

async function departmentIds(db) {
  return (await db.collection("platformDepartments").get()).docs.map((d) => d.id);
}

async function refreshAll(db) {
  const results = [];
  for (const id of await departmentIds(db)) {
    results.push(await refreshDepartment(db, id));
  }
  return results;
}

async function refreshForPlan(db, planId) {
  const subs = await db.collection("platformSubscriptions").where("planId", "==", planId).get();
  for (const doc of subs.docs) await refreshDepartment(db, doc.id);
  return subs.size;
}

/** True when a settings write changed the switched-off modules (other edits don't matter). */
function modulesChanged(before = {}, after = {}) {
  return JSON.stringify(before?.disabledModules ?? null) !== JSON.stringify(after?.disabledModules ?? null);
}

function stationsChanged(before = {}, after = {}) {
  return stationCount(before || {}) !== stationCount(after || {});
}

module.exports = {
  PERSONNEL_LIST,
  effectiveModules,
  stationCount,
  computeEntitlements,
  refreshDepartment,
  refreshAll,
  refreshForPlan,
  modulesChanged,
  stationsChanged,
};
