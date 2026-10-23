import { NARRATIVE_TEMPLATES } from "./picklists.js";

/**
 * Generate a draft narrative from incident data (template-based, reviewable).
 * @param {Record<string, unknown>} report
 */
export function generateDraftNarrative(report = {}) {
  const workspace = report.workspace || {};
  const modules = report.modules || {};
  const core = modules.core_mod_incident || {};
  const type = report.incidentTypeSummary || core.incident_final_type || "incident";
  const address = report.incidentAddress || workspace.location?.address || "the reported location";
  const units = (workspace.units || []).map((u) => u.unitId).filter(Boolean).join(", ");
  const actions = (workspace.actions || []).join(", ").replace(/_/g, " ").toLowerCase();
  const weather = workspace.weather?.source === "weather-api-simulated" ? null : workspace.weather?.dispatchWeather;
  const cad = workspace.cad || {};

  const templateId = matchTemplate(type);
  const template = NARRATIVE_TEMPLATES.find((t) => t.id === templateId);

  const parts = [
    `Units${units ? ` ${units}` : ""} were dispatched to ${address}`,
    cad.dispatchTime ? `at ${formatTime(cad.dispatchTime)}` : "in response to an alarm",
    `for a ${humanizeType(type)}.`,
  ];

  if (weather?.condition) {
    parts.push(`Weather at dispatch was ${weather.condition.toLowerCase()} with ${weather.temperature || "unknown"} temperature and ${weather.windSpeed || "calm"} winds.`);
  }

  if (workspace.location?.occupancyName) {
    parts.push(`The incident occurred at ${workspace.location.occupancyName}, a ${workspace.location.propertyUse || "commercial"} occupancy.`);
  }

  if (actions) {
    parts.push(`Crews performed ${actions}.`);
  }

  if (workspace.ems?.chiefComplaint) {
    parts.push(`Patient presented with ${humanizeType(workspace.ems.chiefComplaint)}.`);
  }

  if (core.incident_narrative_outcome) {
    parts.push(String(core.incident_narrative_outcome));
  } else {
    parts.push("All units returned to service.");
  }

  return {
    body: parts.join(" "),
    aiGenerated: true,
    templateId,
    generatedAt: new Date().toISOString(),
  };
}

/** @param {unknown} type */
function matchTemplate(type) {
  const t = String(Array.isArray(type) ? type[0] : type).toUpperCase();
  if (/FALSE|UNFOUND/.test(t)) return "false_alarm";
  if (/CANCEL/.test(t)) return "cancelled_enroute";
  if (/EMS|MEDICAL/.test(t)) return "ems_assist";
  if (/MVA|ACCIDENT/.test(t)) return "mva";
  if (/STRUCTURE/.test(t)) return "structure_fire";
  if (/VEHICLE.*FIRE/.test(t)) return "vehicle_fire";
  if (/BRUSH|WILDLAND|OUTSIDE/.test(t)) return "brush_fire";
  if (/HAZMAT|HAZSIT/.test(t)) return "hazmat";
  if (/ALARM/.test(t)) return "fire_alarm";
  if (/PUBLIC|SERVICE|ASSIST/.test(t)) return "public_service";
  return "public_service";
}

/** @param {unknown} value */
function humanizeType(value) {
  return String(Array.isArray(value) ? value.join(", ") : value)
    .replace(/_/g, " ")
    .toLowerCase();
}

/** @param {string} iso */
function formatTime(iso) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

/**
 * Convert bullet notes to narrative prose.
 * @param {string} bullets
 */
export function bulletsToNarrative(bullets = "") {
  return bullets
    .split(/\n+/)
    .map((line) => line.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean)
    .map((line, i, arr) => {
      const sentence = line.charAt(0).toUpperCase() + line.slice(1);
      return i === arr.length - 1 && !sentence.endsWith(".") ? `${sentence}.` : sentence;
    })
    .join(" ");
}
