/**
 * Fill departments/{id}/memberGrants/{uid} for every member of every department
 * (the permissions the Firestore rules check). Run once before deploying the
 * role-aware rules; after that the memberGrantsOnMember / memberGrantsOnRole
 * functions keep them current.
 *
 * Prints counts only. Default: dry run, changes nothing. --apply writes.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/sync-member-grants.mjs *> member-grants.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/sync-member-grants.mjs --apply *> member-grants.txt
 */
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const { refreshDepartment } = require("../functions/lib/memberGrants.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const total = { written: 0, removed: 0, unchanged: 0 };
  for (const dept of await db.collection("departments").listDocuments()) {
    const counts = await refreshDepartment(db, dept.id, { dryRun: !APPLY });
    if (!counts.written && !counts.removed && !counts.unchanged) continue;
    console.log(`${dept.id}: ${APPLY ? "wrote" : "would write"} ${counts.written}, ${APPLY ? "removed" : "would remove"} ${counts.removed}, already current ${counts.unchanged}`);
    for (const key of Object.keys(total)) total[key] += counts[key];
  }
  console.log(`\nTotal: ${total.written} to write, ${total.removed} to remove, ${total.unchanged} current.`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
