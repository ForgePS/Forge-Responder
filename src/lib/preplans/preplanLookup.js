/**
 * Small, targeted reads for preplan entry points on other pages (occupancy,
 * inspection). Queries by field instead of loading every preplan.
 */
import { collection, getDocs, query, where } from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import { normalizePreplanRecord } from "../inspections/preplanService.js";
import { PREPLANS_COLLECTION } from "../inspections/paths.js";

const HIDDEN_STATUSES = new Set(["archived", "cancelled"]);

/** Preplans for one occupancy, live ones first (archived and cancelled left out). */
export async function listPreplansForOccupancy(departmentId, occupancyId) {
  const db = getFirestoreDb();
  if (!db || !departmentId || !occupancyId) return [];
  const snap = await getDocs(query(
    collection(db, "departments", departmentId, PREPLANS_COLLECTION),
    where("occupancyId", "==", occupancyId),
  ));
  return snap.docs
    .map((item) => normalizePreplanRecord({ id: item.id, ...item.data() }, departmentId))
    .filter((row) => !HIDDEN_STATUSES.has(String(row.status)))
    .sort((a, b) => Number(Boolean(b.publishedRevisionId)) - Number(Boolean(a.publishedRevisionId))
      || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

/**
 * Open a preplan in the Preplans module. The module reads this key once on
 * load (PreplansShell), so navigation needs no URL parameters.
 */
export function openPreplanInModule(preplanId, onNavigate) {
  try { window.sessionStorage.setItem("forge-open-preplan-id", preplanId); } catch { /* private mode: page still opens */ }
  onNavigate?.("All Preplans");
}
