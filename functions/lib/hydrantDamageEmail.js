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

async function sendWithSendGrid({
  apiKey,
  fromEmail,
  fromName,
  to,
  subject,
  text,
  pdfBuffer,
  filename,
}) {
  const body = {
    personalizations: [{ to: to.map((email) => ({ email })) }],
    from: { email: fromEmail, name: fromName || "FORGE RMS" },
    subject,
    content: [{ type: "text/plain", value: text }],
    attachments: [
      {
        content: pdfBuffer.toString("base64"),
        filename: filename || "hydrant-damage-report.pdf",
        type: "application/pdf",
        disposition: "attachment",
      },
    ],
  };

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const providerMessageId = response.headers.get("x-message-id") || "";
  const errorText = response.ok ? "" : await response.text();
  return {
    ok: response.status === 202 || response.ok,
    status: response.status,
    providerMessageId,
    errorText,
  };
}

module.exports = {
  generateHydrantDamagePdfBuffer,
  sendWithSendGrid,
};
