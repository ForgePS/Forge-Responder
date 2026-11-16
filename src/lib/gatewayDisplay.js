import { TENANT_ROOT_DOMAIN } from "./tenantDomains.js";

/**
 * How the RMS gateway reads on the platform brand card, from the configured
 * gateway address. Departments on the root domain live on their own subdomain
 * ({departmentId}.forgeresponder.com); any other host uses a path
 * (rms.example.com/{departmentId}).
 *
 *   "*.forgeresponder.com"          -> {departmentId}.forgeresponder.com
 *   "https://app.forgeresponder.com" -> {departmentId}.forgeresponder.com
 *   "https://rms.example.com"        -> rms.example.com/{departmentId}
 */
export function describeRmsGateway(rmsAppUrl = "", rootDomain = TENANT_ROOT_DOMAIN) {
  const host = String(rmsAppUrl || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/[/?#].*$/, "")
    .toLowerCase();
  if (!host) return null;

  const wildcard = host.startsWith("*.");
  const bare = wildcard ? host.slice(2) : host;
  const root = String(rootDomain || "").toLowerCase();
  const onRoot = root && (bare === root || bare.endsWith(`.${root}`));

  if (wildcard || onRoot) {
    const domain = onRoot ? root : bare;
    return { label: `{departmentId}.${domain}`, href: `https://app.${domain}` };
  }
  return { label: `${bare}/{departmentId}`, href: `https://${bare}` };
}
