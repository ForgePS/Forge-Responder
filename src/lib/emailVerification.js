import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "./firebaseClient.js";
import { readPendingInviteToken } from "./inviteService.js";

/**
 * Sends the email-verification link (needed for invites and two-factor).
 * Our server sends it through the same mailer as invites, so it comes from
 * Forge Public Safety rather than Firebase's default sender.
 */
export async function sendVerificationEmail() {
  const call = httpsCallable(getFirebaseFunctions(), "sendAccountVerificationEmail");
  // Carry a pending invite through the link, so it's accepted after verifying.
  const continueUrl = new URL(`${window.location.origin}${window.location.pathname}`);
  const invite = readPendingInviteToken();
  if (invite) continueUrl.searchParams.set("invite", invite);
  const { data } = await call({ continueUrl: continueUrl.toString() });
  return data || {};
}
