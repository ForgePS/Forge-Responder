/**
 * Find people who exist in Firebase Auth but not in their department's Firestore
 * records (or the other way round), and fix what can be fixed safely. See
 * functions/lib/userRecordRepair.js for the list of gaps and what each fix does.
 *
 * Emails are printed masked. Default: dry run, changes nothing. --apply writes
 * (memberships, grant records and an audit log entry per fix; never Auth accounts).
 *
 * Needs Application Default Credentials with access to the project:
 *   $env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/repair-department-users.mjs
 *   $env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/repair-department-users.mjs --apply
 * Emulator (FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST set):
 *   $env:GOOGLE_CLOUD_PROJECT = "demo-forge-rms"; node scripts/repair-department-users.mjs
 */
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const { repairUserRecords } = require("../functions/lib/userRecordRepair.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT;
const APPLY = process.argv.includes("--apply");

if (!PROJECT_ID) {
  console.error("Set GOOGLE_CLOUD_PROJECT to the project to check (no default, so production is never touched by accident).");
  process.exit(1);
}

const emulated = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
initializeApp(emulated ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const { findings, counts } = await repairUserRecords(getFirestore(), getAuth(), { apply: APPLY });
  for (const f of findings) {
    const where = f.departmentId ? `${f.departmentId} ` : "";
    const who = [f.uid && `uid ${f.uid}`, f.id && f.id !== f.uid && `record ${f.id}`, f.email].filter(Boolean).join(", ");
    console.log(`${f.fixed ? "fixed  " : "found  "} ${f.type.padEnd(30)} ${where}${who}`);
  }
  console.log("\nTotals:", Object.keys(counts).length ? counts : "nothing to repair");
  console.log("auth_without_membership and membership_without_auth are report-only: decide those by hand.");
  if (!APPLY) console.log("Dry run only. Add --apply to fix the rest.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
