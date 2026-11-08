/**
 * NERIS API client (server only).
 *
 * FORGE has ONE NERIS integration account (client ID + secret, set as Firebase
 * secrets). Each department grants FORGE access by entering FORGE's client ID
 * under Enrollments in the NERIS portal; FORGE then works against that
 * department's NERIS entity ID (e.g. FD24027214).
 *
 * Auth is OAuth2 client_credentials: POST /token with the client ID and secret
 * in a Basic Authorization header and grant_type in a form body.
 * https://neris.fsri.org/articles/how-to-authenticate-with-the-client-credentials-auth-flow-oauth2
 */

const NERIS_BASE_URLS = {
  test: "https://api-test.neris.fsri.org/v1",
  production: "https://api.neris.fsri.org/v1",
};

// Official NERIS guide a department admin follows to enroll a vendor.
const NERIS_ENROLLMENT_GUIDE_URL = "https://neris-dev-public.s3.us-east-2.amazonaws.com/docs/NERIS%2B-Vendor-Integration-Enrollment.pdf";

// Entity type (2 letters) + state FIPS (2) + county FIPS (3) + trailing characters.
const NERIS_ID_PATTERN = /^[A-Z]{2}\d{5}[A-Z0-9]{3,}$/;
// NERIS client IDs are UUIDs ("05dd2999-329b-41ec-b94d-xxxxxxxxxxxx").
const CLIENT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REQUEST_TIMEOUT_MS = 15000;
const TOKEN_REFRESH_MARGIN_MS = 60 * 1000;

class NerisError extends Error {
  constructor(code, message, { status = 0 } = {}) {
    super(message);
    this.name = "NerisError";
    this.code = code; // "config" | "auth" | "not_enrolled" | "not_found" | "invalid" | "unavailable"
    this.status = status;
  }
}

function normalizeEnvironment(value) {
  return String(value || "").trim().toLowerCase() === "production" ? "production" : "test";
}

function baseUrlFor(environment) {
  // Local emulator only: point at a stand-in NERIS for testing. Ignored when deployed.
  if (process.env.FUNCTIONS_EMULATOR === "true" && process.env.NERIS_API_BASE_URL) {
    return process.env.NERIS_API_BASE_URL.replace(/\/+$/, "");
  }
  return NERIS_BASE_URLS[normalizeEnvironment(environment)];
}

function normalizeNerisId(value) {
  return String(value || "").replace(/\s+/g, "").toUpperCase();
}

function isValidNerisId(value) {
  return NERIS_ID_PATTERN.test(normalizeNerisId(value));
}

function isValidClientId(value) {
  return CLIENT_ID_PATTERN.test(String(value || "").trim());
}

async function fetchWithTimeout(fetchImpl, url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    throw new NerisError("unavailable", error.name === "AbortError"
      ? "NERIS didn't respond in time. Try again in a few minutes."
      : "Couldn't reach NERIS. Try again in a few minutes.");
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response) {
  const text = await response.text().catch(() => "");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

// Token cache per environment + client ID. Lives for the life of the function instance.
const tokenCache = new Map();

function clearTokenCache() {
  tokenCache.clear();
}

async function getAccessToken({ clientId, clientSecret, environment, fetchImpl = fetch, now = Date.now } = {}) {
  const id = String(clientId || "").trim();
  const secret = String(clientSecret || "").trim();
  if (!id || !secret) {
    throw new NerisError("config", "FORGE's NERIS credentials aren't set up yet. Contact FORGE Public Safety.");
  }
  const env = normalizeEnvironment(environment);
  const cacheKey = `${env}:${id}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - TOKEN_REFRESH_MARGIN_MS > now()) return cached.accessToken;

  const basic = Buffer.from(`${id}:${secret}`).toString("base64");
  const response = await fetchWithTimeout(fetchImpl, `${baseUrlFor(env)}/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
  });
  const body = await readJson(response);

  if (!response.ok || !body.access_token) {
    console.error("NERIS token request failed", response.status, JSON.stringify(body).slice(0, 300));
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new NerisError("auth", "NERIS rejected FORGE's credentials. Contact FORGE Public Safety.", { status: response.status });
    }
    throw new NerisError("unavailable", "NERIS sign-in isn't working right now. Try again in a few minutes.", { status: response.status });
  }

  const expiresInSeconds = Number(body.expires_in) > 0 ? Number(body.expires_in) : 3600;
  tokenCache.set(cacheKey, { accessToken: body.access_token, expiresAt: now() + expiresInSeconds * 1000 });
  return body.access_token;
}

async function nerisRequest(path, { credentials, method = "GET", body, fetchImpl = fetch } = {}) {
  const accessToken = await getAccessToken({ ...credentials, fetchImpl });
  const response = await fetchWithTimeout(fetchImpl, `${baseUrlFor(credentials?.environment)}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await readJson(response);
  if (response.status === 401) {
    // Token may have been revoked early; drop it so the next call signs in again.
    clearTokenCache();
  }
  return { ok: response.ok, status: response.status, data };
}

/** Best-effort department name from a NERIS entity record. */
function entityDisplayName(entity = {}) {
  return String(entity.name || entity.entity_name || entity.department_name || entity.display_name || "").trim();
}

/**
 * Looks up a department's NERIS entity. This only works once the department
 * has enrolled FORGE, so it doubles as the connection check.
 */
async function fetchEntity(nerisId, { credentials, fetchImpl = fetch } = {}) {
  const id = normalizeNerisId(nerisId);
  if (!isValidNerisId(id)) {
    throw new NerisError("invalid", "That doesn't look like a NERIS ID. It starts with two letters and five digits, like FD24027214.");
  }
  const result = await nerisRequest(`/entity/${encodeURIComponent(id)}`, { credentials, fetchImpl });
  if (result.ok) {
    return { nerisId: id, name: entityDisplayName(result.data), entity: result.data };
  }
  if (result.status === 403 || result.status === 401) {
    throw new NerisError("not_enrolled", "NERIS says FORGE isn't enrolled for this department yet. A NERIS admin for the department needs to enroll FORGE's client ID under Enrollments.", { status: result.status });
  }
  if (result.status === 404) {
    throw new NerisError("not_found", "NERIS has no department with that ID. Check the NERIS ID on the department's NERIS account.", { status: result.status });
  }
  console.error("NERIS entity lookup failed", result.status, JSON.stringify(result.data).slice(0, 300));
  throw new NerisError("unavailable", "NERIS couldn't answer right now. Try again in a few minutes.", { status: result.status });
}

module.exports = {
  NERIS_BASE_URLS,
  NERIS_ENROLLMENT_GUIDE_URL,
  NerisError,
  baseUrlFor,
  clearTokenCache,
  entityDisplayName,
  fetchEntity,
  getAccessToken,
  isValidClientId,
  isValidNerisId,
  nerisRequest,
  normalizeEnvironment,
  normalizeNerisId,
};
