/**
 * Department subdomains on Firebase Hosting: <subdomain>.<TENANT_ROOT_DOMAIN>.
 *
 * Firebase Hosting has no wildcard domains, so each department's subdomain is
 * registered as a custom domain through the Firebase Hosting API. With a
 * wildcard DNS record (*.forgeresponder.com -> Firebase Hosting) in place, a
 * newly registered subdomain gets its certificate automatically.
 *
 * Requires the Cloud Functions service account to hold the
 * "Firebase Hosting Admin" role (roles/firebasehosting.admin).
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { GoogleAuth } = require("google-auth-library");
const { isPlatformCreator } = require("./access");

const TENANT_ROOT_DOMAIN = String(process.env.TENANT_ROOT_DOMAIN || "forgeresponder.com").toLowerCase();
const HOSTING_API = "https://firebasehosting.googleapis.com/v1beta1";
// Never departments (keep in sync with src/lib/tenantDomains.js).
const RESERVED_SUBDOMAINS = new Set([
  "app", "www", "admin", "api", "auth", "console", "creator", "creator-console",
  "demo", "docs", "help", "login", "mail", "status", "support", "staging", "dev", "test",
]);

let authClient;
async function hostingFetch(path, { method = "GET", body } = {}) {
  authClient ||= new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const client = await authClient.getClient();
  const { token } = await client.getAccessToken();
  const response = await fetch(`${HOSTING_API}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

function projectAndSite() {
  const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  const siteId = process.env.HOSTING_SITE_ID || projectId;
  return { projectId, siteId };
}

function isValidSubdomain(label) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label) && !RESERVED_SUBDOMAINS.has(label);
}

/** Plain summary of a Firebase Hosting CustomDomain resource. */
function summarize(domain, resource = {}) {
  return {
    domain,
    hostState: resource.hostState || "HOST_STATE_UNSPECIFIED",
    ownershipState: resource.ownershipState || "OWNERSHIP_STATE_UNSPECIFIED",
    certState: resource.cert?.state || "CERT_STATE_UNSPECIFIED",
    reconciling: Boolean(resource.reconciling),
    // DNS records Firebase still needs (empty once everything is set up).
    requiredDnsUpdates: resource.requiredDnsUpdates || null,
    live: resource.hostState === "HOST_ACTIVE" && resource.ownershipState === "OWNERSHIP_ACTIVE",
  };
}

async function assertCreator(db, auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isPlatformCreator(db, auth))) {
    throw new HttpsError("permission-denied", "Platform creator access is required.");
  }
}

async function getDomainStatus(domain) {
  const { projectId, siteId } = projectAndSite();
  const { status, json } = await hostingFetch(`projects/${projectId}/sites/${siteId}/customDomains/${domain}`);
  if (status === 404) return null;
  if (status >= 400) {
    throw new HttpsError("internal", `Firebase Hosting API error ${status}: ${json.error?.message || "unknown"}`);
  }
  return json;
}

/**
 * Register <subdomain>.forgeresponder.com for a department (creator only) and
 * point the gateway record at it. Safe to call again: returns current status.
 */
async function registerDepartmentDomain(db, request) {
  await assertCreator(db, request.auth);
  const departmentId = String(request.data?.departmentId || "").trim().toLowerCase();
  const subdomain = String(request.data?.subdomain || departmentId).trim().toLowerCase();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");
  if (!isValidSubdomain(subdomain)) {
    throw new HttpsError("invalid-argument", `"${subdomain}" can't be used as a subdomain.`);
  }

  const registry = await db.doc(`platformDepartments/${departmentId}`).get();
  if (!registry.exists || ["disabled", "archived"].includes(registry.data()?.status)) {
    throw new HttpsError("not-found", "Department is not in the registry.");
  }

  // The subdomain must not already belong to another department.
  const gatewayRef = db.doc(`rmsGateways/${subdomain}`);
  const gateway = await gatewayRef.get();
  if (gateway.exists && gateway.data()?.departmentId && gateway.data().departmentId !== departmentId) {
    throw new HttpsError("already-exists", `${subdomain} is already used by ${gateway.data().departmentId}.`);
  }

  const domain = `${subdomain}.${TENANT_ROOT_DOMAIN}`;
  let resource = await getDomainStatus(domain);
  if (!resource) {
    const { projectId, siteId } = projectAndSite();
    const { status, json } = await hostingFetch(
      `projects/${projectId}/sites/${siteId}/customDomains?customDomainId=${encodeURIComponent(domain)}`,
      { method: "POST", body: {} }
    );
    if (status >= 400 && status !== 409) {
      throw new HttpsError(
        status === 403 ? "permission-denied" : "internal",
        `Firebase Hosting refused ${domain} (${status}): ${json.error?.message || "unknown"}`
      );
    }
    resource = (await getDomainStatus(domain)) || json.response || {};
  }

  const nowIso = new Date().toISOString();
  const registryData = registry.data() || {};
  await gatewayRef.set({
    gatewayId: subdomain,
    departmentId,
    departmentName: registryData.name || departmentId,
    departmentShortName: registryData.shortName || registryData.name || departmentId,
    status: "active",
    domain,
    updatedAt: nowIso,
    ...(gateway.exists ? {} : { createdAt: nowIso }),
  }, { merge: true });
  await db.doc(`platformDepartments/${departmentId}`).set({ domain, subdomain, updatedAt: nowIso }, { merge: true });

  return summarize(domain, resource);
}

async function departmentDomainStatus(db, request) {
  await assertCreator(db, request.auth);
  const subdomain = String(request.data?.subdomain || request.data?.departmentId || "").trim().toLowerCase();
  if (!isValidSubdomain(subdomain)) throw new HttpsError("invalid-argument", "Invalid subdomain.");
  const domain = `${subdomain}.${TENANT_ROOT_DOMAIN}`;
  const resource = await getDomainStatus(domain);
  return resource ? summarize(domain, resource) : { domain, registered: false };
}

module.exports = {
  departmentDomainStatus,
  isValidSubdomain,
  registerDepartmentDomain,
  summarize,
  TENANT_ROOT_DOMAIN,
};
