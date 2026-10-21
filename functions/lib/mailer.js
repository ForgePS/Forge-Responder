/**
 * Plain-text email via SendGrid. Returns "sent" | "not_configured" | "failed".
 * Needs SENDGRID_API_KEY and SENDGRID_FROM_EMAIL on Cloud Functions.
 */
async function sendTextEmail({ to = [], cc = [], subject, text }) {
  const apiKey = String(process.env.SENDGRID_API_KEY || "").trim();
  const fromEmail = String(process.env.SENDGRID_FROM_EMAIL || "").trim();
  const toList = [...new Set(to.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
  const ccList = [...new Set(cc.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))]
    .filter((e) => !toList.includes(e));
  if (!toList.length) return "no_recipient";
  if (!apiKey || !fromEmail) return "not_configured";

  const personalization = { to: toList.map((email) => ({ email })) };
  if (ccList.length) personalization.cc = ccList.map((email) => ({ email }));
  try {
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
  } catch (error) {
    console.error("SendGrid request failed", error);
    return "failed";
  }
}

module.exports = { sendTextEmail };
