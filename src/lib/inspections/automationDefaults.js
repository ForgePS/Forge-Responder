/** Phase 12 — automation, workflows, webhooks, calendar, NERIS mappings. */

export const AUTOMATION_TRIGGERS = [
  { id: "inspection_created", label: "Inspection created" },
  { id: "inspection_assigned", label: "Inspection assigned" },
  { id: "inspection_due", label: "Inspection due" },
  { id: "inspection_overdue", label: "Inspection overdue" },
  { id: "inspection_completed", label: "Inspection completed" },
  { id: "inspection_approved", label: "Inspection approved" },
  { id: "violation_issued", label: "Violation issued" },
  { id: "violation_overdue", label: "Violation overdue" },
  { id: "reinspection_due", label: "Reinspection due" },
  { id: "payment_overdue", label: "Payment overdue" },
  { id: "fps_impaired", label: "FPS impaired" },
  { id: "appeal_filed", label: "Appeal filed" },
  { id: "status_changed", label: "Status changed" },
  { id: "manual", label: "Manual / on-demand" },
];

export const AUTOMATION_ACTIONS = [
  { id: "notify_in_app", label: "In-app notification" },
  { id: "notify_email", label: "Send email (stub)" },
  { id: "notify_supervisor", label: "Notify supervisor" },
  { id: "create_task", label: "Create task" },
  { id: "create_reinspection", label: "Create reinspection" },
  { id: "create_fee", label: "Create fee" },
  { id: "generate_document", label: "Generate document" },
  { id: "add_tag", label: "Add tag" },
  { id: "webhook", label: "Call webhook" },
  { id: "queue_integration", label: "Queue integration export" },
];

export const AUTOMATION_STATUSES = [
  { id: "draft", label: "Draft" },
  { id: "testing", label: "Testing" },
  { id: "enabled", label: "Enabled" },
  { id: "disabled", label: "Disabled" },
];

export const WORKFLOW_NODE_TYPES = [
  { id: "start", label: "Start" },
  { id: "status", label: "Status" },
  { id: "assignment", label: "Assignment" },
  { id: "approval", label: "Approval" },
  { id: "decision", label: "Decision" },
  { id: "timer", label: "Timer" },
  { id: "notification", label: "Notification" },
  { id: "document", label: "Document generation" },
  { id: "fee", label: "Fee creation" },
  { id: "reinspection", label: "Reinspection" },
  { id: "integration", label: "Integration event" },
  { id: "end", label: "End" },
];

export const WORKFLOW_TEMPLATES = [
  {
    id: "standard_inspection",
    label: "Standard inspection",
    description: "Create → assign → conduct → approve → close.",
    nodes: ["start", "assignment", "status", "approval", "end"],
  },
  {
    id: "violation_enforcement",
    label: "Violation enforcement",
    description: "Issue → notice → reinspection → escalate / close.",
    nodes: ["start", "notification", "document", "reinspection", "decision", "end"],
  },
  {
    id: "fee_collection",
    label: "Fee collection",
    description: "Create fee → invoice → payment reminder → write-off decision.",
    nodes: ["start", "fee", "timer", "notification", "decision", "end"],
  },
  {
    id: "fps_impairment",
    label: "FPS impairment response",
    description: "Impairment → fire watch notice → restore → close.",
    nodes: ["start", "notification", "timer", "status", "end"],
  },
];

export const WEBHOOK_EVENT_TYPES = [
  { id: "inspection.completed", label: "Inspection completed" },
  { id: "violation.issued", label: "Violation issued" },
  { id: "fee.created", label: "Fee created" },
  { id: "payment.recorded", label: "Payment recorded" },
  { id: "fps.impaired", label: "FPS impaired" },
  { id: "preplan.published", label: "Preplan published" },
  { id: "automation.ran", label: "Automation ran" },
];

export const WEBHOOK_STATUSES = [
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "failed", label: "Failed" },
  { id: "draft", label: "Draft" },
];

export const CALENDAR_EVENT_TYPES = [
  { id: "inspection", label: "Inspection" },
  { id: "reinspection", label: "Reinspection" },
  { id: "hearing", label: "Hearing / appeal" },
  { id: "training", label: "Training" },
  { id: "other", label: "Other" },
];

export const CALENDAR_SYNC_MODES = [
  { id: "local_only", label: "Local only" },
  { id: "google_stub", label: "Google Calendar (stub)" },
  { id: "microsoft_stub", label: "Microsoft 365 (stub)" },
];

export const NERIS_ENTITY_TYPES = [
  { id: "occupancy", label: "Occupancy / entity" },
  { id: "inspection_outcome", label: "Inspection outcome" },
  { id: "preplan", label: "Preplan" },
  { id: "fps", label: "Fire protection system" },
  { id: "risk_activity", label: "Community risk activity" },
  { id: "incident_link", label: "Incident history link" },
];

export const INTEGRATION_ADAPTER_TYPES = [
  { id: "webhook", label: "Generic webhook", description: "Outbound signed event posts." },
  { id: "neris", label: "NERIS relationship", description: "Entity / outcome mapping layer (no incident schema force-fit)." },
  { id: "calendar", label: "Calendar", description: "Google / Microsoft sync stubs." },
  { id: "cad", label: "CAD", description: "Occupancy / address hints for CAD consumers." },
  { id: "gis", label: "GIS", description: "Parcel / address geocode adapters." },
  { id: "accounting", label: "Accounting export", description: "Fee / payment export queue." },
];

export const STARTER_AUTOMATIONS = [
  {
    id: "auto-overdue-supervisor",
    name: "Overdue inspection → notify supervisor",
    trigger: "inspection_overdue",
    action: "notify_supervisor",
    status: "draft",
    description: "When inspections are overdue, notify the prevention supervisor.",
  },
  {
    id: "auto-violation-fee",
    name: "Violation overdue → create late fee",
    trigger: "violation_overdue",
    action: "create_fee",
    status: "draft",
    description: "Queue a late fee when a violation passes its due date.",
  },
  {
    id: "auto-fps-webhook",
    name: "FPS impairment → webhook",
    trigger: "fps_impaired",
    action: "webhook",
    status: "draft",
    description: "Post impairment events to the configured outbound webhook.",
  },
];

export function getAutomationTriggers() {
  return AUTOMATION_TRIGGERS.map((row) => ({ ...row }));
}

export function getAutomationActions() {
  return AUTOMATION_ACTIONS.map((row) => ({ ...row }));
}

export function getAutomationStatuses() {
  return AUTOMATION_STATUSES.map((row) => ({ ...row }));
}

export function getWorkflowTemplates() {
  return WORKFLOW_TEMPLATES.map((row) => ({ ...row, nodes: [...row.nodes] }));
}

export function getWorkflowNodeTypes() {
  return WORKFLOW_NODE_TYPES.map((row) => ({ ...row }));
}

export function getWebhookEventTypes() {
  return WEBHOOK_EVENT_TYPES.map((row) => ({ ...row }));
}

export function getWebhookStatuses() {
  return WEBHOOK_STATUSES.map((row) => ({ ...row }));
}

export function getCalendarEventTypes() {
  return CALENDAR_EVENT_TYPES.map((row) => ({ ...row }));
}

export function getCalendarSyncModes() {
  return CALENDAR_SYNC_MODES.map((row) => ({ ...row }));
}

export function getNerisEntityTypes() {
  return NERIS_ENTITY_TYPES.map((row) => ({ ...row }));
}

export function getInspectionIntegrationAdapterTypes() {
  return INTEGRATION_ADAPTER_TYPES.map((row) => ({ ...row }));
}

export function labelForAutomationTrigger(id) {
  return AUTOMATION_TRIGGERS.find((row) => row.id === id)?.label || id || "—";
}

export function labelForAutomationAction(id) {
  return AUTOMATION_ACTIONS.find((row) => row.id === id)?.label || id || "—";
}

export function labelForAutomationStatus(id) {
  return AUTOMATION_STATUSES.find((row) => row.id === id)?.label || id || "—";
}
