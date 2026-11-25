/**
 * Printable QR labels for EMS equipment. Each label's QR code holds the
 * equipment's address in this app (equipmentUrl), so scanning it with the
 * in-app scanner or a phone's own camera opens the record. The equipment ID is
 * printed under the code for typing in when a label is worn.
 */
import QRCode from "qrcode";
import { equipmentUrl } from "./equipmentDisplay.js";

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function equipmentQrDataUrl(equipmentId, width = 240) {
  return QRCode.toDataURL(equipmentUrl(equipmentId), { width, margin: 1, errorCorrectionLevel: "M" });
}

/** The label sheet as a complete HTML document (one label per record). */
export async function buildLabelSheet(records = [], departmentName = "") {
  const labels = await Promise.all(records.map(async (r) => ({ r, qr: await equipmentQrDataUrl(r.id) })));
  const body = labels.map(({ r, qr }) => `
    <div class="label">
      <img src="${qr}" alt="" />
      <div class="text">
        <strong>${escapeHtml(r.name)}</strong>
        <span class="id">${escapeHtml(r.assetNumber || r.id)}</span>
        ${r.serialNumber ? `<span>S/N ${escapeHtml(r.serialNumber)}</span>` : ""}
        ${departmentName ? `<span class="dept">${escapeHtml(departmentName)}</span>` : ""}
      </div>
    </div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Equipment labels</title>
<style>
  @page { margin: 10mm; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; color: #000; background: #fff; }
  .sheet { display: grid; grid-template-columns: repeat(auto-fill, 66mm); gap: 4mm; }
  .label { display: flex; gap: 3mm; align-items: center; border: 1px dashed #999; border-radius: 2mm; padding: 2mm; height: 28mm; box-sizing: border-box; break-inside: avoid; }
  .label img { width: 24mm; height: 24mm; flex: none; }
  .text { display: grid; gap: 1mm; font-size: 8pt; min-width: 0; }
  .text strong { font-size: 9pt; line-height: 1.15; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
  .id { font-family: "Courier New", monospace; font-size: 10pt; font-weight: bold; }
  .dept { color: #444; }
  .hint { font-size: 10pt; margin: 0 0 6mm; }
  @media print { .hint { display: none; } .label { border-color: #ccc; } }
</style></head><body>
<p class="hint">Print on label stock or plain paper. Scan with the EMS Equipment scanner or a phone camera.</p>
<div class="sheet">${body}</div>
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 200); });</script>
</body></html>`;
}

/**
 * Open the label sheet in a new window and print it. The window is opened
 * straight from the click (so pop-up blockers allow it), then filled.
 */
export async function printLabels(records, departmentName) {
  const win = window.open("", "_blank");
  if (!win) throw new Error("Allow pop-ups for this site to print labels.");
  win.document.write("<p style=\"font-family:sans-serif\">Preparing labels…</p>");
  try {
    const html = await buildLabelSheet(records, departmentName);
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (error) {
    win.close();
    throw error;
  }
}
