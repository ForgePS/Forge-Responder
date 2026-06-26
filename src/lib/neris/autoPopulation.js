import { getPersonDisplayName } from "../personnelSchema.js";

/**
 * @typedef {{
 *   personnel?: Array<Record<string, unknown>>,
 *   apparatus?: Array<Record<string, unknown>>,
 *   occupancies?: Array<Record<string, unknown>>,
 *   preplans?: Array<Record<string, unknown>>,
 *   inspections?: Array<Record<string, unknown>>,
 *   scheduleDays?: Array<Record<string, unknown>>,
 *   hydrants?: Array<Record<string, unknown>>,
 * }} ForgeSources
 */

/**
 * Build auto-populated workspace data from Forge modules.
 * @param {Record<string, unknown>} report
 * @param {ForgeSources} sources
 */
export function autoPopulateReport(report = {}, sources = {}) {
  const workspace = { ...(report.workspace || {}) };
  const autoPopulateSources = { ...(report.autoPopulateSources || {}) };
  const address = String(report.incidentAddress || "").toLowerCase();

  const occupancy = matchOccupancy(address, sources.occupancies || []);
  if (occupancy) {
    workspace.location = {
      ...(workspace.location || {}),
      occupancyId: occupancy.id,
      occupancyName: occupancy.name,
      address: occupancy.address || report.incidentAddress,
      propertyUse: occupancy.type,
      constructionType: occupancy.constructionType || "",
      hazardLevel: occupancy.hazard,
      sprinklerStatus: occupancy.sprinkler || "Unknown",
      alarmStatus: occupancy.alarm || "Unknown",
      knoxBox: occupancy.knoxBox || "Unknown",
    };
    autoPopulateSources["workspace.location"] = "occupancy";

    const preplan = (sources.preplans || []).find((p) => p.occupancyId === occupancy.id);
    if (preplan) {
      workspace.location.preplanId = preplan.id;
      workspace.location.preplanStatus = preplan.status;
      workspace.location.hazards = preplan.hazards;
      workspace.location.waterSupply = preplan.waterSupply;
      autoPopulateSources["workspace.location.preplan"] = "preplan";
    }

    const inspection = (sources.inspections || [])
      .filter((i) => i.occupancyId === occupancy.id)
      .sort((a, b) => String(b.due).localeCompare(String(a.due)))[0];
    if (inspection) {
      workspace.location.inspectionStatus = inspection.status;
      workspace.location.lastInspectionDue = inspection.due;
      autoPopulateSources["workspace.location.inspection"] = "inspections";
    }
  }

  if (!workspace.units?.length && sources.apparatus?.length) {
    workspace.units = sources.apparatus.slice(0, 3).map((unit) => ({
      unitId: unit.unit || unit.name || unit.id,
      apparatusType: unit.type || unit.apparatusType || "",
      station: unit.station || "",
      dispatchTime: "",
      enrouteTime: "",
      arrivalTime: "",
      clearTime: "",
      source: "apparatus",
    }));
    autoPopulateSources["workspace.units"] = "apparatus";
  }

  if (!workspace.personnel?.length) {
    const staffing = resolveStaffingForDate(report.incidentDate, sources);
    if (staffing.length) {
      workspace.personnel = staffing;
      autoPopulateSources["workspace.personnel"] = "scheduling";
    }
  }

  if (!workspace.weather?.dispatchWeather && report.incidentDate) {
    workspace.weather = {
      ...(workspace.weather || {}),
      dispatchWeather: simulateWeather(report.incidentDate, report.coordinates),
      source: "weather-api-simulated",
    };
    autoPopulateSources["workspace.weather"] = "weather";
  }

  if (!workspace.cad?.incidentNumber && report.reportNumber) {
    workspace.cad = {
      ...(workspace.cad || {}),
      incidentNumber: report.reportNumber,
      cadCallNumber: report.cadIncidentId || report.reportNumber,
      dispatchTime: report.incidentDate ? `${report.incidentDate}T08:00` : "",
      priority: workspace.cad?.priority || "Routine",
      alarmLevel: workspace.cad?.alarmLevel || "1",
      initialComments: workspace.cad?.initialComments || "",
    };
    autoPopulateSources["workspace.cad"] = "cad";
  }

  const hydrants = matchNearbyHydrants(address, sources.hydrants || []);
  if (hydrants.length) {
    workspace.location = {
      ...(workspace.location || {}),
      closestHydrants: hydrants.slice(0, 3).map((h) => h.id || h.hydrant),
    };
    autoPopulateSources["workspace.location.hydrants"] = "hydrants";
  }

  return {
    ...report,
    workspace,
    autoPopulateSources,
    completionPercentage: undefined,
  };
}

/** @param {string} address @param {Array<Record<string, unknown>>} occupancies */
function matchOccupancy(address, occupancies) {
  if (!address) return null;
  return occupancies.find((occ) => {
    const occAddr = String(occ.address || "").toLowerCase();
    const occName = String(occ.name || "").toLowerCase();
    return address.includes(occAddr) || occAddr.includes(address)
      || address.includes(occName);
  }) || null;
}

/** @param {string} address @param {Array<Record<string, unknown>>} hydrants */
function matchNearbyHydrants(address, hydrants) {
  if (!address || !hydrants.length) return [];
  const district = address.includes("goodman") ? "1" : "2";
  return hydrants.filter((h) => String(h.district || "") === district);
}

/**
 * @param {string} incidentDate
 * @param {ForgeSources} sources
 */
function resolveStaffingForDate(incidentDate, sources) {
  const day = (sources.scheduleDays || []).find((d) => d.date === incidentDate || d.id === incidentDate);
  if (!day?.roster?.length) {
    return (sources.personnel || []).slice(0, 4).map((person) => ({
      personnelId: person.id,
      name: getPersonDisplayName(person),
      rank: person.rank || "",
      certification: person.emsLevel || person.certification || "",
      unitId: person.assignment || "",
      role: "Responder",
      source: "personnel-roster",
    }));
  }
  return day.roster.slice(0, 6).map((slot) => ({
    personnelId: slot.personnelId || slot.id,
    name: slot.name || slot.personName || "",
    rank: slot.rank || "",
    certification: slot.certification || "",
    unitId: slot.unit || slot.apparatus || "",
    role: slot.role || "Responder",
    source: "scheduling",
  }));
}

/** @param {string} dateStr @param {{ lat?: number, lng?: number } | undefined} coords */
function simulateWeather(dateStr, coords) {
  const seed = (dateStr + (coords?.lat || 0)).split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const tempF = 65 + (seed % 25);
  const windMph = 3 + (seed % 15);
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return {
    temperature: `${tempF}°F`,
    windSpeed: `${windMph} mph`,
    windDirection: directions[seed % directions.length],
    humidity: `${40 + (seed % 40)}%`,
    visibility: "10 mi",
    precipitation: seed % 5 === 0 ? "Light rain" : "None",
    condition: seed % 5 === 0 ? "Overcast" : "Clear",
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Log a user override of an auto-populated field.
 * @param {Record<string, unknown>} report
 * @param {string} fieldPath
 * @param {unknown} newValue
 * @param {string} reason
 */
export function logFieldOverride(report, fieldPath, newValue, reason = "") {
  const fieldOverrides = { ...(report.fieldOverrides || {}) };
  const previous = fieldOverrides[fieldPath];
  fieldOverrides[fieldPath] = {
    originalValue: previous?.originalValue ?? report.autoPopulateSources?.[fieldPath],
    newValue,
    reason,
    overriddenAt: new Date().toISOString(),
  };
  const auditLog = [...(report.workspace?.auditLog || report.auditLog || [])];
  auditLog.push({
    action: "field_override",
    field: fieldPath,
    reason,
    timestamp: new Date().toISOString(),
  });
  return {
    ...report,
    fieldOverrides,
    workspace: { ...(report.workspace || {}), auditLog },
  };
}

/**
 * Prior incidents at same occupancy.
 * @param {Record<string, unknown>} report
 * @param {Array<Record<string, unknown>>} allReports
 */
export function getOccupancyIncidentHistory(report, allReports = []) {
  const occId = report.workspace?.location?.occupancyId;
  const address = String(report.incidentAddress || "").toLowerCase();
  if (!occId && !address) return [];

  const now = new Date(report.incidentDate || Date.now());
  const cutoff30 = new Date(now); cutoff30.setDate(cutoff30.getDate() - 30);
  const cutoff90 = new Date(now); cutoff90.setDate(cutoff90.getDate() - 90);
  const cutoff365 = new Date(now); cutoff365.setFullYear(cutoff365.getFullYear() - 1);

  return allReports
    .filter((r) => r.id !== report.id)
    .filter((r) => {
      if (occId && r.workspace?.location?.occupancyId === occId) return true;
      const rAddr = String(r.incidentAddress || "").toLowerCase();
      return address && rAddr && (rAddr.includes(address) || address.includes(rAddr));
    })
    .map((r) => ({
      id: r.id,
      reportNumber: r.reportNumber,
      incidentDate: r.incidentDate,
      type: r.incidentTypeSummary,
      status: r.status,
      period: classifyPeriod(new Date(r.incidentDate), now, cutoff30, cutoff90, cutoff365),
    }));
}

function classifyPeriod(date, now, c30, c90, c365) {
  if (date >= c30) return "30d";
  if (date >= c90) return "90d";
  if (date >= c365) return "12mo";
  return "all";
}
