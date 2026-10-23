import { buildDepartmentGatewayPath } from "./gatewayRouting.js";
import { resolveRmsAppUrl } from "./platformUrls.js";
import { PLATFORM_SCOPE_ID } from "./tenantPaths.js";

export const CREATOR_CONSOLE_PATH = "/creator-console";
export const CREATOR_CONSOLE_VIEW = "creator-console";
export const CREATOR_CONSOLE_MODULE = "Creator Console";

const MODULE_VIEW_SLUGS = {
  [CREATOR_CONSOLE_VIEW]: CREATOR_CONSOLE_MODULE,
  "creator-console": CREATOR_CONSOLE_MODULE,
  "creator console": CREATOR_CONSOLE_MODULE,
  "platform-admin": CREATOR_CONSOLE_MODULE
};

export function isCreatorConsolePath(pathname = window.location.pathname) {
  return pathname.replace(/\/$/, "") === CREATOR_CONSOLE_PATH;
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
      scope: params.get("scope") === "platform" ? PLATFORM_SCOPE_ID : null
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

export function buildCreatorConsoleUrl(options = {}) {
  const base = resolveRmsAppUrl();
  const { departmentId, platformScope = false, useQueryOnDepartment = false } = options;

  if (platformScope) {
    return `${base}${CREATOR_CONSOLE_PATH}?scope=platform`;
  }

  if (departmentId && useQueryOnDepartment) {
    return `${base}${buildDepartmentGatewayPath(departmentId)}?view=${CREATOR_CONSOLE_VIEW}`;
  }

  if (departmentId) {
    return `${base}${buildDepartmentGatewayPath(departmentId)}?view=${CREATOR_CONSOLE_VIEW}`;
  }

  return `${base}${CREATOR_CONSOLE_PATH}`;
}
