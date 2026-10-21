import { readStoredWorkspaceId } from "./creatorConsoleWorkspace.js";
import { resolveRmsAppUrl } from "./rmsAppUrl.js";
import { DEMO_DEPARTMENT_ID, PLATFORM_SCOPE_ID, isPlatformScope } from "./tenantPaths.js";
import { isHydrantAppPath, isBrandedHydrantHost, brandedHostDepartmentId } from "./hydrantAppRouting.js";
import { parseTenantSubdomain, tenantOrigin, useTenantSubdomains } from "./tenantDomains.js";

const DEMO_MODE_SESSION_KEY = "rms-demo-mode";

function isDemoSessionActive() {
  try {
    return window.sessionStorage.getItem(DEMO_MODE_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export const DEMO_ENTRY_PATH = "/demo";
export const GATEWAY_DEPARTMENT_SESSION_KEY = "rms-gateway-department-id";
export const GATEWAY_DEPARTMENT_PATH_KEY = "rms-gateway-department-path";
/** Explicit tenant chosen on the sign-in screen (persists until Change tenant). */
export const LOGIN_TENANT_KEY = "rms-login-tenant-id";

export const CREATOR_CONSOLE_PATH = "/creator-console";
export const CREATOR_CONSOLE_VIEW = "creator-console";
export const CREATOR_CONSOLE_MODULE = "Creator Console";

const MODULE_VIEW_SLUGS = {
  [CREATOR_CONSOLE_VIEW]: CREATOR_CONSOLE_MODULE,
  "creator-console": CREATOR_CONSOLE_MODULE,
  "creator console": CREATOR_CONSOLE_MODULE,
  "platform-admin": CREATOR_CONSOLE_MODULE
};
export const RESERVED_GATEWAY_PATHS = new Set([
  "demo",
  "creator-console",
  "alerts",
  "admin",
  "api",
  "assets",
  "static",
  "favicon.ico",
  "robots.txt",
  "manifest.json",
  "index.html",
  "login",
  "logout",
  "auth",
  "health",
  "status",
  "null",
  "undefined",
  "utility-ack",
]);

/** Accidental / mistyped branch IDs that should be soft-disabled from the creator registry. */
export const GHOST_DEPARTMENT_IDS = new Set([
  "admin",
  "api",
  "hornlake-fd",
  "st-charles-fire-dept",
  "st-charles",
  "assets",
  "static",
]);

function decodeGatewaySegment(value = "") {
  try {
    return decodeURIComponent(String(value || "").trim());
  } catch {
    return String(value || "").trim();
  }
}

export function isInvalidGatewaySlug(value = "") {
  const decoded = decodeGatewaySegment(value).toLowerCase();
  if (!decoded) return true;
  if (decoded.includes("{") || decoded.includes("}")) return true;
  if (decoded === "department-id" || decoded === "{department-id}") return true;
  return false;
}

export function isCreatorConsolePath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  return pathname.replace(/\/$/, "") === CREATOR_CONSOLE_PATH;
}

export function normalizeGatewayDepartmentId(value = "") {
  return String(value).trim().toLowerCase();
}

export function parseGatewayDepartmentId(pathname = window.location.pathname) {
  // <department>.forgeresponder.com names the department in the hostname.
  const subdomainId = parseTenantSubdomain();
  if (subdomainId) return subdomainId;

  if (isHydrantAppPath(pathname)) return null;

  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/" || normalized === DEMO_ENTRY_PATH) return null;

  const segment = normalized.split("/").filter(Boolean)[0];
  if (!segment) return null;

  const gatewayDepartmentId = normalizeGatewayDepartmentId(decodeGatewaySegment(segment));
  if (!gatewayDepartmentId || RESERVED_GATEWAY_PATHS.has(gatewayDepartmentId)) return null;
  if (isInvalidGatewaySlug(gatewayDepartmentId)) return null;
  return gatewayDepartmentId;
}

export function buildDepartmentGatewayPath(departmentId) {
  if (!departmentId) return "/";
  // On a department subdomain the department is in the hostname, not the path.
  if (parseTenantSubdomain()) return "/";
  return `/${encodeURIComponent(normalizeGatewayDepartmentId(departmentId))}`;
}

export function buildDepartmentGatewayUrl(departmentId) {
  if (!departmentId) return resolveRmsAppUrl();
  if (useTenantSubdomains()) return tenantOrigin(normalizeGatewayDepartmentId(departmentId));
  return `${resolveRmsAppUrl()}${buildDepartmentGatewayPath(departmentId)}`;
}

export function persistGatewayContext(gatewayDepartmentId, departmentId) {
  try {
    const pathId = normalizeGatewayDepartmentId(gatewayDepartmentId || departmentId || "");
    if (pathId) {
      window.sessionStorage.setItem(GATEWAY_DEPARTMENT_PATH_KEY, pathId);
    } else {
      window.sessionStorage.removeItem(GATEWAY_DEPARTMENT_PATH_KEY);
    }
    if (departmentId) {
      window.sessionStorage.setItem(GATEWAY_DEPARTMENT_SESSION_KEY, departmentId);
    } else {
      window.sessionStorage.removeItem(GATEWAY_DEPARTMENT_SESSION_KEY);
    }
  } catch (error) {
    console.warn("Unable to persist gateway context", error);
  }
}

export function getPersistedGatewayDepartmentId() {
  try {
    return window.sessionStorage.getItem(GATEWAY_DEPARTMENT_SESSION_KEY) || null;
  } catch {
    return null;
  }
}

export function getGatewayDepartmentId() {
  return getPersistedGatewayDepartmentId();
}

export function readLoginTenantId() {
  if (typeof window === "undefined") return null;
  try {
    const value = normalizeGatewayDepartmentId(window.localStorage.getItem(LOGIN_TENANT_KEY) || "");
    return value || null;
  } catch {
    return null;
  }
}

export function writeLoginTenantId(departmentId) {
  if (typeof window === "undefined") return;
  const value = normalizeGatewayDepartmentId(departmentId || "");
  try {
    if (value) {
      window.localStorage.setItem(LOGIN_TENANT_KEY, value);
    } else {
      window.localStorage.removeItem(LOGIN_TENANT_KEY);
    }
  } catch (error) {
    console.warn("Unable to persist login tenant", error);
  }
}

export function clearLoginTenantId() {
  writeLoginTenantId("");
}

/** True when the sign-in screen should treat the tenant as selected/locked. */
export function hasLockedLoginTenant() {
  if (typeof window === "undefined") return false;
  if (parseTenantSubdomain()) return true;
  if (isBrandedHydrantHost(window.location.hostname)) return true;
  if (parseGatewayDepartmentId()) return true;
  if (readLoginTenantId()) return true;
  return false;
}

/**
 * The department the app should show. When nothing identifies a tenant this
 * returns PLATFORM_SCOPE_ID ("no department selected"): users see the tenant
 * picker / access page, creators see the platform workspace. There is no
 * default customer.
 */
export function resolveActiveDepartmentId() {
  if (typeof window === "undefined") return PLATFORM_SCOPE_ID;
  if (isBrandedHydrantHost(window.location.hostname)) return brandedHostDepartmentId();
  if (isDemoSessionActive()) return DEMO_DEPARTMENT_ID;
  if (isCreatorConsolePath()) return readStoredWorkspaceId();

  const pathGatewayId = parseGatewayDepartmentId();
  if (pathGatewayId) return pathGatewayId;

  const loginTenantId = readLoginTenantId();
  if (loginTenantId) return loginTenantId;

  const sessionDepartmentId = getPersistedGatewayDepartmentId();
  if (sessionDepartmentId) return sessionDepartmentId;

  const storedWorkspaceId = readStoredWorkspaceId();
  if (storedWorkspaceId && !isPlatformScope(storedWorkspaceId)) {
    return storedWorkspaceId;
  }

  return PLATFORM_SCOPE_ID;
}

export function shouldSyncGatewayUrl(departmentId) {
  if (!departmentId || typeof window === "undefined") return false;
  if (parseTenantSubdomain()) return false;
  if (isBrandedHydrantHost(window.location.hostname)) return false;
  if (isHydrantAppPath(window.location.pathname)) return false;
  if (isCreatorConsolePath()) return false;
  if (isPlatformScope(departmentId)) return false;
  if (isAlertDashboardPath()) return false;

  const pathGatewayId = parseGatewayDepartmentId();
  if (!pathGatewayId) {
    // Only push /{tenant} when the user explicitly selected a login tenant.
    return Boolean(readLoginTenantId());
  }

  return normalizeGatewayDepartmentId(departmentId) === pathGatewayId;
}

export function syncGatewayUrl(departmentId) {
  if (isAlertDashboardPath()) return;
  if (!shouldSyncGatewayUrl(departmentId)) return;
  const targetPath = isAlertDashboardPath()
    ? buildAlertDashboardPath(departmentId)
    : buildDepartmentGatewayPath(departmentId);
  const search = window.location.search || "";
  const currentPath = window.location.pathname.replace(/\/$/, "");
  const normalizedTarget = targetPath.replace(/\/$/, "");
  if (currentPath !== normalizedTarget) {
    window.history.replaceState({}, "", `${normalizedTarget}${search}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }
}

export function normalizeAppViewSlug(value = "") {
  return String(value).trim().toLowerCase().replace(/_/g, "-");
}

export function resolveModuleFromViewSlug(viewSlug = "") {
  return MODULE_VIEW_SLUGS[normalizeAppViewSlug(viewSlug)] || null;
}

export function parseAppDeepLink(location = window.location) {
  const pathname = location.pathname || "/";
  const params = new URLSearchParams(location.search || "");

  if (isCreatorConsolePath(pathname)) {
    return {
      module: CREATOR_CONSOLE_MODULE,
      scope: PLATFORM_SCOPE_ID
    };
  }

  const view = params.get("view");
  if (!view) return null;

  const module = resolveModuleFromViewSlug(view);
  if (!module) return null;

  return {
    module,
    scope: params.get("scope") === "platform" ? PLATFORM_SCOPE_ID : null
  };
}

export const ALERT_DASHBOARD_PATH_SUFFIX = "/alerts";

export function isAlertDashboardPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const normalized = String(pathname || "/").replace(/\/$/, "") || "/";
  return normalized === ALERT_DASHBOARD_PATH_SUFFIX || normalized.endsWith(`${ALERT_DASHBOARD_PATH_SUFFIX}`);
}

export function parseAlertDashboardGatewaySlug(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const normalized = String(pathname || "/").replace(/\/$/, "") || "/";
  // camden.forgeresponder.com/alerts: the department is in the hostname.
  const subdomainId = parseTenantSubdomain();
  if (subdomainId) return normalized.endsWith(ALERT_DASHBOARD_PATH_SUFFIX) ? subdomainId : null;
  // A bare /alerts has no department: require /{department}/alerts.
  if (normalized === ALERT_DASHBOARD_PATH_SUFFIX) return null;
  if (!normalized.endsWith(ALERT_DASHBOARD_PATH_SUFFIX)) return null;
  const segment = normalized.split("/").filter(Boolean)[0];
  if (!segment || segment === "alerts") return null;
  const gatewayId = normalizeGatewayDepartmentId(decodeGatewaySegment(segment));
  if (!gatewayId || isInvalidGatewaySlug(gatewayId)) return null;
  return gatewayId;
}

export function buildAlertDashboardPath(departmentId = "") {
  if (!departmentId || parseTenantSubdomain()) return ALERT_DASHBOARD_PATH_SUFFIX;
  return `${buildDepartmentGatewayPath(departmentId)}${ALERT_DASHBOARD_PATH_SUFFIX}`;
}

export function buildCreatorConsoleUrl(options = {}) {
  const base = resolveRmsAppUrl();
  const { departmentId, platformScope = false } = options;

  if (platformScope) {
    return `${base}${CREATOR_CONSOLE_PATH}?scope=platform`;
  }

  if (departmentId) {
    return `${base}${buildDepartmentGatewayPath(departmentId)}?view=${CREATOR_CONSOLE_VIEW}`;
  }

  return `${base}${CREATOR_CONSOLE_PATH}`;
}
