/**
 * Email-address verification sent through our own mailer (Resend/SendGrid),
 * so it comes from the same Forge Public Safety sender as invites instead of
 * Firebase's default noreply@<project>.firebaseapp.com, which Yahoo and others
 * often drop or file as spam.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");
const { sendTextEmail } = require("./mailer");
const { safeAppOrigin } = require("./invites");

const COOLDOWN_MS = 60 * 1000;

/** The page to return to after the link is clicked, limited to our own hosts. */
function continueUrlFor(pageUrl) {
  try {
    const url = new URL(String(pageUrl || ""));
    const origin = safeAppOrigin(url.origin);
    return origin === url.origin ? `${origin}${url.pathname}` : `${origin}/`;
  } catch {
    return `${safeAppOrigin("")}/`;
  }
}

async function generateLink(adminAuth, email, continueUrl) {
  try {
    return await adminAuth.generateEmailVerificationLink(email, { url: continueUrl });
  } catch (error) {
    // The continue URL's domain must be on Firebase's authorized list; if it
    // isn't, still send a working link (it just won't return to this page).
    if (error?.code === "auth/unauthorized-continue-uri" || error?.code === "auth/invalid-continue-uri") {
      console.warn("Continue URL not authorized; sending link without it", continueUrl);
      return adminAuth.generateEmailVerificationLink(email);
    }
    throw error;
  }
}

async function sendVerificationEmail(db, adminAuth, request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in first.");

  const user = await adminAuth.getUser(uid);
  const email = String(user.email || "").trim();
  if (!email) throw new HttpsError("failed-precondition", "Your account has no email address.");
  if (user.emailVerified) return { status: "already_verified", email };

  const ref = db.doc(`emailVerificationRequests/${uid}`);
  const last = (await ref.get()).data()?.lastSentAt?.toMillis?.() || 0;
  if (Date.now() - last < COOLDOWN_MS) {
    throw new HttpsError("resource-exhausted", "A verification email was sent recently. Wait a minute and try again.");
  }

  const link = await generateLink(adminAuth, email, continueUrlFor(request.data?.continueUrl));
  const status = await sendTextEmail({
    to: [email],
    subject: "Verify your email address for Forge Public Safety",
    text: [
      "Confirm your email address to finish setting up your Forge Public Safety account:",
      "",
      link,
      "",
      `This confirms ${email}. If you didn't request this, you can ignore this email.`,
      "",
      "— Forge Public Safety",
    ].join("\n"),
  });

  if (status !== "sent" && status !== "logged") {
    console.error("Verification email not sent", { uid, status });
    throw new HttpsError("unavailable", "We couldn't send the verification email. Please try again in a moment.");
  }
  await ref.set({ lastSentAt: Timestamp.now(), email }, { merge: true });
  return { status, email };
}

module.exports = { COOLDOWN_MS, continueUrlFor, sendVerificationEmail };
