import { createRecord, listRecords } from "./firestoreService.js";

export async function writeAuditLog(departmentId, entry) {
  const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return createRecord(departmentId, "auditLogs", id, {
    id,
    action: entry.action || "update",
    module: entry.module || "System",
    recordId: entry.recordId || "",
    summary: entry.summary || "",
    actorUid: entry.actorUid || "system",
    actorName: entry.actorName || "System",
    before: entry.before || null,
    after: entry.after || null,
    created_at: new Date().toISOString()
  });
}

export async function listAuditLogs(departmentId, filters = {}) {
  let logs = await listRecords(departmentId, "auditLogs");
  logs = logs.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (filters.module && filters.module !== "All") {
    logs = logs.filter((log) => log.module === filters.module);
  }
  if (filters.action && filters.action !== "All") {
    logs = logs.filter((log) => log.action === filters.action);
  }
  if (filters.actorUid) {
    logs = logs.filter((log) => log.actorUid === filters.actorUid);
  }
  return logs.slice(0, filters.limit || 100);
}
