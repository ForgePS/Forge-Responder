/**
 * Server-side NEMSIS check of a patient care report: the same XML the app exports (generated/nemsisCore.cjs is
 * the app's own NEMSIS code), the browser-level XSD checks, the national Schematron, and any state Schematron.
 *
 * PHI: a report and its findings contain patient data. Never log them; return them only to callers who may read
 * the report (canReadPcr, same as firestore.rules).
 */
const core = require("./generated/nemsisCore.cjs");
const { runNemsisSchematron } = require("./schematron");

/** Permissions that read every report (firestore.rules pcrReadAllKeys). */
const PCR_READ_ALL_KEYS = ["viewAllPcrs", "unlockPcrs", "exportPcrs", "reviewPcrs"];

/** Same access as firestore.rules match /pcrs: the crew on it, read-all permission holders, admins, creators. */
function canReadPcr(pcr, { uid, permissions = {}, isAdmin = false, isCreator = false }) {
  if (isCreator || isAdmin) return true;
  if ((pcr?.crewUids || []).includes(uid)) return true;
  return PCR_READ_ALL_KEYS.some((key) => permissions[key] === true);
}

/** NEMSIS DemographicGroup for the EMSDataSet header, from departments/{id}/settings/ems. */
function agencyFromSettings(settings = {}) {
  return {
    "dAgency.01": String(settings.stateAgencyId || "").trim(),
    "dAgency.02": String(settings.agencyNumber || "").trim(),
    "dAgency.04": String(settings.state || "").trim(),
  };
}

const AGENCY_LABELS = {
  "dAgency.01": "EMS agency unique state ID",
  "dAgency.02": "EMS agency number",
  "dAgency.04": "EMS agency state",
};

/**
 * @param {{ pcr: object, settings?: object, extraSchematron?: {id: string, text: string}[] }} input
 * @returns {Promise<{ ok: boolean, schemaVersion: string, missingAgency: string[],
 *   blocking: {path: string, element: string, message: string}[],
 *   findings: {id: string, source: string, severity: string, message: string, location: string}[],
 *   errorCount: number, warningCount: number }>}
 */
async function runPcrCheck({ pcr, settings = {}, extraSchematron = [] }) {
  const schema = core.nemsisSchema;
  const report = { ...(pcr?.nemsis || {}), attrs: { ...(pcr?.nemsis?.attrs || {}), UUID: pcr?.nemsis?.attrs?.UUID || pcr?.uuid } };
  const agency = agencyFromSettings(settings);
  const missingAgency = Object.entries(agency).filter(([, v]) => !v).map(([k]) => AGENCY_LABELS[k]);
  const local = core.postCheck(schema, report);
  const xml = core.pcrXml(schema, { agency, pcr: report });
  const schematron = await runNemsisSchematron(xml, { extraSchematron });
  const findings = schematron.findings.map((f) => ({
    id: f.id,
    source: f.source,
    severity: f.severity,
    message: f.message,
    location: f.location,
  }));
  const errorCount = local.blocking.length + schematron.errorCount;
  return {
    ok: errorCount === 0 && missingAgency.length === 0,
    schemaVersion: schematron.schemaVersion,
    missingAgency,
    blocking: local.blocking.map((i) => ({ path: i.path, element: i.element, message: i.message })),
    findings,
    errorCount,
    warningCount: local.warnings.length + schematron.warningCount,
  };
}

/**
 * Should a write to a report run the NEMSIS check? Only when it is posted (draft → posted, a new posted report,
 * or a re-post after an unlock). The check's own write (nemsisCheck only) leaves postedAt unchanged, so it never
 * triggers itself.
 */
function shouldCheckOnPost(before, after) {
  if (!after || after.status !== "posted") return false;
  if (!before || before.status !== "posted") return true;
  return Boolean(after.postedAt) && after.postedAt !== before.postedAt;
}

/** What is stored on the report (counts only: findings hold patient data and go only to callers who may read it). */
function checkStamp(result, { at, byUid = "", trigger, postedAt } = {}) {
  return {
    at,
    ok: result.ok,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    missingAgency: result.missingAgency.length > 0,
    trigger,
    ...(byUid ? { byUid } : {}),
    ...(postedAt ? { postedAt } : {}),
  };
}

/**
 * The amendment record written when an unlocked report is posted again: what changed (element paths, old and new
 * stored values), why (the unlock reason), and who unlocked and re-posted it. Clinical values are kept because the
 * amendment history is part of the record; it is readable only by those who can read the report.
 */
function amendmentRevision({ count, open, changes, after, at }) {
  return {
    kind: "amendment",
    version: count,
    fromRevision: String(open.revisionId || ""),
    reason: String(open.reason || ""),
    unlockedAt: String(open.openedAt || ""),
    unlockedByName: String(open.openedByName || ""),
    amendedAt: String(after.postedAt || at),
    amendedByUid: String(after.postedByUid || ""),
    amendedByName: String(after.postedByName || ""),
    changes: (changes || []).slice(0, 2000),
    changeCount: (changes || []).length,
    createdAt: at,
    createdByUid: "system",
  };
}

module.exports = { amendmentRevision, runPcrCheck, canReadPcr, agencyFromSettings, shouldCheckOnPost, checkStamp, PCR_READ_ALL_KEYS };
