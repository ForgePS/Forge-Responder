const admin = require("firebase-admin");
const { replaceListItems } = require("./listStore");
const {
  authenticateUser,
  createAccessToken,
  fetchAgencyAlerts,
  getValidAccessToken,
  maskEmail,
} = require("./active911Client");

function integrationRef(db, departmentId) {
  return db.doc(`departments/${departmentId}/integrations/active911`);
}

async function loadIntegration(db, departmentId) {
  const snap = await integrationRef(db, departmentId).get();
  if (!snap.exists) return null;
  return snap.data() || null;
}

async function saveIntegration(db, departmentId, patch) {
  const ref = integrationRef(db, departmentId);
  await ref.set({
    ...patch,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
  return ref.get().then((snap) => snap.data() || patch);
}

async function connectIntegration(db, departmentId, { email, password, refreshToken, connectedBy }) {
  let nextRefreshToken = String(refreshToken || "").trim();
  let userId = "";
  let emailHint = "";

  if (!nextRefreshToken) {
    const auth = await authenticateUser(email, password);
    nextRefreshToken = auth.refreshToken;
    userId = auth.userId;
    emailHint = maskEmail(email);
  } else {
    const access = await createAccessToken(nextRefreshToken);
    userId = access.userId;
    emailHint = maskEmail(email || "");
  }

  const access = await createAccessToken(nextRefreshToken);
  let agency = { id: "", name: "" };
  try {
    const result = await fetchAgencyAlerts(nextRefreshToken, access.accessToken, { alertDays: 1 });
    agency = result.agency || agency;
  } catch {
    // Connection can succeed even if alert read fails due to permissions.
  }

  return saveIntegration(db, departmentId, {
    connected: true,
    authType: "user-service",
    userId,
    emailHint,
    refreshToken: nextRefreshToken,
    accessToken: access.accessToken,
    accessTokenExpiresAt: access.expiresAt,
    agencyId: agency.id || "",
    agencyName: agency.name || "",
    connectedAt: new Date().toISOString(),
    connectedBy: connectedBy || "",
    lastSyncAt: "",
    lastError: "",
  });
}

async function disconnectIntegration(db, departmentId) {
  await integrationRef(db, departmentId).delete();
  return { connected: false };
}

function publicStatus(integration = {}) {
  if (!integration?.connected) {
    return { connected: false };
  }

  return {
    connected: true,
    authType: integration.authType || "user-service",
    emailHint: integration.emailHint || "",
    agencyId: integration.agencyId || "",
    agencyName: integration.agencyName || "",
    connectedAt: integration.connectedAt || "",
    lastSyncAt: integration.lastSyncAt || "",
    lastError: integration.lastError || "",
  };
}

async function syncAlerts(db, departmentId, options = {}) {
  const integration = await loadIntegration(db, departmentId);
  if (!integration?.connected || !integration.refreshToken) {
    throw new Error("Active911 is not connected for this department.");
  }

  const access = await getValidAccessToken(integration);
  const result = await fetchAgencyAlerts(integration.refreshToken, access.accessToken, {
    alertDays: options.alertDays || 10,
    alertMinutes: options.alertMinutes || null,
  });

  await saveIntegration(db, departmentId, {
    accessToken: access.accessToken,
    accessTokenExpiresAt: access.expiresAt,
    agencyId: result.agency?.id || integration.agencyId || "",
    agencyName: result.agency?.name || integration.agencyName || "",
    lastSyncAt: new Date().toISOString(),
    lastError: "",
  });

  const alerts = result.alerts.map((alert) => ({
    ...alert,
    syncedAt: new Date().toISOString(),
    source: "active911",
  }));

  await replaceListItems(db, departmentId, "hlfd-rms-active911-alerts", alerts, { updatedBy: options.userId || "system" });

  return {
    agency: result.agency,
    alerts,
    count: alerts.length,
  };
}

module.exports = {
  connectIntegration,
  disconnectIntegration,
  loadIntegration,
  publicStatus,
  syncAlerts,
};
