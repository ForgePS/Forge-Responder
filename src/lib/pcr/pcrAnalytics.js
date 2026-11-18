/**
 * EMS analytics from patient care reports (pure; unit tested).
 *
 * Totals only: no names, numbers, addresses or dates of birth ever appear. Counts from 1 to 4 are shown as "<5"
 * (small-cell suppression), so a rare complaint or disposition can't point to a patient. Percentages and medians
 * are only given when at least five reports are counted.
 */
import { getLeaf, groupRows } from "../nemsis/pcrModel.js";
import { CODE_NAMES } from "../nemsis/pcrNarrativeFacts.js";
import { readLeaf } from "../nemsis/schema.js";
import { reportStatus } from "./pcrLifecycle.js";

export const SMALL_CELL = 5;

/** A count as shown: 0, "<5", or the number. */
export const shownCount = (n) => (n > 0 && n < SMALL_CELL ? `<${SMALL_CELL}` : n);

const value = (schema, pcr, el, at) => {
  const leaf = readLeaf(getLeaf(schema, pcr, el, at));
  return leaf.NV || leaf.PN ? "" : leaf.value ?? "";
};

function tally(items) {
  const map = new Map();
  for (const item of items) if (item) map.set(item, (map.get(item) || 0) + 1);
  return [...map.entries()].map(([label, count]) => ({ label, count, shown: shownCount(count) })).sort((a, b) => b.count - a.count);
}

function median(nums) {
  if (nums.length < SMALL_CELL) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const minutesBetween = (a, b) => {
  const ta = Date.parse(a || "");
  const tb = Date.parse(b || "");
  return Number.isFinite(ta) && Number.isFinite(tb) && tb >= ta ? (tb - ta) / 60000 : null;
};

/** The time a report is counted at: unit notified, else created. */
export const reportTime = (schema, report) => value(schema, report.nemsis || {}, "eTimes.03") || report.createdAt || "";

/**
 * @param {object} schema
 * @param {object[]} reports pcr documents
 * @param {{ from?: string, to?: string }} [range] ISO dates (inclusive), on the unit-notified time
 */
export function pcrAnalytics(schema, reports, { from = "", to = "" } = {}) {
  const inRange = (reports || []).filter((r) => {
    const t = reportTime(schema, r).slice(0, 10);
    return (!from || t >= from) && (!to || t <= to);
  });
  const label = (el, code) => (code ? String(schema.codeLabel(el, code, "EMSDataSet") ?? code) : "");
  const statuses = inRange.map((r) => reportStatus(r).label);
  const dispositions = [];
  const transports = [];
  const impressions = [];
  const meds = [];
  const procs = [];
  const responseMins = [];
  const sceneMins = [];
  const completionHours = [];
  let transported = 0;
  let contacts = 0;
  let checked = 0;
  let checkFailed = 0;
  for (const r of inRange) {
    const p = r.nemsis || {};
    const unitDisp = value(schema, p, "eDisposition.27");
    const transport = value(schema, p, "eDisposition.30");
    dispositions.push(label("eDisposition.27", unitDisp));
    transports.push(label("eDisposition.30", transport));
    if (unitDisp === "4227001") contacts += 1;
    if (transport === "4230001" || transport === "4230003") transported += 1;
    impressions.push(String(value(schema, p, "eSituation.11") || ""));
    groupRows(schema, p, "eMedications.MedicationGroup").forEach((_, i) => {
      const code = String(value(schema, p, "eMedications.03", { "eMedications.MedicationGroup": i }) || "");
      meds.push(CODE_NAMES["eMedications.03"]?.[code] || code);
    });
    groupRows(schema, p, "eProcedures.ProcedureGroup").forEach((_, i) => {
      const code = String(value(schema, p, "eProcedures.03", { "eProcedures.ProcedureGroup": i }) || "");
      procs.push(CODE_NAMES["eProcedures.03"]?.[code] || code);
    });
    const response = minutesBetween(value(schema, p, "eTimes.03"), value(schema, p, "eTimes.06"));
    if (response !== null && response < 240) responseMins.push(response);
    const scene = minutesBetween(value(schema, p, "eTimes.06"), value(schema, p, "eTimes.09"));
    if (scene !== null && scene < 480) sceneMins.push(scene);
    if (r.status === "posted") {
      const hours = minutesBetween(value(schema, p, "eTimes.13") || r.createdAt, r.postedAt);
      if (hours !== null) completionHours.push(hours / 60);
    }
    if (r.nemsisCheck) {
      checked += 1;
      if (r.nemsisCheck.ok === false) checkFailed += 1;
    }
  }
  const pct = (n, d) => (d >= SMALL_CELL ? Math.round((n / d) * 100) : null);
  return {
    total: inRange.length,
    shownTotal: shownCount(inRange.length),
    byStatus: tally(statuses),
    byUnitDisposition: tally(dispositions),
    byTransport: tally(transports),
    topImpressions: tally(impressions).slice(0, 10),
    medications: tally(meds).slice(0, 12),
    procedures: tally(procs).slice(0, 12),
    transportRate: pct(transported, contacts),
    medianResponseMinutes: median(responseMins),
    medianSceneMinutes: median(sceneMins),
    medianHoursToPost: median(completionHours),
    nemsisCheckFailRate: pct(checkFailed, checked),
    checkedCount: checked,
  };
}
