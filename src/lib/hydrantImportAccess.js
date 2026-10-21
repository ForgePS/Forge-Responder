import { getFirebaseAuth } from "./firebaseClient.js";
import { loadDepartmentMembership } from "./departmentMembership.js";
import { recoverMembershipAccess } from "./membershipRecovery.js";
import { isPlatformBootstrapEmail } from "./platformBootstrap.js";
import {
  ensureCreatorDepartmentAccess,
  loadPlatformCreator,
} from "./platformService.js";
function permissionError() {
  return new Error(
    "Missing permission to import hydrants for this department. Ask a department admin to invite you or add you under User Permissions."
  );
}

/** Ensure Firestore membership exists before hydrant import writes. */
export async function ensureHydrantImportAccess(departmentId) {
  const user = getFirebaseAuth()?.currentUser;
  if (!user?.uid) {
    throw new Error("Sign in before importing hydrants.");
  }
  if (!departmentId) {
    throw new Error("Department context is missing.");
  }

  const existing = await loadDepartmentMembership(departmentId, user.uid);
  if (existing?.status === "active") {
    return existing;
  }

  const creator = await loadPlatformCreator(user.uid);
  if (String(creator?.status || "").toLowerCase() === "active") {
    const ensured = await ensureCreatorDepartmentAccess(user, departmentId);
    if (ensured?.status === "active") return ensured;
  }

  if (isPlatformBootstrapEmail(user.email)) {
    const recovered = await recoverMembershipAccess(user, departmentId);
    if (recovered?.status === "active") return recovered;
  }

  const recovered = await recoverMembershipAccess(user, departmentId);
  if (recovered?.status === "active") return recovered;

  throw permissionError(departmentId);
}
