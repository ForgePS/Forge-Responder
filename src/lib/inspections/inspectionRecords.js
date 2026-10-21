import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { INSPECTIONS_COLLECTION } from "./paths.js";

/**
 * Zero-safe summary counts for the Phase 1 dashboard.
 * @param {import("./types.js").InspectionRecord[]} records
 */
export function buildInspectionDashboardMetrics(records = []) {
  const list = Array.isArray(records) ? records.filter(Boolean) : [];
  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const dueAtMs = (record) => {
    const raw = record?.dueAt || record?.scheduledStart || "";
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? ms : null;
  };

  let dueToday = 0;
  let dueThisWeek = 0;
  let overdue = 0;
  let unassigned = 0;
  let inProgress = 0;
  let awaitingApproval = 0;
  let completed = 0;

  for (const record of list) {
    const status = String(record.status || "").toLowerCase();
    const assignees = Array.isArray(record.assignedInspectorIds) ? record.assignedInspectorIds : [];
    const due = dueAtMs(record);

    if (!assignees.length && status !== "completed" && status !== "cancelled" && status !== "archived") {
      unassigned += 1;
    }
    if (status === "in_progress") inProgress += 1;
    if (status === "awaiting_approval") awaitingApproval += 1;
    if (status === "completed") completed += 1;
    if (status === "overdue" || (due != null && due < now && !["completed", "cancelled", "archived"].includes(status))) {
      overdue += 1;
    }
    if (due != null && due >= startOfToday.getTime() && due < endOfToday.getTime()) dueToday += 1;
    if (due != null && due >= startOfToday.getTime() && due < endOfWeek.getTime()) dueThisWeek += 1;
  }

  return {
    total: list.length,
    dueToday,
    dueThisWeek,
    overdue,
    unassigned,
    inProgress,
    awaitingApproval,
    completed,
    openViolations: list.reduce((sum, item) => sum + (Number(item.openViolationCount) || 0), 0),
  };
}

/**
 * @param {string} departmentId
 * @param {{ assignedInspectorId?: string, max?: number }} [options]
 * @returns {Promise<import("./types.js").InspectionRecord[]>}
 */
export async function listInspectionRecords(departmentId, options = {}) {
  if (!departmentId) return [];
  const db = getFirestoreDb();
  if (!db) return [];

  const max = Number.isFinite(options.max) ? options.max : 500;
  const col = collection(db, "departments", departmentId, INSPECTIONS_COLLECTION);

  try {
    let q;
    if (options.assignedInspectorId) {
      q = query(
        col,
        where("assignedInspectorIds", "array-contains", options.assignedInspectorId),
        limit(max)
      );
    } else {
      q = query(col, orderBy("updatedAt", "desc"), limit(max));
    }
    const snap = await getDocs(q);
    return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  } catch (error) {
    // Index may be missing or collection empty — fall back to unscoped read.
    if (error?.code === "failed-precondition" || error?.code === "invalid-argument") {
      try {
        const snap = await getDocs(query(col, limit(max)));
        let rows = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        if (options.assignedInspectorId) {
          rows = rows.filter((row) => (
            Array.isArray(row.assignedInspectorIds)
            && row.assignedInspectorIds.includes(options.assignedInspectorId)
          ));
        }
        return rows;
      } catch (fallbackError) {
        console.warn("Unable to list inspection records", fallbackError);
        return [];
      }
    }
    if (error?.code === "permission-denied") {
      console.warn("Permission denied listing inspection records", error);
      return [];
    }
    console.warn("Unable to list inspection records", error);
    return [];
  }
}
