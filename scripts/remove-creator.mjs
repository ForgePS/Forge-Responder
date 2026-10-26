/**
 * Remove someone's platform creator access.
 *
 * Default: dry run, changes nothing. Shows the person's creator record and every
 * department login that still marks them as a creator.
 *
 *   --email=<email>   who to remove (required)
 *   --apply           make the change:
 *                       - platformCreators/<uid>: status "removed" (kept for the audit trail)
 *                       - department logins: isPlatformCreator cleared; a "creator" role becomes "member";
 *                         "creator" removed from roleIds (read-only if nothing else is left)
 *                       - signs them out everywhere (revokes refresh tokens)
 *                       - writes a platformAuditLogs entry
 *
 * They keep their sign-in and any normal department logins; only creator access goes.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/remove-creator.mjs '--email=jpowell@hornlake.org' *> remove-creator.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/remove-creator.mjs '--email=jpowell@hornlake.org' --apply *> remove-creator.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const argValue = (name) => (arg(name) || "").split("=").slice(1).join("=").trim();
const APPLY = Boolean(arg("apply"));
const EMAIL = argValue("email").toLowerCase();

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID} — ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  if (!EMAIL) {
    console.error("Give the person's email: --email=name@example.com");
    process.exitCode = 1;
    return;
  }

  let user;
  try {
    user = await auth.getUserByEmail(EMAIL);
  } catch {
    console.error(`No sign-in account found for ${EMAIL}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Account: ${user.email}  (uid ${user.uid})${user.disabled ? "  [account disabled]" : ""}`);

  const creatorRef = db.doc(`platformCreators/${user.uid}`);
  const creator = await creatorRef.get();
  if (creator.exists) {
    console.log(`Creator record: status "${creator.data()?.status || "(none)"}"`);
  } else {
    console.log("Creator record: none");
  }

  // Department logins that still mark them as a creator.
  const departments = await db.collection("departments").listDocuments();
  const flagged = [];
  for (const dept of departments) {
    const membership = await dept.collection("users").doc(user.uid).get();
    if (!membership.exists) continue;
    const data = membership.data() || {};
    const roleIds = Array.isArray(data.roleIds) ? data.roleIds : [];
    // Permission checks read roleIds first, so a "creator" entry there still grants creator access.
    const isCreatorLogin = data.isPlatformCreator === true || data.role === "creator" || roleIds.includes("creator");
    console.log(`  ${dept.id}: role "${data.role || "(none)"}", roleIds [${roleIds.join(", ")}]${data.isPlatformCreator ? ", isPlatformCreator" : ""}${isCreatorLogin ? "  <- creator access" : ""}`);
    if (isCreatorLogin) flagged.push({ ref: membership.ref, deptId: dept.id, data });
  }

  const hasActiveCreator = creator.exists && creator.data()?.status === "active";
  if (!hasActiveCreator && !flagged.length) {
    console.log("\nNothing to remove: this person isn't a creator.\n");
    return;
  }

  console.log(`\nWill: ${hasActiveCreator ? "set creator record to removed; " : ""}${flagged.length ? `clear creator flag on ${flagged.length} department login(s); ` : ""}sign them out everywhere.`);
  if (!APPLY) {
    console.log("Dry run only. Add --apply to make the change.\n");
    return;
  }

  const now = new Date().toISOString();
  if (creator.exists) {
    await creatorRef.set({ status: "removed", previousStatus: creator.data()?.status || "", removedAt: now, updatedAt: now }, { merge: true });
    console.log("Creator record set to removed.");
  }
  for (const { ref, deptId, data } of flagged) {
    const roleIds = (Array.isArray(data.roleIds) ? data.roleIds : []).filter((id) => id !== "creator");
    await ref.set({
      isPlatformCreator: false,
      ...(data.role === "creator" ? { role: "member" } : {}),
      roleIds: roleIds.length ? roleIds : ["readOnly"],
      updatedAt: now,
    }, { merge: true });
    console.log(`Removed creator access on ${deptId} (roleIds now [${(roleIds.length ? roleIds : ["readOnly"]).join(", ")}]).`);
  }
  await auth.revokeRefreshTokens(user.uid);
  console.log("Signed out of all sessions.");
  await db.collection("platformAuditLogs").add({
    action: "security.creator-removed",
    module: "Creator Console",
    recordId: user.uid,
    summary: `Removed platform creator access for ${user.email}`,
    actorName: "scripts/remove-creator.mjs",
    created_at: now,
  });
  console.log("Audit log written.\nDone.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
