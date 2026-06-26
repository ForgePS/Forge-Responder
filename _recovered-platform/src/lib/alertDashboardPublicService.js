import { fetchPublicAlertDashboard } from "./alertDashboardPublicCallable.js";
import { loadPublicAlertDashboardFromFirestore } from "./alertDashboardPublicLoader.js";

export async function loadPublicAlertDashboard(gatewaySlug = "") {
  try {
    return await loadPublicAlertDashboardFromFirestore(gatewaySlug);
  } catch (firestoreError) {
    try {
      return await fetchPublicAlertDashboard(gatewaySlug);
    } catch {
      throw firestoreError;
    }
  }
}

export { savePublicAlertDashboardDoc } from "./alertDashboardPublicLoader.js";
