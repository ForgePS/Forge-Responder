/**
 * Fill toAll / recipientUids on existing internal messages, so the Firestore
 * rules can show each message only to its sender, recipients and message
 * managers. New messages get these from the internalMessageAudience function.
 * Run once after deploying that function and before deploying the rules.
 *
 * Prints counts only. Default: dry run, changes nothing. --apply writes.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/backfill-message-recipients.mjs
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/backfill-message-recipients.mjs --apply
 */
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const { backfillDepartmentMessages } = require("../functions/lib/messageRecipients.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const total = { updated: 0, unchanged: 0 };
  const skipped = [];
  for (const dept of await db.collection("departments").listDocuments()) {
    // Archived or disabled departments (old test or legacy ones) are left alone.
    const registry = await db.doc(`platformDepartments/${dept.id}`).get();
    const status = registry.exists ? registry.get("status") : "";
    if (["archived", "disabled"].includes(status)) {
      skipped.push(`${dept.id} (${status})`);
      continue;
    }
    const counts = await backfillDepartmentMessages(db, dept.id, { dryRun: !APPLY });
    if (!counts.updated && !counts.unchanged) continue;
    console.log(`${dept.id}: ${APPLY ? "updated" : "would update"} ${counts.updated}, already current ${counts.unchanged}`);
    total.updated += counts.updated;
    total.unchanged += counts.unchanged;
  }
  if (skipped.length) console.log(`\nSkipped (archived or disabled): ${skipped.join(", ")}`);
  console.log(`\nTotal: ${total.updated} to update, ${total.unchanged} current.`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
