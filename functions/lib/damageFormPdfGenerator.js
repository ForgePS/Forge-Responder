const PDFDocument = require("pdfkit");

function formatSubmittedAt(value = "") {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function generateDamageFormPdfBuffer(record = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: "LETTER" });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const title = record.title || record.formTitle || "Damage Form";
    const source = record.source === "jotform" ? "JotForm" : "Employee portal";

    doc.font("Helvetica-Bold").fontSize(18).text(title);
    doc.moveDown(0.4);
    doc.font("Helvetica").fontSize(11).fillColor("#444444");
    doc.text(`${record.formTitle || source} · ${formatSubmittedAt(record.submittedAt || record.receivedAt)}`);
    if (record.submitterName) {
      doc.text(`Submitted by: ${record.submitterName}`);
    }
    doc.moveDown(1);
    doc.fillColor("#111111");

    const answers = Array.isArray(record.answers) ? record.answers : [];
    if (answers.length) {
      answers.forEach((answer) => {
        doc.font("Helvetica-Bold").fontSize(11).text(answer.label || answer.field || "Answer");
        doc.font("Helvetica").fontSize(11).text(String(answer.value || ""), {
          indent: 12,
          width: doc.page.width - 96,
        });
        doc.moveDown(0.75);
      });
    } else if (record.summary) {
      doc.font("Helvetica").fontSize(11).text(String(record.summary));
    } else {
      doc.font("Helvetica").fontSize(11).text("No field details were captured for this submission.");
    }

    doc.end();
  });
}

module.exports = {
  generateDamageFormPdfBuffer,
};
