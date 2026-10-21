/**
 * Phase 0 membership back-fill + access review.
 *
 * The tightened firestore.rules no longer let users create or promote their own
 * membership. Run this BEFORE deploying those rules so legitimate users keep access.
 *
 * Dry run (default — read-only, prints a report):
 *   GOOGLE_APPLICATION_CREDENTIALS=path/to/service-account.json node scripts/backfill-memberships.mjs
 * Apply the proposed changes:
 *   ... node scripts/backfill-memberships.mjs --apply
 * Options:
 *   --project=rms-dashboard-7562e   (default)
 *   --hornlake-role=firefighter      role for back-filled @hornlake.org users (default firefighter)
 *
 * What it does:
 *   1. Platform owners: shows each bootstrap email's Auth account, whether the email is
 *      verified, and whether a platformCreators doc exists. (Rules now require one of those.)
 *   2. Horn Lake: verified @hornlake.org Auth users with no horn-lake-fd membership get one
 *      (status active, non-admin role). They currently rely on the email-domain rule.
 *   3. All departments: active memberships missing roleIds get them derived from the
 *      legacy `role` field (clients can no longer write roleIds themselves).
 *   4. Review list: every admin/creator membership, and any membership whose Auth account
 *      is missing, unverified, or was created after the department's first admin — these may
 *      have been self-granted through the old rules. Nothing is removed automatically.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  })
);

const PROJECT_ID = args.project || "rms-dashboard-7562e";
const APPLY = Boolean(args.apply);
const HORN_LAKE_ID = "horn-lake-fd";
const HORN_LAKE_ROLE = args["hornlake-role"] || "firefighter";
const BOOTSTRAP_EMAILS = ["admin@forgepublicsafety.com", "jpowell@hornlake.org", "jeremyepowell@hotmail.com"];
const LEGACY_ROLE_MAP = {
  creator: "creator",
  platform_creator: "creator",
  department_admin: "fireChief",
  system_owner: "fireChief",
  fire_chief: "fireChief",
  read_only: "readOnly",
  firefighter: "firefighter",
};
const ADMIN_ROLE_IDS = new Set(["fireChief", "itAdmin", "creator"]);

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function listAllAuthUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

function roleIdsFor(membership) {
  if (Array.isArray(membership.roleIds) && membership.roleIds.length) return membership.roleIds;
  const legacy = String(membership.role || "");
  return [LEGACY_ROLE_MAP[legacy] || legacy || "readOnly"];
}

function isAdminMembership(m) {
  return m.isPlatformCreator === true
    || ["creator", "department_admin"].includes(m.role)
    || roleIdsFor(m).some((id) => ADMIN_ROLE_IDS.has(id));
}

function line(...parts) {
  console.log(...parts);
}

async function main() {
  line(`\nProject: ${PROJECT_ID}   Mode: ${APPLY ? "APPLY (writing changes)" : "DRY RUN (no writes)"}\n`);

  const authUsers = await listAllAuthUsers();
  const authByUid = new Map(authUsers.map((u) => [u.uid, u]));
  const authByEmail = new Map(authUsers.filter((u) => u.email).map((u) => [u.email.toLowerCase(), u]));
  line(`Auth users: ${authUsers.length}`);

  // 1. Platform owners
  line("\n== 1. Platform owner access (rules require verified email OR platformCreators doc) ==");
  for (const email of BOOTSTRAP_EMAILS) {
    const user = authByEmail.get(email);
    if (!user) {
      line(`  ${email}: no Auth account`);
      continue;
    }
    const creatorDoc = await db.doc(`platformCreators/${user.uid}`).get();
    const creatorActive = creatorDoc.exists && creatorDoc.data()?.status === "active";
    const ok = user.emailVerified || creatorActive;
    line(`  ${email}: uid=${user.uid} emailVerified=${user.emailVerified} platformCreators=${creatorActive ? "active" : "none"} providers=${user.providerData.map((p) => p.providerId).join(",")} -> ${ok ? "OK" : "WILL LOSE CREATOR ACCESS"}`);
  }

  // Load all departments' memberships
  const departmentRefs = await db.collection("departments").listDocuments();
  const membershipsByDept = new Map();
  for (const deptRef of departmentRefs) {
    const snap = await deptRef.collection("users").get();
    membershipsByDept.set(deptRef.id, snap.docs.map((d) => ({ id: d.id, ref: d.ref, ...d.data() })));
  }
  line(`\nDepartments with a users collection: ${[...membershipsByDept.entries()].filter(([, m]) => m.length).length}`);

  const writes = [];

  // 2. Horn Lake email-domain users without membership
  line(`\n== 2. Verified @hornlake.org users without a ${HORN_LAKE_ID} membership ==`);
  const hornLakeMembers = new Set((membershipsByDept.get(HORN_LAKE_ID) || []).map((m) => m.id));
  const hornLakeMissing = authUsers.filter((u) =>
    u.email && /@hornlake\.org$/i.test(u.email) && u.emailVerified && !u.disabled && !hornLakeMembers.has(u.uid)
  );
  if (!hornLakeMissing.length) line("  none");
  const now = new Date().toISOString();
  for (const user of hornLakeMissing) {
    line(`  + ${user.email} (uid=${user.uid}) -> create membership role=${HORN_LAKE_ROLE}`);
    writes.push({
      ref: db.doc(`departments/${HORN_LAKE_ID}/users/${user.uid}`),
      data: {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split("@")[0],
        role: HORN_LAKE_ROLE,
        roleIds: [LEGACY_ROLE_MAP[HORN_LAKE_ROLE] || HORN_LAKE_ROLE],
        status: "active",
        departmentId: HORN_LAKE_ID,
        personnelId: "",
        backfilledBy: "phase0-backfill",
        createdAt: now,
        updatedAt: now,
      },
      merge: false,
    });
  }
  const unverifiedHornLake = authUsers.filter((u) => u.email && /@hornlake\.org$/i.test(u.email) && !u.emailVerified && !hornLakeMembers.has(u.uid));
  if (unverifiedHornLake.length) {
    line("  Unverified @hornlake.org accounts (skipped — verify the email or add them manually):");
    unverifiedHornLake.forEach((u) => line(`    ? ${u.email} (uid=${u.uid})`));
  }

  // 3. Missing roleIds
  line("\n== 3. Active memberships missing roleIds ==");
  let missingRoleIds = 0;
  for (const [deptId, memberships] of membershipsByDept) {
    for (const m of memberships) {
      if (m.status !== "active" || (Array.isArray(m.roleIds) && m.roleIds.length)) continue;
      missingRoleIds += 1;
      const roleIds = roleIdsFor(m);
      line(`  ~ ${deptId}/${m.id} (${m.email || "no email"}) role=${m.role || "-"} -> roleIds=${JSON.stringify(roleIds)}`);
      writes.push({ ref: m.ref, data: { roleIds, updatedAt: now }, merge: true });
    }
  }
  if (!missingRoleIds) line("  none");

  // 4. Review list
  line("\n== 4. Review: admin memberships and memberships that may have been self-granted ==");
  for (const [deptId, memberships] of membershipsByDept) {
    if (!memberships.length) continue;
    const flagged = memberships.filter((m) => {
      const user = authByUid.get(m.id);
      return isAdminMembership(m) || !user || !user.emailVerified || user.disabled;
    });
    if (!flagged.length) continue;
    line(`  [${deptId}] ${memberships.length} members, ${flagged.length} to review:`);
    for (const m of flagged) {
      const user = authByUid.get(m.id);
      const notes = [];
      if (isAdminMembership(m)) notes.push(`ADMIN(${[m.role, ...roleIdsFor(m)].filter(Boolean).join("/")})`);
      if (m.isPlatformCreator) notes.push("isPlatformCreator");
      if (!user) notes.push("NO AUTH ACCOUNT");
      else {
        if (!user.emailVerified) notes.push("email unverified");
        if (user.disabled) notes.push("auth disabled");
        notes.push(`signedUp=${user.metadata.creationTime}`);
      }
      line(`    - ${m.email || user?.email || "?"} uid=${m.id} status=${m.status} ${notes.join(" | ")}`);
    }
  }

  line(`\nProposed writes: ${writes.length}`);
  if (!APPLY) {
    line("Dry run only. Re-run with --apply to write them.\n");
    return;
  }
  for (const write of writes) {
    if (write.merge) await write.ref.set(write.data, { merge: true });
    else await write.ref.create(write.data).catch((error) => {
      if (error.code === 6) return; // ALREADY_EXISTS — leave existing membership untouched
      throw error;
    });
  }
  line(`Applied ${writes.length} writes.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
