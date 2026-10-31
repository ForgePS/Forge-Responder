/**
 * Two-factor login (authenticator app codes) requirements on the server.
 *
 * A session "has a second factor" when the user signed in with a code: Firebase
 * puts firebase.sign_in_second_factor in the ID token. Platform creators always
 * need it (access.js isPlatformCreator). Department admins need it once
 * platformConfig/main.mfaAdminDeadline has passed (set with
 * scripts/two-factor.mjs --start-admin-grace); the shared demo is exempt.
 * firestore.rules applies the same rules (hasSecondFactor / adminTwoFactorOk).
 */
const { HttpsError } = require("firebase-functions/v2/https");

const DEMO_DEPARTMENT_ID = "forge-demo";

function hasSecondFactor(auth) {
  return Boolean(auth?.token?.firebase?.sign_in_second_factor);
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function adminDeadline(db) {
  const snap = await db.doc("platformConfig/main").get();
  return toDate(snap.data()?.mfaAdminDeadline);
}

/** Whether department admins of this department must use a second factor now. */
async function adminSecondFactorRequired(db, departmentId, now = new Date()) {
  if (departmentId === DEMO_DEPARTMENT_ID) return false;
  const deadline = await adminDeadline(db);
  return Boolean(deadline && now >= deadline);
}

// Two-step sign-in codes are optional for everyone (2026-10-29). Set to true to
// require them again for department admins after platformConfig/main.mfaAdminDeadline.
const ADMIN_SECOND_FACTOR_ENFORCED = false;

async function assertAdminSecondFactor(db, departmentId, auth) {
  if (!ADMIN_SECOND_FACTOR_ENFORCED) return;
  if (hasSecondFactor(auth)) return;
  if (await adminSecondFactorRequired(db, departmentId)) {
    throw new HttpsError(
      "permission-denied",
      "Admin tools now need two-factor login. Set it up when the app asks, then sign in again with a code."
    );
  }
}

module.exports = {
  DEMO_DEPARTMENT_ID,
  hasSecondFactor,
  adminDeadline,
  adminSecondFactorRequired,
  assertAdminSecondFactor,
};
