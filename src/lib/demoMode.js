import { buildDepartmentGatewayPath, DEMO_ENTRY_PATH, persistGatewayContext } from "./gatewayRouting.js";
import { DEMO_DEPARTMENT_ID } from "./tenantPaths.js";

export const DEMO_MODE_KEY = "rms-demo-mode";
export { DEMO_ENTRY_PATH };

export function isDemoEntryPath(pathname = window.location.pathname) {
  return pathname.replace(/\/$/, "") === DEMO_ENTRY_PATH;
}

export function isDemoModeActive() {
  try {
    return window.sessionStorage.getItem(DEMO_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function activateDemoMode() {
  try {
    window.sessionStorage.setItem(DEMO_MODE_KEY, "1");
    window.localStorage.setItem("rms-active-department-id", DEMO_DEPARTMENT_ID);
    persistGatewayContext(DEMO_DEPARTMENT_ID, DEMO_DEPARTMENT_ID);
  } catch (error) {
    console.warn("Unable to persist demo mode", error);
  }
}

export function getDemoGatewayPath() {
  return buildDepartmentGatewayPath(DEMO_DEPARTMENT_ID);
}

export function clearDemoMode() {
  try {
    window.sessionStorage.removeItem(DEMO_MODE_KEY);
  } catch {
    // ignore
  }
}

export function getDemoCredentials() {
  return {
    email: import.meta.env.VITE_DEMO_EMAIL || "demo@forge.demo",
    password: import.meta.env.VITE_DEMO_PASSWORD || "ForgeDemo2026!"
  };
}

/** Leave the demo and return to the sign-in page, where users pick their own department. */
export function leaveDemoToProduction() {
  clearDemoMode();
  try {
    window.localStorage.removeItem("rms-active-department-id");
    persistGatewayContext("", "");
  } catch {
    // ignore
  }
  window.location.href = "/";
}
