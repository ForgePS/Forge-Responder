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

/**
 * Leave the demo for the sign-in page, where people pick their own department.
 * Also signs out the shared demo account, so you can sign in as yourself (e.g.
 * for the Creator Console).
 *
 * Sign out first: the app redraws on sign-out while still on the demo address
 * and saves the demo as the current department again. Clearing that afterwards,
 * in the same moment as leaving, means nothing can put it back.
 */
export async function leaveDemoToProduction() {
  try {
    const [{ getFirebaseAuth }, { signOut }] = await Promise.all([
      import("./firebaseClient.js"),
      import("firebase/auth"),
    ]);
    const auth = getFirebaseAuth();
    const email = String(auth?.currentUser?.email || "").toLowerCase();
    if (auth && email === getDemoCredentials().email.toLowerCase()) await signOut(auth);
  } catch (error) {
    console.warn("Couldn't sign out of the demo account", error);
  }
  clearDemoMode();
  try {
    window.localStorage.removeItem("rms-active-department-id");
    window.localStorage.removeItem("rms-login-tenant-id");
    persistGatewayContext("", "");
  } catch {
    // ignore
  }
  window.location.replace("/");
}
