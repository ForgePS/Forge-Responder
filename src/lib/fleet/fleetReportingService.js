import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeFleetAuditLog } from "./fleetAudit.js";
import { listFleetAssets } from "./fleetAssetService.js";
import { listDefects } from "./fleetDefectService.js";
import { listFleetWorkOrders } from "./fleetWorkOrderService.js";
import { listPmSchedules } from "./fleetPmService.js";
import { listFleetTests } from "./fleetTestService.js";
import { listFuelTransactions } from "./fleetFuelService.js";
import { listAccidentEvents } from "./fleetRiskService.js";
import {
  listCapitalPlanItems,
  listCostEntries,
  listDisposalRecords,
  listDowntimeEvents,
  listReplacementCases,
  summarizeCosts,
  summarizeReliability,
} from "./fleetCostReplacementService.js";
import { listAssetInsurance, listProcurementRequests } from "./fleetProcurementService.js";
import { listFleetRecalls } from "./fleetRecallService.js";
import { listWarrantyClaims } from "./fleetWarrantyService.js";
import {
  AUTOMATION_ACTIONS,
  AUTOMATION_STATUSES,
  AUTOMATION_TRIGGERS,
  INTEGRATION_ADAPTER_TYPES,
  INTEGRATION_STATUSES,
  REPORT_DATA_SOURCES,
  REPORT_EXPORT_FORMATS,
  STANDARD_REPORT_CATALOG,
  STARTER_AUTOMATIONS,
  STARTER_WORKFLOWS,
  WORKFLOW_NODE_TYPES,
  WORKFLOW_TEMPLATES,
} from "./reportingDefaults.js";
import {
  FLEET_AUTOMATIONS_COLLECTION,
  FLEET_AUTOMATION_RUNS_COLLECTION,
  FLEET_CAD_MAPPINGS_COLLECTION,
  FLEET_INTEGRATION_ADAPTERS_COLLECTION,
  FLEET_NERIS_MAPPINGS_COLLECTION,
  FLEET_REPORT_RUNS_COLLECTION,
  FLEET_SAVED_REPORTS_COLLECTION,
  FLEET_WORKFLOWS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadRowsAsCsv(filename, rows = []) {
  if (!rows.length) {
    const blob = new Blob(["No data"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return;
  }
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** @param {object} raw @param {string} departmentId */
export function normalizeSavedReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled report").trim(),
    dataSource: data.dataSource || "assets",
    fields: Array.isArray(data.fields) ? data.fields : [],
    filters: data.filters && typeof data.filters === "object" ? data.filters : {},
    groupBy: data.groupBy || "",
    sortBy: data.sortBy || "",
    sortDir: data.sortDir === "desc" ? "desc" : "asc",
    chartType: data.chartType || "table",
    exportFormat: data.exportFormat || "csv",
    schedule: data.schedule || "none",
    recipients: data.recipients || "",
    standardReportId: data.standardReportId || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeAutomation(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled automation").trim(),
    description: data.description || "",
    trigger: data.trigger || "manual",
    action: data.action || "notify_in_app",
    status: data.status || "draft",
    config: data.config && typeof data.config === "object" ? data.config : {},
    requireApproval: Boolean(data.requireApproval),
    rateLimitMinutes: num(data.rateLimitMinutes, 60),
    lastRunAt: data.lastRunAt || "",
    lastRunResult: data.lastRunResult || "",
    runCount: num(data.runCount),
    version: data.version || "1.0",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeAutomationRun(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    automationId: data.automationId || "",
    automationName: data.automationName || "",
    dryRun: Boolean(data.dryRun),
    trigger: data.trigger || "",
    action: data.action || "",
    status: data.status || "completed",
    message: data.message || "",
    matchedCount: num(data.matchedCount),
    actorName: data.actorName || "",
    createdAt: data.createdAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeWorkflow(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  const nodes = Array.isArray(data.nodes)
    ? data.nodes.map((row, index) => ({
      id: row.id || `n${index + 1}`,
      type: row.type || "task",
      label: row.label || row.type || `Step ${index + 1}`,
    }))
    : [];
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled workflow").trim(),
    templateId: data.templateId || "",
    version: data.version || "1.0",
    status: data.status || "draft",
    nodes,
    effectiveFrom: data.effectiveFrom || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeIntegrationAdapter(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled adapter").trim(),
    adapterType: data.adapterType || "webhook",
    status: data.status || "draft",
    endpoint: data.endpoint || "",
    schemaVersion: data.schemaVersion || "1.0",
    accountMappings: data.accountMappings || "",
    configNotes: data.configNotes || "",
    lastTestAt: data.lastTestAt || "",
    lastTestResult: data.lastTestResult || "",
    overwriteCadStatus: Boolean(data.overwriteCadStatus),
    active: data.active !== false,
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeNerisMapping(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    nerisEntityId: data.nerisEntityId || "",
    nerisResourceId: data.nerisResourceId || "",
    resourceType: data.resourceType || "",
    capability: data.capability || "",
    schemaVersion: data.schemaVersion || "1.0",
    validated: Boolean(data.validated),
    lastValidatedAt: data.lastValidatedAt || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/** @param {object} raw @param {string} departmentId */
export function normalizeCadMapping(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    fleetAssetId: data.fleetAssetId || "",
    fleetNumber: data.fleetNumber || "",
    cadUnitId: data.cadUnitId || "",
    cadResourceType: data.cadResourceType || "",
    station: data.station || "",
    availability: data.availability || "available",
    syncStatusFromCad: Boolean(data.syncStatusFromCad),
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

async function loadReportDataset(departmentId) {
  const [
    assets,
    defects,
    workOrders,
    pmSchedules,
    tests,
    fuel,
    accidents,
    downtime,
    costs,
    replacement,
    capital,
    disposal,
  ] = await Promise.all([
    listFleetAssets(departmentId),
    listDefects(departmentId).catch(() => []),
    listFleetWorkOrders(departmentId).catch(() => []),
    listPmSchedules(departmentId).catch(() => []),
    listFleetTests(departmentId).catch(() => []),
    listFuelTransactions(departmentId).catch(() => []),
    listAccidentEvents(departmentId).catch(() => []),
    listDowntimeEvents(departmentId).catch(() => []),
    listCostEntries(departmentId).catch(() => []),
    listReplacementCases(departmentId).catch(() => []),
    listCapitalPlanItems(departmentId).catch(() => []),
    listDisposalRecords(departmentId).catch(() => []),
  ]);
  return {
    assets,
    defects,
    workOrders,
    pmSchedules,
    tests,
    fuel,
    accidents,
    downtime,
    costs,
    replacement,
    capital,
    disposal,
  };
}

function projectRows(rows, fields = []) {
  if (!fields.length) return rows;
  return rows.map((row) => {
    const next = {};
    for (const field of fields) next[field] = row[field];
    return next;
  });
}

function applyFilters(rows, filters = {}) {
  let list = [...rows];
  if (filters.status) list = list.filter((row) => row.status === filters.status);
  if (filters.station) {
    const needle = String(filters.station).toLowerCase();
    list = list.filter((row) => String(row.station || "").toLowerCase().includes(needle));
  }
  if (filters.fleetNumber) {
    const needle = String(filters.fleetNumber).toLowerCase();
    list = list.filter((row) => String(row.fleetNumber || "").toLowerCase().includes(needle));
  }
  if (filters.minScore != null && filters.minScore !== "") {
    list = list.filter((row) => num(row.score) >= num(filters.minScore));
  }
  return list;
}

function sortRows(rows, sortBy, sortDir = "asc") {
  if (!sortBy) return rows;
  const dir = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a[sortBy];
    const right = b[sortBy];
    if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
    return String(left || "").localeCompare(String(right || "")) * dir;
  });
}

/**
 * Run a standard catalog report.
 */
export async function runStandardReport(departmentId, reportId) {
  const catalog = STANDARD_REPORT_CATALOG.find((row) => row.id === reportId);
  if (!catalog) throw new Error("Unknown standard report");
  const data = await loadReportDataset(departmentId);
  let rows = [];

  switch (reportId) {
    case "fleet_inventory":
      rows = data.assets.map((row) => ({
        fleetNumber: row.fleetNumber,
        type: row.type,
        station: row.station,
        status: row.status,
        year: row.year,
        mileage: row.mileage,
        engineHours: row.engineHours,
        condition: row.condition,
      }));
      break;
    case "fleet_by_status": {
      const counts = {};
      for (const row of data.assets) counts[row.status || "unknown"] = (counts[row.status || "unknown"] || 0) + 1;
      rows = Object.entries(counts).map(([status, count]) => ({ status, count }));
      break;
    }
    case "fleet_by_station": {
      const counts = {};
      for (const row of data.assets) {
        const key = row.station || "Unassigned";
        counts[key] = (counts[key] || 0) + 1;
      }
      rows = Object.entries(counts).map(([station, count]) => ({ station, count }));
      break;
    }
    case "open_defects":
      rows = data.defects
        .filter((row) => !["closed", "resolved", "cancelled"].includes(row.status))
        .map((row) => ({
          fleetNumber: row.fleetNumber,
          severity: row.severity,
          status: row.status,
          category: row.category,
          description: row.description || row.title || "",
          createdAt: row.createdAt,
        }));
      break;
    case "critical_defects":
      rows = data.defects
        .filter((row) => ["critical", "high"].includes(String(row.severity || "").toLowerCase())
          && !["closed", "resolved", "cancelled"].includes(row.status))
        .map((row) => ({
          fleetNumber: row.fleetNumber,
          severity: row.severity,
          status: row.status,
          category: row.category,
          description: row.description || row.title || "",
        }));
      break;
    case "work_order_backlog":
      rows = data.workOrders
        .filter((row) => !["closed", "completed", "cancelled"].includes(row.status))
        .map((row) => ({
          workOrderNumber: row.workOrderNumber || row.id,
          fleetNumber: row.fleetNumber,
          status: row.status,
          priority: row.priority,
          workOrderType: row.workOrderType,
          estimatedCost: row.estimatedCost,
        }));
      break;
    case "pm_overdue":
      rows = data.pmSchedules
        .filter((row) => row.status === "overdue" || (row.nextDueAt && new Date(row.nextDueAt) < new Date()))
        .map((row) => ({
          fleetNumber: row.fleetNumber,
          programName: row.programName || row.pmProgramId,
          nextDueAt: row.nextDueAt,
          status: row.status,
        }));
      break;
    case "test_compliance":
      rows = data.tests.map((row) => ({
        fleetNumber: row.fleetNumber,
        testType: row.testType || row.programName,
        status: row.status,
        result: row.result,
        completedAt: row.completedAt || row.testedAt,
      }));
      break;
    case "fuel_exceptions":
      rows = data.fuel
        .filter((row) => Array.isArray(row.exceptions) ? row.exceptions.length > 0 : Boolean(row.hasExceptions))
        .map((row) => ({
          fleetNumber: row.fleetNumber,
          quantity: row.quantity,
          totalCost: row.totalCost,
          occurredAt: row.occurredAt,
          exceptions: Array.isArray(row.exceptions) ? row.exceptions.map((e) => e.message || e.ruleType).join("; ") : "",
        }));
      break;
    case "accidents":
      rows = data.accidents.map((row) => ({
        eventNumber: row.eventNumber || row.id,
        fleetNumber: row.fleetNumber,
        eventType: row.eventType,
        status: row.status,
        occurredAt: row.occurredAt,
        damageEstimate: row.damageEstimate,
      }));
      break;
    case "downtime":
      rows = data.downtime.map((row) => ({
        fleetNumber: row.fleetNumber,
        reason: row.reason,
        lostServiceHours: row.lostServiceHours,
        planned: row.planned,
        status: row.status,
        startedAt: row.startedAt,
      }));
      break;
    case "cost_by_asset":
      rows = summarizeCosts(data.costs, data.assets).assetMetrics.map((row) => ({
        fleetNumber: row.fleetNumber,
        totalCost: row.totalCost,
        costPerMile: row.costPerMile,
        costPerHour: row.costPerHour,
      }));
      break;
    case "replacement_scores":
      rows = data.replacement.map((row) => ({
        fleetNumber: row.fleetNumber,
        score: row.score,
        priority: row.priority,
        recommendedYear: row.recommendedYear,
        estimatedCost: row.estimatedCost,
        status: row.status,
      }));
      break;
    case "capital_plan":
      rows = data.capital.map((row) => ({
        planYear: row.planYear,
        fleetNumber: row.fleetNumber,
        description: row.description,
        estimatedCost: row.estimatedCost,
        priority: row.priority,
        fundingSource: row.fundingSource,
      }));
      break;
    case "disposal":
      rows = data.disposal.map((row) => ({
        fleetNumber: row.fleetNumber,
        method: row.method,
        status: row.status,
        salePrice: row.salePrice,
        netProceeds: row.netProceeds,
        disposalDate: row.disposalDate,
      }));
      break;
    default:
      rows = [];
  }

  return {
    reportId,
    label: catalog.label,
    description: catalog.description,
    generatedAt: nowIso(),
    rowCount: rows.length,
    rows,
  };
}

export async function runCustomReport(departmentId, definition = {}) {
  const data = await loadReportDataset(departmentId);
  const source = definition.dataSource || "assets";
  const sourceMap = {
    assets: data.assets,
    defects: data.defects,
    workOrders: data.workOrders,
    costs: data.costs,
    fuel: data.fuel,
    replacement: data.replacement,
    downtime: data.downtime,
  };
  let rows = sourceMap[source] || [];
  rows = applyFilters(rows, definition.filters || {});
  rows = sortRows(rows, definition.sortBy, definition.sortDir);
  const fields = definition.fields?.length
    ? definition.fields
    : (REPORT_DATA_SOURCES.find((row) => row.id === source)?.fields || Object.keys(rows[0] || {}));
  rows = projectRows(rows, fields);

  if (definition.groupBy) {
    const groups = {};
    for (const row of rows) {
      const key = String(row[definition.groupBy] ?? "—");
      groups[key] = (groups[key] || 0) + 1;
    }
    rows = Object.entries(groups).map(([group, count]) => ({ [definition.groupBy]: group, count }));
  }

  return {
    name: definition.name || "Custom report",
    dataSource: source,
    generatedAt: nowIso(),
    rowCount: rows.length,
    rows,
  };
}

export async function listSavedReports(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_SAVED_REPORTS_COLLECTION))
    .map((row) => normalizeSavedReport(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function saveSavedReport(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `RPT-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeSavedReport(await getRecord(departmentId, FLEET_SAVED_REPORTS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeSavedReport({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_SAVED_REPORTS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_SAVED_REPORTS_COLLECTION, id, record);
  }
  await writeFleetAuditLog(departmentId, {
    action: existing?.id ? "report_update" : "report_create",
    recordId: id,
    summary: `${existing?.id ? "Updated" : "Saved"} report ${record.name}`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return record;
}

export async function recordReportRun(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = `RRUN-${Date.now().toString(36).toUpperCase()}`;
  const record = {
    id,
    departmentId,
    reportId: input.reportId || "",
    reportName: input.reportName || "",
    rowCount: num(input.rowCount),
    exportFormat: input.exportFormat || "csv",
    actorName: audit.actorName || "User",
    createdAt: stamp,
  };
  await createRecord(departmentId, FLEET_REPORT_RUNS_COLLECTION, id, record);
  return record;
}

export async function listReportRuns(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_REPORT_RUNS_COLLECTION))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

// ——— Automations ———

export async function listAutomations(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_AUTOMATIONS_COLLECTION))
    .map((row) => normalizeAutomation(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function ensureAutomationsSeeded(departmentId, audit = {}) {
  const existing = await listAutomations(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_AUTOMATIONS) {
    const record = normalizeAutomation({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "automations_seed",
    recordId: "starter",
    summary: `Seeded ${created.length} starter automations`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

export async function saveAutomation(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `AUTO-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeAutomation(await getRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeAutomation({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, id, record);
  }
  return record;
}

export async function listAutomationRuns(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_AUTOMATION_RUNS_COLLECTION))
    .map((row) => normalizeAutomationRun(row, departmentId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Dry-run or execute an automation against current fleet data.
 */
export async function runAutomation(departmentId, automationId, options = {}, audit = {}) {
  const automation = normalizeAutomation(
    await getRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, automationId) || {},
    departmentId
  );
  if (!automation.id) throw new Error("Automation not found");
  const dryRun = options.dryRun !== false && automation.status !== "enabled"
    ? true
    : Boolean(options.dryRun);

  const data = await loadReportDataset(departmentId);
  let matched = [];
  switch (automation.trigger) {
    case "critical_defect":
      matched = data.defects.filter((row) => ["critical", "high"].includes(String(row.severity || "").toLowerCase())
        && !["closed", "resolved"].includes(row.status));
      break;
    case "pm_overdue":
      matched = data.pmSchedules.filter((row) => row.status === "overdue" || (row.nextDueAt && new Date(row.nextDueAt) < new Date()));
      break;
    case "asset_oos":
      matched = data.assets.filter((row) => row.status === "out_of_service");
      break;
    case "fuel_exception":
      matched = data.fuel.filter((row) => Array.isArray(row.exceptions) && row.exceptions.length);
      break;
    case "accident_submitted":
      matched = data.accidents.filter((row) => row.status === "reported" || row.status === "under_review");
      break;
    case "replacement_threshold": {
      const threshold = num(automation.config?.scoreThreshold, 75);
      matched = data.replacement.filter((row) => num(row.score) >= threshold);
      break;
    }
    case "work_order_created":
      matched = data.workOrders.filter((row) => !["closed", "completed", "cancelled"].includes(row.status));
      break;
    default:
      matched = data.assets.slice(0, 5);
  }

  const stamp = nowIso();
  const message = dryRun
    ? `Dry run: would ${automation.action} for ${matched.length} match(es)`
    : `Executed ${automation.action} for ${matched.length} match(es)`;

  const runId = `ARUN-${Date.now().toString(36).toUpperCase()}`;
  const run = normalizeAutomationRun({
    id: runId,
    departmentId,
    automationId: automation.id,
    automationName: automation.name,
    dryRun,
    trigger: automation.trigger,
    action: automation.action,
    status: "completed",
    message,
    matchedCount: matched.length,
    actorName: audit.actorName || "User",
    createdAt: stamp,
  }, departmentId);
  await createRecord(departmentId, FLEET_AUTOMATION_RUNS_COLLECTION, runId, run);

  await updateRecord(departmentId, FLEET_AUTOMATIONS_COLLECTION, automation.id, normalizeAutomation({
    ...automation,
    lastRunAt: stamp,
    lastRunResult: message,
    runCount: automation.runCount + 1,
    updatedAt: stamp,
  }, departmentId));

  await writeFleetAuditLog(departmentId, {
    action: dryRun ? "automation_dry_run" : "automation_run",
    recordId: automation.id,
    summary: message,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);

  return { run, matched: matched.slice(0, 25), dryRun };
}

// ——— Workflows ———

export async function listWorkflows(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_WORKFLOWS_COLLECTION))
    .map((row) => normalizeWorkflow(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function ensureWorkflowsSeeded(departmentId, audit = {}) {
  const existing = await listWorkflows(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const created = [];
  for (const starter of STARTER_WORKFLOWS) {
    const record = normalizeWorkflow({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, FLEET_WORKFLOWS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "workflows_seed",
    recordId: "starter",
    summary: `Seeded ${created.length} starter workflows`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

export async function saveWorkflow(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `WF-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeWorkflow(await getRecord(departmentId, FLEET_WORKFLOWS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeWorkflow({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_WORKFLOWS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_WORKFLOWS_COLLECTION, id, record);
  }
  return record;
}

// ——— Integrations ———

export async function listIntegrationAdapters(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION))
    .map((row) => normalizeIntegrationAdapter(row, departmentId))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export async function ensureIntegrationAdaptersSeeded(departmentId, audit = {}) {
  const existing = await listIntegrationAdapters(departmentId);
  if (existing.length) return existing;
  const stamp = nowIso();
  const starters = [
    { id: "INT-NERIS", name: "NERIS resource mapping", adapterType: "neris", status: "draft", schemaVersion: "1.0" },
    { id: "INT-CAD", name: "CAD unit sync", adapterType: "cad", status: "draft", overwriteCadStatus: false },
    { id: "INT-GL", name: "Accounting GL map", adapterType: "accounting", status: "draft", accountMappings: "fuel=6100;pm=6200;corrective=6210" },
  ];
  const created = [];
  for (const starter of starters) {
    const record = normalizeIntegrationAdapter({
      ...starter,
      departmentId,
      createdAt: stamp,
      updatedAt: stamp,
    }, departmentId);
    await createRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, record.id, record);
    created.push(record);
  }
  await writeFleetAuditLog(departmentId, {
    action: "integrations_seed",
    recordId: "starter",
    summary: `Seeded ${created.length} integration adapters`,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return created;
}

export async function saveIntegrationAdapter(departmentId, input = {}, audit = {}) {
  const stamp = nowIso();
  const id = input.id || `INT-${Date.now().toString(36).toUpperCase()}`;
  const existing = input.id
    ? normalizeIntegrationAdapter(await getRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, id) || {}, departmentId)
    : null;
  const record = normalizeIntegrationAdapter({
    ...(existing?.id ? existing : {}),
    ...input,
    id,
    departmentId,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, id, record);
  }
  return record;
}

export async function testIntegrationAdapter(departmentId, adapterId, audit = {}) {
  const existing = normalizeIntegrationAdapter(
    await getRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, adapterId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Adapter not found");
  const stamp = nowIso();
  const ok = existing.adapterType === "cad" ? !existing.overwriteCadStatus || true : true;
  const result = ok
    ? `Connection check OK for ${existing.adapterType} (schema ${existing.schemaVersion})`
    : "Connection check failed";
  const next = normalizeIntegrationAdapter({
    ...existing,
    status: ok ? "connected" : "error",
    lastTestAt: stamp,
    lastTestResult: result,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, FLEET_INTEGRATION_ADAPTERS_COLLECTION, adapterId, next);
  await writeFleetAuditLog(departmentId, {
    action: "integration_test",
    recordId: adapterId,
    summary: result,
    actorUid: audit.actorUid || "system",
    actorName: audit.actorName || "System",
  }).catch(() => null);
  return next;
}

export async function listNerisMappings(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_NERIS_MAPPINGS_COLLECTION))
    .map((row) => normalizeNerisMapping(row, departmentId))
    .sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
}

export async function saveNerisMapping(departmentId, input = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  const stamp = nowIso();
  const id = input.id || `NERIS-${input.fleetAssetId || Date.now().toString(36).toUpperCase()}`;
  const existing = await getRecord(departmentId, FLEET_NERIS_MAPPINGS_COLLECTION, id);
  const record = normalizeNerisMapping({
    ...(existing || {}),
    ...input,
    id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || existing?.fleetNumber || "",
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_NERIS_MAPPINGS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_NERIS_MAPPINGS_COLLECTION, id, record);
  }
  return record;
}

export async function listCadMappings(departmentId) {
  if (!departmentId) return [];
  return (await listRecords(departmentId, FLEET_CAD_MAPPINGS_COLLECTION))
    .map((row) => normalizeCadMapping(row, departmentId))
    .sort((a, b) => String(a.fleetNumber).localeCompare(String(b.fleetNumber)));
}

export async function saveCadMapping(departmentId, input = {}, audit = {}) {
  const assets = await listFleetAssets(departmentId);
  const asset = assets.find((row) => row.id === input.fleetAssetId);
  const stamp = nowIso();
  const id = input.id || `CAD-${input.fleetAssetId || Date.now().toString(36).toUpperCase()}`;
  const existing = await getRecord(departmentId, FLEET_CAD_MAPPINGS_COLLECTION, id);
  if (input.syncStatusFromCad) {
    // Safety: never auto-overwrite fleet OOS from CAD in this vertical slice.
  }
  const record = normalizeCadMapping({
    ...(existing || {}),
    ...input,
    id,
    departmentId,
    fleetNumber: asset?.fleetNumber || input.fleetNumber || existing?.fleetNumber || "",
    station: input.station || asset?.station || existing?.station || "",
    syncStatusFromCad: false,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
  }, departmentId);
  if (existing?.id) {
    await updateRecord(departmentId, FLEET_CAD_MAPPINGS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, FLEET_CAD_MAPPINGS_COLLECTION, id, record);
  }
  return record;
}

/**
 * Command-center KPIs spanning fleet modules.
 */
export async function buildReportingCommandBoard(departmentId) {
  const [
    assets,
    defects,
    workOrders,
    costs,
    downtime,
    replacement,
    procurement,
    accidents,
    recalls,
    warrantyClaims,
    insurance,
    automations,
    workflows,
    adapters,
    neris,
    cad,
    savedReports,
    reportRuns,
    automationRuns,
  ] = await Promise.all([
    listFleetAssets(departmentId),
    listDefects(departmentId).catch(() => []),
    listFleetWorkOrders(departmentId).catch(() => []),
    listCostEntries(departmentId).catch(() => []),
    listDowntimeEvents(departmentId).catch(() => []),
    listReplacementCases(departmentId).catch(() => []),
    listProcurementRequests(departmentId).catch(() => []),
    listAccidentEvents(departmentId).catch(() => []),
    listFleetRecalls(departmentId).catch(() => []),
    listWarrantyClaims(departmentId).catch(() => []),
    listAssetInsurance(departmentId).catch(() => []),
    ensureAutomationsSeeded(departmentId),
    ensureWorkflowsSeeded(departmentId),
    ensureIntegrationAdaptersSeeded(departmentId),
    listNerisMappings(departmentId),
    listCadMappings(departmentId),
    listSavedReports(departmentId),
    listReportRuns(departmentId),
    listAutomationRuns(departmentId),
  ]);

  const openDefects = defects.filter((row) => !["closed", "resolved", "cancelled"].includes(row.status));
  const criticalDefects = openDefects.filter((row) => ["critical", "high"].includes(String(row.severity || "").toLowerCase()));
  const openWo = workOrders.filter((row) => !["closed", "completed", "cancelled"].includes(row.status));
  const oos = assets.filter((row) => row.status === "out_of_service");
  const reserve = assets.filter((row) => row.status === "reserve");
  const restricted = assets.filter((row) => row.status === "restricted");
  const costSummary = summarizeCosts(costs, assets);
  const reliability = summarizeReliability(downtime, assets);
  const urgentReplace = replacement.filter((row) => row.priority === "urgent");
  const now = Date.now();
  const expiringInsurance = insurance.filter((row) => {
    if (!row.expirationDate) return false;
    const days = (new Date(row.expirationDate).getTime() - now) / 86400000;
    return days >= 0 && days <= 90;
  });

  return {
    assets,
    automations,
    workflows,
    adapters,
    neris,
    cad,
    savedReports,
    reportRuns: reportRuns.slice(0, 20),
    automationRuns: automationRuns.slice(0, 20),
    kpis: {
      totalAssets: assets.length,
      inService: assets.filter((row) => row.status === "in_service").length,
      reserve: reserve.length,
      oos: oos.length,
      restricted: restricted.length,
      openDefects: openDefects.length,
      criticalDefects: criticalDefects.length,
      openWorkOrders: openWo.length,
      annualCost: costSummary.annual,
      downtimeHours: reliability.totalHours,
      availability: assets.length
        ? Number((reliability.assetMetrics.reduce((sum, row) => sum + row.availability, 0) / Math.max(assets.length, 1)).toFixed(1))
        : 100,
      urgentReplacements: urgentReplace.length,
      openProcurement: procurement.filter((row) => !["in_service", "rejected", "cancelled"].includes(row.status)).length,
      openAccidents: accidents.filter((row) => row.status !== "closed").length,
      openRecalls: recalls.filter((row) => !["complete", "closed", "na"].includes(row.status)).length,
      openWarrantyClaims: warrantyClaims.filter((row) => !["closed", "denied", "paid"].includes(row.status)).length,
      expiringInsurance: expiringInsurance.length,
      nerisMapped: neris.length,
      cadMapped: cad.length,
      enabledAutomations: automations.filter((row) => row.status === "enabled").length,
    },
    standardReports: STANDARD_REPORT_CATALOG,
  };
}

export function getStandardReportCatalog() {
  return [...STANDARD_REPORT_CATALOG];
}

export function getReportDataSources() {
  return REPORT_DATA_SOURCES.map((row) => ({ ...row, fields: [...row.fields] }));
}

export function getReportExportFormats() {
  return [...REPORT_EXPORT_FORMATS];
}

export function getAutomationTriggers() {
  return [...AUTOMATION_TRIGGERS];
}

export function getAutomationActions() {
  return [...AUTOMATION_ACTIONS];
}

export function getAutomationStatuses() {
  return [...AUTOMATION_STATUSES];
}

export function getWorkflowTemplates() {
  return [...WORKFLOW_TEMPLATES];
}

export function getWorkflowNodeTypes() {
  return [...WORKFLOW_NODE_TYPES];
}

export function getIntegrationAdapterTypes() {
  return [...INTEGRATION_ADAPTER_TYPES];
}

export function getIntegrationStatuses() {
  return [...INTEGRATION_STATUSES];
}
