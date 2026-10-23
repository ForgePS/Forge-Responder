/**
 * Department subdomains: https://<department>.forgeresponder.com
 *
 * Each department is served on its own subdomain of TENANT_ROOT_DOMAIN. The
 * platform itself (sign-in tenant picker, creator console) lives on
 * PLATFORM_SUBDOMAIN (app.forgeresponder.com). On other hosts (localhost,
 * *.web.app) the older path form /<department> keeps working.
 *
 * Config (Vite env):
 *   VITE_TENANT_ROOT_DOMAIN   default "forgeresponder.com"
 *   VITE_TENANT_SUBDOMAINS    "true" to build subdomain links even when the
 *                             current page is on another host (turn on once DNS
 *                             for the root domain is live).
 */

export const TENANT_ROOT_DOMAIN = String(import.meta.env?.VITE_TENANT_ROOT_DOMAIN || "forgeresponder.com")
  .trim()
  .toLowerCase();

export const PLATFORM_SUBDOMAIN = "app";

// Subdomains that are never departments.
export const RESERVED_SUBDOMAINS = new Set([
  PLATFORM_SUBDOMAIN, "www", "admin", "api", "auth", "console", "creator", "creator-console",
  "demo", "docs", "help", "login", "mail", "status", "support", "staging", "dev", "test",
]);

const SUBDOMAIN_LINKS_FORCED = String(import.meta.env?.VITE_TENANT_SUBDOMAINS || "").toLowerCase() === "true";

function currentHostname() {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

function normalizeHost(hostname) {
  return String(hostname || "").trim().toLowerCase().replace(/\.$/, "");
}

/** True for forgeresponder.com and any of its subdomains. */
export function isTenantDomainHost(hostname = currentHostname()) {
  const host = normalizeHost(hostname);
  return Boolean(TENANT_ROOT_DOMAIN) && (host === TENANT_ROOT_DOMAIN || host.endsWith(`.${TENANT_ROOT_DOMAIN}`));
}

/** True on the platform host (app.forgeresponder.com) or the bare root domain. */
export function isPlatformDomainHost(hostname = currentHostname()) {
  const host = normalizeHost(hostname);
  return host === TENANT_ROOT_DOMAIN || host === `${PLATFORM_SUBDOMAIN}.${TENANT_ROOT_DOMAIN}`;
}

/** A valid DNS label that can name a department. */
export function isValidTenantSubdomain(label = "") {
  const value = String(label || "").toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(value) && !RESERVED_SUBDOMAINS.has(value);
}

/**
 * The department gateway id named by the hostname ("camden" for
 * camden.forgeresponder.com), or null. Only one level of subdomain counts.
 */
export function parseTenantSubdomain(hostname = currentHostname()) {
  const host = normalizeHost(hostname);
  if (!isTenantDomainHost(host) || host === TENANT_ROOT_DOMAIN) return null;
  const label = host.slice(0, -(TENANT_ROOT_DOMAIN.length + 1));
  if (label.includes(".")) return null;
  return isValidTenantSubdomain(label) ? label : null;
}

/** Whether links should use department subdomains instead of /<department> paths. */
export function useTenantSubdomains(hostname = currentHostname()) {
  return SUBDOMAIN_LINKS_FORCED || isTenantDomainHost(hostname);
}

export function tenantOrigin(departmentId) {
  return `https://${String(departmentId || "").toLowerCase()}.${TENANT_ROOT_DOMAIN}`;
}

export function platformOrigin() {
  return `https://${PLATFORM_SUBDOMAIN}.${TENANT_ROOT_DOMAIN}`;
}
