import { defaultRoles } from "../data/defaultRoles.js";
import { DEFAULT_DEPARTMENT_ID } from "./tenantPaths.js";

// Retired: platform creators are identified only by platformCreators/{uid}
// (server-written), matching firestore.rules. Kept empty so existing callers of
// isPlatformBootstrapEmail() fall through to the creator-record checks.
export const PLATFORM_BOOTSTRAP_EMAILS = new Set();

export function isPlatformBootstrapEmail(email = "") {
  return PLATFORM_BOOTSTRAP_EMAILS.has(String(email).trim().toLowerCase());
}

export function buildBootstrapMembership(user, departmentId = DEFAULT_DEPARTMENT_ID) {
  const now = new Date().toISOString();
  return {
    id: user.uid,
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || user.email?.split("@")[0] || "Forge Admin",
    role: "creator",
    roleIds: ["creator"],
    status: "active",
    departmentId,
    isPlatformCreator: true,
    createdAt: now,
    updatedAt: now
  };
}

export function buildBootstrapRolesMap() {
  const creatorRole = defaultRoles.find((role) => role.id === "creator");
  return creatorRole ? { creator: creatorRole } : {};
}
