/**
 * The facts the AI narrative writer may see from a patient care report (pure; unit tested; also bundled into
 * Cloud Functions, where the draftPcrNarrative callable builds them from the saved report).
 *
 * De-identified on purpose (in the spirit of HIPAA Safe Harbor):
 *   - no names, addresses, cities, ZIP codes, GPS, phone numbers, IDs, record or incident numbers
 *   - no dates: times are given as clock time only (14:32); dates of birth are never read
 *   - age only, with 90 and over grouped as "90 or older"
 *   - free text is left out, except the chief complaint (scrubbed again on the server)
 * Only coded clinical fields (pick lists), numbers (vitals, doses) and clock times from clinical sections are read.
 */
import { PCR_SECTIONS, getLeaf, groupRows, sectionLayout } from "./pcrModel.js";
import { readLeaf } from "./schema.js";

/** Sections the writer may read. Everything else (patient identity, billing, crew, signatures, outcome) stays out. */
const SECTIONS = ["dispatch", "response", "times", "scene", "situation", "injury", "arrest", "history", "vitals", "exam", "labs", "protocols", "medications", "procedures", "airway", "disposition"];

/** Scene: only what kind of place and how many patients, never where. */
const SCENE_ALLOW = new Set(["eScene.01", "eScene.06", "eScene.07", "eScene.08", "eScene.09"]);
/** Free-text fields allowed through (codes or short clinical text). */
const TEXT_ALLOW = new Set(["eSituation.04", "eMedications.03", "eProcedures.03"]);
/** Names for common EMS medication (RxNorm) and procedure (SNOMED CT) codes, so drafts read as words. */
const CODE_NAMES = {
  "eMedications.03": {
    161: "acetaminophen", 296: "adenosine", 435: "albuterol", 703: "amiodarone", 1191: "aspirin", 1223: "atropine",
    1901: "calcium chloride", 3322: "diazepam", 3498: "diphenhydramine", 3992: "epinephrine", 4337: "fentanyl",
    4832: "glucagon", 4850: "dextrose", 4917: "nitroglycerin", 5640: "ibuprofen", 6130: "ketamine", 6387: "lidocaine",
    6470: "lorazepam", 6585: "magnesium sulfate", 6902: "methylprednisolone", 6960: "midazolam", 7052: "morphine",
    7213: "ipratropium", 7242: "naloxone", 7806: "oxygen", 9863: "sodium chloride", 10691: "tranexamic acid",
    26225: "ondansetron", 35827: "ketorolac", 36676: "sodium bicarbonate",
  },
  "eProcedures.03": { 268400002: "12-lead ECG", 89666000: "CPR", 112798008: "endotracheal intubation" },
};
const MAX_LINES_PER_SECTION = 80;
const MAX_LINES = 400;

const clip = (value, max = 200) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** "2026-11-17T14:32:05-06:00" → "14:32" (no date). */
export function clockTime(value) {
  const m = /T(\d{2}):(\d{2})/.exec(String(value ?? ""));
  return m ? `${m[1]}:${m[2]}` : "";
}

function allowed(sectionId, field) {
  if (sectionId === "scene") return SCENE_ALLOW.has(field.el);
  if (field.kind === "date" || field.kind === "file") return false;
  if (field.kind === "text" || field.kind === "textarea") return TEXT_ALLOW.has(field.el);
  return true;
}

function describe(field, raw) {
  const label = (code) => field.options?.find((o) => o.code === String(code))?.label ?? String(code);
  const pn = (code) => field.pn?.find((o) => o.code === String(code))?.label ?? String(code);
  const values = Array.isArray(raw) ? raw : [raw];
  const parts = [];
  for (const entry of values) {
    const leaf = readLeaf(entry);
    if (leaf.NV) continue;
    if (leaf.PN) {
      parts.push(`none (${pn(leaf.PN)})`);
      continue;
    }
    if (leaf.value === undefined || leaf.value === null || leaf.value === "") continue;
    if (field.kind === "datetime") parts.push(clockTime(leaf.value));
    else if (field.options) parts.push(label(leaf.value));
    else if (CODE_NAMES[field.el]?.[leaf.value]) parts.push(`${CODE_NAMES[field.el][leaf.value]} (code ${clip(leaf.value, 20)})`);
    else parts.push(clip(leaf.value));
  }
  return parts.filter(Boolean).join(", ");
}

function sectionLines(schema, pcr, sectionId) {
  const lines = [];
  const walk = (items, at, prefix) => {
    for (const item of items) {
      if (lines.length >= MAX_LINES_PER_SECTION) return;
      if (item.type === "field") {
        if (!allowed(sectionId, item.field)) continue;
        const value = describe(item.field, getLeaf(schema, pcr, item.field.el, at));
        if (value) lines.push(`${prefix}${item.field.label}: ${value}`);
        continue;
      }
      if (!item.repeating) {
        walk(item.children, at, prefix);
        continue;
      }
      const rows = groupRows(schema, pcr, item.name, at);
      rows.forEach((_, index) => {
        walk(item.children, { ...at, [item.name]: index }, `${prefix}${item.label}${rows.length > 1 ? ` ${index + 1}` : ""} · `);
      });
    }
  };
  walk(sectionLayout(schema, sectionId), {}, "");
  return lines;
}

/** Age as the writer sees it: "54 years", "8 months", "90 or older". */
function patientAge(schema, pcr) {
  const age = Number(readLeaf(getLeaf(schema, pcr, "ePatient.15")).value);
  if (!Number.isFinite(age) || age < 0) return "";
  const unitsCode = readLeaf(getLeaf(schema, pcr, "ePatient.16")).value;
  const units = unitsCode ? String(schema.codeLabel("ePatient.16", unitsCode, "EMSDataSet") ?? "").toLowerCase() : "years";
  if (/year/.test(units) && age >= 90) return "90 or older";
  return `${age} ${units || "years"}`.trim();
}

function patientGender(schema, pcr) {
  const code = readLeaf(getLeaf(schema, pcr, "ePatient.13")).value;
  return code ? String(schema.codeLabel("ePatient.13", code, "EMSDataSet") ?? "") : "";
}

/**
 * @param {object} schema
 * @param {object} pcr the NEMSIS PatientCareReport document
 * @returns {{ patient: { age?: string, gender?: string }, sections: { section: string, lines: string[] }[] }}
 */
export function pcrNarrativeFacts(schema, pcr) {
  const nemsis = pcr || {};
  const sections = [];
  let total = 0;
  for (const id of SECTIONS) {
    if (total >= MAX_LINES) break;
    const lines = sectionLines(schema, nemsis, id).slice(0, MAX_LINES - total);
    if (!lines.length) continue;
    total += lines.length;
    sections.push({ section: PCR_SECTIONS.find((s) => s.id === id)?.label || id, lines });
  }
  const patient = {};
  const age = patientAge(schema, nemsis);
  if (age) patient.age = age;
  const gender = patientGender(schema, nemsis);
  if (gender) patient.gender = gender;
  return { patient, sections };
}

/**
 * A plain draft from the same facts, without AI (offline, or when the department hasn't switched AI on).
 * Chronological: dispatch, arrival, assessment, treatment, disposition.
 */
export function quickPcrNarrative(facts) {
  const find = (name) => facts.sections.find((s) => s.section === name)?.lines || [];
  const value = (line) => (line ? line.slice(line.lastIndexOf(": ") + 2) : "");
  const first = (name, pattern) => value(find(name).find((line) => pattern.test(line)));
  const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);
  /** Lines of a repeating section as one sentence per row: "14:14: Heart Rate 96, Respiratory Rate 18". */
  const rowsOf = (lines) => {
    const rows = new Map();
    for (const line of lines) {
      const cut = line.lastIndexOf(" · ");
      const key = cut >= 0 ? line.slice(0, cut) : "";
      const rest = cut >= 0 ? line.slice(cut + 3) : line;
      if (!rows.has(key)) rows.set(key, { time: "", items: [] });
      const row = rows.get(key);
      const [label, ...v] = rest.split(": ");
      if (/Date\/Time/.test(label)) row.time ||= v.join(": ");
      else if (!/Prior to this Unit/i.test(label)) row.items.push(`${label.replace(/ \(.*\)$/, "")} ${v.join(": ")}`);
    }
    return [...rows.values()].filter((r) => r.items.length).map((r) => `${r.time ? `At ${r.time}: ` : ""}${r.items.join(", ")}.`);
  };

  const parts = [];
  const notified = first("Times", /Unit Notified/i);
  const onScene = first("Times", /Arrived on Scene/i);
  const atPatient = first("Times", /Arrived at Patient/i);
  const dispatch = first("Dispatch", /Dispatch Reason/i);
  parts.push([
    `Unit ${notified ? `notified at ${notified}` : "dispatched"}${dispatch ? ` for ${dispatch.toLowerCase()}` : ""}`,
    onScene ? `, arrived on scene at ${onScene}` : "",
    atPatient ? ` and at the patient at ${atPatient}` : "",
    ".",
  ].join(""));

  const age = /^(\d+) years$/.exec(facts.patient.age || "");
  const who = [age ? `${age[1]}-year-old` : facts.patient.age, facts.patient.gender?.toLowerCase()].filter(Boolean).join(" ");
  const complaint = first("Situation", /(^|· )Complaint: /);
  const impression = first("Situation", /Primary Impression/i);
  parts.push(`Found ${who ? `a ${who}` : "the patient"}${complaint ? ` complaining of ${lower(complaint)}` : ""}.${impression ? ` Primary impression: ${impression}.` : ""}`);

  const vitals = rowsOf(find("Vitals"));
  if (vitals.length) parts.push(`Vital signs. ${vitals.join(" ")}`);
  const treatment = rowsOf([...find("Medications"), ...find("Procedures"), ...find("Airway")]);
  if (treatment.length) parts.push(`Treatment. ${treatment.join(" ")}`);
  const disposition = find("Disposition").map((line) => `${line.split(": ")[0]}: ${value(line)}`);
  const leftScene = first("Times", /Left Scene/i);
  const atDestination = first("Times", /Arrived at Destination/i);
  if (disposition.length || leftScene) {
    parts.push([
      disposition.slice(0, 6).join(". "),
      leftScene ? `. Left the scene at ${leftScene}` : "",
      atDestination ? ` and arrived at the destination at ${atDestination}` : "",
      ".",
    ].join("").replace(/^\. /, ""));
  }
  return parts.join("\n\n");
}
