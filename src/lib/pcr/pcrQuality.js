/**
 * Documentation review for a patient care report (pure; unit tested; no AI).
 *
 * Feedback comes in three kinds that are never mixed up:
 *   - "nemsis":     NEMSIS validation (pcrModel postCheck, server XSD/Schematron). Errors block posting.
 *   - "agency":     the department's own requirements (pcrForm departmentIssues). Block posting.
 *   - "suggestion": documentation suggestions from the checks below. Never block; each can be dismissed.
 *
 * Suggestions only point at what is charted (or missing). They never change the report, never assume a finding,
 * and are worded as "check" or "may", because the crew knows what happened and the checks don't.
 *
 * Vital-sign flags are informational reference ranges (adult / pediatric by age), not clinical decisions. Values far
 * outside what is physiologically possible are flagged as a likely typo.
 */
import { fieldPath, getLeaf, groupRows } from "../nemsis/pcrModel.js";
import { CODE_NAMES } from "../nemsis/pcrNarrativeFacts.js";
import { readLeaf } from "../nemsis/schema.js";

export const FEEDBACK_KINDS = Object.freeze({
  nemsis: { label: "NEMSIS validation", blocks: true },
  agency: { label: "Department requirement", blocks: true },
  suggestion: { label: "Documentation suggestion", blocks: false },
});

const VITALS = "eVitals.VitalGroup";
const MEDS = "eMedications.MedicationGroup";
const PROCS = "eProcedures.ProcedureGroup";
const SIGNATURES = "eOther.SignatureGroup";

// NEMSIS 3.5.1 codes (eDisposition.27 / .28 / .30, eArrest.01), from the official enumerations.
const CONTACT_MADE = "4227001";
const TRANSPORT_BY_THIS_UNIT = new Set(["4230001", "4230003"]);
const NO_TRANSPORT = new Set(["4230009", "4230013"]);
const REFUSED = new Set(["4228003", "4228007"]);
const REFUSED_TRANSPORT = "4230009";
const ARREST_NO = "3001001";

const value = (schema, pcr, el, at) => {
  const leaf = readLeaf(getLeaf(schema, pcr, el, at));
  return leaf.NV || leaf.PN ? "" : leaf.value ?? "";
};
const values = (schema, pcr, el, at) => {
  const raw = getLeaf(schema, pcr, el, at);
  return (Array.isArray(raw) ? raw : [raw]).map((entry) => readLeaf(entry)).filter((l) => !l.NV && !l.PN && l.value !== undefined && l.value !== "").map((l) => String(l.value));
};
const hasAny = (schema, pcr, group, at, els) => els.some((el) => value(schema, pcr, el, at) !== "");

// ---------------------------------------------------------------------------------------------------------------
// Vital signs
// ---------------------------------------------------------------------------------------------------------------

/** What each vital is called and where it lives. Limits: [low, high] usual range; [min, max] possible at all. */
const VITAL_FIELDS = [
  { el: "eVitals.06", name: "Systolic BP", possible: [20, 320] },
  { el: "eVitals.07", name: "Diastolic BP", possible: [5, 250] },
  { el: "eVitals.10", name: "Heart rate", possible: [0, 350] },
  { el: "eVitals.14", name: "Respiratory rate", possible: [0, 90] },
  { el: "eVitals.12", name: "SpO2", possible: [20, 100] },
  { el: "eVitals.16", name: "ETCO2", possible: [0, 150] },
  { el: "eVitals.18", name: "Blood glucose", possible: [10, 1500] },
  { el: "eVitals.24", name: "Temperature (°C)", possible: [20, 46] },
  { el: "eVitals.27", name: "Pain score", possible: [0, 10] },
];

/**
 * Informational reference ranges by age band. Departments can replace these (settings/emsForm.vitalRanges, same
 * shape) to match their own protocols.
 */
export const DEFAULT_VITAL_RANGES = Object.freeze({
  adult: { "eVitals.06": [90, 180], "eVitals.10": [50, 120], "eVitals.14": [10, 28], "eVitals.12": [92, 100], "eVitals.16": [30, 50], "eVitals.18": [70, 300], "eVitals.24": [35, 39] },
  child: { "eVitals.06": [80, 130], "eVitals.10": [70, 150], "eVitals.14": [16, 40], "eVitals.12": [92, 100], "eVitals.18": [60, 250], "eVitals.24": [35, 39] },
  infant: { "eVitals.06": [65, 110], "eVitals.10": [100, 190], "eVitals.14": [25, 60], "eVitals.12": [92, 100], "eVitals.18": [45, 250], "eVitals.24": [35.5, 38.5] },
});

/** Age band from ePatient.15/.16 (units: years, months, days, hours, minutes). Unknown age → adult ranges. */
export function ageBand(schema, pcr) {
  const age = Number(value(schema, pcr, "ePatient.15"));
  const unitsCode = value(schema, pcr, "ePatient.16");
  if (!Number.isFinite(age) || age < 0) return "adult";
  const units = unitsCode ? String(schema.codeLabel("ePatient.16", unitsCode, "EMSDataSet") ?? "").toLowerCase() : "years";
  if (/year/.test(units)) return age < 1 ? "infant" : age < 13 ? "child" : "adult";
  if (/month/.test(units)) return age < 12 ? "infant" : "child";
  return "infant";
}

/**
 * Flags for every vital set: [{ row, el, name, value, kind: "typo" | "range", message, path }].
 * Nothing is changed; a flag asks the crew to check the value.
 */
export function vitalFlags(schema, pcr, { ranges = DEFAULT_VITAL_RANGES } = {}) {
  const band = ageBand(schema, pcr);
  const limits = ranges[band] || DEFAULT_VITAL_RANGES[band] || {};
  const flags = [];
  groupRows(schema, pcr, VITALS).forEach((_, row) => {
    const at = { [VITALS]: row };
    for (const vital of VITAL_FIELDS) {
      const raw = value(schema, pcr, vital.el, at);
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      const path = fieldPath(schema, vital.el, at);
      const [min, max] = vital.possible;
      if (n < min || n > max) {
        flags.push({ row, el: vital.el, name: vital.name, value: n, kind: "typo", path, message: `${vital.name} ${n} in vital set ${row + 1} is outside what's possible. Check for a typo.` });
        continue;
      }
      const range = limits[vital.el];
      if (range && (n < range[0] || n > range[1])) {
        flags.push({ row, el: vital.el, name: vital.name, value: n, kind: "range", path, message: `${vital.name} ${n} in vital set ${row + 1} is ${n < range[0] ? "below" : "above"} the usual ${band} range (${range[0]}–${range[1]}). Confirm it's right.` });
      }
    }
  });
  return flags;
}

/** Vital sets as rows for a trend chart: [{ time, values: { el: number } }], in time order. */
export function vitalTrend(schema, pcr) {
  const rows = groupRows(schema, pcr, VITALS).map((_, row) => {
    const at = { [VITALS]: row };
    const out = {};
    for (const vital of VITAL_FIELDS) {
      const n = Number(value(schema, pcr, vital.el, at));
      if (value(schema, pcr, vital.el, at) !== "" && Number.isFinite(n)) out[vital.el] = n;
    }
    return { row, time: value(schema, pcr, "eVitals.01", at), values: out };
  });
  return rows.filter((r) => Object.keys(r.values).length).sort((a, b) => String(a.time).localeCompare(String(b.time)));
}
export const TREND_VITALS = VITAL_FIELDS.filter((v) => ["eVitals.06", "eVitals.10", "eVitals.14", "eVitals.12", "eVitals.16"].includes(v.el));

// ---------------------------------------------------------------------------------------------------------------
// Documentation suggestions
// ---------------------------------------------------------------------------------------------------------------

/** Times that should run in this order when present (NEMSIS eTimes). */
const TIME_ORDER = [
  ["eTimes.03", "Unit notified"], ["eTimes.05", "En route"], ["eTimes.06", "On scene"], ["eTimes.07", "At patient"],
  ["eTimes.09", "Left scene"], ["eTimes.11", "At destination"], ["eTimes.12", "Transfer of care"], ["eTimes.13", "Back in service"],
];

const MED_NAMES = Object.entries(CODE_NAMES["eMedications.03"] || {}).map(([code, name]) => ({ code, name }))
  .filter((m) => m.name !== "oxygen" && m.name !== "sodium chloride");

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function suggestion(code, message, { schema, el, at, key = "" }) {
  return {
    id: `${code}${key ? `:${key}` : ""}`,
    kind: "suggestion",
    code,
    severity: "info",
    blocking: false,
    message,
    element: el || "",
    path: el ? fieldPath(schema, el, at || {}) : "",
  };
}

/**
 * Documentation suggestions for a report. `options.ranges` overrides the vital reference ranges.
 * @returns {Array<{id, kind: "suggestion", code, message, element, path, blocking: false}>}
 */
export function documentationSuggestions(schema, pcr, options = {}) {
  const nemsis = pcr || {};
  const out = [];
  const unitDisposition = value(schema, nemsis, "eDisposition.27");
  const careDisposition = value(schema, nemsis, "eDisposition.28");
  const transport = value(schema, nemsis, "eDisposition.30");
  const contact = unitDisposition === CONTACT_MADE;
  const transported = TRANSPORT_BY_THIS_UNIT.has(transport);
  const narrative = String(value(schema, nemsis, "eNarrative.01") || "");
  const vitalRows = groupRows(schema, nemsis, VITALS).filter((_, row) => hasAny(schema, nemsis, VITALS, { [VITALS]: row }, VITAL_FIELDS.map((v) => v.el)));
  const ctx = { schema };

  // Vital signs
  if (contact && careDisposition === "4228001" && !vitalRows.length) {
    out.push(suggestion("no-vitals", "Care was provided but no vital signs are charted. Add them, or document why they weren't obtained.", { ...ctx, el: "eVitals.01", at: { [VITALS]: 0 } }));
  } else if (transported && vitalRows.length === 1) {
    out.push(suggestion("one-vital-set", "Only one set of vital signs is charted for a transported patient. A second set may be missing.", { ...ctx, el: "eVitals.01", at: { [VITALS]: 0 } }));
  }
  for (const flag of vitalFlags(schema, nemsis, options)) {
    out.push({ ...suggestion(`vital-${flag.kind}`, flag.message, { ...ctx, key: `${flag.row}:${flag.el}` }), element: flag.el, path: flag.path });
  }

  // Treatments without a time
  groupRows(schema, nemsis, MEDS).forEach((_, row) => {
    const at = { [MEDS]: row };
    if (value(schema, nemsis, "eMedications.03", at) && !value(schema, nemsis, "eMedications.01", at)) {
      out.push(suggestion("med-no-time", `Medication ${row + 1} has no time given.`, { ...ctx, el: "eMedications.01", at, key: String(row) }));
    }
  });
  groupRows(schema, nemsis, PROCS).forEach((_, row) => {
    const at = { [PROCS]: row };
    if (value(schema, nemsis, "eProcedures.03", at) && !value(schema, nemsis, "eProcedures.01", at)) {
      out.push(suggestion("procedure-no-time", `Procedure ${row + 1} has no time performed.`, { ...ctx, el: "eProcedures.01", at, key: String(row) }));
    }
  });

  // Medications named in the narrative but not charted as given
  if (narrative) {
    const given = new Set(groupRows(schema, nemsis, MEDS).map((_, row) => String(value(schema, nemsis, "eMedications.03", { [MEDS]: row }))));
    const ownMeds = new Set([...values(schema, nemsis, "eHistory.12"), ...values(schema, nemsis, "eHistory.06")]);
    groupRows(schema, nemsis, "eHistory.CurrentMedsGroup").forEach((_, row) => ownMeds.add(String(value(schema, nemsis, "eHistory.12", { "eHistory.CurrentMedsGroup": row }))));
    for (const med of MED_NAMES) {
      if (given.has(med.code) || ownMeds.has(med.code)) continue;
      if (new RegExp(`\\b${escapeRe(med.name)}\\b`, "i").test(narrative)) {
        out.push(suggestion("med-in-narrative", `The narrative mentions ${med.name}, but no ${med.name} is charted under Medications. If it was given, add it there.`, { ...ctx, el: "eMedications.03", at: { [MEDS]: 0 }, key: med.code }));
      }
    }
  }

  // Cardiac arrest mentioned but not documented
  const arrest = value(schema, nemsis, "eArrest.01");
  if (narrative && /\b(CPR|cardiac arrest|pulseless|asystole|ROSC)\b/i.test(narrative) && (!arrest || arrest === ARREST_NO)) {
    out.push(suggestion("arrest-not-charted", `The narrative mentions a cardiac arrest, but Cardiac arrest is ${arrest ? "set to No" : "blank"}.`, { ...ctx, el: "eArrest.01" }));
  }

  // Transport and destination
  const destinationName = value(schema, nemsis, "eDisposition.01");
  const destinationType = value(schema, nemsis, "eDisposition.21");
  if (transported && !destinationName && !destinationType) {
    out.push(suggestion("transport-no-destination", "The patient was transported by this unit, but no destination is charted.", { ...ctx, el: "eDisposition.01" }));
  }
  if (NO_TRANSPORT.has(transport) && destinationName) {
    out.push(suggestion("no-transport-destination", `Transport is "${schema.codeLabel("eDisposition.30", transport, "EMSDataSet")}", but a destination (${destinationName}) is charted. Check which is right.`, { ...ctx, el: "eDisposition.30" }));
  }
  if (transported && !value(schema, nemsis, "eTimes.11")) {
    out.push(suggestion("transport-no-arrival", "Transported, but the time the patient arrived at the destination is blank.", { ...ctx, el: "eTimes.11" }));
  }

  // Refusals
  if ((transport === REFUSED_TRANSPORT || REFUSED.has(careDisposition)) && !groupRows(schema, nemsis, SIGNATURES).length) {
    out.push(suggestion("refusal-no-signature", "A refusal is charted but no signature is recorded. Follow your department's refusal policy (patient or witness signature, or the reason one wasn't obtained).", { ...ctx, el: "eOther.12", at: { [SIGNATURES]: 0 } }));
  }

  // Narrative
  if (contact && !narrative.trim()) {
    out.push(suggestion("no-narrative", "Patient contact was made, but there's no narrative yet.", { ...ctx, el: "eNarrative.01" }));
  }

  // Times out of order
  let previous = null;
  for (const [el, name] of TIME_ORDER) {
    const at = value(schema, nemsis, el);
    if (!at) continue;
    const t = Date.parse(at);
    if (!Number.isFinite(t)) continue;
    if (previous && t < previous.t) {
      out.push(suggestion("times-order", `${name} is earlier than ${previous.name}. Check both times.`, { ...ctx, el, key: el }));
    }
    previous = { t, name };
  }

  return out;
}

/** Suggestions the crew hasn't dismissed. `dismissed` is report.qualityDismissed (ids). */
export function openSuggestions(suggestions, dismissed = []) {
  const off = new Set(dismissed || []);
  return suggestions.filter((s) => !off.has(s.id));
}

/** Tag postCheck / department issues with their kind, so the review screen can keep them apart. */
export function feedbackKind(issue) {
  if (issue.kind) return issue.kind;
  return issue.code === "department-required" || issue.code === "ai-review" ? "agency" : "nemsis";
}
