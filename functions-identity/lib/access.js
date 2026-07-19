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
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  if (!departmentId) {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }
  const allowed = await isPlatformCreator(db, auth) || await isDepartmentMember(db, departmentId, auth.uid);
  if (!allowed) {
    throw new HttpsError("permission-denied", "You do not have access to this department.");
  }
}

module.exports = { assertDepartmentAccess };
