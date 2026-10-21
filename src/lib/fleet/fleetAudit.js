import { writeAuditLog } from "../auditService.js";
import { createRecord } from "../firestoreService.js";
import { FLEET_AUDIT_EVENTS_COLLECTION } from "./paths.js";

/**
 * @param {string} departmentId
 * @param {object} entry
 */
export async function writeFleetAuditLog(departmentId, entry = {}) {
  return writeAuditLog(departmentId, {
    ...entry,
    module: entry.module || "Fleet",
  });
}

/**
 * @param {string} departmentId
 * @param {object} event
 */
export async function writeFleetAuditEvent(departmentId, event = {}) {
  if (!departmentId) return null;
  const id = event.id || `FAE-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return createRecord(departmentId, FLEET_AUDIT_EVENTS_COLLECTION, id, {
    id,
    action: event.action || "update",
    recordType: event.recordType || "fleetAsset",
    recordId: event.recordId || "",
    summary: event.summary || "",
    actorUid: event.actorUid || "system",
    actorName: event.actorName || "System",
    before: event.before || null,
    after: event.after || null,
    created_at: new Date().toISOString(),
  });
}
