/**
 * Client-side printable HTML for hydrant damage reports (preview / print-to-PDF).
 * Server PDFKit generation mirrors these fields on send.
 */

function esc(value = "") {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

/**
 * @param {object} report
 * @param {{ departmentName?: string, logoUrl?: string }} [branding]
 */
export function buildHydrantDamageReportHtml(report = {}, branding = {}) {
  const categories = Array.isArray(report.damageCategoryIds)
    ? report.damageCategoryIds.map((id) => String(id).replace(/_/g, " ")).join(", ")
    : "";
  const recipients = (report.recipientSnapshot || [])
    .map((row) => `${row.name || ""} <${row.email || ""}>`.trim())
    .filter(Boolean)
    .join("; ");

  const flags = [
    report.leaking ? "Leaking" : null,
    report.roadwayHazard ? "Roadway hazard" : null,
    report.publicSafetyHazard ? "Public safety hazard" : null,
    report.dispatchNotificationRequired ? "Dispatch notification required" : null,
    report.alternativeWaterSupplyRequired ? "Alternative water supply required" : null,
  ].filter(Boolean).join(" · ") || "None noted";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(report.reportNumber || "Hydrant Damage Report")}</title>
  <style>
    body { font-family: Inter, Segoe UI, Arial, sans-serif; color: #212529; margin: 32px; font-size: 13px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    h2 { margin: 22px 0 8px; font-size: 15px; color: #145d55; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
    .muted { color: #6c757d; }
    .banner { display: inline-block; padding: 6px 10px; border-radius: 6px; background: #e6f7f5; color: #145d55; font-weight: 700; margin: 8px 0 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; }
    .label { color: #6c757d; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
    .value { font-weight: 600; }
    .block { white-space: pre-wrap; line-height: 1.45; }
    footer { margin-top: 28px; font-size: 11px; color: #6c757d; }
  </style>
</head>
<body>
  <header>
    <div class="muted">${esc(branding.departmentName || "Fire Department")}</div>
    <h1>Hydrant Damage Report</h1>
    <div class="muted">${esc(report.reportNumber)} · Rev ${esc(report.recordVersion || 1)}</div>
    <div class="banner">${esc(report.severityLabel || report.severity)} · ${esc(report.operationalStatusLabel || report.operationalStatus)}</div>
  </header>

  <h2>Hydrant</h2>
  <div class="grid">
    <div><div class="label">Hydrant ID</div><div class="value">${esc(report.hydrantLabel)}</div></div>
    <div><div class="label">Address</div><div class="value">${esc(report.hydrantAddress || "—")}</div></div>
    <div><div class="label">Water company</div><div class="value">${esc(report.waterCompanyName || "—")}</div></div>
    <div><div class="label">Assignment</div><div class="value">${esc(report.assignmentSource || "—")} (${Math.round((report.assignmentConfidence || 0) * 100)}%)</div></div>
  </div>

  <h2>Damage summary</h2>
  <div class="grid">
    <div><div class="label">Discovered</div><div class="value">${esc(formatWhen(report.discoveredAt))} by ${esc(report.discoveredBy || "—")}</div></div>
    <div><div class="label">Categories</div><div class="value">${esc(categories || "—")}</div></div>
    <div><div class="label">Flags</div><div class="value">${esc(flags)}</div></div>
    <div><div class="label">Requested response</div><div class="value">Ack by ${esc(formatWhen(report.acknowledgmentDueAt))} · Repair target ${esc(formatWhen(report.repairTargetAt))}</div></div>
  </div>

  <h2>Description</h2>
  <div class="block">${esc(report.description || "—")}</div>

  <h2>Immediate actions</h2>
  <div class="block">${esc(report.immediateActions || "—")}</div>

  <h2>Utility-facing notes</h2>
  <div class="block">${esc(report.utilityFacingNotes || "—")}</div>

  <h2>Recipients</h2>
  <div class="block">${esc(recipients || "—")}</div>

  <footer>
    Generated ${esc(formatWhen(new Date().toISOString()))}.
    Internal notes are intentionally excluded from this external report.
    Audit id: ${esc(report.id)}.
  </footer>
</body>
</html>`;
}

/**
 * @param {object} report
 * @param {{ departmentName?: string }} [branding]
 */
export function openHydrantDamageReportPrintPreview(report, branding = {}) {
  const html = buildHydrantDamageReportHtml(report, branding);
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!win) throw new Error("Pop-up blocked. Allow pop-ups to preview the PDF.");
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try { win.print(); } catch { /* ignore */ }
  }, 250);
}

/**
 * @param {object} report
 */
export function buildHydrantDamageEmailPreview(report = {}) {
  const subject = (report.preferredSubjectFormat
    || "Hydrant Damage Report {reportNumber} — {hydrantId}")
    .replace("{reportNumber}", report.reportNumber || "")
    .replace("{hydrantId}", report.hydrantLabel || "");

  const to = (report.recipientSnapshot || []).map((row) => row.email).filter(Boolean);
  const body = [
    `Report: ${report.reportNumber || ""}`,
    `Hydrant: ${report.hydrantLabel || ""}`,
    `Address: ${report.hydrantAddress || ""}`,
    `Severity: ${report.severityLabel || report.severity || ""}`,
    `Operational status: ${report.operationalStatusLabel || report.operationalStatus || ""}`,
    "",
    report.description || "",
    "",
    "A PDF damage report is attached.",
    "Please acknowledge receipt and provide a work-order number when available.",
  ].join("\n");

  return { subject, to, body };
}
