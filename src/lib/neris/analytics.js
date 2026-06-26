/**
 * NERIS incident analytics — NFPA 1710, annual survey, heat map, ad-hoc reporting.
 */

const NFPA1710_BENCHMARKS = {
  callProcessingSeconds: 60,
  turnoutSeconds: 80,
  travelSeconds: 240,
  totalResponseSeconds: 300,
};

function parseTime(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function secondsBetween(start, end) {
  const a = parseTime(start);
  const b = parseTime(end);
  if (!a || !b) return null;
  return Math.max(0, Math.round((b - a) / 1000));
}

/**
 * @param {Record<string, unknown>} report
 */
export function extractIncidentTimings(report = {}) {
  const cad = report.workspace?.cad || {};
  const units = report.workspace?.units || [];
  const firstUnit = units[0] || {};

  const dispatch = cad.dispatchTime || firstUnit.dispatchTime;
  const enroute = cad.enrouteTime || firstUnit.enrouteTime || cad.unitEnrouteTime;
  const arrival = cad.arrivalTime || firstUnit.arrivalTime || cad.onSceneTime;
  const clear = cad.clearTime || firstUnit.clearTime;

  const callProcessing = secondsBetween(cad.receivedTime || dispatch, dispatch);
  const turnout = secondsBetween(dispatch, enroute);
  const travel = secondsBetween(enroute, arrival);
  const totalResponse = secondsBetween(dispatch, arrival);
  const scene = secondsBetween(arrival, clear);

  return {
    incidentId: report.id,
    reportNumber: report.reportNumber,
    incidentDate: report.incidentDate,
    incidentType: report.incidentTypeSummary,
    address: report.incidentAddress,
    callProcessingSeconds: callProcessing,
    turnoutSeconds: turnout,
    travelSeconds: travel,
    totalResponseSeconds: totalResponse,
    sceneSeconds: scene,
  };
}

/**
 * @param {Array<Record<string, unknown>>} reports
 */
export function buildNfpa1710Metrics(reports = []) {
  const timings = reports.map(extractIncidentTimings).filter((t) => t.totalResponseSeconds != null);
  if (!timings.length) {
    return {
      incidentCount: reports.length,
      measuredCount: 0,
      compliance: {},
      incidents: [],
      benchmarks: NFPA1710_BENCHMARKS,
    };
  }

  const metrics = ["callProcessingSeconds", "turnoutSeconds", "travelSeconds", "totalResponseSeconds"];
  const compliance = {};

  for (const metric of metrics) {
    const benchmarkKey = metric;
    const benchmark = NFPA1710_BENCHMARKS[benchmarkKey];
    const measured = timings.filter((t) => t[metric] != null);
    const compliant = measured.filter((t) => t[metric] <= benchmark);
    compliance[metric] = {
      benchmark,
      measured: measured.length,
      compliant: compliant.length,
      percentage: measured.length ? Math.round((compliant.length / measured.length) * 100) : 0,
    };
  }

  return {
    incidentCount: reports.length,
    measuredCount: timings.length,
    compliance,
    incidents: timings,
    benchmarks: NFPA1710_BENCHMARKS,
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
  let firefighterCasualties = 0;
  let propertyLoss = 0;

  for (const report of filtered) {
    const type = String(report.incidentTypeSummary || "Unknown");
    byType[type] = (byType[type] || 0) + 1;

    const disciplines = report.disciplines || [];
    if (disciplines.includes("fire") || /fire/i.test(type)) fireCount += 1;
    if (disciplines.includes("ems") || /medical|ems/i.test(type)) emsCount += 1;
    if (disciplines.includes("mutual_aid") || /mutual|aid/i.test(type)) mutualAidCount += 1;

    const casualties = report.workspace?.casualties || {};
    civilianCasualties += Number(casualties.civilianCount || 0);
    firefighterCasualties += Number(casualties.firefighterCount || 0);

    const loss = report.workspace?.propertyLoss || {};
    propertyLoss += Number(loss.propertyLoss || 0) + Number(loss.contentsLoss || 0);
  }

  return {
    year,
    totalIncidents: filtered.length,
    byType,
    fireIncidents: fireCount,
    emsIncidents: emsCount,
    mutualAidIncidents: mutualAidCount,
    civilianCasualties,
    firefighterCasualties,
    propertyLoss,
  };
}

/**
 * @param {Array<Record<string, unknown>>} reports
 */
export function buildHeatMapPoints(reports = []) {
  return reports
    .map((report) => {
      const lat = report.latitude || report.workspace?.location?.latitude;
      const lng = report.longitude || report.workspace?.location?.longitude;
      if (lat == null || lng == null) return null;

      const loss = report.workspace?.propertyLoss || {};
      return {
        id: report.id,
        lat: Number(lat),
        lng: Number(lng),
        weight: 1,
        incidentType: report.incidentTypeSummary,
        address: report.incidentAddress,
        propertyLoss: Number(loss.propertyLoss || 0),
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
    `Civilian Casualties,${survey.civilianCasualties}`,
    `Firefighter Casualties,${survey.firefighterCasualties}`,
    `Property Loss,${survey.propertyLoss}`,
    "",
    "Incident Type,Count",
  ];
  for (const [type, count] of Object.entries(survey.byType || {})) {
    lines.push(`"${type.replace(/"/g, '""')}",${count}`);
  }
  return lines.join("\n");
}
