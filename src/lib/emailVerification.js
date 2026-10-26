import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";

/**
 * Sends the email-verification link (needed for invites and two-factor).
 * Our server sends it through the same mailer as invites, so it comes from
 * Forge Public Safety rather than Firebase's default sender.
 */
export async function sendVerificationEmail() {
  const call = httpsCallable(getFirebaseFunctions(), "sendAccountVerificationEmail");
  const { data } = await call({ continueUrl: `${window.location.origin}${window.location.pathname}` });
  return data || {};
}
