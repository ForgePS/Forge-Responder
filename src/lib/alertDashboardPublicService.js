import { fetchPublicAlertDashboard } from "./alertDashboardPublicCallable.js";
import { loadPublicAlertDashboardFromFirestore } from "./alertDashboardPublicLoader.js";

export async function loadPublicAlertDashboard(gatewaySlug = "", displayKey = "") {
  return fetchPublicAlertDashboard(gatewaySlug, displayKey);
}

// Kept for signed-in previews inside FORGE.
export { loadPublicAlertDashboardFromFirestore };

export { savePublicAlertDashboardDoc } from "./alertDashboardPublicLoader.js";
