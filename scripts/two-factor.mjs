/**
 * Two-factor login (authenticator app codes) for FORGE Responder.
 *
 * Default (no options): status only, changes nothing. Shows whether authenticator
 * codes are switched on for the project, the department-admin deadline, and
 * which platform creators and department admins have set up two-factor.
 *
 *   --enable-totp              switch on authenticator-app codes for the project
 *                              (needs the Identity Platform upgrade in the Firebase
 *                              console: Authentication -> Settings).
 *   --start-admin-grace[=14]   department admins must use two-factor after this
 *                              many days (sets platformConfig/main.mfaAdminDeadline).
 *   --reset=<email>            clear someone's two-factor (lost phone), including
 *                              your own; they set it up again at next sign-in.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/two-factor.mjs *> two-factor.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/two-factor.mjs --enable-totp *> two-factor.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const argValue = (name) => (arg(name) || "").split("=").slice(1).join("=").trim();
const ADMIN_ROLE_IDS = ["fireChief", "itAdmin"];

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const auth = getAuth();
const db = getFirestore();

async function totpStatus() {
  try {
    const config = await auth.projectConfigManager().getProjectConfig();
    const totp = (config.multiFactorConfig?.providerConfigs || []).find((p) => p.totpProviderConfig);
    return totp?.state === "ENABLED" ? "ON" : "off";
  } catch (error) {
    return `unknown (${error.message.split("\n")[0]})`;
  }
}

async function factorsFor(uid) {
  try {
    const user = await auth.getUser(uid);
    const factors = user.multiFactor?.enrolledFactors || [];
    return { email: user.email || uid, totp: factors.some((f) => f.factorId === "totp") };
  } catch {
    return { email: uid, totp: false, missing: true };
  }
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}\n`);

  if (arg("enable-totp")) {
    await auth.projectConfigManager().updateProjectConfig({
      multiFactorConfig: { providerConfigs: [{ state: "ENABLED", totpProviderConfig: { adjacentIntervals: 5 } }] },
    });
    console.log("Authenticator-app codes switched ON.\n");
  }

  if (arg("start-admin-grace")) {
    const days = Number(argValue("start-admin-grace") || 14);
    if (!Number.isFinite(days) || days < 0) throw new Error("Days must be a number, e.g. --start-admin-grace=14");
    const deadline = new Date(Date.now() + days * 24 * 3600 * 1000);
    await db.doc("platformConfig/main").set({ mfaAdminDeadline: Timestamp.fromDate(deadline) }, { merge: true });
    console.log(`Department admins must use two-factor from ${deadline.toISOString()} (${days} days).\n`);
  }

  const resetEmail = argValue("reset").toLowerCase();
  if (resetEmail) {
    const user = await auth.getUserByEmail(resetEmail);
    await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
    await auth.revokeRefreshTokens(user.uid);
    await db.collection("platformAuditLogs").add({
      action: "security.two-factor-reset",
      module: "Creator Console",
      recordId: user.uid,
      summary: `Reset two-factor login for ${resetEmail} (scripts/two-factor.mjs)`,
      actorUid: "script",
      actorName: "scripts/two-factor.mjs",
      created_at: new Date().toISOString(),
    });
    console.log(`Two-factor cleared for ${resetEmail}. They sign in with their password and set it up again.\n`);
  }

  // Status
  const deadline = (await db.doc("platformConfig/main").get()).data()?.mfaAdminDeadline;
  console.log(`Authenticator-app codes:  ${await totpStatus()}`);
  console.log(`Admin deadline:           ${deadline ? deadline.toDate().toISOString() : "not set (admins not required yet)"}\n`);

  console.log("Platform creators (always required):");
  for (const doc of (await db.collection("platformCreators").get()).docs) {
    if (doc.data().status !== "active") continue;
    const f = await factorsFor(doc.id);
    console.log(`  ${f.totp ? "[set up]   " : "[NOT SET UP]"} ${f.email}`);
  }

  console.log("\nDepartment admins (required after the deadline; demo exempt):");
  for (const dept of (await db.collection("platformDepartments").get()).docs) {
    if (dept.id === "forge-demo") continue;
    const members = await db.collection(`departments/${dept.id}/users`).where("status", "==", "active").get();
    const admins = members.docs.filter((m) => {
      const d = m.data();
      const roles = Array.isArray(d.roleIds) ? d.roleIds : [];
      return !d.isPlatformCreator && (d.role === "department_admin" || roles.some((r) => ADMIN_ROLE_IDS.includes(r)));
    });
    for (const m of admins) {
      const f = await factorsFor(m.id);
      console.log(`  ${f.totp ? "[set up]   " : "[not yet]  "} ${dept.id.padEnd(16)} ${f.email}`);
    }
    if (!admins.length) console.log(`  (none)       ${dept.id}`);
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
