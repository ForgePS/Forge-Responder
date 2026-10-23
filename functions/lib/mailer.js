/**
 * Plain-text email. Provider: Resend (RESEND_API_KEY, preferred) or SendGrid
 * (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL) as a fallback.
 *
 * Returns "sent" | "not_configured" | "no_recipient" | "failed".
 *
 * RESEND_API_KEY is a Firebase secret: functions that send email must declare
 * it (`secrets: [resendApiKey]`) so it is present in process.env.
 * EMAIL_FROM sets the sender; its domain must be verified in Resend.
 */
const DEFAULT_FROM = "FORGE Responder <noreply@forgeresponder.com>";

function cleanList(list = []) {
  return [...new Set(list.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
}

async function sendViaResend({ apiKey, from, to, cc, replyTo, subject, text }) {
  const body = { from, to, subject, text };
  if (cc.length) body.cc = cc;
  if (replyTo) body.reply_to = replyTo;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.error("Resend error", response.status, await response.text());
    return "failed";
  }
  return "sent";
}

async function sendViaSendGrid({ apiKey, fromEmail, to, cc, subject, text }) {
  const personalization = { to: to.map((email) => ({ email })) };
  if (cc.length) personalization.cc = cc.map((email) => ({ email }));
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [personalization],
      from: { email: fromEmail, name: "FORGE Responder" },
      subject,
      content: [{ type: "text/plain", value: text }],
    }),
  });
  if (!response.ok) {
    console.error("SendGrid error", response.status, await response.text());
    return "failed";
  }
  return "sent";
}

async function sendTextEmail({ to = [], cc = [], replyTo = "", subject, text }) {
  const toList = cleanList(to);
  const ccList = cleanList(cc).filter((e) => !toList.includes(e));
  if (!toList.length) return "no_recipient";

  // Staging (functions/.env.forge-rms-staging): log instead of emailing anyone.
  if (process.env.EMAIL_DELIVERY === "log") {
    console.log("[email not sent: EMAIL_DELIVERY=log]", JSON.stringify({ to: toList, cc: ccList, subject, text: String(text || "").slice(0, 2000) }));
    return "logged";
  }

  const resendKey = String(process.env.RESEND_API_KEY || "").trim();
  const sendGridKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const sendGridFrom = String(process.env.SENDGRID_FROM_EMAIL || "").trim();
  try {
    if (resendKey) {
      const from = String(process.env.EMAIL_FROM || DEFAULT_FROM).trim();
      return await sendViaResend({ apiKey: resendKey, from, to: toList, cc: ccList, replyTo, subject, text });
    }
    if (sendGridKey && sendGridFrom) {
      return await sendViaSendGrid({ apiKey: sendGridKey, fromEmail: sendGridFrom, to: toList, cc: ccList, subject, text });
    }
    return "not_configured";
  } catch (error) {
    console.error("Email request failed", error);
    return "failed";
  }
}

module.exports = { DEFAULT_FROM, sendTextEmail };
