const { HttpsError } = require("firebase-functions/v2/https");

// Platform creators are listed in platformCreators/{uid} (no email allowlists).
async function isPlatformCreator(db, auth) {
  if (!auth?.uid) return false;
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
