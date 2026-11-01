const { HttpsError } = require("firebase-functions/v2/https");
const { assertAdminSecondFactor } = require("./twoFactor");

// Platform creators are listed in platformCreators/{uid} (no email allowlists).
// Two-step sign-in codes are optional (2026-10-29).
async function isPlatformCreator(db, auth) {
  if (!auth?.uid) return false;
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

/**
 * The caller's permissions in a department, worked out the same way as the app
 * (roles + personal overrides; see lib/memberGrants.js). Creators get everything.
 */
async function memberPermissions(db, departmentId, auth) {
  const { computeMemberPermissions } = require("./memberGrants");
  if (await isPlatformCreator(db, auth)) return computeMemberPermissions({ roleIds: ["creator"] });
  const [userSnap, rolesSnap] = await Promise.all([
    db.doc(`departments/${departmentId}/users/${auth.uid}`).get(),
    db.collection(`departments/${departmentId}/roles`).get(),
  ]);
  const roles = Object.fromEntries(rolesSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
  return computeMemberPermissions(userSnap.data() || {}, roles);
}

/** Active member who holds at least one of the given permissions (creators always pass). */
async function assertMemberPermission(db, departmentId, auth, anyOf = [], message = "You don't have permission to do that.") {
  await assertDepartmentAccess(db, departmentId, auth);
  const permissions = await memberPermissions(db, departmentId, auth);
  if (anyOf.some((key) => permissions[key] === true)) return permissions;
  throw new HttpsError("permission-denied", message);
}

async function assertDepartmentManage(db, departmentId, auth) {
  await assertMemberPermission(db, departmentId, auth,
    ["manageDigitalDashboard", "manageSystemSettings", "managePermissions"],
    "Administrator access is required.");
  await assertAdminSecondFactor(db, departmentId, auth);
}

const { resolveGatewayDepartmentId } = require("./gatewayResolver");

async function assertDepartmentAccessOrPublicGateway(db, departmentId, auth, gatewaySlug = "", displayKey = "") {
  if (auth?.uid) {
    const allowed = await isPlatformCreator(db, auth)
      || await isDepartmentMember(db, departmentId, auth.uid);
    if (allowed) return;
  }

  const slug = String(gatewaySlug || "").trim();
  if (slug) {
    const gateway = await resolveGatewayDepartmentId(db, slug);
    if (gateway?.departmentId && gateway.departmentId === String(departmentId || "").trim().toLowerCase()) {
      const { verifyPublicDisplayKey } = require("./alertDashboardPublic");
      if (await verifyPublicDisplayKey(db, gateway.departmentId, displayKey)) return;
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
  assertMemberPermission,
  assertPlatformSuperAdmin,
  memberPermissions,
  isPlatformCreator,
  isDepartmentActive,
  isDepartmentMember,
};
