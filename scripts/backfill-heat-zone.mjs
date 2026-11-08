/**
 * Heat Zone Analytics data migration: build departments/{id}/heatZoneCalls for
 * every department from its NERIS report list. Run once after the first deploy
 * of the heatZone* functions (new and changed reports are handled by the
 * heatZoneOnReport* triggers after that). Safe to re-run: only differences
 * are written.
 *
 * Prints counts only. Default: dry run, changes nothing. --apply writes.
 * Optional: --department=<id> to limit to one department.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/backfill-heat-zone.mjs *> heat-zone-backfill.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/backfill-heat-zone.mjs --apply *> heat-zone-backfill.txt
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
// Same firebase-admin copy as the functions code (FieldValue must match the SDK instance).
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { rebuildDepartment } = require("./lib/heatZone/service.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "";
const APPLY = process.argv.includes("--apply");
const ONLY = (process.argv.find((a) => a.startsWith("--department=")) || "").split("=")[1] || "";

if (!PROJECT_ID) {
  console.error("Set GOOGLE_CLOUD_PROJECT to the project to backfill.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}${ONLY ? `, department ${ONLY}` : ""}\n`);
  const total = { projected: 0, written: 0, removed: 0, skipped: 0, rejected: 0 };
  const departments = ONLY ? [{ id: ONLY }] : await db.collection("departments").listDocuments();
  for (const dept of departments) {
    const counts = await rebuildDepartment(db, dept.id, { reason: "backfill", dryRun: !APPLY });
    if (!counts.projected && !counts.removed) continue;
    console.log(`${dept.id}: ${counts.projected} incidents, ${APPLY ? "wrote" : "would write"} ${counts.written}, ${APPLY ? "removed" : "would remove"} ${counts.removed}, skipped ${counts.skipped} (no usable time), rejected ${counts.rejected} (other department id)`);
    for (const key of Object.keys(total)) total[key] += counts[key];
  }
  console.log(`\nTotal: ${total.projected} incidents, ${total.written} to write, ${total.removed} to remove, ${total.skipped} skipped, ${total.rejected} rejected.`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
