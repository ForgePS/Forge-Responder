import { listDepartmentApparatus } from "../apparatusService.js";
import { loadTenantListFromFirestore } from "../tenantListLoader.js";
import { LIST_KEYS } from "../tenantListKeys.js";

/**
 * Client-side backup dump of classic Fleet list docs for dry-run / Phase 3 prep.
 * Does not write to Firestore.
 *
 * @param {string} departmentId
 * @returns {Promise<{
 *   departmentId: string,
 *   exportedAt: string,
 *   apparatus: object[],
 *   workOrders: object[],
 *   assets: object[],
 *   hoseTests: object[],
 * }>}
 */
export async function exportClassicFleetLists(departmentId) {
  if (!departmentId) {
    return {
      departmentId: "",
      exportedAt: new Date().toISOString(),
      apparatus: [],
      workOrders: [],
      assets: [],
      hoseTests: [],
    };
  }

  const [apparatus, workOrdersPack, assetsPack, hosePack] = await Promise.all([
    listDepartmentApparatus(departmentId),
    loadTenantListFromFirestore(departmentId, LIST_KEYS.workOrders),
    loadTenantListFromFirestore(departmentId, LIST_KEYS.assets),
    loadTenantListFromFirestore(departmentId, LIST_KEYS.hoseTests),
  ]);

  return {
    departmentId,
    exportedAt: new Date().toISOString(),
    apparatus: Array.isArray(apparatus) ? apparatus : [],
    workOrders: Array.isArray(workOrdersPack?.items) ? workOrdersPack.items : [],
    assets: Array.isArray(assetsPack?.items) ? assetsPack.items : [],
    hoseTests: Array.isArray(hosePack?.items) ? hosePack.items : [],
  };
}

/**
 * Trigger a browser download of the classic fleet export JSON.
 * @param {string} departmentId
 */
export async function downloadClassicFleetExport(departmentId) {
  const payload = await exportClassicFleetLists(departmentId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `fleet-export-${departmentId || "unknown"}-${payload.exportedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  return payload;
}
