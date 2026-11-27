/**
 * SmartPlan conversion records (`preplanConversions`). One record per import,
 * so every proposed object can be traced to its source file and method.
 *
 * Browser code writes only deterministic methods (overlay, vector_import,
 * line_detection). AI vision records are created by the server; the rules
 * stop a browser from writing one.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { createRecord, updateRecord } from "../firestoreService.js";
import { writeInspectionAuditLog } from "../inspections/inspectionAudit.js";
import { PREPLAN_CONVERSIONS_COLLECTION } from "../inspections/paths.js";

export function newConversionId() {
  return `PPC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export async function recordConversion(departmentId, payload = {}, actor = {}) {
  const id = payload.id || newConversionId();
  const record = {
    id,
    method: payload.method,
    format: String(payload.format || ""),
    preplanId: String(payload.preplanId || ""),
    revisionId: String(payload.revisionId || ""),
    buildingId: String(payload.buildingId || ""),
    floorId: String(payload.floorId || ""),
    fileId: String(payload.fileId || ""),
    fileName: String(payload.fileName || "").slice(0, 200),
    status: "applied",
    reviewStatus: "pending",
    counts: payload.counts || {},
    proposedCount: Number(payload.proposedCount) || 0,
    skippedCount: Number(payload.skippedCount) || 0,
    unsupported: payload.unsupported || {},
    warnings: (payload.warnings || []).slice(0, 20).map((row) => String(row).slice(0, 300)),
    scaleFactor: Number(payload.scaleFactor) || 1,
    fileUnits: String(payload.fileUnits || ""),
    createdBy: actor.actorUid || "",
    createdByName: actor.actorName || "",
  };
  await createRecord(departmentId, PREPLAN_CONVERSIONS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanConversion",
    action: "create",
    recordId: id,
    summary: `SmartPlan ${record.method} of ${record.fileName || "a drawing"}: ${record.proposedCount} proposed objects`,
    actorUid: actor.actorUid || "",
    actorName: actor.actorName || "",
  });
  return record;
}

export async function listConversionsForFloor(departmentId, revisionId, floorId) {
  const db = getFirestoreDb();
  if (!db || !revisionId) return [];
  const snap = await getDocs(query(
    collection(db, "departments", departmentId, PREPLAN_CONVERSIONS_COLLECTION),
    where("revisionId", "==", revisionId),
  ));
  return snap.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .filter((row) => row.floorId === floorId)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export async function markConversionReviewed(departmentId, conversionId, actor = {}) {
  return updateRecord(departmentId, PREPLAN_CONVERSIONS_COLLECTION, conversionId, {
    reviewStatus: "reviewed",
    reviewedBy: actor.actorUid || "",
    reviewedAt: new Date().toISOString(),
  });
}
