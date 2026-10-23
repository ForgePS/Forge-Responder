/** Phase 10 — prevention dashboard & reporting starter config. */

export const PREVENTION_KPI_CARDS = [
  { id: "due_today", label: "Due today", drillNav: "Work Queue" },
  { id: "due_this_week", label: "Due this week", drillNav: "Work Queue" },
  { id: "overdue", label: "Overdue", drillNav: "Work Queue" },
  { id: "unassigned", label: "Unassigned", drillNav: "Work Queue" },
  { id: "in_progress", label: "In progress", drillNav: "Work Queue" },
  { id: "awaiting_approval", label: "Awaiting approval", drillNav: "Work Queue" },
  { id: "open_violations", label: "Open violations", drillNav: "Open Violations" },
  { id: "violations_overdue", label: "Violations overdue", drillNav: "Open Violations" },
  { id: "reinspections_due", label: "Reinspections due", drillNav: "Enforcement Cases" },
  { id: "active_orders", label: "Active enforcement orders", drillNav: "Enforcement Cases" },
  { id: "fps_impairments", label: "Active FPS impairments", drillNav: "Fire Protection Systems" },
  { id: "outstanding_fees", label: "Outstanding fees", drillNav: "Fees & Payments" },
  { id: "revenue_collected", label: "Revenue collected", drillNav: "Fees & Payments" },
  { id: "preplans_review", label: "Preplans awaiting review", drillNav: "Preplan Work Queue" },
  { id: "pass_rate", label: "Pass rate %", drillNav: "All Inspections" },
];

export const STANDARD_INSPECTION_REPORT_CATALOG = [
  {
    id: "inspections_by_status",
    label: "Inspections by status",
    dataSource: "inspections",
    description: "Counts of inspections grouped by workflow status.",
  },
  {
    id: "inspections_by_type",
    label: "Inspections by type",
    dataSource: "inspections",
    description: "Volume by inspection type snapshot label.",
  },
  {
    id: "open_violations",
    label: "Open violations",
    dataSource: "violations",
    description: "Active violation records with occupancy and due dates.",
  },
  {
    id: "violations_by_severity",
    label: "Violations by severity",
    dataSource: "violations",
    description: "Open/all violations counted by severity.",
  },
  {
    id: "inspector_workload",
    label: "Inspector workload",
    dataSource: "inspections",
    description: "Open inspections counted by assigned inspector.",
  },
  {
    id: "pass_fail_summary",
    label: "Pass / fail summary",
    dataSource: "inspections",
    description: "Completed inspections by result.",
  },
  {
    id: "fee_aging",
    label: "Fee aging",
    dataSource: "fees",
    description: "Open fee balances by aging bucket.",
  },
  {
    id: "revenue_by_fee_type",
    label: "Revenue by fee type",
    dataSource: "fees",
    description: "Collected payment amounts attributed by fee type.",
  },
  {
    id: "fps_impairments",
    label: "Active FPS impairments",
    dataSource: "fps",
    description: "Open fire-protection-system impairments.",
  },
  {
    id: "preplan_status",
    label: "Preplans by status",
    dataSource: "preplans",
    description: "Preplan inventory grouped by lifecycle status.",
  },
  {
    id: "enforcement_orders",
    label: "Active enforcement orders",
    dataSource: "enforcement",
    description: "Orders that are issued or active.",
  },
];

export const INSPECTION_REPORT_DATA_SOURCES = [
  {
    id: "inspections",
    label: "Inspections",
    fields: ["inspectionNumber", "status", "occupancyName", "address", "priority", "result", "dueAt", "assignedInspectorNames"],
  },
  {
    id: "violations",
    label: "Violations",
    fields: ["violationNumber", "status", "severity", "occupancyName", "codeCitation", "dueAt", "description"],
  },
  {
    id: "fees",
    label: "Fees",
    fields: ["feeNumber", "name", "feeTypeId", "status", "amount", "balance", "occupancyName", "dueAt"],
  },
  {
    id: "preplans",
    label: "Preplans",
    fields: ["preplanNumber", "status", "occupancyName", "address", "updatedAt"],
  },
  {
    id: "fps",
    label: "Fire protection systems",
    fields: ["systemNumber", "name", "status", "occupancyName", "systemTypeId"],
  },
];

export const REPORT_EXPORT_FORMATS = [
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
];

export const SCHEDULE_FREQUENCIES = [
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "monthly", label: "Monthly" },
  { id: "manual", label: "Manual only" },
];

export const SCHEDULE_STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "draft", label: "Draft" },
];

export function getPreventionKpiCards() {
  return PREVENTION_KPI_CARDS.map((row) => ({ ...row }));
}

export function getStandardInspectionReportCatalog() {
  return STANDARD_INSPECTION_REPORT_CATALOG.map((row) => ({ ...row }));
}

export function getInspectionReportDataSources() {
  return INSPECTION_REPORT_DATA_SOURCES.map((row) => ({
    ...row,
    fields: [...row.fields],
  }));
}

export function getReportExportFormats() {
  return REPORT_EXPORT_FORMATS.map((row) => ({ ...row }));
}

export function getScheduleFrequencies() {
  return SCHEDULE_FREQUENCIES.map((row) => ({ ...row }));
}

export function getScheduleStatuses() {
  return SCHEDULE_STATUSES.map((row) => ({ ...row }));
}
