/**
 * Maintenance Issues dashboard: turns Fleet work orders and damage-report records into one
 * list of reported issues, each placed on its lifecycle (New → Triaged → In progress → Resolved)
 * and on the path chosen for it (repair, replace, dispose or no action).
 *
 * Pure functions only (no Firestore), so the rules here can be unit tested.
 */
import { WORK_ORDER_TRANSITIONS } from "./fleet/workOrderDefaults.js";

export const OVERDUE_AFTER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Each path's steps in order. The last step resolves the issue. */
export const ISSUE_PATHS = {
  repair: {
    label: "Repair",
    steps: [
      { id: "triaged", label: "Triaged" },
      { id: "in_repair", label: "In repair", workOrderStatus: "in_progress" },
      { id: "repaired", label: "Repaired", workOrderStatus: "completed" },
    ],
  },
  replace: {
    label: "Replace",
    steps: [
      { id: "triaged", label: "Triaged" },
      { id: "ordered", label: "Replacement ordered", workOrderStatus: "awaiting_parts" },
      { id: "received", label: "Replacement received", workOrderStatus: "in_progress" },
      { id: "replaced", label: "Replaced", workOrderStatus: "completed" },
    ],
  },
  dispose: {
    label: "Dispose",
    steps: [
      { id: "triaged", label: "Triaged" },
      { id: "removed", label: "Removed from service", workOrderStatus: "in_progress" },
      { id: "disposed", label: "Disposed", workOrderStatus: "completed" },
    ],
  },
  no_action: {
    label: "No action needed",
    steps: [{ id: "closed_no_action", label: "Closed, no action needed", workOrderStatus: "cancelled" }],
  },
};

export const ISSUE_PATH_OPTIONS = Object.entries(ISSUE_PATHS).map(([id, path]) => ({ id, label: path.label }));

export const ISSUE_STAGES = [
  { id: "new", label: "New", hint: "Reported, not yet triaged" },
  { id: "triaged", label: "Triaged", hint: "Path chosen, work not started" },
  { id: "in_progress", label: "In progress", hint: "Being repaired, replaced or disposed of" },
  { id: "resolved", label: "Resolved", hint: "Repaired, replaced, disposed of or closed" },
];

export const ISSUE_OUTCOME_LABELS = {
  repaired: "Repaired",
  replaced: "Replaced",
  disposed: "Disposed",
  no_action: "No action needed",
  cancelled: "Cancelled",
};

const FINAL_STEP_OUTCOME = {
  repaired: "repaired",
  replaced: "replaced",
  disposed: "disposed",
  closed_no_action: "no_action",
};

const SOURCE_LABELS = {
  "employee-portal": "Employee Portal",
  employee_portal: "Employee Portal",
  "field-app": "FORGE FIELD",
  field_app: "FORGE FIELD",
  jotform: "Jotform",
};

const WORK_STATUSES = new Set(["in_progress", "awaiting_parts", "awaiting_vendor", "ready_for_qc"]);
const TRIAGED_STATUSES = new Set(["approved", "scheduled"]);
const DONE_STATUSES = new Set(["completed", "closed"]);

export function pathSteps(pathId = "") {
  return ISSUE_PATHS[pathId]?.steps || [];
}

export function stepLabel(pathId = "", stepId = "") {
  return pathSteps(pathId).find((step) => step.id === stepId)?.label || "";
}

/** The step after the current one on this path, or null at the end. */
export function nextStep(pathId = "", stepId = "") {
  const steps = pathSteps(pathId);
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1] : null;
}

export function isFinalStep(pathId = "", stepId = "") {
  const steps = pathSteps(pathId);
  return steps.length > 0 && steps[steps.length - 1].id === stepId;
}

/**
 * Shortest list of allowed work-order transitions from one status to another
 * (e.g. requested → completed = approved, in_progress, completed). [] when already there,
 * null when the target can't be reached (closed and cancelled orders are final).
 */
export function planWorkOrderTransitions(fromStatus = "", toStatus = "", transitions = WORK_ORDER_TRANSITIONS) {
  if (!toStatus || fromStatus === toStatus) return [];
  const queue = [[fromStatus]];
  const seen = new Set([fromStatus]);
  while (queue.length) {
    const route = queue.shift();
    for (const next of transitions[route[route.length - 1]] || []) {
      if (seen.has(next)) continue;
      const nextRoute = [...route, next];
      if (next === toStatus) return nextRoute.slice(1);
      seen.add(next);
      queue.push(nextRoute);
    }
  }
  return null;
}

function toTime(value) {
  if (!value) return NaN;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : NaN;
}

function daysBetween(start, end) {
  const a = toTime(start);
  const b = typeof end === "number" ? end : toTime(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  return Math.floor((b - a) / DAY_MS);
}

function isIssueWorkOrder(order = {}, formFor) {
  return Boolean(
    formFor(order)
    || order.damageFormId
    || order.issueOutcome
    || order.source === "employee_portal"
    || /damage report/i.test(String(order.category || ""))
    || /^WO-[PF]/i.test(String(order.id || ""))
    || /^WO-[PF]/i.test(String(order.legacyWorkOrderId || "")),
  );
}

function sourceFor(order, form) {
  const raw = form?.source || order?.source || "";
  if (SOURCE_LABELS[raw]) return SOURCE_LABELS[raw];
  const id = String(order?.legacyWorkOrderId || order?.id || "");
  if (/^WO-P/i.test(id)) return "Employee Portal";
  if (/^WO-F/i.test(id)) return "FORGE FIELD";
  return "Fleet";
}

/** Where the issue sits on the board, and how it ended if resolved. */
export function deriveIssueState(order = null) {
  if (!order) return { stage: "new", path: "", step: "", outcome: "" };
  const status = order.status || "requested";
  const path = ISSUE_PATHS[order.issueOutcome] ? order.issueOutcome : "";
  const step = path && pathSteps(path).some((s) => s.id === order.issueStep) ? order.issueStep : "";

  if (DONE_STATUSES.has(status) || (path && isFinalStep(path, step) && status !== "cancelled")) {
    // Finished from Fleet Work Orders without stepping through here: show the path's last step.
    const resolvedPath = path || "repair";
    const finalStep = pathSteps(resolvedPath).at(-1).id;
    return { stage: "resolved", path: resolvedPath, step: finalStep, outcome: FINAL_STEP_OUTCOME[finalStep] };
  }
  if (status === "cancelled") {
    return { stage: "resolved", path, step, outcome: path === "no_action" ? "no_action" : "cancelled" };
  }
  if (path) {
    return { stage: !step || step === "triaged" ? "triaged" : "in_progress", path, step: step || "triaged", outcome: "" };
  }
  if (TRIAGED_STATUSES.has(status)) return { stage: "triaged", path: "", step: "", outcome: "" };
  if (WORK_STATUSES.has(status)) return { stage: "in_progress", path: "repair", step: "in_repair", outcome: "" };
  return { stage: "new", path: "", step: "", outcome: "" };
}

function buildTimeline(order, form, reportedAt, reportedBy) {
  const events = [];
  if (reportedAt) events.push({ at: reportedAt, label: "Reported", detail: reportedBy ? `by ${reportedBy}` : "" });
  if (order?.startedAt) events.push({ at: order.startedAt, label: "Work started", detail: "" });
  for (const entry of order?.issueHistory || []) {
    const label = entry.type === "note"
      ? "Note"
      : entry.type === "path"
        ? `Path set: ${ISSUE_PATHS[entry.path]?.label || entry.path}`
        : stepLabel(entry.path, entry.step) || entry.step || "Updated";
    const by = entry.byName ? (entry.note ? `— ${entry.byName}` : `by ${entry.byName}`) : "";
    events.push({ at: entry.at, label, detail: [entry.note, by].filter(Boolean).join(" ") });
  }
  if (order?.completedAt) events.push({ at: order.completedAt, label: "Work order completed", detail: "" });
  if (order?.closedAt) events.push({ at: order.closedAt, label: "Work order closed", detail: "" });
  return events.sort((a, b) => toTime(a.at) - toTime(b.at));
}

/**
 * One row per reported issue. Damage-report records are joined to their work order by
 * `workOrderId` (portal and field reports) or the order's `damageFormId` (tracked later).
 * @param {{ workOrders?: object[], damageForms?: object[], now?: Date|number }} input
 */
export function buildMaintenanceIssues({ workOrders = [], damageForms = [], now = Date.now() } = {}) {
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  const forms = Array.isArray(damageForms) ? damageForms : [];
  const orders = Array.isArray(workOrders) ? workOrders : [];

  const formByWorkOrder = new Map();
  const formById = new Map();
  for (const form of forms) {
    if (!form?.id) continue;
    formById.set(form.id, form);
    if (form.workOrderId) formByWorkOrder.set(form.workOrderId, form);
  }
  const formFor = (order) => (order.damageFormId && formById.get(order.damageFormId))
    || formByWorkOrder.get(order.id)
    || (order.legacyWorkOrderId && formByWorkOrder.get(order.legacyWorkOrderId))
    || null;

  const usedForms = new Set();
  const issues = [];

  const pushIssue = (order, form) => {
    if (form) usedForms.add(form.id);
    const state = deriveIssueState(order);
    const reportedAt = form?.submittedAt || order?.openedAt || order?.createdAt || "";
    const reportedBy = form?.submitterName || order?.requestedBy || "";
    const resolvedAt = state.stage === "resolved"
      ? order?.completedAt || order?.closedAt || order?.issueHistory?.at(-1)?.at || order?.updatedAt || ""
      : "";
    const ageDays = daysBetween(reportedAt, state.stage === "resolved" ? resolvedAt : nowMs);
    const target = toTime(order?.targetCompletionAt);
    const open = state.stage !== "resolved";
    const photos = [...(form?.photos || []), ...(order?.photos || [])]
      .filter((photo, index, all) => photo?.url && all.findIndex((other) => other?.url === photo.url) === index);

    issues.push({
      id: order?.id || `form:${form.id}`,
      workOrder: order,
      damageForm: form,
      workOrderId: order?.id || "",
      workOrderNumber: order?.workOrderNumber || order?.id || "",
      title: form?.equipment || order?.complaint || form?.title || "Maintenance issue",
      unit: order?.unitDesignation || order?.fleetNumber || form?.location || "",
      description: form?.damageDescription || form?.summary || order?.complaint || "",
      reportedAt,
      reportedBy,
      source: sourceFor(order, form),
      priority: order?.priority || "medium",
      safety: Boolean(open && (order?.oosRequired || order?.priority === "critical" || order?.defectId)),
      photos,
      ...state,
      resolvedAt,
      ageDays,
      overdue: open && (Number.isFinite(target) ? target < nowMs : ageDays >= OVERDUE_AFTER_DAYS),
      timeline: buildTimeline(order, form, reportedAt, reportedBy),
    });
  };

  for (const order of orders) {
    if (!order?.id || !isIssueWorkOrder(order, formFor)) continue;
    pushIssue(order, formFor(order));
  }
  for (const form of forms) {
    if (form?.id && !usedForms.has(form.id)) pushIssue(null, form);
  }

  return issues.sort((a, b) => toTime(b.reportedAt || 0) - toTime(a.reportedAt || 0));
}

/** KPI numbers for the top of the dashboard. */
export function summarizeMaintenanceIssues(issues = [], { now = Date.now(), windowDays = 30 } = {}) {
  const nowMs = typeof now === "number" ? now : new Date(now).getTime();
  const since = nowMs - windowDays * DAY_MS;
  const open = issues.filter((issue) => issue.stage !== "resolved");
  const recentlyResolved = issues.filter((issue) => issue.stage === "resolved" && toTime(issue.resolvedAt) >= since);
  const byStage = Object.fromEntries(ISSUE_STAGES.map((stage) => [stage.id, 0]));
  for (const issue of issues) byStage[issue.stage] = (byStage[issue.stage] || 0) + 1;
  const byOutcome = Object.fromEntries(Object.keys(ISSUE_OUTCOME_LABELS).map((key) => [key, 0]));
  for (const issue of recentlyResolved) byOutcome[issue.outcome] = (byOutcome[issue.outcome] || 0) + 1;
  const average = (list, pick) => (list.length ? Math.round((list.reduce((sum, item) => sum + pick(item), 0) / list.length) * 10) / 10 : 0);

  return {
    total: issues.length,
    open: open.length,
    new: byStage.new,
    safety: open.filter((issue) => issue.safety).length,
    overdue: open.filter((issue) => issue.overdue).length,
    avgDaysOpen: average(open, (issue) => issue.ageDays),
    resolvedRecently: recentlyResolved.length,
    avgDaysToResolve: average(recentlyResolved, (issue) => issue.ageDays),
    byStage,
    byOutcome,
    windowDays,
  };
}

/** Search + filter helper for the board. */
export function filterMaintenanceIssues(issues = [], { search = "", path = "", source = "", safetyOnly = false, overdueOnly = false } = {}) {
  const needle = String(search || "").trim().toLowerCase();
  return issues.filter((issue) => {
    if (path && issue.path !== path) return false;
    if (source && issue.source !== source) return false;
    if (safetyOnly && !issue.safety) return false;
    if (overdueOnly && !issue.overdue) return false;
    if (!needle) return true;
    return [issue.title, issue.unit, issue.description, issue.reportedBy, issue.workOrderNumber, issue.source]
      .some((value) => String(value || "").toLowerCase().includes(needle));
  });
}
