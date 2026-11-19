/**
 * Find (and optionally fix) people who exist in Firebase Auth or Firestore but not
 * both. Used by scripts/repair-department-users.mjs; tested in
 * tests/functions/departmentUsers.test.mjs.
 *
 * Gaps:
 *   accepted_invite_no_membership  Auth user redeemed an invite but has no membership
 *                                  in that department → recreate it from the invite.
 *   membership_wrong_uid           departments/<d>/users/<id> where <id> isn't an Auth
 *                                  user but the record's email is → move it to the real uid.
 *   missing_grant                  active member with no memberGrants record → refresh it.
 *   auth_without_membership        Auth user in no department and no accepted invite
 *                                  (report only: we can't know which department).
 *   membership_without_auth        membership with no Auth user, by id or email
 *                                  (report only: creating sign-ins in bulk is a decision).
 *
 * Platform creators (platformCreators/<uid>) are never flagged as unassigned.
 * Nothing is written unless apply is true.
 */
const { refreshMember } = require("./memberGrants");
const { maskEmail, normalizeEmail } = require("./invites");
const { primaryRole } = require("./departmentUsers");

async function listAllAuthUsers(authAdmin) {
  const users = [];
  let pageToken;
  do {
    const page = await authAdmin.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function loadMemberships(db) {
  const memberships = [];
  for (const deptRef of await db.collection("departments").listDocuments()) {
    const [users, grants] = await Promise.all([
      deptRef.collection("users").get(),
      deptRef.collection("memberGrants").listDocuments(),
    ]);
    const grantIds = new Set(grants.map((ref) => ref.id));
    users.docs.forEach((doc) => memberships.push({
      departmentId: deptRef.id,
      id: doc.id,
      ref: doc.ref,
      data: doc.data() || {},
      hasGrant: grantIds.has(doc.id),
    }));
  }
  return memberships;
}

async function audit(db, departmentId, summary, targetUid) {
  const nowIso = new Date().toISOString();
  await db.collection(`departments/${departmentId}/auditLogs`).add({
    action: "user.repaired",
    module: "Users",
    actorUid: "system",
    actorName: "repair-department-users script",
    summary,
    targetUid,
    created_at: nowIso,
    createdAt: nowIso,
  });
}

/**
 * @returns {Promise<{ findings: Array<{type: string, departmentId?: string, uid?: string, id?: string, email: string, fixed: boolean}>, counts: Record<string, number> }>}
 */
async function repairUserRecords(db, authAdmin, { apply = false } = {}) {
  const [authUsers, memberships, creatorsSnap, acceptedInvites] = await Promise.all([
    listAllAuthUsers(authAdmin),
    loadMemberships(db),
    db.collection("platformCreators").get(),
    db.collection("invites").where("status", "==", "accepted").get(),
  ]);
  const authByUid = new Map(authUsers.map((user) => [user.uid, user]));
  const authByEmail = new Map(authUsers.filter((u) => u.email).map((user) => [normalizeEmail(user.email), user]));
  const creatorUids = new Set(creatorsSnap.docs.map((doc) => doc.id));
  const memberKey = (departmentId, uid) => `${departmentId}/${uid}`;
  const memberKeys = new Set(memberships.map((m) => memberKey(m.departmentId, m.id)));
  const findings = [];
  const note = (finding) => { findings.push({ fixed: false, ...finding, email: maskEmail(finding.email || "") }); return findings.at(-1); };

  // Membership docs whose id isn't a real Auth user.
  for (const m of memberships) {
    if (authByUid.has(m.id)) continue;
    const email = normalizeEmail(m.data.email);
    const owner = email ? authByEmail.get(email) : null;
    if (!owner || memberKeys.has(memberKey(m.departmentId, owner.uid))) {
      note({ type: "membership_without_auth", departmentId: m.departmentId, id: m.id, email });
      continue;
    }
    const finding = note({ type: "membership_wrong_uid", departmentId: m.departmentId, id: m.id, uid: owner.uid, email });
    if (apply) {
      const target = db.doc(`departments/${m.departmentId}/users/${owner.uid}`);
      const batch = db.batch();
      batch.set(target, { ...m.data, uid: owner.uid, email, updatedAt: new Date().toISOString(), repairedFrom: m.id });
      batch.delete(m.ref);
      await batch.commit();
      await refreshMember(db, m.departmentId, m.id);
      await refreshMember(db, m.departmentId, owner.uid);
      await audit(db, m.departmentId, `Moved the membership for ${maskEmail(email)} to their sign-in account`, owner.uid);
      finding.fixed = true;
    }
    memberKeys.add(memberKey(m.departmentId, owner.uid));
  }

  // Auth users who redeemed an invite but have no membership there.
  const repairedFromInvite = new Set();
  for (const doc of acceptedInvites.docs) {
    const invite = doc.data() || {};
    const uid = invite.acceptedBy;
    const user = uid && authByUid.get(uid);
    if (!user || !invite.departmentId || memberKeys.has(memberKey(invite.departmentId, uid))) continue;
    const roleIds = (Array.isArray(invite.roleIds) ? invite.roleIds : []).filter((id) => id && id !== "creator");
    if (!roleIds.length) continue;
    repairedFromInvite.add(uid);
    const email = normalizeEmail(user.email || invite.email);
    const finding = note({ type: "accepted_invite_no_membership", departmentId: invite.departmentId, uid, email });
    if (apply) {
      const nowIso = new Date().toISOString();
      await db.doc(`departments/${invite.departmentId}/users/${uid}`).set({
        uid,
        email,
        displayName: invite.displayName || user.displayName || email.split("@")[0],
        role: primaryRole(roleIds),
        roleIds,
        status: "active",
        departmentId: invite.departmentId,
        personnelId: invite.personnelId || "",
        invitedBy: invite.createdBy || "",
        inviteId: doc.id,
        createdAt: nowIso,
        updatedAt: nowIso,
        repairedFrom: "acceptedInvite",
      });
      await refreshMember(db, invite.departmentId, uid);
      await audit(db, invite.departmentId, `Restored the membership for ${maskEmail(email)} from their accepted invite`, uid);
      finding.fixed = true;
    }
    memberKeys.add(memberKey(invite.departmentId, uid));
  }

  // Active members missing their grant record (the rules would deny them everything).
  for (const m of memberships) {
    if (!authByUid.has(m.id) || m.data.status !== "active" || m.hasGrant) continue;
    const finding = note({ type: "missing_grant", departmentId: m.departmentId, uid: m.id, email: m.data.email });
    if (apply) {
      await refreshMember(db, m.departmentId, m.id);
      finding.fixed = true;
    }
  }

  // Auth users in no department at all.
  const memberUids = new Set([...memberKeys].map((key) => key.split("/")[1]));
  for (const user of authUsers) {
    if (memberUids.has(user.uid) || creatorUids.has(user.uid) || repairedFromInvite.has(user.uid)) continue;
    note({ type: "auth_without_membership", uid: user.uid, email: user.email });
  }

  const counts = {};
  findings.forEach((f) => { counts[f.type] = (counts[f.type] || 0) + 1; });
  return { findings, counts };
}

module.exports = { repairUserRecords };
