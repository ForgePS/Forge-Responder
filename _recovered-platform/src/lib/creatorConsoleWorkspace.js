import { PLATFORM_SCOPE_ID } from "./tenantPaths.js";

export const ACTIVE_DEPARTMENT_KEY = "rms-active-department-id";

export function readStoredWorkspaceId() {
  if (typeof window === "undefined") return PLATFORM_SCOPE_ID;
  try {
    return window.localStorage.getItem(ACTIVE_DEPARTMENT_KEY) || PLATFORM_SCOPE_ID;
  } catch {
    return PLATFORM_SCOPE_ID;
  }
}

export function writeStoredWorkspaceId(workspaceId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_DEPARTMENT_KEY, workspaceId);
  } catch (error) {
    console.warn("Unable to persist creator workspace", error);
  }
}
