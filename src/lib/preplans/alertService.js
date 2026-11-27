/**
 * Firestore access for preplan operational alerts, inspection finding links and
 * review tasks. Rules (firestore.rules) enforce who may verify or resolve.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, getRecord, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import {
  PREPLAN_ALERTS_COLLECTION,
  PREPLAN_FINDING_LINKS_COLLECTION,
  PREPLAN_REVIEW_TASKS_COLLECTION,
} from "../inspections/paths.js";
import { alertHistoryEntry, normalizeAlert } from "./alertModel.js";
import { localDateKey } from "./localDate.js";

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

async function queryBy(departmentId, collectionName, field, value) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !value) return [];
  const snap = await getDocs(query(collection(db, "departments", departmentId, collectionName), where(field, "==", value)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

/** Alerts for a preplan and its occupancy (an inspection may raise one before a preplan exists). */
export async function listAlertsForPreplan(departmentId, { preplanId = "", occupancyId = "" } = {}) {
  const [byPreplan, byOccupancy] = await Promise.all([
    queryBy(departmentId, PREPLAN_ALERTS_COLLECTION, "preplanId", preplanId),
    queryBy(departmentId, PREPLAN_ALERTS_COLLECTION, "occupancyId", occupancyId),
  ]);
  const byId = new Map();
  for (const row of [...byPreplan, ...byOccupancy]) byId.set(row.id, normalizeAlert(row));
  return [...byId.values()];
}

/** Report a condition. Always starts as "reported" unless the caller can verify (rules check). */
export async function reportAlert(departmentId, payload = {}, actor = {}, { verified = false } = {}) {
  if (!payload.description?.trim()) throw new Error("Describe the condition.");
  if (!payload.occupancyId && !payload.preplanId) throw new Error("An alert needs an occupancy or a preplan.");
  const id = newId("PPA");
  const stamp = new Date().toISOString();
  const record = normalizeAlert({
    ...payload,
    id,
    verificationStatus: verified ? "verified" : "reported",
    resolutionStatus: "active",
    effectiveAt: payload.effectiveAt || localDateKey(),
    lastVerifiedAt: verified ? stamp : "",
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
    reviewedBy: verified ? actor.actorUid || "" : "",
    reviewedByName: verified ? actor.actorName || "" : "",
    history: [alertHistoryEntry(verified ? "created_verified" : "reported", actor)],
    createdAt: stamp,
    updatedAt: stamp,
  });
  await createRecord(departmentId, PREPLAN_ALERTS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanAlert",
    action: "create",
    recordId: id,
    summary: `Operational alert ${verified ? "created" : "reported"}: ${record.description.slice(0, 80)}`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return record;
}

/**
 * Approver decision on an alert.
 * @param {"verify"|"reject"|"resolve"|"reverify"} decision
 */
export async function decideAlert(departmentId, alertId, decision, actor = {}, note = "") {
  const existing = normalizeAlert(await getRecord(departmentId, PREPLAN_ALERTS_COLLECTION, alertId) || {});
  if (!existing.id) throw new Error("Alert not found.");
  const stamp = new Date().toISOString();
  const patch = {
    verify: { verificationStatus: "verified", lastVerifiedAt: stamp },
    reverify: { lastVerifiedAt: stamp },
    reject: { verificationStatus: "rejected" },
    resolve: { resolutionStatus: "resolved", resolvedAt: stamp },
  }[decision];
  if (!patch) throw new Error("Unknown decision.");
  const next = normalizeAlert({
    ...existing,
    ...patch,
    reviewedBy: actor.actorUid || "",
    reviewedByName: actor.actorName || "",
    history: [...existing.history, alertHistoryEntry(decision, actor, note)],
    updatedAt: stamp,
  });
  await updateRecord(departmentId, PREPLAN_ALERTS_COLLECTION, alertId, next);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanAlert",
    action: decision,
    recordId: alertId,
    summary: `Operational alert ${decision}: ${existing.description.slice(0, 80)}`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return next;
}

/** Link an inspection finding (or the inspection itself) to a preplan object. */
export async function linkFindingToObject(departmentId, payload = {}, actor = {}) {
  if (!payload.inspectionId || !payload.preplanId) throw new Error("Pick an inspection and a preplan.");
  const id = newId("PPL");
  const record = {
    id,
    inspectionId: String(payload.inspectionId),
    violationId: String(payload.violationId || ""),
    preplanId: String(payload.preplanId),
    occupancyId: String(payload.occupancyId || ""),
    buildingId: String(payload.buildingId || ""),
    floorId: String(payload.floorId || ""),
    objectId: String(payload.objectId || ""),
    // Labels as they were when linked, so the list reads well without loading every record.
    inspectionNumber: String(payload.inspectionNumber || "").slice(0, 60),
    violationLabel: String(payload.violationLabel || "").slice(0, 200),
    objectLabel: String(payload.objectLabel || "").slice(0, 200),
    note: String(payload.note || "").slice(0, 1000),
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  };
  await createRecord(departmentId, PREPLAN_FINDING_LINKS_COLLECTION, id, record);
  return record;
}

export async function listFindingLinks(departmentId, { preplanId = "", inspectionId = "" } = {}) {
  if (preplanId) return queryBy(departmentId, PREPLAN_FINDING_LINKS_COLLECTION, "preplanId", preplanId);
  return queryBy(departmentId, PREPLAN_FINDING_LINKS_COLLECTION, "inspectionId", inspectionId);
}

/**
 * Open a review task. The id is deterministic, so the same change reported
 * twice (a retried save, a second inspector) doesn't make a duplicate task.
 */
export async function openReviewTask(departmentId, payload = {}, actor = {}) {
  const source = String(payload.source || "manual");
  const sourceId = String(payload.sourceId || newId("SRC"));
  const fingerprint = String(payload.fingerprint || "request").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60);
  const id = `${source}-${sourceId}-${fingerprint}`.slice(0, 200);
  const existing = await getRecord(departmentId, PREPLAN_REVIEW_TASKS_COLLECTION, id).catch(() => null);
  if (existing) return { ...existing, alreadyExisted: true };
  const record = {
    id,
    status: "open",
    source,
    sourceId,
    preplanId: String(payload.preplanId || ""),
    occupancyId: String(payload.occupancyId || ""),
    reason: String(payload.reason || "").slice(0, 1000),
    changedFields: Array.isArray(payload.changedFields) ? payload.changedFields.slice(0, 30).map(String) : [],
    requestedBy: actor.actorUid || "",
    requestedByName: actor.actorName || "",
  };
  await createRecord(departmentId, PREPLAN_REVIEW_TASKS_COLLECTION, id, record);
  return record;
}

export async function listReviewTasks(departmentId, { preplanId = "", occupancyId = "" } = {}) {
  const rows = preplanId
    ? await queryBy(departmentId, PREPLAN_REVIEW_TASKS_COLLECTION, "preplanId", preplanId)
    : await queryBy(departmentId, PREPLAN_REVIEW_TASKS_COLLECTION, "occupancyId", occupancyId);
  return rows.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

/** @param {"accepted"|"rejected"|"investigating"} status */
export async function decideReviewTask(departmentId, taskId, status, actor = {}, note = "") {
  if (!["accepted", "rejected", "investigating"].includes(status)) throw new Error("Unknown status.");
  return updateRecord(departmentId, PREPLAN_REVIEW_TASKS_COLLECTION, taskId, {
    status,
    decidedBy: actor.actorUid || "",
    decidedByName: actor.actorName || "",
    decidedAt: new Date().toISOString(),
    decisionNote: String(note || "").slice(0, 1000),
  });
}
