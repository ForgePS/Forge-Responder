/**
 * Plan entitlements per department: plan, status, limits, usage and the
 * modules that will be enforced (functions/lib/entitlements.js).
 *
 * DRY RUN by default: prints the report and changes nothing.
 * --apply writes platformEntitlements/<departmentId> for every department (the
 * records the Firestore rules check). The Cloud Functions keep them current
 * afterwards; this is for the first rollout or to re-sync.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/entitlements-report.mjs *> entitlements.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/entitlements-report.mjs --apply *> entitlements.txt
 */
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const entitlements = require("../functions/lib/entitlements.js");
const { MODULE_KEYS } = require("../functions/lib/moduleCatalog.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const shown = (limit) => (limit ? String(limit) : "unlimited");
function usageLine(label, used, limit) {
  const over = limit && used > limit ? "   ! OVER LIMIT (existing kept; new ones blocked)" : limit && used === limit ? "   (at limit)" : "";
  return `     ${label.padEnd(13)} ${String(used).padStart(4)} of ${shown(limit)}${over}`;
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  const ids = (await db.collection("platformDepartments").get()).docs.map((d) => d.id).sort();
  for (const id of ids) {
    const e = await entitlements.computeEntitlements(db, id);
    const off = MODULE_KEYS.filter((key) => !e.modules.includes(key));
    console.log(`== ${id}   plan ${e.planId || "(none)"}   status ${e.status || "(none)"}`);
    console.log(usageLine("personnel", e.usage.personnel, e.limits.maxPersonnel));
    console.log(usageLine("portal users", e.usage.portalUsers, e.limits.maxPortalUsers));
    console.log(usageLine("stations", e.usage.stations, e.limits.maxStations));
    console.log(`     modules       ${off.length ? `all except: ${off.join(", ")}` : "all"}`);
    if (APPLY) {
      await entitlements.refreshDepartment(db, id);
      console.log("     -> entitlements written");
    }
    console.log("");
  }
  console.log(`${ids.length} department(s).${APPLY ? "" : " Dry run only. Nothing changed. Re-run with --apply."}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
