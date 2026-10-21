import { createRecord } from "../firestoreService.js";
import { HYDRANT_DAMAGE_AUDIT_COLLECTION } from "./paths.js";

function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {string} departmentId
 * @param {{
 *   action: string,
 *   entityType?: string,
 *   entityId?: string,
 *   actorUid?: string,
 *   actorName?: string,
 *   reason?: string,
 *   before?: object,
 *   after?: object,
 *   correlationId?: string,
 *   providerMessageId?: string,
 * }} event
 */
export async function writeHydrantDamageAudit(departmentId, event = {}) {
  if (!departmentId || !event.action) return null;
  const id = `HDA-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return createRecord(departmentId, HYDRANT_DAMAGE_AUDIT_COLLECTION, id, {
    action: String(event.action),
    entityType: event.entityType || "",
    entityId: event.entityId || "",
    actorUid: event.actorUid || "system",
    actorName: event.actorName || "System",
    reason: event.reason || "",
    before: event.before || null,
    after: event.after || null,
    correlationId: event.correlationId || "",
    providerMessageId: event.providerMessageId || "",
    source: "hydrant_damage",
    createdAt: nowIso(),
  });
}
