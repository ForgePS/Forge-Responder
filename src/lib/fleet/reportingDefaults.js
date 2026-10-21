/** Reporting, automation, workflow, and integration defaults for Phase 14. */

export const STANDARD_REPORT_CATALOG = [
  { id: "fleet_inventory", label: "Fleet inventory", dataSource: "assets", description: "All fleet assets with status, station, and class." },
  { id: "fleet_by_status", label: "Fleet by status", dataSource: "assets", description: "Counts and lists grouped by operational status." },
  { id: "fleet_by_station", label: "Fleet by station", dataSource: "assets", description: "Assets grouped by assigned station." },
  { id: "open_defects", label: "Open defects", dataSource: "defects", description: "Active defect records." },
  { id: "critical_defects", label: "Critical defects", dataSource: "defects", description: "Critical / high-severity open defects." },
  { id: "work_order_backlog", label: "Work-order backlog", dataSource: "workOrders", description: "Open and in-progress work orders." },
  { id: "pm_overdue", label: "PM overdue", dataSource: "pm", description: "Overdue preventive maintenance schedules." },
  { id: "test_compliance", label: "Test compliance", dataSource: "tests", description: "Recent and overdue fleet tests." },
  { id: "fuel_exceptions", label: "Fuel exceptions", dataSource: "fuel", description: "Fuel transactions with exception flags." },
  { id: "accidents", label: "Accidents", dataSource: "accidents", description: "Accident and damage events." },
  { id: "downtime", label: "Downtime", dataSource: "downtime", description: "Planned and unplanned downtime events." },
  { id: "cost_by_asset", label: "Cost by asset", dataSource: "costs", description: "Lifecycle cost rollup per unit." },
  { id: "replacement_scores", label: "Replacement scores", dataSource: "replacement", description: "Scored replacement candidates." },
  { id: "capital_plan", label: "Capital plan", dataSource: "capital", description: "Multi-year capital funding lines." },
  { id: "disposal", label: "Disposal", dataSource: "disposal", description: "Decommission and disposal records." },
];

export const REPORT_DATA_SOURCES = [
  { id: "assets", label: "Fleet assets", fields: ["fleetNumber", "type", "station", "status", "year", "mileage", "engineHours", "condition"] },
  { id: "defects", label: "Defects", fields: ["fleetNumber", "severity", "status", "category", "description", "createdAt"] },
  { id: "workOrders", label: "Work orders", fields: ["workOrderNumber", "fleetNumber", "status", "priority", "workOrderType", "estimatedCost", "actualCost"] },
  { id: "costs", label: "Cost entries", fields: ["fleetNumber", "category", "amount", "occurredAt", "source", "fiscalYear"] },
  { id: "fuel", label: "Fuel transactions", fields: ["fleetNumber", "quantity", "totalCost", "occurredAt", "exceptions"] },
  { id: "replacement", label: "Replacement cases", fields: ["fleetNumber", "score", "priority", "recommendedYear", "estimatedCost", "status"] },
  { id: "downtime", label: "Downtime", fields: ["fleetNumber", "reason", "lostServiceHours", "planned", "status", "startedAt"] },
];

export const REPORT_EXPORT_FORMATS = [
  { id: "csv", label: "CSV" },
  { id: "json", label: "JSON" },
];

export const AUTOMATION_TRIGGERS = [
  { id: "asset_created", label: "Asset created" },
  { id: "status_changed", label: "Status changed" },
  { id: "check_failed", label: "Check failed" },
  { id: "check_overdue", label: "Check overdue" },
  { id: "defect_submitted", label: "Defect submitted" },
  { id: "critical_defect", label: "Critical defect" },
  { id: "asset_oos", label: "Asset out of service" },
  { id: "work_order_created", label: "Work order created" },
  { id: "pm_due_soon", label: "PM due soon" },
  { id: "pm_overdue", label: "PM overdue" },
  { id: "test_due", label: "Test due" },
  { id: "insurance_expiring", label: "Insurance expiring" },
  { id: "fuel_exception", label: "Fuel exception" },
  { id: "accident_submitted", label: "Accident submitted" },
  { id: "replacement_threshold", label: "Replacement score threshold" },
  { id: "manual", label: "Manual / on-demand" },
];

export const AUTOMATION_ACTIONS = [
  { id: "notify_in_app", label: "Send in-app notification" },
  { id: "notify_email", label: "Send email" },
  { id: "create_task", label: "Create task" },
  { id: "create_work_order", label: "Create work order" },
  { id: "create_defect", label: "Create defect" },
  { id: "escalate", label: "Escalate" },
  { id: "webhook", label: "Webhook" },
  { id: "queue_integration", label: "Queue integration" },
  { id: "add_tag", label: "Add tag" },
];

export const AUTOMATION_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "testing", label: "Testing" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
];

export const WORKFLOW_TEMPLATES = [
  { id: "defect_review", label: "Defect review", description: "Review → assign → close or escalate." },
  { id: "oos_decision", label: "Out-of-service decision", description: "Safety review before OOS / return to service." },
  { id: "work_order", label: "Work order", description: "Intake → authorize → complete → QC." },
  { id: "warranty_claim", label: "Warranty claim", description: "Draft → submit → recovery." },
  { id: "accident", label: "Accident", description: "Report → investigate → claim → safety review." },
  { id: "procurement", label: "Procurement", description: "Request → spec → award → build." },
  { id: "replacement", label: "Replacement", description: "Score → fund → procure → dispose." },
  { id: "decommission", label: "Decommission", description: "Checklist → approval → disposal." },
];

export const WORKFLOW_NODE_TYPES = [
  { id: "start", label: "Start" },
  { id: "status", label: "Status" },
  { id: "assignment", label: "Assignment" },
  { id: "approval", label: "Approval" },
  { id: "task", label: "Task" },
  { id: "decision", label: "Decision" },
  { id: "timer", label: "Timer" },
  { id: "notification", label: "Notification" },
  { id: "integration", label: "Integration" },
  { id: "end", label: "End" },
];

export const INTEGRATION_ADAPTER_TYPES = [
  { id: "neris", label: "NERIS", description: "Resource / entity mapping for NERIS submissions." },
  { id: "cad", label: "CAD", description: "Unit identifiers, availability, and response status." },
  { id: "accounting", label: "Accounting / GL", description: "Cost category to GL account mappings." },
  { id: "fuel_card", label: "Fuel card", description: "Fuel card import / reconciliation." },
  { id: "telematics", label: "Telematics", description: "OEM or third-party telematics feed." },
  { id: "vendor", label: "Vendor shop", description: "External shop work status adapters." },
  { id: "webhook", label: "Generic webhook", description: "Outbound event webhooks." },
];

export const INTEGRATION_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "connected", label: "Connected" },
  { id: "error", label: "Error" },
  { id: "disabled", label: "Disabled" },
];

export const STARTER_AUTOMATIONS = [
  {
    id: "AUTO-CRITICAL-DEFECT",
    name: "Escalate critical defects",
    trigger: "critical_defect",
    action: "escalate",
    status: "draft",
    description: "Escalate when a critical defect is submitted.",
  },
  {
    id: "AUTO-PM-OVERDUE",
    name: "Notify PM overdue",
    trigger: "pm_overdue",
    action: "notify_in_app",
    status: "draft",
    description: "In-app notification when PM schedules are overdue.",
  },
  {
    id: "AUTO-REPLACEMENT",
    name: "Flag urgent replacement scores",
    trigger: "replacement_threshold",
    action: "create_task",
    status: "draft",
    description: "Create a task when replacement score reaches urgent threshold.",
    config: { scoreThreshold: 75 },
  },
];

export const STARTER_WORKFLOWS = [
  {
    id: "WF-DEFECT-REVIEW",
    name: "Defect review",
    templateId: "defect_review",
    version: "1.0",
    status: "published",
    nodes: [
      { id: "n1", type: "start", label: "Defect submitted" },
      { id: "n2", type: "assignment", label: "Assign reviewer" },
      { id: "n3", type: "decision", label: "Critical?" },
      { id: "n4", type: "approval", label: "Supervisor approval" },
      { id: "n5", type: "status", label: "Create work order / close" },
      { id: "n6", type: "end", label: "Complete" },
    ],
  },
  {
    id: "WF-OOS",
    name: "Out-of-service decision",
    templateId: "oos_decision",
    version: "1.0",
    status: "published",
    nodes: [
      { id: "n1", type: "start", label: "OOS requested" },
      { id: "n2", type: "approval", label: "Safety / officer approval" },
      { id: "n3", type: "task", label: "Request reserve unit" },
      { id: "n4", type: "status", label: "Apply OOS status" },
      { id: "n5", type: "notification", label: "Notify station" },
      { id: "n6", type: "end", label: "Complete" },
    ],
  },
];
