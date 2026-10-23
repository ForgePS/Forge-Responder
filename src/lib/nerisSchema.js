import modulesBundle from "../data/neris/modules.json";
import valueSetsBundle from "../data/neris/valueSets.json";

export const NERIS_SCHEMA_REPO = "https://github.com/ulfsri/neris-framework";
export { NERIS_REPORT_STATUSES } from "./neris/workflow.js";

/** @typedef {{ name: string, properties: Record<string, string> }} NerisFieldDef */

export const NERIS_FORM_MODULES = [
  { id: "core_mod_incident", label: "Core Incident", description: "NERIS core incident identifiers, location, aid, and narrative." },
  { id: "mod_fire", label: "Fire", description: "Fire suppression, structure, and outdoor fire details." },
  { id: "mod_hazard", label: "Hazard", description: "Hazardous materials / hazsit module fields." },
  { id: "mod_medical", label: "EMS / Medical", description: "NERIS medical module fields (non-NEMSIS workspace companion)." },
  { id: "mod_rescue_ff", label: "Rescue (FF)", description: "Firefighter rescue module fields." },
  { id: "mod_rescue_nonff", label: "Rescue (Non-FF)", description: "Non-firefighter rescue module fields." },
  { id: "mod_emerging_hazard", label: "Emerging Hazard", description: "Emerging hazard incident details." },
  { id: "mod_exposure", label: "Exposure", description: "Exposure and property involvement." },
  { id: "mod_risk_reduction", label: "Risk Reduction", description: "Community risk reduction actions." },
];

const modules = modulesBundle.modules || {};
const valueSets = valueSetsBundle.valueSets || {};

/** @param {string} moduleId */
export function getNerisModule(moduleId) {
  return modules[moduleId] || null;
}

/** @returns {string[]} */
export function listNerisModuleIds() {
  return Object.keys(modules);
}

/** @param {string} name */
export function getNerisValueSet(name) {
  if (!name) return [];
  const set = valueSets[name];
  return set?.options || [];
}

/** @param {string} format */
export function resolveValueSetName(format = "") {
  const match = String(format).match(/type_[a-z0-9_]+/i);
  return match ? match[0].toLowerCase() : "";
}

/** @param {NerisFieldDef} field */
function isComputedField(field) {
  return String(field.properties.computed || "").toUpperCase() === "TRUE";
}

/** @param {NerisFieldDef} field */
function isModuleReference(field) {
  const type = String(field.properties.type || "");
  return type === "Module" || type.startsWith("Array[Module]");
}

/**
 * User-fillable fields for a NERIS module form (skips computed + nested module refs).
 * @param {string} moduleId
 */
export function getFillableFields(moduleId) {
  const moduleDef = getNerisModule(moduleId);
  if (!moduleDef) return [];

  return moduleDef.fields
    .filter((field) => !isComputedField(field) && !isModuleReference(field))
    .map((field) => {
      const type = field.properties.type || "Text";
      const valueSetName = String(field.properties.value_set || "").toUpperCase() === "TRUE"
        ? resolveValueSetName(field.properties.format || field.properties.reference_location || "")
        : "";
      const cardinality = field.properties.cardinality || "Single";
      const inputType = resolveInputType(type, cardinality);

      return {
        moduleId,
        name: field.name,
        label: humanizeFieldName(field.name),
        group: field.properties.group || "general",
        type,
        inputType,
        valueSetName,
        options: valueSetName ? getNerisValueSet(valueSetName) : [],
        definition: field.properties.definition || "",
        example: field.properties.example || "",
        nerisCore: String(field.properties.neris_core || "").toUpperCase() === "TRUE",
        cardinality,
        possibleIf: field.properties.possible_if || "",
      };
    });
}

/** @param {string} type @param {string} cardinality */
function resolveInputType(type, cardinality) {
  const normalized = String(type).toLowerCase();
  if (normalized.includes("boolean")) return "boolean";
  if (normalized.includes("integer") || normalized === "int") return "number";
  if (normalized.includes("float") || normalized.includes("double")) return "number";
  if (normalized.includes("date") || normalized.includes("timestamp")) return "datetime-local";
  if (cardinality === "Multi" || normalized.startsWith("array")) return "multiselect";
  return "text";
}

/** @param {string} name */
export function humanizeFieldName(name = "") {
  return String(name)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** @param {Record<string, Record<string, unknown>>} modulesData */
export function summarizeIncidentType(modulesData = {}) {
  const core = modulesData.core_mod_incident || {};
  const raw = core.incident_final_type;
  if (Array.isArray(raw)) return raw.flat().filter(Boolean).join(", ");
  return String(raw || "").trim();
}

/** @param {Record<string, unknown>} report */
export function summarizeReportAddress(report = {}) {
  return String(report.incidentAddress || report.address || "").trim();
}
