/** Password reset and change for the signed-in or signing-in person. */
import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, updatePassword } from "firebase/auth";
import { getFirebaseAuth } from "./firebaseClient.js";

/**
 * Emails a reset link. Always reports success for a well-formed address so the
 * form can't be used to find out which emails have accounts.
 */
export async function requestPasswordReset(email) {
  const address = String(email || "").trim();
  if (!address) throw Object.assign(new Error("Enter your email address first."), { code: "auth/missing-email" });
  try {
    await sendPasswordResetEmail(getFirebaseAuth(), address);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return;
    throw error;
  }
}

/** Confirms the current password, then sets the new one. */
export async function changePassword(currentPassword, newPassword) {
  const user = getFirebaseAuth()?.currentUser;
  if (!user?.email) throw new Error("Sign in first.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  await updatePassword(user, newPassword);
}

export function accountErrorMessage(error) {
  const code = error?.code || "";
  if (code === "auth/missing-email") return error.message;
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") return "Your current password isn't right.";
  if (code === "auth/weak-password") return "Choose a password of at least 6 characters.";
  if (code === "auth/too-many-requests") return "Too many attempts. Wait a few minutes and try again.";
  if (code === "auth/multi-factor-auth-required") return "Sign out and back in with your two-factor code, then try again.";
  return error?.message || "Something went wrong. Try again.";
}
