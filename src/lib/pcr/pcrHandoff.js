/**
 * Hospital handoff summary: the short version of a patient care report for the receiving staff (pure; unit tested).
 *
 * Only what is charted, in a fixed order: patient, complaint and impression, history and allergies, the last vital
 * sets, medications, procedures, key times, transport. Contains PHI; printed from the RMS by people who can read the
 * report (the print is audit-logged). It is not a submission and doesn't change the report.
 */
import { fieldInput, getLeaf, groupRows, leafText } from "../nemsis/pcrModel.js";
import { CODE_NAMES, clockTime } from "../nemsis/pcrNarrativeFacts.js";

const VITALS = "eVitals.VitalGroup";
const MEDS = "eMedications.MedicationGroup";
const PROCS = "eProcedures.ProcedureGroup";

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function text(schema, pcr, el, at = {}) {
  const field = fieldInput(schema, el);
  if (!field) return "";
  const raw = getLeaf(schema, pcr, el, at);
  if (field.kind === "datetime") return leafText(field, raw).map(clockTime).filter(Boolean).join(", ");
  const names = CODE_NAMES[el];
  return leafText(field, raw).map((v) => names?.[v] || v).join(", ");
}

/** @returns {{ patient, complaint, impression, secondary, history, allergies, currentMeds, vitals, medications, procedures, times, transport }} */
export function handoffSummary(schema, report) {
  const pcr = report?.nemsis || {};
  const t = (el, at) => text(schema, pcr, el, at);
  const name = [t("ePatient.03"), t("ePatient.02")].filter(Boolean).join(" ");
  const ageUnits = t("ePatient.16");
  const vitals = groupRows(schema, pcr, VITALS).map((_, i) => {
    const at = { [VITALS]: i };
    const bp = [t("eVitals.06", at), t("eVitals.07", at)].filter(Boolean).join("/");
    const parts = [
      bp && `BP ${bp}`, t("eVitals.10", at) && `HR ${t("eVitals.10", at)}`, t("eVitals.14", at) && `RR ${t("eVitals.14", at)}`,
      t("eVitals.12", at) && `SpO2 ${t("eVitals.12", at)}%`, t("eVitals.16", at) && `ETCO2 ${t("eVitals.16", at)}`,
      t("eVitals.18", at) && `BGL ${t("eVitals.18", at)}`, t("eVitals.23", at) && `GCS ${t("eVitals.23", at)}`,
      t("eVitals.27", at) && `Pain ${t("eVitals.27", at)}/10`, t("eVitals.03", at) && `ECG ${t("eVitals.03", at)}`,
    ].filter(Boolean);
    return { time: t("eVitals.01", at), raw: String(getLeaf(schema, pcr, "eVitals.01", at)?.value ?? getLeaf(schema, pcr, "eVitals.01", at) ?? ""), text: parts.join(" · ") };
  }).filter((v) => v.text).sort((a, b) => a.raw.localeCompare(b.raw)).slice(-3).map(({ time, text: line }) => ({ time, text: line }));
  const medications = groupRows(schema, pcr, MEDS).map((_, i) => {
    const at = { [MEDS]: i };
    const dose = [t("eMedications.05", at), t("eMedications.06", at)].filter(Boolean).join(" ");
    return { time: t("eMedications.01", at), text: [t("eMedications.03", at), dose, t("eMedications.04", at)].filter(Boolean).join(" · "), response: t("eMedications.07", at) };
  }).filter((m) => m.text);
  const procedures = groupRows(schema, pcr, PROCS).map((_, i) => {
    const at = { [PROCS]: i };
    const success = t("eProcedures.06", at);
    return { time: t("eProcedures.01", at), text: [t("eProcedures.03", at), success && `successful: ${success}`].filter(Boolean).join(" · "), response: t("eProcedures.08", at) };
  }).filter((p) => p.text);
  const times = [["eTimes.06", "On scene"], ["eTimes.07", "At patient"], ["eTimes.09", "Left scene"], ["eTimes.11", "At destination"]]
    .map(([el, label]) => ({ label, time: t(el) })).filter((x) => x.time);
  return {
    number: report?.number || "",
    unit: report?.unit || "",
    patient: {
      name: name || "Not identified",
      age: t("ePatient.15") ? `${t("ePatient.15")} ${ageUnits || ""}`.trim() : "",
      gender: t("ePatient.13"),
      weight: t("eExam.01") ? `${t("eExam.01")} kg` : "",
    },
    complaint: groupRows(schema, pcr, "eSituation.PatientComplaintGroup").map((_, i) => t("eSituation.04", { "eSituation.PatientComplaintGroup": i })).filter(Boolean).join("; "),
    onset: t("eSituation.01"),
    impression: t("eSituation.11"),
    secondary: t("eSituation.12"),
    arrest: t("eArrest.01"),
    history: t("eHistory.08"),
    allergies: t("eHistory.06"),
    currentMeds: groupRows(schema, pcr, "eHistory.CurrentMedsGroup").map((_, i) => t("eHistory.12", { "eHistory.CurrentMedsGroup": i })).filter(Boolean).join(", "),
    vitals,
    medications,
    procedures,
    times,
    transport: {
      destination: t("eDisposition.01"),
      type: t("eDisposition.21"),
      disposition: t("eDisposition.30"),
      mode: t("eDisposition.17"),
    },
  };
}

/** A printable page from handoffSummary. Every value is escaped. */
export function handoffHtml(summary, { agencyName = "", printedBy = "", printedAt = "" } = {}) {
  const e = escapeHtml;
  const row = (label, value) => (value ? `<tr><th>${e(label)}</th><td>${e(value)}</td></tr>` : "");
  const list = (items) => (items.length
    ? `<ul>${items.map((i) => `<li>${i.time ? `<b>${e(i.time)}</b> ` : ""}${e(i.text)}${i.response ? ` <i>(${e(i.response)})</i>` : ""}</li>`).join("")}</ul>`
    : "<p class=\"none\">None charted</p>");
  const p = summary.patient;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Handoff ${e(summary.number)}</title>
<style>
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;color:#111;margin:24px;max-width:780px}
h1{font-size:20px;margin:0 0 2px}h2{font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:#444;border-bottom:1px solid #ccc;padding-bottom:3px;margin:16px 0 6px}
.meta{color:#555;font-size:12px}table{border-collapse:collapse;width:100%}th{text-align:left;width:34%;color:#444;font-weight:600;padding:2px 8px 2px 0;vertical-align:top}td{padding:2px 0}
ul{margin:0;padding-left:18px}li{margin:2px 0}.none{color:#777;margin:0}.phi{margin-top:20px;font-size:11px;color:#555;border-top:1px solid #ccc;padding-top:6px}
@media print{body{margin:12mm}}
</style></head><body>
<h1>Patient handoff</h1>
<div class="meta">${e(agencyName)}${summary.unit ? ` · ${e(summary.unit)}` : ""} · Report ${e(summary.number)}</div>
<h2>Patient</h2><table>${row("Name", p.name)}${row("Age", p.age)}${row("Gender", p.gender)}${row("Weight", p.weight)}</table>
<h2>Presentation</h2><table>${row("Chief complaint", summary.complaint)}${row("Onset", summary.onset)}${row("Primary impression", summary.impression)}${row("Secondary impressions", summary.secondary)}${row("Cardiac arrest", summary.arrest)}</table>
<h2>History</h2><table>${row("Medical history", summary.history)}${row("Allergies", summary.allergies)}${row("Current medications", summary.currentMeds)}</table>
${summary.history || summary.allergies || summary.currentMeds ? "" : "<p class=\"none\">None charted</p>"}
<h2>Recent vital signs</h2>${list(summary.vitals)}
<h2>Medications given</h2>${list(summary.medications)}
<h2>Procedures</h2>${list(summary.procedures)}
<h2>Times</h2>${summary.times.length ? `<table>${summary.times.map((x) => row(x.label, x.time)).join("")}</table>` : "<p class=\"none\">None charted</p>"}
<h2>Transport</h2><table>${row("Destination", summary.transport.destination)}${row("Destination type", summary.transport.type)}${row("Transport", summary.transport.disposition)}${row("Mode from scene", summary.transport.mode)}</table>
<p class="phi">Contains protected health information. For the receiving care team only. This summary is not the complete patient care report.${printedBy ? ` Printed by ${e(printedBy)}` : ""}${printedAt ? ` ${e(printedAt)}` : ""}.</p>
</body></html>`;
}
