import { getFillableFields } from "../nerisSchema.js";
import { resolveApplicableSections, isSectionRequired } from "./sections.js";

/** @typedef {{ id: string, severity: 'error' | 'warning', section: string, field?: string, message: string, blocking: boolean }} NerisValidationIssue */

/**
 * @param {Record<string, unknown>} report
 * @returns {NerisValidationIssue[]}
 */
export function validateNerisReport(report = {}) {
  /** @type {NerisValidationIssue[]} */
  const issues = [];
  const modules = report.modules || {};
  const workspace = report.workspace || {};
  const core = modules.core_mod_incident || {};

  const sections = resolveApplicableSections(report);
  for (const section of sections) {
    if (!isSectionRequired(section.id, report)) continue;

    if (section.moduleId) {
      const fields = getFillableFields(section.moduleId).filter((f) => f.nerisCore);
      const moduleData = modules[section.moduleId] || {};
      for (const field of fields) {
        const val = moduleData[field.name];
        const empty = val === undefined || val === null || val === ""
          || (Array.isArray(val) && !val.length);
        if (empty) {
          issues.push({
            id: `${section.id}:${field.name}`,
            severity: "error",
            section: section.id,
            field: field.name,
            message: `${field.label} is required`,
            blocking: true,
          });
        }
      }
    }

    if (section.id === "location" && !report.incidentAddress && !workspace.location?.address) {
      issues.push({
        id: "location:address",
        severity: "error",
        section: "location",
        field: "incidentAddress",
        message: "Incident address is required",
        blocking: true,
      });
    }

    if (section.id === "units" && !(workspace.units || []).length) {
      issues.push({
        id: "units:empty",
        severity: "warning",
        section: "units",
        message: "No units assigned to this incident",
        blocking: false,
      });
    }

    if (section.id === "narrative") {
      const narrative = workspace.narrative?.body || core.incident_narrative_outcome || "";
      if (!String(narrative).trim()) {
        issues.push({
          id: "narrative:empty",
          severity: "error",
          section: "narrative",
          field: "narrative",
          message: "Narrative is required",
          blocking: true,
        });
      }
    }

    if (section.id === "actions" && !(workspace.actions || []).length) {
      issues.push({
        id: "actions:empty",
        severity: "warning",
        section: "actions",
        message: "No actions taken recorded",
        blocking: false,
      });
    }

    if (section.id === "ems" && isSectionRequired("ems", report)) {
      const ems = workspace.ems || {};
      if (!ems.chiefComplaint) {
        issues.push({
          id: "ems:complaint",
          severity: "error",
          section: "ems",
          field: "chiefComplaint",
          message: "Chief complaint is required for EMS incidents",
          blocking: true,
        });
      }
    }
  }

  validateTimelines(workspace, issues);
  validateCrossModule(report, issues);

  return issues;
}

/** @param {Record<string, unknown>} workspace @param {NerisValidationIssue[]} issues */
function validateTimelines(workspace, issues) {
  const cad = workspace.cad || {};
  const units = workspace.units || [];
  const dispatch = parseTime(cad.dispatchTime);
  const arrival = parseTime(cad.arrivalTime || units[0]?.arrivalTime);
  const clear = parseTime(cad.clearTime || units[0]?.clearTime);

  if (dispatch && arrival && arrival < dispatch) {
    issues.push({
      id: "time:arrival-before-dispatch",
      severity: "error",
      section: "cad",
      message: "Arrival cannot be before dispatch",
      blocking: true,
    });
  }
  if (arrival && clear && clear < arrival) {
    issues.push({
      id: "time:clear-before-arrival",
      severity: "error",
      section: "cad",
      message: "Clear cannot be before arrival",
      blocking: true,
    });
  }
}

/** @param {Record<string, unknown>} report @param {NerisValidationIssue[]} issues */
function validateCrossModule(report, issues) {
  const workspace = report.workspace || {};
  const actions = workspace.actions || [];
  const modules = report.modules || {};

  if (actions.includes("SUPPRESSION") && !modules.mod_fire) {
    issues.push({
      id: "cross:fire-module",
      severity: "error",
      section: "fire",
      message: "Fire suppression action requires fire module data",
      blocking: true,
    });
  }
  if (actions.includes("EMS_CARE") && !workspace.ems?.chiefComplaint) {
    issues.push({
      id: "cross:ems-module",
      severity: "warning",
      section: "ems",
      message: "EMS care action should include EMS details",
      blocking: false,
    });
  }
  if (actions.includes("HAZMAT_MITIGATION") && !Object.keys(modules.mod_hazard || {}).length) {
    issues.push({
      id: "cross:hazmat-module",
      severity: "warning",
      section: "hazmat",
      message: "HazMat action should include HazMat module data",
      blocking: false,
    });
  }
}

/** @param {unknown} value */
function parseTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * @param {Record<string, unknown>} report
 */
export function computeCompletionPercentage(report = {}) {
  const sections = resolveApplicableSections(report);
  const requiredSections = sections.filter((s) => isSectionRequired(s.id, report));
  if (!requiredSections.length) return 0;

  const issues = validateNerisReport(report);
  const blockingBySection = new Set(
    issues.filter((i) => i.blocking).map((i) => i.section),
  );

  let complete = 0;
  for (const section of requiredSections) {
    if (!blockingBySection.has(section.id)) complete += 1;
  }
  return Math.round((complete / requiredSections.length) * 100);
}

/**
 * @param {NerisValidationIssue[]} issues
 */
export function countBlockingErrors(issues = []) {
  return issues.filter((i) => i.blocking && i.severity === "error").length;
}
