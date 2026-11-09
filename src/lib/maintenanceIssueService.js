/**
 * Maintenance Issues: saving triage decisions and progress.
 * Everything is stored on the issue's Fleet work order (issueOutcome, issueStep, issueHistory),
 * and the work order's own status is moved along with it so Fleet Work Orders stays in step.
 */
import {
  createFleetWorkOrder,
  transitionFleetWorkOrder,
  updateFleetWorkOrder,
} from "./fleet/fleetWorkOrderService.js";
import {
  ISSUE_PATHS,
  isFinalStep,
  pathSteps,
  planWorkOrderTransitions,
  stepLabel,
} from "./maintenanceIssueBoard.js";

function historyEntry(actor = {}, fields = {}) {
  return {
    at: new Date().toISOString(),
    byUid: actor.actorUid || "",
    byName: actor.actorName || "",
    ...fields,
  };
}

/** Move the work order to `target` through allowed transitions. Returns warnings, never throws for "can't get there". */
async function moveWorkOrderTo(departmentId, workOrderId, fromStatus, target, actor, notes = "") {
  const route = planWorkOrderTransitions(fromStatus, target);
  if (route === null) {
    return { warnings: [`Work order is already ${fromStatus.replace(/_/g, " ")}, so its status was left as is.`] };
  }
  let last = null;
  for (const status of route) {
    last = await transitionFleetWorkOrder(departmentId, workOrderId, status, { ...actor, notes });
  }
  return { warnings: last?.completion?.warnings || [], completion: last?.completion || null };
}

/**
 * Damage reports that never got a work order (e.g. older JotForm submissions): open one so the
 * issue can be tracked. The report itself is not changed; the order points back to it.
 */
export async function startTrackingIssue(departmentId, form = {}, actor = {}) {
  const complaint = [form.equipment, form.damageDescription || form.summary]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" — ");
  return createFleetWorkOrder(departmentId, {
    unit: form.location || "",
    complaint: complaint || form.title || "Damage report",
    category: "Damage report",
    workOrderType: "corrective",
    priority: "medium",
    source: form.source === "jotform" ? "jotform" : "damage_form",
    damageFormId: form.id,
    photos: (form.photos || []).filter((photo) => photo?.url),
    openedAt: form.submittedAt || "",
    status: "requested",
  }, actor);
}

/**
 * Triage: choose repair, replace, dispose or no action.
 * "No action needed" closes the issue (the work order is cancelled).
 */
export async function setIssuePath(departmentId, order, path, { note = "" } = {}, actor = {}) {
  if (!order?.id) throw new Error("This issue has no work order yet.");
  if (!ISSUE_PATHS[path]) throw new Error("Choose repair, replace, dispose or no action.");
  const firstStep = pathSteps(path)[0];
  const history = [
    ...(order.issueHistory || []),
    historyEntry(actor, { type: "path", path, step: firstStep.id, note: String(note || "").trim() }),
  ];
  await updateFleetWorkOrder(departmentId, order.id, {
    issueOutcome: path,
    issueStep: firstStep.id,
    issueHistory: history,
  }, actor);
  // Triage approves a requested order; "no action" cancels it.
  const target = firstStep.workOrderStatus || (order.status === "requested" ? "approved" : "");
  if (!target) return { warnings: [] };
  return moveWorkOrderTo(departmentId, order.id, order.status, target, actor, note);
}

/** Record the next step on the chosen path (e.g. Replacement ordered → received → replaced). */
export async function advanceIssueStep(departmentId, order, stepId, { note = "" } = {}, actor = {}) {
  if (!order?.id) throw new Error("This issue has no work order yet.");
  const path = order.issueOutcome || "repair";
  const step = pathSteps(path).find((item) => item.id === stepId);
  if (!step) throw new Error("That step isn't on this issue's path.");
  const cleanNote = String(note || "").trim();
  const patch = {
    issueOutcome: path,
    issueStep: step.id,
    issueHistory: [
      ...(order.issueHistory || []),
      historyEntry(actor, { type: "step", path, step: step.id, note: cleanNote }),
    ],
  };
  // The work order's correction is what closes a linked defect, so say how it was resolved.
  if (isFinalStep(path, step.id) && !String(order.correction || "").trim()) {
    patch.correction = [stepLabel(path, step.id), cleanNote].filter(Boolean).join(": ");
  }
  await updateFleetWorkOrder(departmentId, order.id, patch, actor);
  if (!step.workOrderStatus) return { warnings: [] };
  return moveWorkOrderTo(departmentId, order.id, order.status, step.workOrderStatus, actor, cleanNote);
}

export async function addIssueNote(departmentId, order, note = "", actor = {}) {
  const text = String(note || "").trim();
  if (!order?.id || !text) return null;
  return updateFleetWorkOrder(departmentId, order.id, {
    issueHistory: [
      ...(order.issueHistory || []),
      historyEntry(actor, { type: "note", path: order.issueOutcome || "", step: order.issueStep || "", note: text }),
    ],
  }, actor);
}
