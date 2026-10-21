import { hostLockedDepartmentId, resolveHostTenant } from "./hostTenants.js";

export const HYDRANT_APP_ROUTE_PREFIXES = [
  "hydrants",
  "ems-forms",
  "fire-forms",
  "pre-fire-plans",
  "fire-codes",
  "important-numbers",
  "inspection-division",
  "investigations",
];

/** True on a department-branded hydrant host (see hostTenants.js). */
export function isBrandedHydrantHost(hostname = typeof window !== "undefined" ? window.location.hostname : "") {
  return Boolean(resolveHostTenant(hostname)?.hydrantApp);
}

export function isHydrantAppPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const segment = pathname.replace(/\/$/, "").split("/").filter(Boolean)[0]?.toLowerCase();
  return HYDRANT_APP_ROUTE_PREFIXES.includes(segment);
}

export function hydrantTabFromPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const path = pathname.toLowerCase();
  if (path.startsWith("/hydrants/list")) return "hydrants";
  if (path.startsWith("/hydrants/flow")) return "flow";
  if (path.startsWith("/hydrants/inspections")) return "inspection";
  if (path.startsWith("/hydrants/reports")) return "reports";
  if (path.startsWith("/hydrants/sync")) return "sync";
  if (path.startsWith("/hydrants")) return "dashboard";
  return null;
}

export function hydrantTabFromHash(hash = typeof window !== "undefined" ? window.location.hash : "") {
  const tab = String(hash || "").replace(/^#\/?/, "").trim().toLowerCase();
  return tab || null;
}

export function hydrantPathForTab(tab, { embedded = false } = {}) {
  if (embedded) return null;
  const paths = {
    dashboard: "/hydrants",
    hydrants: "/hydrants/list",
    flow: "/hydrants/flow",
    inspection: "/hydrants/inspections",
    reports: "/hydrants/reports",
    sync: "/hydrants/sync",
  };
  return paths[tab] || null;
}

export function resolveInitialHydrantTab({
  embedded = false,
  preferDashboard = false,
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  hash = typeof window !== "undefined" ? window.location.hash : "",
} = {}) {
  const fromHash = hydrantTabFromHash(hash);
  const validTabs = new Set(["dashboard", "hydrants", "flow", "inspection", "reports", "sync", "ems", "fireForms", "fireCodes", "importantNumbers", "inspectionDivision", "investigations", "settings", "app"]);
  if (fromHash && validTabs.has(fromHash)) return fromHash;

  const fromPath = hydrantTabFromPath(pathname);
  if (fromPath) return fromPath;

  if (preferDashboard || embedded) return "dashboard";
  return "app";
}

/** Department locked by the current branded hydrant host, or "". */
export function brandedHostDepartmentId(hostname = typeof window !== "undefined" ? window.location.hostname : "") {
  return hostLockedDepartmentId(hostname);
}

export function shouldOpenHydrantsModule(location = typeof window !== "undefined" ? window.location : null) {
  if (!location) return false;
  if (!isBrandedHydrantHost(location.hostname)) return false;
  return Boolean(hydrantTabFromPath(location.pathname));
}

export function resolveInitialAppModule(location = typeof window !== "undefined" ? window.location : null) {
  if (shouldOpenHydrantsModule(location)) return "Hydrants";
  return "Dashboard";
}
