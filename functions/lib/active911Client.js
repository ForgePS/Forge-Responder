const USER_SERVICE_BASE = "https://user-service.active911.com/v1";
const OPEN_API_BASE = "https://access.active911.com/interface/open_api/api";
const { sanitizeAlertText } = require("./alertDashboardSanitize");

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Active911 returned an invalid response (${response.status}).`);
  }
}

function buildApiError(payload = {}, fallback = "Active911 request failed.") {
  const message = payload.message || payload.error || fallback;
  const error = new Error(message);
  error.code = payload.code || "ACTIVE911_ERROR";
  return error;
}

async function authenticateUser(email, password) {
  const body = new URLSearchParams({
    email: String(email || "").trim(),
    password: String(password || ""),
  });

  const response = await fetch(`${USER_SERVICE_BASE}/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const payload = await parseJsonResponse(response);
  if (!payload.success || !payload.result?.token) {
    throw buildApiError(payload, "Active911 sign-in failed. Check email and password.");
  }

  return {
    userId: payload.result.id,
    refreshToken: payload.result.token,
  };
}

async function createAccessToken(refreshToken) {
  const response = await fetch(`${USER_SERVICE_BASE}/user/access`, {
    method: "POST",
    headers: { Authorization: `a911Auth ${refreshToken}` },
  });

  const payload = await parseJsonResponse(response);
  if (!payload.success || !payload.result?.token) {
    throw buildApiError(payload, "Could not refresh Active911 access token.");
  }

  const expiresAt = Date.now() + (14 * 60 * 1000);
  return {
    accessToken: payload.result.token,
    userId: payload.result.id,
    expiresAt,
  };
}

async function getValidAccessToken(integration = {}) {
  if (
    integration.accessToken
    && integration.accessTokenExpiresAt
    && Date.now() < integration.accessTokenExpiresAt - 60_000
  ) {
    return {
      accessToken: integration.accessToken,
      userId: integration.userId,
      expiresAt: integration.accessTokenExpiresAt,
    };
  }

  return createAccessToken(integration.refreshToken);
}

async function openApiRequest(path, refreshToken, accessToken, options = {}) {
  const url = path.startsWith("http") ? path : `${OPEN_API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = {
    Authorization: `a911Access ${accessToken}`,
    Cookie: `a911Auth=${refreshToken}`,
    Accept: "application/json",
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body,
  });

  const payload = await parseJsonResponse(response);
  if (payload.result === "success" || payload.success === true) {
    return payload.message || payload.result || payload;
  }

  if (payload.result === "error" || payload.success === false) {
    throw buildApiError(payload);
  }

  return payload;
}


function normalizeAlertRecord(alert = {}) {
  return {
    id: String(alert.id || alert.alert_id || ""),
    description: sanitizeAlertText(alert.description || alert.details || "Alert"),
    address: sanitizeAlertText([alert.address, alert.unit].filter(Boolean).join(" ")),
    city: sanitizeAlertText(alert.city || ""),
    state: sanitizeAlertText(alert.state || ""),
    units: sanitizeAlertText(alert.units || ""),
    priority: sanitizeAlertText(alert.priority || ""),
    cadCode: sanitizeAlertText(alert.cad_code || ""),
    sentAt: alert.sent || alert.received || "",
    latitude: alert.latitude ?? null,
    longitude: alert.longitude ?? null,
    crossStreet: sanitizeAlertText(alert.cross_street || ""),
    source: alert.source || "Active911",
    responses: Array.isArray(alert.responses) ? alert.responses : [],
  };
}

async function fetchAgencyAlerts(refreshToken, accessToken, { alertDays = 10, alertMinutes = null } = {}) {
  const root = await openApiRequest("/", refreshToken, accessToken);
  const agency = root.agency || root.message?.agency || root;
  const agencyUri = agency.uri || agency.alerts_uri;

  let alertsPath = "/alerts";
  if (agencyUri && String(agencyUri).includes("/api/")) {
    alertsPath = `${String(agencyUri).replace(OPEN_API_BASE, "")}/alerts`;
  }

  const params = new URLSearchParams();
  if (alertMinutes) params.set("alert_minutes", String(alertMinutes));
  else params.set("alert_days", String(Math.min(Math.max(Number(alertDays) || 10, 1), 30)));

  const alertsEnvelope = await openApiRequest(
    `${alertsPath}?${params.toString()}`,
    refreshToken,
    accessToken
  );

  const alertRefs = alertsEnvelope.alerts || alertsEnvelope.message?.alerts || [];
  const alerts = [];

  for (const ref of alertRefs.slice(0, 25)) {
    if (!ref?.uri && !ref?.id) continue;
    try {
      const detailPath = ref.uri
        ? String(ref.uri).replace(OPEN_API_BASE, "")
        : `/alerts/${ref.id}`;
      const detailEnvelope = await openApiRequest(detailPath, refreshToken, accessToken);
      const alert = detailEnvelope.alert || detailEnvelope.message?.alert || detailEnvelope;
      if (alert?.id || alert?.description) {
        alerts.push(normalizeAlertRecord(alert));
      }
    } catch (error) {
      alerts.push(normalizeAlertRecord({
        id: ref.id,
        description: ref.description || "Active911 alert",
        details: error.message,
      }));
    }
  }

  return {
    agency: {
      id: agency.id || "",
      name: agency.name || "Active911 Agency",
      latitude: agency.latitude ?? null,
      longitude: agency.longitude ?? null,
    },
    alerts,
  };
}

function maskEmail(email = "") {
  const value = String(email || "").trim();
  if (!value.includes("@")) return "";
  const [local, domain] = value.split("@");
  if (!local || !domain) return value;
  return `${local.slice(0, 1)}***@${domain}`;
}

module.exports = {
  authenticateUser,
  createAccessToken,
  getValidAccessToken,
  fetchAgencyAlerts,
  maskEmail,
};