const { syncAlerts } = require("./active911Store");
const { clientConfig: googleApisClientConfig, loadIntegration: loadGoogleApisIntegration } = require("./googleApisStore");
const { resolveGatewayDepartmentId } = require("./gatewayResolver");
const { readListItems } = require("./listStore");
const crypto = require("crypto");

const LIST_KEYS = {
  active911Alerts: "hlfd-rms-active911-alerts",
  alertDashboardConfig: "hlfd-rms-alert-dashboard-config",
  alertBusinessDirectory: "hlfd-rms-alert-business-directory",
  digitalDashboardDisplays: "hlfd-rms-dd-displays",
};

async function loadListItems(db, departmentId, listKey) {
  return readListItems(db, departmentId, listKey);
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

/**
 * Station TV screens open /{department}/alerts?key=... with no sign-in. The key is
 * the department's publicDisplayKey (Digital Dashboard settings); without the right
 * key, or with the public display turned off, nothing is returned.
 */
function sameKey(a = "", b = "") {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function publicDisplayAllowed(config = {}, displayKey = "") {
  if (config.publicDashboardEnabled === false) return false;
  return sameKey(config.publicDisplayKey, String(displayKey || "").trim());
}

/** True when this key opens the department's station displays. */
async function verifyPublicDisplayKey(db, departmentId, displayKey = "") {
  if (!departmentId || !displayKey) return false;
  const configItems = await readListItems(db, departmentId, LIST_KEYS.alertDashboardConfig).catch(() => []);
  const config = configItems.find((item) => item.id === "config") || configItems[0] || {};
  return publicDisplayAllowed(config, displayKey);
}

// Only what a station screen shows: no responder names or free-text notes.
function publicAlert(alert = {}) {
  return {
    id: alert.id || "",
    cadCode: alert.cadCode || "",
    description: alert.description || "",
    address: alert.address || "",
    city: alert.city || "",
    state: alert.state || "",
    crossStreet: alert.crossStreet || "",
    units: alert.units || "",
    priority: alert.priority || "",
    sentAt: alert.sentAt || "",
    syncedAt: alert.syncedAt || "",
    latitude: alert.latitude ?? null,
    longitude: alert.longitude ?? null,
    source: alert.source || "",
  };
}

function publicConfig(config = {}) {
  const { publicDisplayKey: _key, ...rest } = config;
  return rest;
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
  if (!publicDisplayAllowed(config, options.displayKey)) {
    const error = new Error("This display link isn't valid. Copy the current link from Digital Dashboard in FORGE.");
    error.code = "permission-denied";
    throw error;
  }

  if (options.sync !== false) {
    await maybeSyncAlerts(db, departmentId, config);
  }

  const [
    alertsItems,
    businessDirectory,
    displays,
    profileSnap,
    googleIntegration,
  ] = await Promise.all([
    loadListItems(db, departmentId, LIST_KEYS.active911Alerts).catch(() => []),
    loadListItems(db, departmentId, LIST_KEYS.alertBusinessDirectory),
    loadListItems(db, departmentId, LIST_KEYS.digitalDashboardDisplays),
    db.doc(`departments/${departmentId}/profile/main`).get().catch(() => null),
    loadGoogleApisIntegration(db, departmentId).catch(() => null),
  ]);

  const alerts = Array.isArray(alertsItems) ? alertsItems : [];
  const profile = profileSnap?.exists ? (profileSnap.data() || {}) : {};
  const mapsConfig = googleApisClientConfig(googleIntegration || {});

  return {
    gatewayId: gateway.gatewayId,
    departmentId,
    departmentName: gateway.label || profile.name || departmentId,
    alerts: alerts.map(publicAlert),
    configItems: [publicConfig(config)],
    businessDirectory: publicBusinessDirectory(businessDirectory),
    displays: publicDisplays(displays),
    profile: { stationDetails: publicStationDetails(profile) },
    mapsJsApiKey: mapsConfig.mapsJsApiKey || "",
  };
}

module.exports = {
  loadPublicAlertDashboard,
  verifyPublicDisplayKey,
  publicAlert,
};
