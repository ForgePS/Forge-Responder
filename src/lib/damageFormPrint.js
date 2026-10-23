import { formatDamageFormDate } from "./damageFormService.js";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDamageFormPrintHtml(record = {}) {
  const title = record.title || "Damage form";
  const submittedAt = formatDamageFormDate(record.submittedAt || record.receivedAt);
  const source = record.source === "jotform" ? "JotForm" : "Employee portal";
  const answers = Array.isArray(record.answers) ? record.answers : [];

  const answerRows = answers.length
    ? answers.map((answer) => `
        <tr>
          <th>${escapeHtml(answer.label || answer.field || "Answer")}</th>
          <td>${escapeHtml(answer.value || "")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="2">No field details were captured.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Arial, sans-serif; color: #111; margin: 32px; }
      h1 { margin: 0 0 8px; font-size: 24px; }
      .meta { margin: 0 0 24px; color: #444; font-size: 14px; }
      table { width: 100%; border-collapse: collapse; }
      th, td { border: 1px solid #ccc; padding: 10px 12px; text-align: left; vertical-align: top; }
      th { width: 32%; background: #f3f4f6; }
      @media print { body { margin: 16px; } }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">${escapeHtml(source)} · ${escapeHtml(submittedAt)}${record.submitterName ? ` · ${escapeHtml(record.submitterName)}` : ""}</p>
    <table>
      <tbody>${answerRows}</tbody>
    </table>
  </body>
</html>`;
}

export function printDamageFormRecord(record = {}) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return false;
  printWindow.document.write(buildDamageFormPrintHtml(record));
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
  return true;
}

export function downloadBlob(blob, filename = "damage-form.pdf") {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function base64ToPdfBlob(base64 = "") {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: "application/pdf" });
}
