import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { buildInspectionDashboardMetrics, listInspectionRecords } from "./inspectionRecords.js";
import { listViolations } from "./violationService.js";
import { listPreplans } from "./preplanService.js";
import { listInspectionFees, listPayments, loadFeeBoard } from "./feeService.js";
import { loadFpsBoard } from "./fpsService.js";
import { loadEnforcementBoard } from "./enforcementService.js";
import {
  getStandardInspectionReportCatalog,
  INSPECTION_REPORT_DATA_SOURCES,
  STANDARD_INSPECTION_REPORT_CATALOG,
} from "./reportingDefaults.js";
import {
  FIRE_PROTECTION_SYSTEMS_COLLECTION,
  INSPECTION_REPORT_RUNS_COLLECTION,
  INSPECTION_SAVED_REPORTS_COLLECTION,
  INSPECTION_SCHEDULED_REPORTS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "RPT") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function countBy(rows, keyFn) {
  const counts = {};
  for (const row of rows) {
    const key = keyFn(row) || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function agingBucket(dueAt, balance) {
  if (!(Number(balance) > 0) || !dueAt) return "current";
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return "current";
  const days = Math.floor((Date.now() - due) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function downloadRowsAsCsv(filename, rows = []) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]);
  const lines = [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export function normalizeSavedReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled report").trim(),
    description: data.description || "",
    dataSource: data.dataSource || "inspections",
    fields: Array.isArray(data.fields) ? data.fields.map(String) : [],
    filters: data.filters && typeof data.filters === "object" ? { ...data.filters } : {},
    sortBy: data.sortBy || "",
    sortDir: data.sortDir === "desc" ? "desc" : "asc",
    groupBy: data.groupBy || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeReportRun(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    reportId: data.reportId || "",
    reportName: data.reportName || "",
    reportKind: data.reportKind || "standard",
    rowCount: Number(data.rowCount) || 0,
    format: data.format || "csv",
    createdAt: data.createdAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeScheduledReport(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Scheduled report").trim(),
    reportId: data.reportId || "",
    reportName: data.reportName || "",
    reportKind: data.reportKind || "standard",
    frequency: data.frequency || "weekly",
    status: data.status || "draft",
    recipients: data.recipients || "",
    notes: data.notes || "",
    lastRunAt: data.lastRunAt || "",
    nextRunAt: data.nextRunAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

async function loadReportDataset(departmentId) {
  const [inspections, violations, fees, payments, preplans, fpsSystems, fpsBoard, enforcement] = await Promise.all([
    listInspectionRecords(departmentId),
    listViolations(departmentId),
    listInspectionFees(departmentId),
    listPayments(departmentId),
    listPreplans(departmentId),
    listRecords(departmentId, FIRE_PROTECTION_SYSTEMS_COLLECTION),
    loadFpsBoard(departmentId).catch(() => ({ impairments: [], metrics: {} })),
    loadEnforcementBoard(departmentId).catch(() => ({
      reinspections: [],
      orders: [],
      metrics: {},
    })),
  ]);
  return {
    inspections,
    violations,
    fees,
    payments,
    preplans,
    fpsSystems,
    fpsImpairments: fpsBoard.impairments || [],
    enforcement,
  };
}

/**
 * Aggregate prevention KPIs + chart series for dashboard / reports overview.
 */
export async function loadPreventionCommandBoard(departmentId) {
  const [inspections, violations, feeBoard, fpsBoard, preplans, enforcement] = await Promise.all([
    listInspectionRecords(departmentId),
    listViolations(departmentId),
    loadFeeBoard(departmentId).catch(() => ({ metrics: {}, fees: [], payments: [] })),
    loadFpsBoard(departmentId).catch(() => ({ metrics: {}, impairments: [] })),
    listPreplans(departmentId).catch(() => []),
    loadEnforcementBoard(departmentId).catch(() => ({
      reinspections: [],
      orders: [],
      metrics: {},
    })),
  ]);

  const base = buildInspectionDashboardMetrics(inspections);
  const openViolations = violations.filter((row) => !["closed", "corrected", "dismissed", "void"].includes(String(row.status || "").toLowerCase()));
  const now = Date.now();
  const violationsOverdue = openViolations.filter((row) => {
    const due = Date.parse(row.dueAt || "");
    return Number.isFinite(due) && due < now;
  }).length;

  const completed = inspections.filter((row) => String(row.status || "").toLowerCase() === "completed");
  const passed = completed.filter((row) => {
    const result = String(row.result || "").toLowerCase();
    return result.includes("pass") || result === "compliant" || result === "passed";
  }).length;
  const passRate = completed.length ? Math.round((passed / completed.length) * 1000) / 10 : 0;

  const reinspectionsDue = (enforcement.reinspections || []).filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return ["scheduled", "due", "no_access"].includes(status);
  }).length;
  const activeOrders = (enforcement.orders || []).filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return ["issued", "active", "in_effect"].includes(status);
  }).length;
  const preplansReview = preplans.filter((row) => {
    const status = String(row.status || "").toLowerCase();
    return ["pending_review", "awaiting_review", "in_review", "draft"].includes(status);
  }).length;

  const kpis = {
    due_today: base.dueToday,
    due_this_week: base.dueThisWeek,
    overdue: base.overdue,
    unassigned: base.unassigned,
    in_progress: base.inProgress,
    awaiting_approval: base.awaitingApproval,
    open_violations: openViolations.length || base.openViolations,
    violations_overdue: violationsOverdue,
    reinspections_due: reinspectionsDue,
    active_orders: activeOrders,
    fps_impairments: fpsBoard.metrics?.activeImpairments || 0,
    outstanding_fees: feeBoard.metrics?.outstanding || 0,
    revenue_collected: feeBoard.metrics?.collected || 0,
    preplans_review: preplansReview,
    pass_rate: passRate,
  };

  const charts = {
    inspectionsByStatus: countBy(inspections, (row) => row.status || "unknown"),
    inspectionsByType: countBy(
      inspections,
      (row) => row.inspectionTypeSnapshot?.label || row.inspectionTypeId || "Unknown type"
    ),
    violationsBySeverity: countBy(openViolations, (row) => row.severity || "unspecified"),
    feeAging: Object.entries(feeBoard.metrics?.aging || {}).map(([key, count]) => ({
      key,
      count: money(count),
    })),
    passFail: countBy(completed, (row) => row.result || "unspecified"),
  };

  return {
    inspections,
    violations: openViolations,
    feeBoard,
    fpsBoard,
    preplans,
    enforcement,
    kpis,
    charts,
    metrics: {
      ...base,
      openViolations: kpis.open_violations,
      violationsOverdue,
      reinspectionsDue,
      activeOrders,
      fpsImpairments: kpis.fps_impairments,
      outstandingFees: kpis.outstanding_fees,
      revenueCollected: kpis.revenue_collected,
      preplansReview,
      passRate,
    },
  };
}

function sortRows(rows, sortBy, sortDir = "asc") {
  if (!sortBy) return rows;
  const dir = sortDir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const left = a[sortBy];
    const right = b[sortBy];
    if (typeof left === "number" && typeof right === "number") return (left - right) * dir;
    return String(left ?? "").localeCompare(String(right ?? "")) * dir;
  });
}

export async function runStandardInspectionReport(departmentId, reportId) {
  const catalog = STANDARD_INSPECTION_REPORT_CATALOG.find((row) => row.id === reportId);
  if (!catalog) throw new Error("Unknown standard report");
  const data = await loadReportDataset(departmentId);
  let rows = [];

  switch (reportId) {
    case "inspections_by_status":
      rows = countBy(data.inspections, (row) => row.status || "unknown").map((row) => ({
        status: row.key,
        count: row.count,
      }));
      break;
    case "inspections_by_type":
      rows = countBy(
        data.inspections,
        (row) => row.inspectionTypeSnapshot?.label || row.inspectionTypeId || "Unknown"
      ).map((row) => ({ type: row.key, count: row.count }));
      break;
    case "open_violations":
      rows = data.violations
        .filter((row) => !["closed", "corrected", "dismissed", "void"].includes(String(row.status || "").toLowerCase()))
        .map((row) => ({
          violationNumber: row.violationNumber || row.id,
          status: row.status,
          severity: row.severity,
          occupancyName: row.occupancyName,
          codeCitation: row.codeCitation,
          dueAt: row.dueAt,
          description: row.description,
        }));
      break;
    case "violations_by_severity":
      rows = countBy(data.violations, (row) => row.severity || "unspecified").map((row) => ({
        severity: row.key,
        count: row.count,
      }));
      break;
    case "inspector_workload": {
      const open = data.inspections.filter((row) => !["completed", "cancelled", "archived"].includes(String(row.status || "").toLowerCase()));
      const counts = {};
      for (const row of open) {
        const names = Array.isArray(row.assignedInspectorNames) && row.assignedInspectorNames.length
          ? row.assignedInspectorNames
          : ["Unassigned"];
        for (const name of names) {
          counts[name || "Unassigned"] = (counts[name || "Unassigned"] || 0) + 1;
        }
      }
      rows = Object.entries(counts).map(([inspector, count]) => ({ inspector, count }));
      break;
    }
    case "pass_fail_summary":
      rows = countBy(
        data.inspections.filter((row) => String(row.status || "").toLowerCase() === "completed"),
        (row) => row.result || "unspecified"
      ).map((row) => ({ result: row.key, count: row.count }));
      break;
    case "fee_aging": {
      const aging = { current: 0, "1_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0 };
      for (const fee of data.fees.filter((row) => row.balance > 0)) {
        const bucket = agingBucket(fee.dueAt, fee.balance);
        aging[bucket] = money(aging[bucket] + fee.balance);
      }
      rows = Object.entries(aging).map(([bucket, amount]) => ({ bucket, amount }));
      break;
    }
    case "revenue_by_fee_type": {
      const byType = {};
      const feeMap = Object.fromEntries(data.fees.map((row) => [row.id, row]));
      for (const payment of data.payments.filter((row) => row.status === "recorded")) {
        const feeIds = payment.feeIds?.length ? payment.feeIds : [];
        if (!feeIds.length) {
          byType.unallocated = money((byType.unallocated || 0) + payment.amount);
          continue;
        }
        const share = money(payment.amount / feeIds.length);
        for (const feeId of feeIds) {
          const type = feeMap[feeId]?.feeTypeId || "custom";
          byType[type] = money((byType[type] || 0) + share);
        }
      }
      rows = Object.entries(byType).map(([feeTypeId, amount]) => ({ feeTypeId, amount }));
      break;
    }
    case "fps_impairments":
      rows = (data.fpsImpairments || [])
        .filter((row) => String(row.status || "").toLowerCase() === "active")
        .map((row) => ({
          impairmentNumber: row.impairmentNumber || row.id,
          systemName: row.systemName,
          occupancyName: row.occupancyName,
          reason: row.reason,
          fireWatchRequired: row.fireWatchRequired ? "yes" : "no",
          expectedRestoreAt: row.expectedRestoreAt,
        }));
      break;
    case "preplan_status":
      rows = countBy(data.preplans, (row) => row.status || "unknown").map((row) => ({
        status: row.key,
        count: row.count,
      }));
      break;
    case "enforcement_orders":
      rows = (data.enforcement.orders || [])
        .filter((row) => ["issued", "active", "in_effect"].includes(String(row.status || "").toLowerCase()))
        .map((row) => ({
          orderNumber: row.orderNumber || row.id,
          title: row.title,
          status: row.status,
          occupancyName: row.occupancyName,
          effectiveAt: row.effectiveAt,
        }));
      break;
    default:
      throw new Error(`Report not implemented: ${reportId}`);
  }

  return {
    reportId,
    name: catalog.label,
    description: catalog.description,
    columns: rows[0] ? Object.keys(rows[0]) : [],
    rows,
  };
}

export async function runCustomInspectionReport(departmentId, definition = {}) {
  const data = await loadReportDataset(departmentId);
  const source = definition.dataSource || "inspections";
  const sourceMeta = INSPECTION_REPORT_DATA_SOURCES.find((row) => row.id === source);
  const fields = (definition.fields?.length ? definition.fields : sourceMeta?.fields || []).map(String);
  const filters = definition.filters || {};

  let sourceRows = [];
  if (source === "inspections") sourceRows = data.inspections;
  else if (source === "violations") sourceRows = data.violations;
  else if (source === "fees") sourceRows = data.fees;
  else if (source === "preplans") sourceRows = data.preplans;
  else if (source === "fps") sourceRows = data.fpsSystems;
  else throw new Error(`Unsupported data source: ${source}`);

  let filtered = sourceRows.filter((row) => {
    if (filters.status && String(row.status || "") !== filters.status) return false;
    if (filters.occupancyName) {
      const needle = String(filters.occupancyName).toLowerCase();
      if (!String(row.occupancyName || "").toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  if (definition.groupBy) {
    const grouped = countBy(filtered, (row) => {
      const value = row[definition.groupBy];
      return Array.isArray(value) ? value.join(", ") : value;
    });
    return {
      reportId: definition.id || "custom",
      name: definition.name || "Custom report",
      description: definition.description || "",
      columns: ["group", "count"],
      rows: grouped.map((row) => ({ group: row.key, count: row.count })),
    };
  }

  filtered = sortRows(filtered, definition.sortBy, definition.sortDir);
  const rows = filtered.map((row) => {
    const out = {};
    for (const field of fields) {
      const value = row[field];
      out[field] = Array.isArray(value) ? value.join(", ") : value;
    }
    return out;
  });

  return {
    reportId: definition.id || "custom",
    name: definition.name || "Custom report",
    description: definition.description || "",
    columns: fields,
    rows,
  };
}

export async function listSavedInspectionReports(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_SAVED_REPORTS_COLLECTION);
  return rows
    .map((row) => normalizeSavedReport(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInspectionReport(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("SR");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_SAVED_REPORTS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeSavedReport({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_SAVED_REPORTS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_SAVED_REPORTS_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: existing ? "report.update" : "report.create",
    entityType: "saved_report",
    entityId: id,
    summary: `${existing ? "Updated" : "Saved"} report ${record.name}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

export async function recordInspectionReportRun(departmentId, input = {}, actor = {}) {
  const id = newId("RUN");
  const stamp = nowIso();
  const record = normalizeReportRun({
    id,
    reportId: input.reportId || "",
    reportName: input.reportName || "",
    reportKind: input.reportKind || "standard",
    rowCount: input.rowCount || 0,
    format: input.format || "csv",
    createdAt: stamp,
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  }, departmentId);
  await createRecord(departmentId, INSPECTION_REPORT_RUNS_COLLECTION, id, record);
  return record;
}

export async function listInspectionReportRuns(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_REPORT_RUNS_COLLECTION);
  return rows
    .map((row) => normalizeReportRun(row, departmentId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50);
}

export async function listScheduledInspectionReports(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION);
  return rows
    .map((row) => normalizeScheduledReport(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveScheduledInspectionReport(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("SCH");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const catalog = getStandardInspectionReportCatalog().find((row) => row.id === draft.reportId);
  const record = normalizeScheduledReport({
    ...existing,
    ...draft,
    id,
    reportName: draft.reportName || catalog?.label || existing?.reportName || "",
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: existing ? "report.schedule.update" : "report.schedule.create",
    entityType: "scheduled_report",
    entityId: id,
    summary: `${existing ? "Updated" : "Created"} schedule ${record.name}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

/**
 * Stub runner — records lastRunAt; email delivery deferred.
 */
export async function runScheduledInspectionReportNow(departmentId, scheduleId, actor = {}) {
  const schedule = normalizeScheduledReport(
    await getRecord(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION, scheduleId) || {},
    departmentId
  );
  if (!schedule.id) throw new Error("Scheduled report not found.");

  let result;
  if (schedule.reportKind === "custom") {
    const saved = await getRecord(departmentId, INSPECTION_SAVED_REPORTS_COLLECTION, schedule.reportId);
    if (!saved) throw new Error("Custom report definition not found.");
    result = await runCustomInspectionReport(departmentId, normalizeSavedReport(saved, departmentId));
  } else {
    result = await runStandardInspectionReport(departmentId, schedule.reportId);
  }

  const stamp = nowIso();
  await updateRecord(departmentId, INSPECTION_SCHEDULED_REPORTS_COLLECTION, scheduleId, {
    lastRunAt: stamp,
    updatedAt: stamp,
  });
  await recordInspectionReportRun(departmentId, {
    reportId: schedule.reportId,
    reportName: schedule.reportName || result.name,
    reportKind: schedule.reportKind,
    rowCount: result.rows.length,
    format: "stub",
  }, actor);

  await writeInspectionAuditLog(departmentId, {
    action: "report.schedule.run",
    entityType: "scheduled_report",
    entityId: scheduleId,
    summary: `Ran scheduled report ${schedule.name} (email delivery stub)`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return { schedule, result };
}

export async function loadInspectionReportingBoard(departmentId) {
  const [command, savedReports, reportRuns, schedules] = await Promise.all([
    loadPreventionCommandBoard(departmentId),
    listSavedInspectionReports(departmentId),
    listInspectionReportRuns(departmentId),
    listScheduledInspectionReports(departmentId),
  ]);
  return {
    ...command,
    savedReports,
    reportRuns,
    schedules,
    catalog: getStandardInspectionReportCatalog(),
  };
}
