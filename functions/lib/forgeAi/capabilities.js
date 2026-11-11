/**
 * Forge AI capability catalog: what each capability needs before it may run.
 * A capability runs only when ALL of these hold:
 *   - the department switched Forge AI on (forgeAiSettings/main.enabled)
 *   - the capability is not switched off for the department
 *   - the member holds useForgeAi plus the capability's own permission keys
 *     (the same keys that already gate the underlying RMS data)
 *   - the department's plan includes the underlying module
 * Platform creators pass permission checks, as everywhere else in FORGE.
 */

const PERMISSIONS = Object.freeze({
  use: "useForgeAi",
  briefings: "useForgeAiBriefings",
  supervisorQa: "useForgeAiSupervisorQa",
  manage: "manageForgeAi",
  usage: "viewForgeAiUsage",
});

const CAPABILITIES = Object.freeze([
  {
    id: "incident",
    label: "Incident Intelligence",
    description: "Summaries, timelines, missing or inconsistent fields and similar incidents from NERIS reports.",
    allOf: ["viewNerisReports"],
    module: "nerisFireReports",
    suggestions: ["Summarize incidents from the last 7 days", "Show structure fires this month", "Which incidents happened on Main St this year?"],
  },
  {
    id: "dispatch",
    label: "Dispatch Intelligence",
    description: "Search calls by time, type, unit or address using CAD times recorded on reports and the Active911 alert window.",
    allOf: ["viewNerisReports"],
    module: "nerisFireReports",
    suggestions: ["What calls did E1 run yesterday?", "List medical calls in the last 24 hours", "Show recent Active911 alerts"],
  },
  {
    id: "heatZone",
    label: "Heat Zone Intelligence",
    description: "Call concentrations, district comparison, repeat locations, time-of-day patterns and period comparison.",
    allOf: ["viewHeatZoneAnalytics"],
    module: "analytics",
    suggestions: ["Which district was busiest in the last 30 days?", "What hours have the most calls this month?", "Compare this month to last month"],
  },
  {
    id: "units",
    label: "Unit & Resource Intelligence",
    description: "Fleet readiness, restrictions and unit activity on recorded incidents.",
    anyOf: ["viewApparatus", "viewFleetDashboard"],
    module: "apparatus",
    suggestions: ["Which units are out of service?", "How many calls did each unit run this week?"],
  },
  {
    id: "briefing",
    label: "Shift & Command Briefings",
    description: "A structured briefing built only from the data you can see.",
    allOf: [PERMISSIONS.briefings, "viewNerisReports"],
    module: "nerisFireReports",
    suggestions: ["Create a shift briefing for the last 24 hours", "Create a command briefing for the last 7 days"],
  },
  {
    id: "nerisQuality",
    label: "NERIS Data Quality",
    description: "Checks reports against Forge's NERIS validation rules. It does not write or submit reports.",
    allOf: ["viewNerisReports"],
    module: "nerisFireReports",
    suggestions: ["Which reports this month are missing required NERIS fields?", "What is blocking reports from being submitted?"],
  },
  {
    id: "supervisorQa",
    label: "Supervisor QA",
    description: "Separates confirmed rule failures, potential issues and AI observations. Never a finding about a member.",
    allOf: [PERMISSIONS.supervisorQa, "viewNerisReports"],
    module: "nerisFireReports",
    suggestions: ["Run a QA review of reports from the last 7 days"],
  },
  {
    id: "knowledge",
    label: "Platform Knowledge",
    description: "How FORGE Responder works, answered from FORGE's own documentation.",
    allOf: [],
    module: "",
    suggestions: ["How does Heat Zone Analytics assign calls to districts?", "How does the offline demo work?"],
  },
]);

const CAPABILITY_IDS = CAPABILITIES.map((c) => c.id);
const byId = (id) => CAPABILITIES.find((c) => c.id === id) || null;

/**
 * Is a capability available to this member right now?
 * @returns {{allowed:boolean, reason:string}}
 */
function capabilityAccess(capability, { permissions = {}, isCreator = false, modules = null, settings = {} }) {
  const cap = typeof capability === "string" ? byId(capability) : capability;
  if (!cap) return { allowed: false, reason: "Unknown capability." };
  if (settings.enabled !== true) return { allowed: false, reason: "Forge AI is turned off for your department." };
  if (settings.capabilities && settings.capabilities[cap.id] === false) {
    return { allowed: false, reason: `${cap.label} is turned off for your department.` };
  }
  if (cap.module && Array.isArray(modules) && !modules.includes(cap.module)) {
    return { allowed: false, reason: `${cap.label} needs a module that isn't in your department's plan.` };
  }
  if (isCreator) return { allowed: true, reason: "" };
  const has = (key) => permissions[key] === true;
  if (!has(PERMISSIONS.use)) return { allowed: false, reason: "You don't have access to Forge AI." };
  if ((cap.allOf || []).some((key) => !has(key))) return { allowed: false, reason: `You don't have access to the data ${cap.label} uses.` };
  if (cap.anyOf && cap.anyOf.length && !cap.anyOf.some(has)) return { allowed: false, reason: `You don't have access to the data ${cap.label} uses.` };
  return { allowed: true, reason: "" };
}

module.exports = {
  CAPABILITIES,
  CAPABILITY_IDS,
  PERMISSIONS,
  byId,
  capabilityAccess,
};
