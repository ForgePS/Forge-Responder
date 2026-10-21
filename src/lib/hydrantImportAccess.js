import { getFirebaseAuth } from "./firebaseClient.js";
import { loadDepartmentMembership } from "./departmentMembership.js";
import { recoverMembershipAccess } from "./membershipRecovery.js";
import { isPlatformBootstrapEmail } from "./platformBootstrap.js";
import {
  ensureCreatorDepartmentAccess,
  loadPlatformCreator,
} from "./platformService.js";
import { HORN_LAKE_DEPARTMENT_ID } from "./tenantPaths.js";

export function isHornLakeOrgEmail(email = "") {
  return /@hornlake\.org$/i.test(String(email || "").trim());
}

function permissionError(departmentId) {
  return new Error(
    departmentId === HORN_LAKE_DEPARTMENT_ID
      ? "Missing permission to import hydrants. Sign in with your @hornlake.org account, or ask an admin to add you under User Permissions."
      : "Missing permission to import hydrants for this department. Ask an admin to add your account under User Permissions."
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

  // Legacy: firestore.rules still let verified @hornlake.org accounts into horn-lake-fd
  // until the membership back-fill is done. Nothing is written here; users can no longer
  // create their own (admin) membership.
  if (departmentId === HORN_LAKE_DEPARTMENT_ID && isHornLakeOrgEmail(user.email) && user.emailVerified) {
    return { id: user.uid, uid: user.uid, email: user.email, status: "active", departmentId, roleIds: [] };
  }

  const recovered = await recoverMembershipAccess(user, departmentId);
  if (recovered?.status === "active") return recovered;

  throw permissionError(departmentId);
}
