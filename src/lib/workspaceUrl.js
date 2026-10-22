import { PAGE_PARAM } from "./pageUrl.js";
import { PLATFORM_SCOPE_ID } from "./tenantPaths.js";
import { parseTenantSubdomain, platformOrigin } from "./tenantDomains.js";

// Same as CREATOR_CONSOLE_PATH in gatewayRouting.js (not imported: that module
// needs the browser build environment).
const PLATFORM_CONSOLE_PATH = "/creator-console?scope=platform";

/**
 * Where the creator Workspace switcher goes:
 *  - a department: /<department> on this address, keeping the open page;
 *  - the platform: the creator console (the start page "/" would reopen the
 *    department last signed in to).
 * A department's own subdomain can only show that department, so from there
 * creators switch on the platform address (app.forgeresponder.com), which keeps
 * them signed in across departments.
 */
export function workspaceUrl(nextId, location = window.location) {
  const origin = parseTenantSubdomain(location.hostname) ? platformOrigin() : location.origin;
  if (!nextId || nextId === PLATFORM_SCOPE_ID) return `${origin}${PLATFORM_CONSOLE_PATH}`;
  const page = new URLSearchParams(location.search || "").get(PAGE_PARAM);
  const query = page ? `?${PAGE_PARAM}=${encodeURIComponent(page)}` : "";
  return `${origin}/${encodeURIComponent(nextId)}${query}`;
}
