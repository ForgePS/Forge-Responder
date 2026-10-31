/**
 * NERIS incident analytics — NFPA 1710, annual survey, incident locations, ad-hoc reporting.
 *
 * Honesty rules: a time interval is only measured when BOTH of its times were
 * recorded (never back-filled from another time), and every percentage comes
 * with the number of incidents it is based on. When nothing could be measured
 * the result is null, not 0% or 100%.
 */

const NFPA1710_BENCHMARKS = {
  callProcessingSeconds: 60,
  turnoutSeconds: 80,
  travelSeconds: 240,
  totalResponseSeconds: 300,
};

/** Plain labels and what each interval needs, for the UI. */
export const NFPA1710_METRICS = [
  { key: "callProcessingSeconds", label: "Call processing", from: "Call received", to: "Dispatched" },
  { key: "turnoutSeconds", label: "Turnout", from: "Dispatched", to: "En route" },
  { key: "travelSeconds", label: "Travel", from: "En route", to: "On scene" },
  { key: "totalResponseSeconds", label: "Total response", from: "Dispatched", to: "On scene" },
];

function parseTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Seconds from start to end; null when either is missing or the end is before the start (bad data). */
function secondsBetween(start, end) {
  const a = parseTime(start);
  const b = parseTime(end);
  if (!a || !b) return null;
  const diff = Math.round((b - a) / 1000);
  return diff < 0 ? null : diff;
}

function pickUnitTime(units, field, mode = "earliest") {
  let best = null;
  for (const unit of units) {
    const t = parseTime(unit?.[field]);
    if (!t) continue;
    if (!best || (mode === "earliest" ? t < best.t : t > best.t)) best = { t, raw: unit[field] };
  }
  return best ? best.raw : null;
}

/**
 * @param {Record<string, unknown>} report
 */
export function extractIncidentTimings(report = {}) {
  const cad = report.workspace?.cad || {};
  const units = Array.isArray(report.workspace?.units) ? report.workspace.units : [];

  // Incident-level (CAD) times win; otherwise the first unit's time (last unit for clear).
  // Call received has no fallback: dispatch time is NOT a stand-in for it.
  const received = cad.receivedTime || cad.callReceivedTime || cad.psapAnswerTime || null;
  const dispatch = cad.dispatchTime || pickUnitTime(units, "dispatchTime");
  const enroute = cad.enrouteTime || cad.unitEnrouteTime || pickUnitTime(units, "enrouteTime");
  const arrival = cad.arrivalTime || cad.onSceneTime || pickUnitTime(units, "arrivalTime");
  const clear = cad.clearTime || pickUnitTime(units, "clearTime", "latest");

  return {
    incidentId: report.id,
    reportNumber: report.reportNumber,
    incidentDate: report.incidentDate,
    incidentType: report.incidentTypeSummary,
    address: report.incidentAddress,
    callProcessingSeconds: secondsBetween(received, dispatch),
    turnoutSeconds: secondsBetween(dispatch, enroute),
    travelSeconds: secondsBetween(enroute, arrival),
    totalResponseSeconds: secondsBetween(dispatch, arrival),
    sceneSeconds: secondsBetween(arrival, clear),
  };
}

/** 90th percentile (nearest-rank), the figure NFPA 1710 measures against. */
export function percentile90(values = []) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const rank = Math.ceil(0.9 * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

function median(values = []) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * @param {Array<Record<string, unknown>>} reports
 */
export function buildNfpa1710Metrics(reports = []) {
  const all = reports.map(extractIncidentTimings);
  const keys = [...NFPA1710_METRICS.map((m) => m.key), "sceneSeconds"];
  const incidents = all.filter((t) => keys.some((k) => t[k] != null));

  const compliance = {};
  for (const metric of NFPA1710_METRICS) {
    const benchmark = NFPA1710_BENCHMARKS[metric.key];
    const values = all.map((t) => t[metric.key]).filter((v) => v != null);
    const compliant = values.filter((v) => v <= benchmark).length;
    compliance[metric.key] = {
      label: metric.label,
      benchmark,
      measured: values.length,
      total: reports.length,
      compliant,
      // null = not enough data; never a made-up 0% or 100%.
      percentage: values.length ? Math.round((compliant / values.length) * 100) : null,
      percentile90: percentile90(values),
    };
  }

  const sceneValues = all.map((t) => t.sceneSeconds).filter((v) => v != null);
  const scene = {
    label: "Time on scene",
    measured: sceneValues.length,
    total: reports.length,
    median: median(sceneValues),
  };

  return {
    incidentCount: reports.length,
    measuredCount: incidents.length,
    compliance,
    scene,
    incidents,
    benchmarks: NFPA1710_BENCHMARKS,
  };
}

/** A number the user actually entered (blank / non-numeric → null). */
function enteredNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || String(value).trim() === "") continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function finalTypes(report) {
  const value = report.modules?.core_mod_incident?.incident_final_type;
  const list = Array.isArray(value) ? value.flat() : value ? [value] : [];
  return list.filter(Boolean).map(String);
}

function hasValue(value) {
  if (Array.isArray(value)) return value.flat().some((v) => v !== "" && v != null);
  return value !== "" && value != null;
}

/**
 * Casualty counts as the report editor saves them (workspace.casualties.injuries /
 * fatalities / ffInjuries), with the older civilianCount / firefighterCount names
 * still read for reports saved before the editor redesign.
 * @param {Record<string, unknown>} report
 */
export function readCasualties(report = {}) {
  const c = report.workspace?.casualties || {};
  const civilianInjuries = enteredNumber(c.injuries, c.civilianInjuries);
  const civilianDeaths = enteredNumber(c.fatalities, c.civilianFatalities, c.civilianDeaths);
  const legacyCivilian = enteredNumber(c.civilianCount);
  const firefighterInjuries = enteredNumber(c.ffInjuries, c.firefighterInjuries);
  const firefighterDeaths = enteredNumber(c.ffFatalities, c.firefighterFatalities, c.firefighterDeaths);
  const legacyFirefighter = enteredNumber(c.firefighterCount);

  const civilian = civilianInjuries != null || civilianDeaths != null
    ? (civilianInjuries || 0) + (civilianDeaths || 0)
    : legacyCivilian;
  const firefighter = firefighterInjuries != null || firefighterDeaths != null
    ? (firefighterInjuries || 0) + (firefighterDeaths || 0)
    : legacyFirefighter;

  return {
    civilianInjuries: civilianInjuries || 0,
    civilianDeaths: civilianDeaths || 0,
    civilian: civilian || 0,
    firefighterInjuries: firefighterInjuries || 0,
    firefighterDeaths: firefighterDeaths || 0,
    firefighter: firefighter || 0,
    entered: civilian != null || firefighter != null,
  };
}

/**
 * Dollar loss as the editor saves it (workspace.propertyLoss.property / contents),
 * with the older propertyLoss / contentsLoss names as a fallback.
 * @param {Record<string, unknown>} report
 * @returns {{ property: number, contents: number, total: number, entered: boolean }}
 */
export function readPropertyLoss(report = {}) {
  const loss = report.workspace?.propertyLoss || {};
  const property = enteredNumber(loss.property, loss.propertyLoss);
  const contents = enteredNumber(loss.contents, loss.contentsLoss);
  return {
    property: property || 0,
    contents: contents || 0,
    total: (property || 0) + (contents || 0),
    entered: property != null || contents != null,
  };
}

/**
 * @param {Array<Record<string, unknown>>} reports
 * @param {number} year
 */
export function buildAnnualSurveyTotals(reports = [], year = new Date().getFullYear()) {
  const filtered = reports.filter((r) => String(r.incidentDate || "").startsWith(String(year)));
  const byType = {};
  let fireCount = 0;
  let emsCount = 0;
  let mutualAidCount = 0;
  let civilianCasualties = 0;
  let civilianInjuries = 0;
  let civilianDeaths = 0;
  let firefighterCasualties = 0;
  let propertyLoss = 0;
  let casualtyReports = 0;
  let lossReports = 0;

  for (const report of filtered) {
    const type = String(report.incidentTypeSummary || "Unknown");
    byType[type] = (byType[type] || 0) + 1;

    const disciplines = report.disciplines || report.workspace?.disciplines || [];
    const codes = finalTypes(report);
    // Prefer the NERIS type codes; only guess from the free-text summary on reports without codes.
    const isFire = codes.length ? codes.some((t) => t.startsWith("FIRE")) : /\bfire\b/i.test(type) && !/alarm/i.test(type);
    const isEms = codes.length ? codes.some((t) => t.startsWith("MEDICAL")) : /medical|\bems\b/i.test(type);
    if (isFire || disciplines.includes("fire")) fireCount += 1;
    if (isEms || disciplines.includes("ems")) emsCount += 1;
    if (hasValue(report.modules?.core_mod_incident?.incident_aid_direction) || disciplines.includes("mutual_aid") || /mutual aid/i.test(type)) {
      mutualAidCount += 1;
    }

    const casualties = readCasualties(report);
    civilianCasualties += casualties.civilian;
    civilianInjuries += casualties.civilianInjuries;
    civilianDeaths += casualties.civilianDeaths;
    firefighterCasualties += casualties.firefighter;
    if (casualties.entered) casualtyReports += 1;

    const loss = readPropertyLoss(report);
    propertyLoss += loss.total;
    if (loss.entered) lossReports += 1;
  }

  return {
    year,
    totalIncidents: filtered.length,
    byType,
    fireIncidents: fireCount,
    emsIncidents: emsCount,
    mutualAidIncidents: mutualAidCount,
    civilianCasualties,
    civilianInjuries,
    civilianDeaths,
    firefighterCasualties,
    propertyLoss,
    /** Reports with any injury/death number filled in (blank = none reported). */
    casualtyReports,
    /** Reports with a property or contents loss amount filled in. */
    lossReports,
  };
}

function coordinate(value, limit) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

/**
 * Reports with real coordinates. The report editor does not collect coordinates
 * today, so this is usually empty; the page says so instead of drawing an empty map.
 * @param {Array<Record<string, unknown>>} reports
 */
export function buildHeatMapPoints(reports = []) {
  return reports
    .map((report) => {
      const location = report.workspace?.location || {};
      const lat = coordinate(report.latitude ?? location.latitude ?? location.lat, 90);
      const lng = coordinate(report.longitude ?? location.longitude ?? location.lng, 180);
      if (lat == null || lng == null || (lat === 0 && lng === 0)) return null;

      return {
        id: report.id,
        lat,
        lng,
        weight: 1,
        incidentType: report.incidentTypeSummary,
        address: report.incidentAddress,
        propertyLoss: readPropertyLoss(report).total,
        disciplines: report.disciplines || [],
        date: report.incidentDate,
      };
    })
    .filter(Boolean);
}

/**
 * @param {Array<Record<string, unknown>>} reports
 * @param {{ columns?: string[], filters?: Record<string, string>, groupBy?: string }} config
 */
export function runAdHocReport(reports = [], config = {}) {
  const columns = config.columns?.length
    ? config.columns
    : ["reportNumber", "incidentDate", "incidentTypeSummary", "incidentAddress", "status"];

  let rows = reports.map((report) => {
    const row = {};
    for (const col of columns) {
      if (col.startsWith("workspace.")) {
        const key = col.slice("workspace.".length);
        row[col] = report.workspace?.[key];
      } else {
        row[col] = report[col];
      }
    }
    return row;
  });

  const filters = config.filters || {};
  for (const [key, value] of Object.entries(filters)) {
    if (!value) continue;
    const needle = String(value).toLowerCase();
    rows = rows.filter((row) => String(row[key] ?? "").toLowerCase().includes(needle));
  }

  if (config.groupBy) {
    const grouped = {};
    for (const row of rows) {
      const key = String(row[config.groupBy] ?? "Unknown");
      grouped[key] = (grouped[key] || 0) + 1;
    }
    return { type: "grouped", groupBy: config.groupBy, groups: grouped, total: rows.length };
  }

  return { type: "tabular", columns, rows, total: rows.length };
}

/**
 * @param {object} data
 */
export function exportCsv(data) {
  if (data.type === "grouped") {
    const lines = ["Group,Count"];
    for (const [key, count] of Object.entries(data.groups)) {
      lines.push(`"${key.replace(/"/g, '""')}",${count}`);
    }
    return lines.join("\n");
  }

  const cols = data.columns || [];
  const lines = [cols.join(",")];
  for (const row of data.rows || []) {
    lines.push(cols.map((c) => `"${String(row[c] ?? "").replace(/"/g, '""')}"`).join(","));
  }
  return lines.join("\n");
}

/**
 * @param {object} survey
 */
export function exportAnnualSurveyCsv(survey) {
  const lines = [
    "Metric,Value",
    `Year,${survey.year}`,
    `Total Incidents,${survey.totalIncidents}`,
    `Fire Incidents,${survey.fireIncidents}`,
    `EMS Incidents,${survey.emsIncidents}`,
    `Mutual Aid,${survey.mutualAidIncidents}`,
    `Civilian Injuries,${survey.civilianInjuries ?? ""}`,
    `Civilian Deaths,${survey.civilianDeaths ?? ""}`,
    `Civilian Casualties,${survey.civilianCasualties}`,
    `Firefighter Casualties,${survey.firefighterCasualties}`,
    // Blank (not $0) when no report has a loss amount entered.
    `Property and Contents Loss,${survey.lossReports === 0 ? "" : survey.propertyLoss}`,
    `Reports With Loss Entered,${survey.lossReports ?? ""}`,
    "",
    "Incident Type,Count",
  ];
  for (const [type, count] of Object.entries(survey.byType || {})) {
    lines.push(`"${type.replace(/"/g, '""')}",${count}`);
  }
  return lines.join("\n");
}
