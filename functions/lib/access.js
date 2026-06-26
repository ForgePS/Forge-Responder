const { HttpsError } = require("firebase-functions/v2/https");

const BOOTSTRAP_PLATFORM_EMAILS = new Set([
  "admin@forgepublicsafety.com",
  "jpowell@hornlake.org",
]);

async function isPlatformCreator(db, auth) {
  if (!auth?.uid) return false;
  if (auth.token?.email && BOOTSTRAP_PLATFORM_EMAILS.has(String(auth.token.email).toLowerCase())) {
    return true;
  }

  const creatorSnap = await db.doc(`platformCreators/${auth.uid}`).get();
  return creatorSnap.exists && creatorSnap.data()?.status === "active";
}

async function isDepartmentMember(db, departmentId, uid) {
  if (!departmentId || !uid) return false;
  const userSnap = await db.doc(`departments/${departmentId}/users/${uid}`).get();
  return userSnap.exists && userSnap.data()?.status === "active";
}

async function assertDepartmentAccess(db, departmentId, auth) {
  if (!auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in to send shift broadcast messages.");
  }
  if (!departmentId) {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }

  const allowed = await isPlatformCreator(db, auth)
    || await isDepartmentMember(db, departmentId, auth.uid);

  if (!allowed) {
    throw new HttpsError("permission-denied", "You do not have access to this department.");
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
};
