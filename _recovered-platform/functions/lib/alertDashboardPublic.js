const { syncAlerts } = require("./active911Store");
const { clientConfig: googleApisClientConfig, loadIntegration: loadGoogleApisIntegration } = require("./googleApisStore");
const { resolveGatewayDepartmentId } = require("./gatewayResolver");

const LIST_KEYS = {
  active911Alerts: "hlfd-rms-active911-alerts",
  alertDashboardConfig: "hlfd-rms-alert-dashboard-config",
  alertBusinessDirectory: "hlfd-rms-alert-business-directory",
  digitalDashboardDisplays: "hlfd-rms-dd-displays",
};

async function loadListItems(db, departmentId, listKey) {
  const snap = await db.doc(`departments/${departmentId}/lists/${listKey}`).get();
  if (!snap.exists()) return [];
  const data = snap.data() || {};
  return Array.isArray(data.items) ? data.items : [];
}

function publicStationDetails(profile = {}) {
  const details = Array.isArray(profile.stationDetails) ? profile.stationDetails : [];
  return details.map((station) => ({
    name: station.name || "",
    address: station.address || "",
    city: station.city || "",
    state: station.state || "",
    zip: station.zip || "",
  }));
}

function publicDisplays(displays = []) {
  return displays.map((display) => ({
    id: display.id || "",
    name: display.name || "",
    station: display.station || "",
  }));
}

function publicBusinessDirectory(entries = []) {
  return entries.map((entry) => ({
    id: entry.id || "",
    address: entry.address || "",
    normalizedAddress: entry.normalizedAddress || "",
    businessName: entry.businessName || "",
    criticalInfo: entry.criticalInfo || "",
  }));
}

async function maybeSyncAlerts(db, departmentId, config = {}) {
  const intervalSec = Number(config.autoSyncIntervalSec) || 90;
  const integrationSnap = await db.doc(`departments/${departmentId}/integrations/active911`).get();
  if (!integrationSnap.exists || !integrationSnap.data()?.connected) {
    return false;
  }

  const lastSyncAt = integrationSnap.data()?.lastSyncAt || "";
  const lastSyncMs = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
  const stale = !lastSyncMs || (Date.now() - lastSyncMs) > intervalSec * 1000;
  if (!stale) return false;

  try {
    await syncAlerts(db, departmentId, {
      alertDays: 1,
      alertMinutes: 180,
      userId: "public-alert-dashboard",
    });
    return true;
  } catch {
    return false;
  }
}

async function loadPublicAlertDashboard(db, gatewaySlug, options = {}) {
  const gateway = await resolveGatewayDepartmentId(db, gatewaySlug);
  if (!gateway?.departmentId) {
    throw new Error("RMS portal not found.");
  }

  const { departmentId } = gateway;
  const configItems = await loadListItems(db, departmentId, LIST_KEYS.alertDashboardConfig);
  const config = configItems.find((item) => item.id === "config") || configItems[0] || {};

  if (options.sync !== false) {
    await maybeSyncAlerts(db, departmentId, config);
  }

  const [
    alertsDoc,
    businessDirectory,
    displays,
    profileSnap,
    googleIntegration,
  ] = await Promise.all([
    db.doc(`departments/${departmentId}/lists/${LIST_KEYS.active911Alerts}`).get(),
    loadListItems(db, departmentId, LIST_KEYS.alertBusinessDirectory),
    loadListItems(db, departmentId, LIST_KEYS.digitalDashboardDisplays),
    db.doc(`departments/${departmentId}/profile/main`).get(),
    loadGoogleApisIntegration(db, departmentId),
  ]);

  const alertsData = alertsDoc.exists() ? (alertsDoc.data() || {}) : {};
  const alerts = Array.isArray(alertsData.items) ? alertsData.items : [];
  const profile = profileSnap.exists() ? (profileSnap.data() || {}) : {};
  const mapsConfig = googleApisClientConfig(googleIntegration || {});

  return {
    gatewayId: gateway.gatewayId,
    departmentId,
    departmentName: gateway.label || profile.name || departmentId,
    alerts,
    configItems: configItems.length ? configItems : [{ id: "config" }],
    businessDirectory: publicBusinessDirectory(businessDirectory),
    displays: publicDisplays(displays),
    profile: { stationDetails: publicStationDetails(profile) },
    mapsJsApiKey: mapsConfig.mapsJsApiKey || "",
  };
}

module.exports = {
  loadPublicAlertDashboard,
};
