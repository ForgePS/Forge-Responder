import { collection, doc, getDocs, limit as limitTo, orderBy, query, setDoc } from "firebase/firestore";
import { getFirestoreDb } from "./firebaseClient.js";
import { createRecord, listRecords } from "./firestoreService.js";
import { isPlatformScope } from "./tenantPaths.js";

// Platform-level entries (creator console) live in their own top-level
// collection: "__forge-platform__" is not a valid Firestore document id.
export const PLATFORM_AUDIT_COLLECTION = "platformAuditLogs";

function buildEntry(id, entry) {
  return {
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
  };
}

export async function writeAuditLog(departmentId, entry) {
  const id = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (isPlatformScope(departmentId)) {
    const db = getFirestoreDb();
    if (!db) return null;
    const payload = buildEntry(id, entry);
    await setDoc(doc(db, PLATFORM_AUDIT_COLLECTION, id), payload);
    return payload;
  }
  return createRecord(departmentId, "auditLogs", id, buildEntry(id, entry));
}

/** Newest-first audit entries for a department, or the platform when departmentId is the platform scope. */
export async function listAuditLogs(departmentId, filters = {}) {
  let logs;
  if (isPlatformScope(departmentId)) {
    const db = getFirestoreDb();
    if (!db) return [];
    const snap = await getDocs(query(collection(db, PLATFORM_AUDIT_COLLECTION), orderBy("created_at", "desc"), limitTo(500)));
    logs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    logs = await listRecords(departmentId, "auditLogs");
  }
  // Older entries use created_at; some server-written ones use createdAt.
  const when = (log) => String(log.created_at || log.createdAt || "");
  logs = logs.sort((a, b) => when(b).localeCompare(when(a)));
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
