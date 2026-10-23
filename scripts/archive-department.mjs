/**
 * Archive (or restore) departments: they disappear from the creator console,
 * the Workspace switcher and Subscriptions, their web address shows "portal
 * not found", and members lose access (rules: isDepartmentActive). NOTHING IS
 * DELETED: every record stays, and --restore brings a department back.
 *
 * DRY RUN by default: shows each department's status and what would change.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/archive-department.mjs '--department=horn-lake-fd,camden,01002' *> archive.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/archive-department.mjs '--department=horn-lake-fd,camden,01002' --apply *> archive.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/archive-department.mjs '--department=camden' --restore --apply *> archive.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const RESTORE = process.argv.includes("--restore");
const IDS = ((process.argv.find((a) => a.startsWith("--department=")) || "").split("=")[1] || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

if (!IDS.length) {
  console.error("Name the departments: '--department=horn-lake-fd,camden'");
  process.exit(1);
}
if (IDS.includes("forge-demo")) {
  console.error("The shared demo (forge-demo) is never archived.");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();
const now = new Date().toISOString();

async function main() {
  console.log(`\nProject ${PROJECT_ID}   ${RESTORE ? "RESTORE" : "ARCHIVE"}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  for (const id of IDS) {
    const registryRef = db.doc(`platformDepartments/${id}`);
    const gatewayRef = db.doc(`rmsGateways/${id}`);
    const [registry, gateway, sub, members] = await Promise.all([
      registryRef.get(),
      gatewayRef.get(),
      db.doc(`platformSubscriptions/${id}`).get(),
      db.collection(`departments/${id}/users`).get(),
    ]);
    if (!registry.exists) {
      console.log(`== ${id}: not found in platformDepartments, skipped\n`);
      continue;
    }
    const r = registry.data() || {};
    console.log(`== ${id}   ${r.name || ""}`);
    console.log(`   registry status: ${r.status || "(none)"}   subscription: ${sub.data()?.status || "(none)"}   logins: ${members.size}   address record: ${gateway.exists ? gateway.data()?.status || "active" : "none"}`);

    if (RESTORE) {
      const nextStatus = r.previousStatus && r.previousStatus !== "archived" ? r.previousStatus : "active";
      console.log(`   -> registry status ${nextStatus}${gateway.exists ? `, address ${gateway.data()?.previousStatus || "active"}` : ""}`);
      if (APPLY) {
        await registryRef.set({ status: nextStatus, restoredAt: now, updatedAt: now }, { merge: true });
        if (gateway.exists) await gatewayRef.set({ status: gateway.data()?.previousStatus || "active", updatedAt: now }, { merge: true });
      }
    } else {
      if (r.status === "archived") {
        console.log("   already archived\n");
        continue;
      }
      console.log(`   -> registry status archived${gateway.exists ? ", address disabled" : ""} (data kept)`);
      if (APPLY) {
        await registryRef.set({ status: "archived", previousStatus: r.status || "active", archivedAt: now, updatedAt: now }, { merge: true });
        if (gateway.exists) {
          await gatewayRef.set({ status: "disabled", previousStatus: gateway.data()?.status || "active", updatedAt: now }, { merge: true });
        }
      }
    }
    if (APPLY) {
      await db.collection("platformAuditLogs").add({
        action: RESTORE ? "department.restored" : "department.archived",
        module: "Creator Console",
        recordId: id,
        summary: `${RESTORE ? "Restored" : "Archived"} ${r.name || id} (scripts/archive-department.mjs)`,
        actorUid: "script",
        actorName: "scripts/archive-department.mjs",
        created_at: now,
      });
      console.log("   done");
    }
    console.log("");
  }
  if (!APPLY) console.log("Dry run only. Nothing changed. Re-run with --apply.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
