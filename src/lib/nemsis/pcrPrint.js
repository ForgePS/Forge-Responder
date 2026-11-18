/**
 * Printable patient care report: a standalone HTML document built from the charted sections (sectionReadout), for
 * the RMS Print button. Pure; every value is escaped. Contains PHI: only for people who may read the report.
 */
import { PCR_SECTIONS, pcrSummary, sectionReadout } from "./pcrModel.js";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

function defaultWhen(value) {
  const t = Date.parse(value);
  return Number.isNaN(t) ? String(value) : new Date(t).toLocaleString();
}

function itemsHtml(items, when) {
  return items.map((item) => {
    if (item.type === "field") {
      const values = item.kind === "datetime" ? item.values.map(when) : item.values;
      // item.image is a data: URL built only from a safe image type and base64 characters (graphicDataUrl).
      const value = item.image ? `<img class="sig" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.label)}">` : values.map(escapeHtml).join(", ");
      return `<div class="f"><dt>${escapeHtml(item.label)}</dt><dd>${value}</dd></div>`;
    }
    const rows = item.rows.map((row, i) => `<div class="row">${item.rows.length > 1 ? `<span class="n">#${i + 1}</span>` : ""}<dl>${itemsHtml(row, when)}</dl></div>`);
    return `<div class="g"><dt>${escapeHtml(item.label)}</dt><dd>${rows.join("")}</dd></div>`;
  }).join("");
}

/**
 * @param {object} schema
 * @param {object} pcr server document ({ number, status, unit, incidentNumber, postedAt, postedByName, nemsis, ... })
 * @param {{ agencyName?: string, printedBy?: string, printedAt?: string, when?: (iso: string) => string }} [options]
 * @returns {string} a complete HTML document
 */
export function pcrPrintHtml(schema, pcr, options = {}) {
  const when = options.when ?? defaultWhen;
  const nemsis = pcr?.nemsis ?? {};
  const summary = pcrSummary(schema, nemsis);
  const number = pcr?.number || summary.number || pcr?.id || "";
  const sections = PCR_SECTIONS
    .map((section) => ({ section, items: sectionReadout(schema, nemsis, section.id) }))
    .filter((s) => s.items.length);
  const status = pcr?.status === "posted"
    ? `Posted ${pcr.postedAt ? when(pcr.postedAt) : ""}${pcr.postedByName ? ` by ${pcr.postedByName}` : ""}`
    : "DRAFT — not posted";
  const facts = [
    ["Agency", options.agencyName],
    ["Unit", pcr?.unit],
    ["Incident", pcr?.incidentNumber],
    ["Patient", summary.patient],
    ["Status", status],
  ].filter(([, v]) => v);
  const footer = `Printed ${escapeHtml(options.printedAt ? when(options.printedAt) : "")}${options.printedBy ? ` by ${escapeHtml(options.printedBy)}` : ""}. Contains protected health information.`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Patient care report ${escapeHtml(number)}</title>
<style>
  body { font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 13px; margin: 16px 0 6px; padding-bottom: 2px; border-bottom: 1px solid #999; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 0 0 8px; }
  .facts span b { font-weight: 600; }
  dl { margin: 0; }
  .f { display: grid; grid-template-columns: 38% 1fr; gap: 8px; padding: 1px 0; break-inside: avoid; }
  dt { color: #444; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .g > dt { font-weight: 600; color: #111; margin-top: 4px; }
  .g > dd { padding-left: 10px; border-left: 2px solid #ccc; }
  .row + .row { margin-top: 4px; padding-top: 4px; border-top: 1px dashed #ccc; }
  .n { color: #666; font-size: 11px; }
  .sig { width: 240px; height: 80px; object-fit: contain; border-bottom: 1px solid #333; }
  .draft { color: #a00; font-weight: 700; }
  footer { margin-top: 18px; color: #555; font-size: 11px; }
  @page { margin: 14mm; }
</style></head>
<body>
<h1>Patient care report ${escapeHtml(number)}</h1>
<div class="facts">${facts.map(([k, v]) => `<span${k === "Status" && pcr?.status !== "posted" ? ' class="draft"' : ""}><b>${escapeHtml(k)}:</b> ${escapeHtml(v)}</span>`).join("")}</div>
${sections.map(({ section, items }) => `<section><h2>${escapeHtml(section.label)}</h2><dl>${itemsHtml(items, when)}</dl></section>`).join("\n")}
${sections.length ? "" : "<p>Nothing has been charted on this report.</p>"}
<footer>${footer}</footer>
</body></html>`;
}
