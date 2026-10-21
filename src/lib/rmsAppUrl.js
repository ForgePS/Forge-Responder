import { isTenantDomainHost, platformOrigin } from "./tenantDomains.js";

function normalizeUrl(value, fallback) {
  const raw = (value || fallback || "").trim();
  if (!raw) return fallback;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

// Platform address (sign-in tenant picker, creator console). Set
// VITE_RMS_APP_URL=https://app.forgeresponder.com once that DNS is live.
export const FORGE_RMS_APP_URL = normalizeUrl(
  import.meta.env.VITE_RMS_APP_URL,
  "https://rms-dashboard-7562e.web.app"
);

export const FORGE_RMS_APP_HOST = new URL(FORGE_RMS_APP_URL).host;

function isRmsGatewayHost(hostname) {
  return (
    hostname === "localhost"
    || hostname.endsWith(".web.app")
    || hostname === FORGE_RMS_APP_HOST
  );
}

/** Platform origin for links (creator console, demo, tenant picker). */
export function resolveRmsAppUrl() {
  if (typeof window !== "undefined") {
    const { hostname, origin } = window.location;
    // On forgeresponder.com hosts the platform lives on app.forgeresponder.com.
    if (isTenantDomainHost(hostname)) return platformOrigin();
    if (isRmsGatewayHost(hostname)) return origin;
  }
  return FORGE_RMS_APP_URL;
}
