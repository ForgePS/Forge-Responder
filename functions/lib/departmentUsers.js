/**
 * Create a department user from System Admin: the Firebase Auth account and the
 * department membership (departments/<id>/users/<uid>) together, server-side.
 *
 * Before this, System Admin could only send an invite; nothing existed in Auth or
 * Firestore until the person redeemed it. Here the admin gets a working account
 * straight away:
 *
 *   1. The caller must be an active member with manageUsers (creators always pass).
 *      The departmentId from the client only selects the department.
 *   2. No email address → a new Auth user. Existing Auth user (any department) →
 *      linked, never duplicated, and its password/profile are left alone.
 *   3. The membership (same shape acceptInvite writes), the audit log entry and the
 *      revocation of any pending invite for that email commit in one transaction.
 *      If that fails, an Auth user this call created is deleted again, so nobody is
 *      left in Auth without a membership.
 *   4. The member's grant record (memberGrants/<uid>) is refreshed right away; the
 *      memberGrantsOnMember trigger keeps it current afterwards.
 *   5. New accounts get a password-setup link by email. The link goes back to the
 *      admin only when the email didn't go out. Existing accounts never get a link
 *      (that would let one department's admin take over another's member).
 *
 * scripts/repair-department-users.mjs finds and fixes records created before this.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");
const { assertMemberPermission, isPlatformCreator } = require("./access");
const { assertAdminSecondFactor } = require("./twoFactor");
const { computeMemberPermissions, refreshMember } = require("./memberGrants");
const { isDemoDepartment, logDemoOutbound } = require("./demoGuard");
const { sendTextEmail } = require("./mailer");
const {
  assertSeatAvailable,
  isAdminMembership,
  loadDepartmentName,
  normalizeEmail,
  validateRoleIds,
} = require("./invites");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same role → legacy `role` mapping acceptInvite uses. */
function primaryRole(roleIds) {
  return roleIds.includes("fireChief") ? "department_admin" : roleIds[0];
}

async function findAuthUserByEmail(authAdmin, email) {
  try {
    return await authAdmin.getUserByEmail(email);
  } catch (error) {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  }
}

// Roles that make someone a department admin (firestore.rules isDepartmentAdmin).
const ADMIN_ROLE_IDS = ["fireChief", "itAdmin"];
// Admin-level keys: only someone who holds a key may hand it out.
const ADMIN_PERMISSION_KEYS = ["manageUsers", "managePermissions", "manageRoles", "manageSystemSettings"];

/**
 * manageUsers alone can't be used to mint an administrator: admin roles need a
 * department admin, and admin-level keys need a caller who holds them. Ordinary
 * roles (firefighter, officer...) are fine for anyone with manageUsers.
 */
async function assertNoEscalation(db, departmentId, roleIds, callerPermissions, callerUid) {
  const [rolesSnap, callerSnap] = await Promise.all([
    db.collection(`departments/${departmentId}/roles`).get(),
    db.doc(`departments/${departmentId}/users/${callerUid}`).get(),
  ]);
  const callerIsAdmin = isAdminMembership(callerSnap.data() || {});
  const roles = Object.fromEntries(rolesSnap.docs.map((doc) => [doc.id, doc.data() || {}]));
  const granted = computeMemberPermissions({ roleIds }, roles);
  const extra = ADMIN_PERMISSION_KEYS.filter((key) => granted[key] === true && callerPermissions[key] !== true);
  if ((!callerIsAdmin && roleIds.some((id) => ADMIN_ROLE_IDS.includes(id))) || extra.length) {
    throw new HttpsError(
      "permission-denied",
      "Only a department administrator can create another administrator."
    );
  }
}

async function sendAccountEmail(mailer, { to, departmentName, setupLink, addedByName, replyTo }) {
  const text = setupLink
    ? [
      `${addedByName || "Your department administrator"} created a FORGE Responder account for you at ${departmentName}.`,
      "",
      `Choose your password: ${setupLink}`,
      "",
      `Then sign in with this email address (${to}).`,
    ].join("\n")
    : [
      `${addedByName || "Your department administrator"} added you to ${departmentName} on FORGE Responder.`,
      "",
      `Sign in with your existing FORGE Responder account (${to}).`,
    ].join("\n");
  return mailer({
    to: [to],
    replyTo,
    subject: setupLink
      ? `Your FORGE Responder account for ${departmentName}`
      : `You've been added to ${departmentName} on FORGE Responder`,
    text,
  });
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {import("firebase-admin/auth").Auth} authAdmin
 * @param {{ auth?: object, data?: object }} request
 * @param {{ mailer?: Function }} [options] for tests
 */
async function createDepartmentUser(db, authAdmin, request, { mailer = sendTextEmail } = {}) {
  const data = request.data || {};
  const departmentId = String(data.departmentId || "").trim();
  const callerPermissions = await assertMemberPermission(
    db, departmentId, request.auth, ["manageUsers"],
    "You need the Manage users permission to add people."
  );
  await assertAdminSecondFactor(db, departmentId, request.auth);
  const callerIsCreator = await isPlatformCreator(db, request.auth);

  // The demo sign-in is public: nobody there may create real accounts.
  if (isDemoDepartment(departmentId) && !callerIsCreator) {
    throw new HttpsError("failed-precondition", "Accounts can't be created in the demo department.");
  }

  const email = normalizeEmail(data.email);
  if (!EMAIL_PATTERN.test(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const displayName = String(data.displayName || "").trim().slice(0, 120);
  const personnelId = String(data.personnelId || "").trim().slice(0, 120);

  const departmentName = await loadDepartmentName(db, departmentId);
  if (!departmentName) throw new HttpsError("not-found", "Department not found.");
  const roleIds = await validateRoleIds(db, departmentId, data.roleIds);
  if (!callerIsCreator) await assertNoEscalation(db, departmentId, roleIds, callerPermissions, request.auth.uid);

  const membershipRef = (uid) => db.doc(`departments/${departmentId}/users/${uid}`);
  const pendingInvites = await db.collection("invites")
    .where("departmentId", "==", departmentId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .get();

  let authUser = await findAuthUserByEmail(authAdmin, email);
  if (authUser) {
    const current = await membershipRef(authUser.uid).get();
    if (current.exists && current.get("status") === "active") {
      return { uid: authUser.uid, status: "already_member", emailStatus: "skipped" };
    }
  }

  // A pending invite for this email is about to be replaced, so it doesn't hold a second seat.
  await assertSeatAvailable(db, departmentId, { ignoreInviteIds: pendingInvites.docs.map((doc) => doc.id) });

  let createdAuthUser = false;
  if (!authUser) {
    try {
      authUser = await authAdmin.createUser({ email, displayName: displayName || undefined, emailVerified: false });
      createdAuthUser = true;
    } catch (error) {
      // Someone else created the account a moment ago: link to it instead.
      if (error?.code !== "auth/email-already-exists") throw error;
      authUser = await authAdmin.getUserByEmail(email);
    }
  }
  const uid = authUser.uid;
  const actorName = request.auth.token?.name || request.auth.token?.email || "Administrator";

  let outcome;
  try {
    outcome = await db.runTransaction(async (tx) => {
      const ref = membershipRef(uid);
      const existing = await tx.get(ref);
      const current = existing.exists ? existing.data() || {} : {};
      if (existing.exists && current.status === "active") return "already_member";

      const nowIso = new Date().toISOString();
      const membership = {
        uid,
        email,
        displayName: current.displayName || displayName || authUser.displayName || email.split("@")[0],
        role: primaryRole(roleIds),
        roleIds,
        status: "active",
        departmentId,
        personnelId: current.personnelId || personnelId || "",
        createdBy: current.createdBy || request.auth.uid,
        createdVia: "systemAdmin",
        updatedAt: nowIso,
      };
      if (!existing.exists) membership.createdAt = nowIso;
      // Never let this strip platform-creator flags from an existing record.
      if (current.isPlatformCreator) {
        membership.role = current.role;
        membership.roleIds = current.roleIds;
      }
      tx.set(ref, membership, { merge: true });

      const revokedAt = Timestamp.now();
      pendingInvites.docs.forEach((doc) => tx.update(doc.ref, {
        status: "revoked", revokedAt, revokedBy: request.auth.uid, revokedReason: "account_created",
      }));

      const action = createdAuthUser ? "user.created" : "user.linked";
      tx.set(db.collection(`departments/${departmentId}/auditLogs`).doc(), {
        action,
        module: "Users",
        actorUid: request.auth.uid,
        actorName,
        summary: createdAuthUser
          ? `Created an account for ${email}`
          : `Added the existing account ${email} to the department`,
        target: email,
        targetUid: uid,
        roleIds: membership.roleIds,
        created_at: nowIso,
        createdAt: nowIso,
      });
      return createdAuthUser ? "created" : "linked";
    });
  } catch (error) {
    if (createdAuthUser) {
      await authAdmin.deleteUser(uid).catch((cleanupError) => {
        console.error(`Couldn't remove the Auth user ${uid} after the membership write failed`, cleanupError);
      });
    }
    throw error;
  }

  if (outcome === "already_member") return { uid, status: outcome, emailStatus: "skipped" };

  // Rules read memberGrants: write it now so the first sign-in already works.
  await refreshMember(db, departmentId, uid);

  const setupLink = createdAuthUser ? await authAdmin.generatePasswordResetLink(email) : "";
  const wantsEmail = data.sendEmail !== false;
  let emailStatus = "skipped";
  if (wantsEmail && isDemoDepartment(departmentId)) {
    logDemoOutbound("account email", { to: email, departmentId });
    emailStatus = "logged";
  } else if (wantsEmail) {
    emailStatus = await sendAccountEmail(mailer, {
      to: email,
      departmentName,
      setupLink,
      addedByName: actorName,
      replyTo: normalizeEmail(request.auth.token?.email),
    });
  }

  const result = { uid, status: outcome, emailStatus };
  // The admin copies the link only when the person didn't get it by email.
  if (setupLink && emailStatus !== "sent") result.setupLink = setupLink;
  return result;
}

module.exports = {
  createDepartmentUser,
  primaryRole,
};
