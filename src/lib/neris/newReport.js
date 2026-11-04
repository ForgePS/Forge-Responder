/**
 * A blank NERIS incident report, the same in the RMS and FORGE FIELD.
 */
import { NERIS_FORM_MODULES } from "../nerisSchema.js";
import { uniqueRecordId } from "../recordIds.js";

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildNewNerisReport(reportNumber, { id, disciplines = [], incidentDate, incidentAddress } = {}) {
  const now = new Date().toISOString();
  return {
    id: id || uniqueRecordId("NERIS"),
    reportNumber,
    incidentDate: incidentDate || todayIso(),
    incidentAddress: incidentAddress || "",
    incidentTypeSummary: "",
    status: "Draft",
    disciplines,
    reviewStage: "author",
    locked: false,
    createdAt: now,
    updatedAt: now,
    workspace: {
      cad: {}, location: {}, units: [], personnel: [], weather: {}, ems: {}, rescue: {}, wildland: {},
      casualties: {}, propertyLoss: {}, actions: [], narrative: {}, attachments: [], approvals: [], auditLog: [], investigations: {}, disciplines,
    },
    autoPopulateSources: {},
    fieldOverrides: {},
    fieldInputOverrides: {},
    modules: Object.fromEntries(NERIS_FORM_MODULES.map((module) => [module.id, module.id === "core_mod_incident" ? { incident_internal_id: reportNumber } : {}])),
  };
}
