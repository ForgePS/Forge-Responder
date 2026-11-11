/**
 * Read-only access to department records for Forge AI, plus the source book
 * that every answer cites. Nothing in this file writes to Firestore.
 *
 * Reports are read with the platform's list reader and projected with Heat
 * Zone's projectReport, so classification, call time and response time mean
 * exactly the same thing in Forge AI as on the Heat Zone and NERIS pages.
 */
const { readList } = require("../listStore");
const { SOURCE_LIST_KEY, locationKey, projectReport } = require("../heatZone/projection");
const { localDayStartMs, localParts, addDays, parseToUtcMs } = require("../heatZone/time");
const { scrubFreeText } = require("../nerisNarrative");

const ACTIVE911_LIST_KEY = "hlfd-rms-active911-alerts";
const APPARATUS_LIST_KEY = "hlfd-rms-apparatus";
const MAX_REPORTS = 20_000;

const text = (v, max = 300) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));

function formatLocal(ms, timeZone) {
  if (!Number.isFinite(ms)) return "";
  const p = localParts(ms, timeZone);
  return `${p.date} ${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function minutes(seconds) {
  return Number.isFinite(seconds) ? Math.round((seconds / 60) * 10) / 10 : null;
}

// ------------------------------------------------------------------ sources

/**
 * Collects the records an answer is built from. Each source gets a short id
 * ("S1", "S2", ...) that the model must cite; unknown ids are discarded.
 */
class SourceBook {
  constructor() {
    this.items = [];
    this.byKey = new Map();
  }

  /** @param {{kind:string, recordId:string, label:string, detail?:string, liveness:"historical"|"live"|"reference"|"current", asOf?:string|null, link?:object}} source */
  add(source) {
    const key = `${source.kind}:${source.recordId}`;
    if (this.byKey.has(key)) return this.byKey.get(key);
    const id = `S${this.items.length + 1}`;
    this.items.push({
      id,
      kind: text(source.kind, 40),
      recordId: text(source.recordId, 300),
      label: text(source.label, 160),
      detail: text(source.detail, 300),
      liveness: source.liveness || "historical",
      asOf: source.asOf || null,
      link: source.link || null,
    });
    this.byKey.set(key, id);
    return id;
  }

  ids() {
    return new Set(this.items.map((s) => s.id));
  }
}

// ------------------------------------------------------------------ reports

/**
 * Every NERIS report of the department, projected. Returns rows sorted by
 * occurrence time (newest first). Reports without a usable time are kept with
 * occurredAt = null so data-quality checks still see them.
 */
async function loadReports(db, departmentId, timeZone) {
  const list = await readList(db, departmentId, SOURCE_LIST_KEY);
  const rows = [];
  for (const report of list.items.slice(0, MAX_REPORTS)) {
    if (!report || typeof report !== "object" || !text(report.id)) continue;
    // Defence in depth: a record that names another department is never used.
    if (report.departmentId && String(report.departmentId) !== departmentId) continue;
    const projection = projectReport(report, { departmentId, timeZone, zones: [] });
    rows.push({ report, p: projection });
  }
  rows.sort((a, b) => (b.p?.occurredAt || 0) - (a.p?.occurredAt || 0));
  return { rows, truncated: list.items.length > MAX_REPORTS };
}

function inWindow(row, window, timeZone, now = Date.now()) {
  if (!row.p || !Number.isFinite(row.p.occurredAt)) return false;
  if (window.hours) return row.p.occurredAt >= now - window.hours * 3600_000 && row.p.occurredAt <= now;
  const start = localDayStartMs(window.from, timeZone);
  const end = localDayStartMs(addDays(window.to, 1), timeZone);
  return row.p.occurredAt >= start && row.p.occurredAt < end;
}

function reportNumber(row) {
  return text(row.p?.reportNumber || row.report.reportNumber || row.report.id, 60);
}

function categoryMatches(row, categories) {
  if (!categories.length) return true;
  const hay = `${row.p?.classification || ""} ${row.p?.classificationDetail || ""} ${row.p?.typeCode || ""} ${row.report.incidentTypeSummary || ""}`.toLowerCase();
  return categories.some((c) => {
    if (c === "Vehicle Crash") return /crash|collision|mvc|mva|motor vehicle|vehicle_?crash|traffic/.test(hay);
    if (c === "Alarm") return /alarm|detector/.test(hay);
    if (c === "Medical") return /medical|ems|illness|injury|cardiac/.test(hay);
    return hay.includes(c.toLowerCase().split(" ")[0]);
  });
}

function unitsOf(report) {
  return (Array.isArray(report.workspace?.units) ? report.workspace.units : []).filter((u) => u && typeof u === "object");
}

function addReportSource(book, row, timeZone) {
  return book.add({
    kind: "nerisReport",
    recordId: text(row.report.id),
    label: `Report ${reportNumber(row)}`,
    detail: [formatLocal(row.p?.occurredAt, timeZone), row.p?.classification, text(row.report.incidentAddress, 120)].filter(Boolean).join(" · "),
    liveness: "historical",
    asOf: text(row.report.updatedAt, 40) || null,
    link: { page: "NERIS Fire Reports", reportId: text(row.report.id) },
  });
}

/** The allowlisted facts about one report that the model may see. No names. */
function incidentFact(row, timeZone, sourceId) {
  const r = row.report;
  return {
    source: sourceId,
    reportNumber: reportNumber(row),
    occurred: formatLocal(row.p?.occurredAt, timeZone),
    type: row.p?.classification || "Unclassified",
    typeDetail: row.p?.classificationDetail || undefined,
    priority: row.p?.priority,
    address: text(r.incidentAddress, 120) || undefined,
    status: text(r.status, 40) || "Draft",
    units: row.p?.units || [],
    responseMinutes: minutes(row.p?.responseSeconds),
    disposition: row.p?.disposition,
  };
}

/** Ordered CAD and unit times for one report. */
function timeline(report, timeZone) {
  const events = [];
  const cad = report.workspace?.cad || {};
  const push = (value, label) => {
    const ms = parseToUtcMs(value, timeZone);
    if (ms !== null) events.push({ ms, time: formatLocal(ms, timeZone), event: label });
  };
  push(cad.psapAnswerTime, "Call answered (PSAP)");
  push(cad.receivedTime, "Call received");
  push(cad.dispatchTime, "Dispatched");
  push(cad.enrouteTime, "First unit en route");
  push(cad.arrivalTime, "First unit on scene");
  push(cad.clearTime, "Incident cleared");
  for (const unit of unitsOf(report).slice(0, 30)) {
    const id = text(unit.unitId, 30) || "Unit";
    push(unit.dispatchTime, `${id} dispatched`);
    push(unit.enrouteTime, `${id} en route`);
    push(unit.arrivalTime, `${id} on scene`);
    push(unit.clearTime, `${id} cleared`);
  }
  return events.sort((a, b) => a.ms - b.ms).map(({ time, event }) => ({ time, event }));
}

/** Up to `limit` earlier incidents of the same type, same address first. */
function similarIncidents(target, rows, limit = 5) {
  const key = locationKey(target.report.incidentAddress, null);
  const yearAgo = (target.p?.occurredAt || Date.now()) - 366 * 86_400_000;
  return rows
    .filter((row) => row !== target && row.p && row.p.occurredAt && row.p.occurredAt >= yearAgo)
    .map((row) => {
      const sameAddress = key && locationKey(row.report.incidentAddress, null) === key;
      const sameType = row.p.classification === target.p?.classification;
      const sameDetail = sameType && row.p.classificationDetail && row.p.classificationDetail === target.p?.classificationDetail;
      const score = (sameAddress ? 4 : 0) + (sameDetail ? 2 : 0) + (sameType ? 1 : 0);
      return { row, score, sameAddress, sameType };
    })
    .filter((x) => x.score >= 2 || (x.sameAddress))
    .sort((a, b) => b.score - a.score || b.row.p.occurredAt - a.row.p.occurredAt)
    .slice(0, limit);
}

/** Find reports named in the question or the entry-point context. */
function findReports(rows, { reportId = "", reportNumbers = [] } = {}) {
  const wanted = new Set(reportNumbers.map((n) => String(n).toLowerCase()));
  return rows.filter((row) => {
    if (reportId && text(row.report.id) === reportId) return true;
    if (!wanted.size) return false;
    const number = reportNumber(row).toLowerCase();
    if (wanted.has(number) || wanted.has(text(row.report.id).toLowerCase())) return true;
    // "report 42" matches NERIS-2026-0042 (numeric tail, leading zeros ignored).
    const tail = number.split(/[-\s]/).pop();
    return /^\d+$/.test(tail) && [...wanted].some((w) => /^\d+$/.test(w) && Number(w) === Number(tail));
  });
}

// ------------------------------------------------------------------ other sources

async function loadActive911(db, departmentId) {
  const list = await readList(db, departmentId, ACTIVE911_LIST_KEY);
  const items = list.items.filter((a) => a && typeof a === "object").slice(0, 200);
  return {
    alerts: items,
    syncedAt: text(list.header?.updatedAt || items[0]?.syncedAt, 40) || null,
  };
}

async function loadFleet(db, departmentId) {
  const [assetsSnap, apparatus] = await Promise.all([
    db.collection(`departments/${departmentId}/fleetAssets`).limit(500).get(),
    readList(db, departmentId, APPARATUS_LIST_KEY),
  ]);
  const assets = assetsSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((a) => !a.departmentId || a.departmentId === departmentId);
  return { assets, apparatus: apparatus.items.filter((a) => a && typeof a === "object") };
}

async function loadProfile(db, departmentId) {
  const snap = await db.doc(`departments/${departmentId}/profile/main`).get();
  const p = snap.data() || {};
  return { name: text(p.name, 120) || departmentId, timezone: text(p.timezone, 60) };
}

module.exports = {
  SourceBook,
  addReportSource,
  categoryMatches,
  findReports,
  formatLocal,
  incidentFact,
  inWindow,
  loadActive911,
  loadFleet,
  loadProfile,
  loadReports,
  minutes,
  reportNumber,
  scrubFreeText,
  similarIncidents,
  text,
  timeline,
  unitsOf,
};
