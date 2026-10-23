/** Creator-only test email to the caller's own address. */
const { HttpsError } = require("firebase-functions/v2/https");
const { isPlatformCreator } = require("./access");
const { sendTextEmail } = require("./mailer");

async function sendTestEmail(db, request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Platform creator access is required.");
  }
  const to = String(request.auth.token?.email || "").trim();
  if (!to) throw new HttpsError("failed-precondition", "Your account has no email address.");
  const status = await sendTextEmail({
    to: [to],
    subject: "FORGE Responder test email",
    text: `This is a test email from FORGE Responder (${new Date().toISOString()}).\n\nIf you received it, invite and billing emails will be delivered.`,
  });
  return { to, status, provider: process.env.RESEND_API_KEY ? "resend" : (process.env.SENDGRID_API_KEY ? "sendgrid" : "none") };
}

module.exports = { sendTestEmail };
