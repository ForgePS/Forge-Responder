import { writeAuditLog } from "../auditService.js";
import { createRecord } from "../firestoreService.js";
import { INSPECTION_AUDIT_EVENTS_COLLECTION } from "./paths.js";

/**
 * Write a department audit log entry scoped to the Inspections module.
 * @param {string} departmentId
 * @param {object} entry
 */
export async function writeInspectionAuditLog(departmentId, entry = {}) {
  return writeAuditLog(departmentId, {
    ...entry,
    module: entry.module || "Inspections",
  });
}

/**
 * Immutable inspection-specific audit event (Phase 1 collection).
 * Prefer writeInspectionAuditLog for cross-module audit trail;
 * use this when a dedicated inspections event stream is needed.
 * @param {string} departmentId
 * @param {object} event
 */
export async function writeInspectionAuditEvent(departmentId, event = {}) {
  if (!departmentId) return null;
  const id = event.id || `IAE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return createRecord(departmentId, INSPECTION_AUDIT_EVENTS_COLLECTION, id, {
    id,
    action: event.action || "update",
    recordType: event.recordType || "inspection",
    recordId: event.recordId || "",
    summary: event.summary || "",
    actorUid: event.actorUid || "system",
    actorName: event.actorName || "System",
    before: event.before || null,
    after: event.after || null,
    created_at: new Date().toISOString(),
  });
}
