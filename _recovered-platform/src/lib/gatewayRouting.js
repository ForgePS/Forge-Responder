import { DEMO_ENTRY_PATH } from "./demoMode.js";
import { resolveRmsAppUrl } from "./platformUrls.js";

export const GATEWAY_DEPARTMENT_SESSION_KEY = "rms-gateway-department-id";
export const GATEWAY_DEPARTMENT_PATH_KEY = "rms-gateway-department-path";

export const RESERVED_GATEWAY_PATHS = new Set(["demo"]);

export function normalizeGatewayDepartmentId(value = "") {
  return String(value).trim().toLowerCase();
}

export function parseGatewayDepartmentId(pathname = window.location.pathname) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/" || normalized === DEMO_ENTRY_PATH) return null;

  const segment = normalized.split("/").filter(Boolean)[0];
  if (!segment) return null;

  const gatewayDepartmentId = normalizeGatewayDepartmentId(segment);
  if (!gatewayDepartmentId || RESERVED_GATEWAY_PATHS.has(gatewayDepartmentId)) return null;
  return gatewayDepartmentId;
}

export function buildDepartmentGatewayPath(departmentId) {
  if (!departmentId) return "/";
  return `/${encodeURIComponent(normalizeGatewayDepartmentId(departmentId))}`;
}

export function buildDepartmentGatewayUrl(departmentId) {
  if (!departmentId) return resolveRmsAppUrl();
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

export function syncGatewayUrl(departmentId) {
  if (!departmentId || typeof window === "undefined") return;
  const targetPath = buildDepartmentGatewayPath(departmentId);
  if (window.location.pathname.replace(/\/$/, "") !== targetPath.replace(/\/$/, "")) {
    window.history.replaceState({}, "", targetPath);
  }
}
