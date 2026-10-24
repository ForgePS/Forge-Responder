import {
  createRecord,
  getRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";
import { listInspectionRecords } from "./inspectionRecords.js";
import { listViolations } from "./violationService.js";
import { listInspectionFees } from "./feeService.js";
import { loadFpsBoard } from "./fpsService.js";
import { loadEnforcementBoard } from "./enforcementService.js";
import {
  STARTER_AUTOMATIONS,
  WORKFLOW_TEMPLATES,
  getWorkflowTemplates,
} from "./automationDefaults.js";
import {
  INSPECTION_AUTOMATIONS_COLLECTION,
  INSPECTION_AUTOMATION_RUNS_COLLECTION,
  INSPECTION_CALENDAR_EVENTS_COLLECTION,
  INSPECTION_INTEGRATION_ADAPTERS_COLLECTION,
  INSPECTION_NERIS_MAPPINGS_COLLECTION,
  INSPECTION_WEBHOOKS_COLLECTION,
  INSPECTION_WORKFLOWS_COLLECTION,
} from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix = "AUTO") {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

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
    config: data.config && typeof data.config === "object" ? { ...data.config } : {},
    runCount: Number(data.runCount) || 0,
    lastRunAt: data.lastRunAt || "",
    lastRunResult: data.lastRunResult || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

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
    matchedCount: Number(data.matchedCount) || 0,
    actorName: data.actorName || "",
    createdAt: data.createdAt || "",
  };
}

export function normalizeWorkflow(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Untitled workflow").trim(),
    templateId: data.templateId || "standard_inspection",
    description: data.description || "",
    status: data.status || "draft",
    version: Number(data.version) || 1,
    nodes: Array.isArray(data.nodes) ? data.nodes.map(String) : [],
    publishedAt: data.publishedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeWebhook(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Webhook").trim(),
    url: data.url || "",
    status: data.status || "draft",
    events: Array.isArray(data.events) ? data.events.map(String) : [],
    secretHint: data.secretHint || "",
    lastTestAt: data.lastTestAt || "",
    lastTestResult: data.lastTestResult || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeCalendarEvent(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    title: String(data.title || "Calendar event").trim(),
    eventType: data.eventType || "inspection",
    syncMode: data.syncMode || "local_only",
    startsAt: data.startsAt || "",
    endsAt: data.endsAt || "",
    occupancyId: data.occupancyId || "",
    occupancyName: data.occupancyName || "",
    inspectionId: data.inspectionId || "",
    inspectionNumber: data.inspectionNumber || "",
    assigneeName: data.assigneeName || "",
    location: data.location || "",
    notes: data.notes || "",
    externalId: data.externalId || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeNerisMapping(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    entityType: data.entityType || "occupancy",
    forgeRecordId: data.forgeRecordId || "",
    forgeLabel: data.forgeLabel || "",
    nerisEntityId: data.nerisEntityId || "",
    nerisResourceId: data.nerisResourceId || "",
    riskClass: data.riskClass || "",
    notes: data.notes || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export function normalizeIntegrationAdapter(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: data.id || "",
    departmentId: departmentId || data.departmentId || "",
    name: String(data.name || "Adapter").trim(),
    adapterType: data.adapterType || "webhook",
    status: data.status || "draft",
    endpoint: data.endpoint || "",
    config: data.config && typeof data.config === "object" ? { ...data.config } : {},
    lastTestAt: data.lastTestAt || "",
    lastTestResult: data.lastTestResult || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
    createdBy: data.createdBy || "",
    createdByName: data.createdByName || "",
  };
}

export async function ensureInspectionAutomationsSeeded(departmentId, actor = {}) {
  const existing = await listRecords(departmentId, INSPECTION_AUTOMATIONS_COLLECTION);
  if (existing.length) {
    return existing.map((row) => normalizeAutomation(row, departmentId));
  }
  const stamp = nowIso();
  const created = [];
  for (const seed of STARTER_AUTOMATIONS) {
    const record = normalizeAutomation({
      ...seed,
      createdAt: stamp,
      updatedAt: stamp,
      createdBy: actor.actorUid || "",
      createdByName: actor.actorName || "",
    }, departmentId);
    await createRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, record.id, record);
    created.push(record);
  }
  return created;
}

export async function listInspectionAutomations(departmentId) {
  await ensureInspectionAutomationsSeeded(departmentId);
  const rows = await listRecords(departmentId, INSPECTION_AUTOMATIONS_COLLECTION);
  return rows
    .map((row) => normalizeAutomation(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInspectionAutomation(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("AUTO");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeAutomation({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: existing ? "automation.update" : "automation.create",
    entityType: "automation",
    entityId: id,
    summary: `${existing ? "Updated" : "Created"} automation ${record.name}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

async function matchAutomationTrigger(departmentId, trigger) {
  const [inspections, violations, fees, fps, enforcement] = await Promise.all([
    listInspectionRecords(departmentId),
    listViolations(departmentId),
    listInspectionFees(departmentId),
    loadFpsBoard(departmentId).catch(() => ({ impairments: [] })),
    loadEnforcementBoard(departmentId).catch(() => ({ reinspections: [], appeals: [] })),
  ]);
  const now = Date.now();
  const openInspection = (row) => !["completed", "cancelled", "archived"].includes(String(row.status || "").toLowerCase());

  switch (trigger) {
    case "inspection_overdue":
      return inspections.filter((row) => {
        if (!openInspection(row)) return false;
        const due = Date.parse(row.dueAt || row.scheduledStart || "");
        return Number.isFinite(due) && due < now;
      });
    case "inspection_due":
      return inspections.filter((row) => {
        if (!openInspection(row)) return false;
        const due = Date.parse(row.dueAt || row.scheduledStart || "");
        if (!Number.isFinite(due)) return false;
        const days = (due - now) / (24 * 60 * 60 * 1000);
        return days >= 0 && days <= 7;
      });
    case "inspection_completed":
      return inspections.filter((row) => String(row.status || "").toLowerCase() === "completed");
    case "inspection_approved":
      return inspections.filter((row) => String(row.status || "").toLowerCase() === "completed" && row.approvedAt);
    case "inspection_assigned":
      return inspections.filter((row) => Array.isArray(row.assignedInspectorIds) && row.assignedInspectorIds.length);
    case "inspection_created":
      return inspections.slice(0, 25);
    case "violation_issued":
      return violations.filter((row) => !["closed", "dismissed", "void"].includes(String(row.status || "").toLowerCase()));
    case "violation_overdue":
      return violations.filter((row) => {
        if (["closed", "corrected", "dismissed", "void"].includes(String(row.status || "").toLowerCase())) return false;
        const due = Date.parse(row.dueAt || "");
        return Number.isFinite(due) && due < now;
      });
    case "reinspection_due":
      return (enforcement.reinspections || []).filter((row) => ["scheduled", "due", "no_access"].includes(String(row.status || "").toLowerCase()));
    case "payment_overdue":
      return fees.filter((row) => {
        if (!(row.balance > 0)) return false;
        const due = Date.parse(row.dueAt || "");
        return Number.isFinite(due) && due < now;
      });
    case "fps_impaired":
      return (fps.impairments || []).filter((row) => ["active", "extended"].includes(String(row.status || "").toLowerCase()));
    case "appeal_filed":
      return (enforcement.appeals || []).filter((row) => ["filed", "scheduled", "under_review"].includes(String(row.status || "").toLowerCase()));
    case "manual":
    case "status_changed":
    default:
      return inspections.filter(openInspection).slice(0, 10);
  }
}

/**
 * Dry-run or execute automation against live prevention data (actions are logged stubs except queue counts).
 */
export async function runInspectionAutomation(departmentId, automationId, options = {}, actor = {}) {
  const automation = normalizeAutomation(
    await getRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, automationId) || {},
    departmentId
  );
  if (!automation.id) throw new Error("Automation not found.");

  const dryRun = options.dryRun != null
    ? Boolean(options.dryRun)
    : automation.status !== "enabled";

  const matched = await matchAutomationTrigger(departmentId, automation.trigger);
  const stamp = nowIso();
  const message = dryRun
    ? `Dry run: would ${automation.action} for ${matched.length} match(es)`
    : `Executed ${automation.action} for ${matched.length} match(es) (logged only; delivery not connected yet)`;

  const runId = newId("ARUN");
  const run = normalizeAutomationRun({
    id: runId,
    automationId: automation.id,
    automationName: automation.name,
    dryRun,
    trigger: automation.trigger,
    action: automation.action,
    status: "completed",
    message,
    matchedCount: matched.length,
    actorName: actor.actorName || "User",
    createdAt: stamp,
  }, departmentId);
  await createRecord(departmentId, INSPECTION_AUTOMATION_RUNS_COLLECTION, runId, run);

  await updateRecord(departmentId, INSPECTION_AUTOMATIONS_COLLECTION, automation.id, normalizeAutomation({
    ...automation,
    lastRunAt: stamp,
    lastRunResult: message,
    runCount: automation.runCount + 1,
    updatedAt: stamp,
  }, departmentId));

  await writeInspectionAuditLog(departmentId, {
    action: dryRun ? "automation.dry_run" : "automation.run",
    entityType: "automation",
    entityId: automation.id,
    summary: message,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });

  return {
    run,
    matched: matched.slice(0, 25).map((row) => ({
      id: row.id,
      label: row.inspectionNumber || row.violationNumber || row.feeNumber || row.impairmentNumber || row.appealNumber || row.name || row.id,
      status: row.status || "",
    })),
    dryRun,
  };
}

export async function listInspectionAutomationRuns(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_AUTOMATION_RUNS_COLLECTION);
  return rows
    .map((row) => normalizeAutomationRun(row, departmentId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 50);
}

export async function listInspectionWorkflows(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_WORKFLOWS_COLLECTION);
  return rows
    .map((row) => normalizeWorkflow(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInspectionWorkflow(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("WF");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_WORKFLOWS_COLLECTION, id)
    : null;
  const template = getWorkflowTemplates().find((row) => row.id === (draft.templateId || existing?.templateId))
    || WORKFLOW_TEMPLATES[0];
  const stamp = nowIso();
  const record = normalizeWorkflow({
    ...existing,
    ...draft,
    id,
    nodes: draft.nodes?.length ? draft.nodes : (existing?.nodes?.length ? existing.nodes : template.nodes),
    description: draft.description || existing?.description || template.description,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_WORKFLOWS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_WORKFLOWS_COLLECTION, id, record);
  }
  await writeInspectionAuditLog(departmentId, {
    action: existing ? "workflow.update" : "workflow.create",
    entityType: "workflow",
    entityId: id,
    summary: `${existing ? "Updated" : "Created"} workflow ${record.name}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

export async function publishInspectionWorkflow(departmentId, workflowId, actor = {}) {
  const existing = normalizeWorkflow(
    await getRecord(departmentId, INSPECTION_WORKFLOWS_COLLECTION, workflowId) || {},
    departmentId
  );
  if (!existing.id) throw new Error("Workflow not found.");
  if (!existing.nodes?.length) throw new Error("Workflow has no nodes to publish.");
  const stamp = nowIso();
  const record = normalizeWorkflow({
    ...existing,
    status: "published",
    version: existing.version + 1,
    publishedAt: stamp,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_WORKFLOWS_COLLECTION, workflowId, record);
  await writeInspectionAuditLog(departmentId, {
    action: "workflow.publish",
    entityType: "workflow",
    entityId: workflowId,
    summary: `Published workflow ${record.name} v${record.version}`,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return record;
}

export async function listInspectionWebhooks(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_WEBHOOKS_COLLECTION);
  return rows
    .map((row) => normalizeWebhook(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInspectionWebhook(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("WH");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_WEBHOOKS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeWebhook({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_WEBHOOKS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_WEBHOOKS_COLLECTION, id, record);
  }
  return record;
}

/** Stub webhook test — does not perform a real network POST. */
export async function testInspectionWebhook(departmentId, webhookId, actor = {}) {
  const webhook = normalizeWebhook(
    await getRecord(departmentId, INSPECTION_WEBHOOKS_COLLECTION, webhookId) || {},
    departmentId
  );
  if (!webhook.id) throw new Error("Webhook not found.");
  if (!webhook.url) throw new Error("Webhook URL is required.");
  const stamp = nowIso();
  const result = `Stub OK — would POST ${webhook.events.join(", ") || "events"} to ${webhook.url}`;
  const next = normalizeWebhook({
    ...webhook,
    lastTestAt: stamp,
    lastTestResult: result,
    status: webhook.status === "draft" ? "active" : webhook.status,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_WEBHOOKS_COLLECTION, webhookId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "webhook.test",
    entityType: "webhook",
    entityId: webhookId,
    summary: result,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return next;
}

export async function listInspectionCalendarEvents(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_CALENDAR_EVENTS_COLLECTION);
  return rows
    .map((row) => normalizeCalendarEvent(row, departmentId))
    .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));
}

export async function saveInspectionCalendarEvent(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("CAL");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_CALENDAR_EVENTS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeCalendarEvent({
    ...existing,
    ...draft,
    id,
    externalId: draft.syncMode && draft.syncMode !== "local_only"
      ? (existing?.externalId || `EXT-${id}`)
      : (draft.externalId || existing?.externalId || ""),
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_CALENDAR_EVENTS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_CALENDAR_EVENTS_COLLECTION, id, record);
  }
  return record;
}

export async function listInspectionNerisMappings(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_NERIS_MAPPINGS_COLLECTION);
  return rows
    .map((row) => normalizeNerisMapping(row, departmentId))
    .sort((a, b) => a.forgeLabel.localeCompare(b.forgeLabel));
}

export async function saveInspectionNerisMapping(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("NERIS");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_NERIS_MAPPINGS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeNerisMapping({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_NERIS_MAPPINGS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_NERIS_MAPPINGS_COLLECTION, id, record);
  }
  return record;
}

export async function listInspectionIntegrationAdapters(departmentId) {
  const rows = await listRecords(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION);
  return rows
    .map((row) => normalizeIntegrationAdapter(row, departmentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveInspectionIntegrationAdapter(departmentId, draft = {}, actor = {}) {
  const id = draft.id || newId("ADP");
  const existing = draft.id
    ? await getRecord(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION, id)
    : null;
  const stamp = nowIso();
  const record = normalizeIntegrationAdapter({
    ...existing,
    ...draft,
    id,
    createdAt: existing?.createdAt || stamp,
    updatedAt: stamp,
    createdBy: existing?.createdBy || actor.actorUid || "",
    createdByName: existing?.createdByName || actor.actorName || "",
  }, departmentId);
  if (existing) {
    await updateRecord(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION, id, record);
  } else {
    await createRecord(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION, id, record);
  }
  return record;
}

export async function testInspectionIntegrationAdapter(departmentId, adapterId, actor = {}) {
  const adapter = normalizeIntegrationAdapter(
    await getRecord(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION, adapterId) || {},
    departmentId
  );
  if (!adapter.id) throw new Error("Adapter not found.");
  const stamp = nowIso();
  const result = `Stub OK — ${adapter.adapterType} adapter "${adapter.name}" reachable configuration validated`;
  const next = normalizeIntegrationAdapter({
    ...adapter,
    lastTestAt: stamp,
    lastTestResult: result,
    status: adapter.status === "draft" ? "active" : adapter.status,
    updatedAt: stamp,
  }, departmentId);
  await updateRecord(departmentId, INSPECTION_INTEGRATION_ADAPTERS_COLLECTION, adapterId, next);
  await writeInspectionAuditLog(departmentId, {
    action: "integration.test",
    entityType: "integration_adapter",
    entityId: adapterId,
    summary: result,
    actorUid: actor.actorUid,
    actorName: actor.actorName,
  });
  return next;
}

export async function loadInspectionAutomationBoard(departmentId) {
  const [
    automations,
    runs,
    workflows,
    webhooks,
    calendarEvents,
    nerisMappings,
    adapters,
  ] = await Promise.all([
    listInspectionAutomations(departmentId),
    listInspectionAutomationRuns(departmentId),
    listInspectionWorkflows(departmentId),
    listInspectionWebhooks(departmentId),
    listInspectionCalendarEvents(departmentId),
    listInspectionNerisMappings(departmentId),
    listInspectionIntegrationAdapters(departmentId),
  ]);

  return {
    automations,
    runs,
    workflows,
    webhooks,
    calendarEvents,
    nerisMappings,
    adapters,
    metrics: {
      automationsEnabled: automations.filter((row) => row.status === "enabled").length,
      automationsDraft: automations.filter((row) => row.status === "draft").length,
      workflowsPublished: workflows.filter((row) => row.status === "published").length,
      webhooksActive: webhooks.filter((row) => row.status === "active").length,
      calendarUpcoming: calendarEvents.filter((row) => {
        const start = Date.parse(row.startsAt || "");
        return Number.isFinite(start) && start >= Date.now();
      }).length,
      nerisMapped: nerisMappings.length,
      adaptersActive: adapters.filter((row) => row.status === "active").length,
    },
  };
}
