/**
 * Department user invites.
 *
 * Department admins invite a person by email. The invite carries a random token
 * (only its SHA-256 hash is stored). The person signs in or signs up with that
 * email and redeems the token; the server then creates their membership.
 * Clients can never create memberships themselves (see firestore.rules).
 */
const crypto = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");
const { isPlatformCreator } = require("./access");
const { assertAdminSecondFactor } = require("./twoFactor");
const { sendTextEmail } = require("./mailer");

const INVITE_TTL_DAYS = 14;
const ADMIN_ROLE_IDS = ["fireChief", "itAdmin"];
const BLOCKED_SUBSCRIPTION_STATUSES = new Set(["suspended", "cancelled"]);
const ALLOWED_APP_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "rms-dashboard-7562e.web.app",
  "rms-dashboard-7562e.firebaseapp.com",
  "rms.forgepublicsafety.com",
  "forge-rms-staging.web.app",
  "forge-rms-staging.firebaseapp.com",
]);
// Departments are served at https://<department>.<TENANT_ROOT_DOMAIN>.
const TENANT_ROOT_DOMAIN = String(process.env.TENANT_ROOT_DOMAIN || "forgeresponder.com").toLowerCase();
// Fallback when the caller's page address isn't trusted: the platform host, so
// invite links become https://<department>.forgeresponder.com/?invite=...
const DEFAULT_APP_ORIGIN = String(process.env.RMS_APP_ORIGIN || `https://app.${TENANT_ROOT_DOMAIN}`).replace(/\/$/, "");

function isTenantDomainHost(hostname = "") {
  const host = String(hostname).toLowerCase();
  return host === TENANT_ROOT_DOMAIN || host.endsWith(`.${TENANT_ROOT_DOMAIN}`);
}
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function newToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function maskEmail(email = "") {
  const [local = "", domain = ""] = String(email).split("@");
  if (!domain) return "";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function safeAppOrigin(origin) {
  try {
    const url = new URL(String(origin || ""));
    if (!["https:", "http:"].includes(url.protocol)) return DEFAULT_APP_ORIGIN;
    if (!ALLOWED_APP_HOSTS.has(url.hostname) && !isTenantDomainHost(url.hostname)) return DEFAULT_APP_ORIGIN;
    return url.origin;
  } catch {
    return DEFAULT_APP_ORIGIN;
  }
}

/**
 * Invite link for a department. From a forgeresponder.com page it points at the
 * department's own subdomain; elsewhere (web.app, localhost) at /<department>.
 */
function buildInviteUrl(origin, departmentId, token) {
  const base = safeAppOrigin(origin);
  const invite = `invite=${encodeURIComponent(token)}`;
  if (isTenantDomainHost(new URL(base).hostname)) {
    return `https://${encodeURIComponent(departmentId)}.${TENANT_ROOT_DOMAIN}/?${invite}`;
  }
  return `${base}/${encodeURIComponent(departmentId)}?${invite}`;
}

function isAdminMembership(data = {}) {
  const roleIds = Array.isArray(data.roleIds) ? data.roleIds : [];
  return data.status === "active"
    && (data.role === "department_admin" || roleIds.some((id) => ADMIN_ROLE_IDS.includes(id)));
}

/** Same definition of "department admin" as firestore.rules isDepartmentAdmin(). */
async function assertDepartmentAdmin(db, departmentId, auth) {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");
  if (await isPlatformCreator(db, auth)) return;
  const snap = await db.doc(`departments/${departmentId}/users/${auth.uid}`).get();
  if (!snap.exists || !isAdminMembership(snap.data())) {
    throw new HttpsError("permission-denied", "Department administrator access is required.");
  }
  await assertAdminSecondFactor(db, departmentId, auth);
}

async function loadDepartmentName(db, departmentId) {
  const [registry, profile] = await Promise.all([
    db.doc(`platformDepartments/${departmentId}`).get(),
    db.doc(`departments/${departmentId}/profile/main`).get(),
  ]);
  if (!registry.exists && !profile.exists) return null;
  return String(profile.data()?.name || registry.data()?.name || departmentId);
}

/** Enforce the plan's maxPortalUsers (0 or missing = unlimited). */
async function assertSeatAvailable(db, departmentId) {
  const subscription = await db.doc(`platformSubscriptions/${departmentId}`).get();
  const sub = subscription.data() || {};
  if (BLOCKED_SUBSCRIPTION_STATUSES.has(sub.status)) {
    throw new HttpsError("failed-precondition", "This department's subscription is not active.");
  }
  if (!sub.planId) return;
  const plan = await db.doc(`platformSubscriptionPlans/${sub.planId}`).get();
  const maxUsers = Number(plan.data()?.maxPortalUsers || 0);
  if (!maxUsers) return;

  const [members, pending] = await Promise.all([
    db.collection(`departments/${departmentId}/users`).where("status", "==", "active").get(),
    db.collection("invites")
      .where("departmentId", "==", departmentId)
      .where("status", "==", "pending")
      .get(),
  ]);
  const seatsUsed = members.docs.filter((d) => !d.data().isPlatformCreator).length + pending.size;
  if (seatsUsed >= maxUsers) {
    throw new HttpsError(
      "resource-exhausted",
      `Your plan allows ${maxUsers} users and all seats are in use. Remove a user or upgrade the plan.`
    );
  }
}

async function validateRoleIds(db, departmentId, roleIds) {
  const requested = [...new Set((Array.isArray(roleIds) ? roleIds : []).map(String).filter(Boolean))];
  if (!requested.length) throw new HttpsError("invalid-argument", "Pick at least one role.");
  if (requested.includes("creator")) {
    throw new HttpsError("permission-denied", "The creator role cannot be assigned by invite.");
  }
  const snaps = await Promise.all(requested.map((id) => db.doc(`departments/${departmentId}/roles/${id}`).get()));
  const missing = requested.filter((_, i) => !snaps[i].exists);
  if (missing.length) throw new HttpsError("invalid-argument", `Unknown role: ${missing.join(", ")}`);
  return requested;
}

async function sendInviteEmail({ to, departmentName, inviteUrl, invitedByName, replyTo }) {
  const text = [
    `${invitedByName || "Your department administrator"} invited you to ${departmentName} on FORGE Responder.`,
    "",
    `Accept the invite: ${inviteUrl}`,
    "",
    `Sign in or create an account using this email address (${to}). The link expires in ${INVITE_TTL_DAYS} days.`,
  ].join("\n");
  return sendTextEmail({
    to: [to],
    replyTo,
    subject: `You're invited to ${departmentName} on FORGE Responder`,
    text,
  });
}

async function createInvite(db, request) {
  const data = request.data || {};
  const departmentId = String(data.departmentId || "").trim();
  await assertDepartmentAdmin(db, departmentId, request.auth);

  const email = normalizeEmail(data.email);
  if (!EMAIL_PATTERN.test(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");

  const departmentName = await loadDepartmentName(db, departmentId);
  if (!departmentName) throw new HttpsError("not-found", "Department not found.");

  const roleIds = await validateRoleIds(db, departmentId, data.roleIds);

  // One open invite per email per department: revoke older pending ones.
  const existing = await db.collection("invites")
    .where("departmentId", "==", departmentId)
    .where("email", "==", email)
    .where("status", "==", "pending")
    .get();

  await assertSeatAvailable(db, departmentId);

  const token = newToken();
  const inviteId = hashToken(token);
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const invite = {
    departmentId,
    departmentName,
    email,
    displayName: String(data.displayName || "").trim().slice(0, 120),
    roleIds,
    personnelId: String(data.personnelId || "").trim().slice(0, 120),
    status: "pending",
    createdAt: now,
    createdBy: request.auth.uid,
    createdByEmail: normalizeEmail(request.auth.token?.email),
    expiresAt,
    emailStatus: "pending",
  };

  const batch = db.batch();
  existing.docs.forEach((doc) => batch.update(doc.ref, { status: "revoked", revokedAt: now, revokedReason: "replaced" }));
  batch.set(db.doc(`invites/${inviteId}`), invite);
  await batch.commit();

  const inviteUrl = buildInviteUrl(data.appOrigin, departmentId, token);
  const emailStatus = data.sendEmail === false
    ? "skipped"
    : await sendInviteEmail({
      to: email,
      departmentName,
      inviteUrl,
      invitedByName: request.auth.token?.name || request.auth.token?.email,
      // Replies go to the admin who sent the invite.
      replyTo: normalizeEmail(request.auth.token?.email),
    });
  await db.doc(`invites/${inviteId}`).update({ emailStatus });

  await db.collection(`departments/${departmentId}/auditLogs`).add({
    action: "invite.created",
    actorUid: request.auth.uid,
    target: email,
    roleIds,
    createdAt: new Date().toISOString(),
  });

  return { inviteId, inviteUrl, emailStatus, expiresAt: expiresAt.toDate().toISOString() };
}

async function revokeInvite(db, request) {
  const inviteId = String(request.data?.inviteId || "").trim();
  if (!inviteId) throw new HttpsError("invalid-argument", "inviteId is required.");
  const ref = db.doc(`invites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Invite not found.");
  const invite = snap.data();
  await assertDepartmentAdmin(db, invite.departmentId, request.auth);
  if (invite.status !== "pending") return { status: invite.status };
  await ref.update({ status: "revoked", revokedAt: Timestamp.now(), revokedBy: request.auth.uid });
  return { status: "revoked" };
}

/** Public: lets the sign-in page show which department the invite is for. */
async function previewInvite(db, request) {
  const token = String(request.data?.token || "").trim();
  if (!token) throw new HttpsError("invalid-argument", "token is required.");
  const snap = await db.doc(`invites/${hashToken(token)}`).get();
  if (!snap.exists) return { valid: false, reason: "not_found" };
  const invite = snap.data();
  const expired = invite.expiresAt?.toMillis?.() < Date.now();
  return {
    valid: invite.status === "pending" && !expired,
    reason: invite.status !== "pending" ? invite.status : (expired ? "expired" : ""),
    departmentId: invite.departmentId,
    departmentName: invite.departmentName,
    emailHint: maskEmail(invite.email),
  };
}

async function acceptInvite(db, request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to accept the invite.");
  const token = String(request.data?.token || "").trim();
  if (!token) throw new HttpsError("invalid-argument", "token is required.");

  const ref = db.doc(`invites/${hashToken(token)}`);
  const uid = request.auth.uid;
  const userEmail = normalizeEmail(request.auth.token?.email);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "This invite link is not valid.");
    const invite = snap.data();
    if (invite.status === "accepted" && invite.acceptedBy === uid) {
      return { departmentId: invite.departmentId, alreadyAccepted: true };
    }
    if (invite.status !== "pending") throw new HttpsError("failed-precondition", `This invite was ${invite.status}.`);
    if (invite.expiresAt?.toMillis?.() < Date.now()) {
      throw new HttpsError("deadline-exceeded", "This invite has expired. Ask your administrator for a new one.");
    }
    if (!userEmail || userEmail !== invite.email) {
      throw new HttpsError(
        "permission-denied",
        `This invite is for ${maskEmail(invite.email)}. Sign in with that email address to accept it.`
      );
    }

    const membershipRef = db.doc(`departments/${invite.departmentId}/users/${uid}`);
    const existing = await tx.get(membershipRef);
    const nowIso = new Date().toISOString();
    const current = existing.exists ? existing.data() : {};
    const membership = {
      uid,
      email: userEmail,
      displayName: current.displayName || invite.displayName || request.auth.token?.name || userEmail.split("@")[0],
      role: invite.roleIds.includes("fireChief") ? "department_admin" : invite.roleIds[0],
      roleIds: invite.roleIds,
      status: "active",
      departmentId: invite.departmentId,
      personnelId: current.personnelId || invite.personnelId || "",
      invitedBy: invite.createdBy,
      inviteId: ref.id,
      updatedAt: nowIso,
    };
    if (!existing.exists) membership.createdAt = nowIso;
    // Never let an invite strip platform-creator flags from an existing record.
    if (current.isPlatformCreator) {
      membership.role = current.role;
      membership.roleIds = current.roleIds;
    }

    tx.set(membershipRef, membership, { merge: true });
    tx.update(ref, { status: "accepted", acceptedAt: Timestamp.now(), acceptedBy: uid });
    tx.set(db.collection(`departments/${invite.departmentId}/auditLogs`).doc(), {
      action: "invite.accepted",
      actorUid: uid,
      target: userEmail,
      roleIds: membership.roleIds,
      createdAt: nowIso,
    });
    return { departmentId: invite.departmentId, departmentName: invite.departmentName };
  });
}

module.exports = {
  acceptInvite,
  assertDepartmentAdmin,
  createInvite,
  hashToken,
  maskEmail,
  previewInvite,
  revokeInvite,
  safeAppOrigin,
  isAdminMembership,
};
