import { loadTenantListFromFirestore } from "./tenantListLoader.js";

export const APPARATUS_LIST_KEY = "hlfd-rms-apparatus";

export async function listDepartmentApparatus(departmentId) {
  const { items } = await loadTenantListFromFirestore(departmentId, APPARATUS_LIST_KEY);
  return items;
}
