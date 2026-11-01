const PDFDocument = require("pdfkit");

function formatWhen(value = "") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US");
}

function generateHydrantDamagePdfBuffer(report = {}, branding = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const categories = Array.isArray(report.damageCategoryIds)
      ? report.damageCategoryIds.map((id) => String(id).replace(/_/g, " ")).join(", ")
      : "";

    doc.font("Helvetica-Bold").fontSize(18).fillColor("#145d55")
      .text(branding.departmentName || "Fire Department");
    doc.moveDown(0.3);
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#111111")
      .text("Hydrant Damage Report");
    doc.font("Helvetica").fontSize(11).fillColor("#555555")
      .text(`${report.reportNumber || ""} · Rev ${report.recordVersion || 1}`);
    doc.moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#145d55")
      .text(`${report.severityLabel || report.severity || "Severity"} · ${report.operationalStatusLabel || report.operationalStatus || ""}`);
    doc.moveDown(1);

    const rows = [
      ["Hydrant", report.hydrantLabel || ""],
      ["Address", report.hydrantAddress || ""],
      ["Water company", report.waterCompanyName || ""],
      ["Discovered", `${formatWhen(report.discoveredAt)} by ${report.discoveredBy || "—"}`],
      ["Categories", categories || "—"],
      ["Description", report.description || "—"],
      ["Immediate actions", report.immediateActions || "—"],
      ["Utility notes", report.utilityFacingNotes || "—"],
      ["Ack due", formatWhen(report.acknowledgmentDueAt)],
      ["Repair target", formatWhen(report.repairTargetAt)],
    ];

    rows.forEach(([label, value]) => {
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#666666").text(String(label).toUpperCase());
      doc.font("Helvetica").fontSize(11).fillColor("#111111").text(String(value || "—"), {
        width: doc.page.width - 96,
      });
      doc.moveDown(0.55);
    });

    doc.moveDown(1);
    doc.font("Helvetica").fontSize(9).fillColor("#777777")
      .text("Internal notes are excluded from this external report.");
    doc.text(`Audit id: ${report.id || ""}`);

    doc.end();
  });
}

/**
 * Email delivery for hydrant damage reports (PDF attached).
 *
 * Uses the same provider settings as the shared mailer (functions/lib/mailer.js):
 *  - RESEND_API_KEY (Firebase secret; the callable must declare it) + EMAIL_FROM
 *  - SendGrid (SENDGRID_API_KEY + SENDGRID_FROM_EMAIL) only as a legacy fallback
 *  - EMAIL_DELIVERY=log: nothing is sent; the attempt is reported as "logged"
 * The shared mailer is text-only, so the attachment request is built here.
 *
 * Returns { outcome, ok, status, providerMessageId, errorText } where outcome is
 * "sent" | "logged" | "not_configured" | "failed". Only "sent" means delivered
 * to the provider.
 */
const { DEFAULT_FROM } = require("./mailer");

function cleanEmails(list = []) {
  return [...new Set(list.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
}

async function sendViaResend({ apiKey, from, to, replyTo, subject, text, pdfBuffer, filename, fetchImpl }) {
  const body = {
    from,
    to,
    subject,
    text,
    attachments: [{ filename, content: pdfBuffer.toString("base64") }],
  };
  if (replyTo) body.reply_to = replyTo;
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("Resend error (hydrant damage report)", response.status, errorText);
    return { outcome: "failed", ok: false, status: response.status, providerMessageId: "", errorText: errorText || `Email provider returned HTTP ${response.status}` };
  }
  const data = await response.json().catch(() => ({}));
  return { outcome: "sent", ok: true, status: response.status, providerMessageId: String(data?.id || ""), errorText: "" };
}

async function sendViaSendGrid({ apiKey, fromEmail, fromName, to, replyTo, subject, text, pdfBuffer, filename, fetchImpl }) {
  const body = {
    personalizations: [{ to: to.map((email) => ({ email })) }],
    from: { email: fromEmail, name: fromName || "Forge Public Safety" },
    subject,
    content: [{ type: "text/plain", value: text }],
    attachments: [{
      content: pdfBuffer.toString("base64"),
      filename,
      type: "application/pdf",
      disposition: "attachment",
    }],
  };
  if (replyTo) body.reply_to = { email: replyTo };
  const response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const providerMessageId = response.headers?.get?.("x-message-id") || "";
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    console.error("SendGrid error (hydrant damage report)", response.status, errorText);
    return { outcome: "failed", ok: false, status: response.status, providerMessageId, errorText: errorText || `Email provider returned HTTP ${response.status}` };
  }
  return { outcome: "sent", ok: true, status: response.status, providerMessageId, errorText: "" };
}

async function sendHydrantDamageEmail({
  to = [],
  replyTo = "",
  subject,
  text,
  pdfBuffer,
  filename = "hydrant-damage-report.pdf",
  env = process.env,
  fetchImpl = fetch,
} = {}) {
  const toList = cleanEmails(to);
  if (!toList.length) {
    return { outcome: "failed", ok: false, status: 0, providerMessageId: "", errorText: "No recipient email addresses." };
  }

  if (env.EMAIL_DELIVERY === "log") {
    console.log("[email not sent: EMAIL_DELIVERY=log]", JSON.stringify({ to: toList, subject, attachment: filename, text: String(text || "").slice(0, 2000) }));
    return { outcome: "logged", ok: false, status: 0, providerMessageId: "", errorText: "Email delivery is switched off on this server (log-only mode), so nothing was sent." };
  }

  const resendKey = String(env.RESEND_API_KEY || "").trim();
  const sendGridKey = String(env.SENDGRID_API_KEY || "").trim();
  const sendGridFrom = String(env.SENDGRID_FROM_EMAIL || "").trim();
  try {
    if (resendKey) {
      const from = String(env.EMAIL_FROM || DEFAULT_FROM).trim();
      return await sendViaResend({ apiKey: resendKey, from, to: toList, replyTo, subject, text, pdfBuffer, filename, fetchImpl });
    }
    if (sendGridKey && sendGridFrom) {
      return await sendViaSendGrid({ apiKey: sendGridKey, fromEmail: sendGridFrom, to: toList, replyTo, subject, text, pdfBuffer, filename, fetchImpl });
    }
  } catch (error) {
    console.error("Hydrant damage email request failed", error);
    return { outcome: "failed", ok: false, status: 0, providerMessageId: "", errorText: error?.message || "Email request failed." };
  }
  return { outcome: "not_configured", ok: false, status: 0, providerMessageId: "", errorText: "Email is not set up on the server yet (no email provider key), so nothing was sent." };
}

module.exports = {
  generateHydrantDamagePdfBuffer,
  sendHydrantDamageEmail,
};
