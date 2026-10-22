const { HttpsError } = require("firebase-functions/v2/https");
const { hasSecondFactor, assertAdminSecondFactor } = require("./twoFactor");

// Platform creators are listed in platformCreators/{uid} (no email allowlists),
// and creator powers need a session signed in with a two-factor code.
async function isPlatformCreator(db, auth) {
  if (!auth?.uid || !hasSecondFactor(auth)) return false;
  const creatorSnap = await db.doc(`platformCreators/${auth.uid}`).get();
  return creatorSnap.exists && creatorSnap.data()?.status === "active";
}

// Mirrors firestore.rules isDepartmentActive(): suspended/cancelled subscriptions
// and disabled/archived departments lose access (platform creators excepted).
async function isDepartmentActive(db, departmentId) {
  const [subscription, registry] = await Promise.all([
    db.doc(`platformSubscriptions/${departmentId}`).get(),
    db.doc(`platformDepartments/${departmentId}`).get(),
  ]);
  if (["suspended", "cancelled"].includes(subscription.data()?.status)) return false;
  if (["disabled", "archived"].includes(registry.data()?.status)) return false;
  return true;
}

async function isDepartmentMember(db, departmentId, uid) {
  if (!departmentId || !uid) return false;
  const userSnap = await db.doc(`departments/${departmentId}/users/${uid}`).get();
  return userSnap.exists && userSnap.data()?.status === "active";
}

async function assertDepartmentAccess(db, departmentId, auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to continue.");
  }
  if (!departmentId) {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }

  if (await isPlatformCreator(db, auth)) return;

  if (!(await isDepartmentMember(db, departmentId, auth.uid))) {
    throw new HttpsError("permission-denied", "You do not have access to this department.");
  }
  if (!(await isDepartmentActive(db, departmentId))) {
    throw new HttpsError("failed-precondition", "This department's subscription is not active.");
  }
}

async function assertDepartmentManage(db, departmentId, auth) {
  await assertDepartmentAccess(db, departmentId, auth);
  if (await isPlatformCreator(db, auth)) return;

  const userSnap = await db.doc(`departments/${departmentId}/users/${auth.uid}`).get();
  const roleId = userSnap.data()?.roleId;
  if (!roleId) {
    throw new HttpsError("permission-denied", "Administrator access is required.");
  }

  const roleSnap = await db.doc(`departments/${departmentId}/roles/${roleId}`).get();
  const permissions = roleSnap.data()?.permissions || {};
  if (
    permissions.manageDigitalDashboard
    || permissions.manageSystemSettings
    || permissions.managePermissions
  ) {
    await assertAdminSecondFactor(db, departmentId, auth);
    return;
  }

  throw new HttpsError("permission-denied", "Administrator access is required.");
}

const { resolveGatewayDepartmentId } = require("./gatewayResolver");

async function assertDepartmentAccessOrPublicGateway(db, departmentId, auth, gatewaySlug = "") {
  if (auth?.uid) {
    const allowed = await isPlatformCreator(db, auth)
      || await isDepartmentMember(db, departmentId, auth.uid);
    if (allowed) return;
  }

  const slug = String(gatewaySlug || "").trim();
  if (slug) {
    const gateway = await resolveGatewayDepartmentId(db, slug);
    if (gateway?.departmentId && gateway.departmentId === String(departmentId || "").trim().toLowerCase()) {
      return;
    }
  }

  throw new HttpsError("permission-denied", "You do not have access to this department.");
}

async function assertPlatformSuperAdmin(db, departmentId, auth) {
  await assertDepartmentAccess(db, departmentId, auth);
  if (await isPlatformCreator(db, auth)) return;

  const userSnap = await db.doc(`departments/${departmentId}/users/${auth.uid}`).get();
  const user = userSnap.data() || {};
  const roleIds = Array.isArray(user.roleIds) ? user.roleIds : [];
  if (
    user.isPlatformCreator
    || user.role === "creator"
    || roleIds.includes("creator")
  ) {
    await assertAdminSecondFactor(db, departmentId, auth);
    return;
  }

  throw new HttpsError(
    "permission-denied",
    "Platform super admin or creator access is required to manage API keys."
  );
}

module.exports = {
  assertDepartmentAccess,
  assertDepartmentAccessOrPublicGateway,
  assertDepartmentManage,
  assertPlatformSuperAdmin,
  isPlatformCreator,
  isDepartmentActive,
  isDepartmentMember,
};
