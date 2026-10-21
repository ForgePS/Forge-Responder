import { NOTICE_MERGE_FIELDS } from "./noticeDefaults.js";

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

function fieldLabel(key) {
  return NOTICE_MERGE_FIELDS.find((row) => row.key === key)?.label || key;
}

function resolveMergeValue(key, notice = {}, context = {}) {
  const merge = {
    departmentName: context.departmentName || notice.departmentName || "Fire Department",
    noticeNumber: notice.noticeNumber || "",
    documentTitle: notice.title || notice.templateSnapshot?.name || "Notice",
    issuedAt: formatDate(notice.issuedAt || notice.createdAt),
    occupancyName: notice.occupancyName || "",
    address: notice.address || "",
    inspectionNumber: notice.inspectionNumber || "",
    inspectorName: notice.inspectorName || notice.createdByName || "",
    summary: notice.summary || "",
    correctiveAction: notice.correctiveAction || "",
    dueAt: formatDate(notice.dueAt),
    recipientName: notice.recipientName || "",
    ...(notice.mergeValues || {}),
    ...(context.mergeValues || {}),
  };
  return merge[key] ?? "";
}

function buildViolationsTable(violations = []) {
  if (!Array.isArray(violations) || !violations.length) {
    return `<p class="muted">No violations listed.</p>`;
  }
  const rows = violations.map((row) => `
    <tr>
      <td>${escapeHtml(row.name || row.codeCitation || "Item")}</td>
      <td>${escapeHtml(row.codeCitation || "")}</td>
      <td>${escapeHtml(row.severity || "")}</td>
      <td>${escapeHtml(row.status || "")}</td>
      <td>${escapeHtml(row.correctiveAction || row.description || "")}</td>
    </tr>
  `).join("");
  return `
    <table>
      <thead>
        <tr>
          <th>Violation</th>
          <th>Citation</th>
          <th>Severity</th>
          <th>Status</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

/**
 * @param {object} notice
 * @param {{ departmentName?: string, mergeValues?: object }} [context]
 */
export function buildNoticePrintHtml(notice = {}, context = {}) {
  const template = notice.templateSnapshot || {};
  const title = notice.title || template.name || "Inspection notice";
  const letterhead = template.letterheadTitle || context.departmentName || "Fire Prevention";
  const subtitle = template.letterheadSubtitle || title;
  const sections = Array.isArray(template.bodySections) ? template.bodySections : [];

  const sectionHtml = sections.map((section) => {
    const fields = (section.includeFields || [])
      .map((key) => {
        const value = resolveMergeValue(key, notice, context);
        if (!value && value !== 0) return "";
        return `<tr><th>${escapeHtml(fieldLabel(key))}</th><td>${escapeHtml(value)}</td></tr>`;
      })
      .filter(Boolean)
      .join("");

    const violationsBlock = section.includeViolations
      ? buildViolationsTable(notice.violationsSnapshot || [])
      : "";

    return `
      <section>
        <h2>${escapeHtml(section.title || "Section")}</h2>
        ${fields ? `<table><tbody>${fields}</tbody></table>` : ""}
        ${violationsBlock}
      </section>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: Georgia, "Times New Roman", serif; color: #111; margin: 36px; line-height: 1.45; }
      .letterhead { border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
      .letterhead h1 { margin: 0; font-size: 22px; letter-spacing: 0.02em; }
      .letterhead p { margin: 4px 0 0; color: #333; font-size: 14px; }
      .meta { margin: 0 0 18px; color: #444; font-size: 13px; }
      h2 { font-size: 15px; margin: 22px 0 8px; text-transform: uppercase; letter-spacing: 0.04em; }
      table { width: 100%; border-collapse: collapse; margin: 0 0 12px; font-size: 13px; }
      th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; vertical-align: top; }
      th { width: 28%; background: #f3f4f6; font-family: Arial, sans-serif; }
      .intro, .closing, .footer { font-size: 14px; }
      .footer { margin-top: 28px; border-top: 1px solid #ccc; padding-top: 10px; color: #555; font-size: 12px; }
      .muted { color: #666; font-style: italic; }
      @media print { body { margin: 16px; } }
    </style>
  </head>
  <body>
    <header class="letterhead">
      <h1>${escapeHtml(letterhead)}</h1>
      <p>${escapeHtml(subtitle)}</p>
    </header>
    <p class="meta">
      ${escapeHtml(notice.noticeNumber || "")}
      ${notice.issuedAt ? ` · Issued ${escapeHtml(formatDate(notice.issuedAt))}` : ""}
      ${notice.status ? ` · ${escapeHtml(String(notice.status))}` : ""}
    </p>
    ${template.introText ? `<p class="intro">${escapeHtml(template.introText)}</p>` : ""}
    ${sectionHtml}
    ${template.closingText ? `<p class="closing">${escapeHtml(template.closingText)}</p>` : ""}
    ${template.footerText ? `<p class="footer">${escapeHtml(template.footerText)}</p>` : ""}
  </body>
</html>`;
}

/**
 * Open a print window for the notice (browser Save as PDF).
 * @param {object} notice
 * @param {{ departmentName?: string }} [context]
 */
export function printNoticeRecord(notice = {}, context = {}) {
  if (typeof window === "undefined") return false;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return false;
  printWindow.document.write(buildNoticePrintHtml(notice, context));
  printWindow.document.close();
  printWindow.focus();
  printWindow.onload = () => {
    printWindow.print();
  };
  return true;
}
