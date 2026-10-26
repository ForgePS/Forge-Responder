/**
 * Two-factor login with an authenticator app (TOTP), on the app side.
 * The server and Firestore rules enforce it (functions/lib/twoFactor.js,
 * firestore.rules hasSecondFactor): platform creators always, department
 * admins after platformConfig/main.mfaAdminDeadline; the shared demo is exempt.
 */
import {
  EmailAuthProvider,
  TotpMultiFactorGenerator,
  getMultiFactorResolver,
  multiFactor,
  reauthenticateWithCredential,
} from "firebase/auth";

export const ISSUER = "FORGE Responder";
const ADMIN_ROLE_IDS = ["fireChief", "itAdmin"];
const DAY_MS = 24 * 60 * 60 * 1000;

export function isSecondFactorRequiredError(error) {
  return error?.code === "auth/multi-factor-auth-required";
}

/** Sign-in step 2: the resolver from the "second factor required" error. */
export function secondFactorResolver(auth, error) {
  return getMultiFactorResolver(auth, error);
}

export async function completeSignInWithCode(resolver, code) {
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID) || resolver.hints[0];
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(hint.uid, String(code).trim());
  return resolver.resolveSignIn(assertion);
}

export function hasAuthenticatorApp(user) {
  if (!user) return false;
  return multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
}

/** Whether this session was signed in with a code (what the rules check). */
export async function sessionHasSecondFactor(user) {
  if (!user) return false;
  const token = await user.getIdTokenResult();
  return Boolean(token.claims?.firebase?.sign_in_second_factor);
}

/** Setup step 1: a new secret, its otpauth URL (for the QR code) and the key to type by hand. */
export async function startAuthenticatorSetup(user) {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  return {
    secret,
    url: secret.generateQrCodeUrl(user.email || user.uid, ISSUER),
    key: secret.secretKey,
  };
}

/** Setup step 2: confirm with a code from the app. */
export async function finishAuthenticatorSetup(user, secret, code, displayName = "Authenticator app") {
  const assertion = TotpMultiFactorGenerator.assertionForEnrollment(secret, String(code).trim());
  await multiFactor(user).enroll(assertion, displayName);
}

/** Re-reads the account; true once the email link has been clicked. */
export async function emailNowVerified(user) {
  await user.reload();
  return Boolean(user.emailVerified);
}

/** Setup needs a recent sign-in; confirm the password when Firebase asks. */
export async function confirmPassword(user, password) {
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
}

export function isDepartmentAdminMembership(membership = {}) {
  const roleIds = Array.isArray(membership?.roleIds) ? membership.roleIds : [];
  return membership?.role === "department_admin" || roleIds.some((id) => ADMIN_ROLE_IDS.includes(id));
}

function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.seconds === "number") return new Date(value.seconds * 1000);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * What two-factor means for this person right now:
 *  - "required": must have a two-factor session to use the app;
 *  - "grace": a department admin before the deadline (daysLeft);
 *  - "none": not required (everyone else, the demo, or no deadline set).
 */
export function twoFactorRequirement({ isCreator, membership, departmentId, demo, deadline, now = new Date() }) {
  if (demo) return { level: "none" };
  if (isCreator) return { level: "required" };
  if (!isDepartmentAdminMembership(membership) || departmentId === "forge-demo") return { level: "none" };
  const due = toDate(deadline);
  if (!due) return { level: "none" };
  if (now >= due) return { level: "required", deadline: due };
  return { level: "grace", deadline: due, daysLeft: Math.max(1, Math.ceil((due - now) / DAY_MS)) };
}
