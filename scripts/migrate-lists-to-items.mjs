/**
 * Move department lists from one record holding an `items` array
 * (departments/<id>/lists/<key>) to one record per item
 * (departments/<id>/lists/<key>/items/<itemId>), so no list can hit Firestore's
 * 1 MB record limit and saves only rewrite the items that changed.
 *
 * DRY RUN by default: per department and list, shows item counts, size, and
 * any items with missing or repeated ids (those get new ids when migrated).
 * --apply first saves every list it will change to backups/lists-<timestamp>.json
 * (gitignored), then for each list: copies the items across, and flips the list
 * header to { storage: "items" } in a transaction that checks nobody saved the
 * list in the meantime (if they did, it copies again).
 * Requires the app version that reads per-item lists to be live first.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/migrate-lists-to-items.mjs *> lists-migration.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/migrate-lists-to-items.mjs '--department=camden' --apply *> lists-migration.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/migrate-lists-to-items.mjs --apply *> lists-migration.txt
 * Options: '--department=<id>' (one department), '--list=<key>' (one list).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const require = createRequire(import.meta.url);
const plan = require("../functions/lib/listItemsPlan.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=").slice(1).join("=").trim();
const ONLY_DEPT = arg("department");
const ONLY_LIST = arg("list");
const BATCH_LIMIT = 450;

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

/** Items as the app reads them: JSON strings parsed, non-objects dropped. */
function readItems(header) {
  const raw = Array.isArray(header?.items) ? header.items : [];
  const items = [];
  let dropped = 0;
  for (const item of raw) {
    let value = item;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch { /* keep as string */ }
    }
    if (value && typeof value === "object" && !Array.isArray(value)) items.push(value);
    else dropped += 1;
  }
  return { items, dropped };
}

async function commitPlan(ref, writes) {
  const col = ref.collection(plan.ITEMS_SUBCOLLECTION);
  const ops = [
    ...writes.upserts.map((u) => (b) => b.set(col.doc(u.docId), u.data)),
    ...writes.deletes.map((id) => (b) => b.delete(col.doc(id))),
  ];
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_LIMIT).forEach((op) => op(batch));
    await batch.commit();
  }
}

/** Copy items across, then flip the header only if the array didn't change meanwhile. */
async function migrateList(ref, departmentId) {
  let entries = new Map();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const snap = await ref.get();
    const header = snap.data() || {};
    if (plan.isItemsStorage(header)) return { status: "already per item" };
    const rawJson = JSON.stringify(header.items ?? null);
    const { items: withIds } = plan.ensureItemIds(readItems(header).items);
    const writes = plan.planListWrites(entries, withIds);
    await commitPlan(ref, writes);
    entries = writes.entries;

    const flipped = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(ref);
      if (JSON.stringify(fresh.data()?.items ?? null) !== rawJson) return false;
      tx.set(ref, {
        storage: plan.ITEMS_STORAGE,
        items: FieldValue.delete(),
        itemCount: withIds.length,
        departmentId,
        migratedAt: new Date().toISOString(),
        migratedBy: "scripts/migrate-lists-to-items.mjs",
      }, { merge: true });
      return true;
    });
    if (flipped) return { status: "migrated", count: withIds.length, attempts: attempt };
  }
  return { status: "skipped: list kept changing, run again" };
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}${ONLY_DEPT ? `   Department ${ONLY_DEPT}` : ""}${ONLY_LIST ? `   List ${ONLY_LIST}` : ""}\n`);
  const deptRefs = ONLY_DEPT
    ? [db.doc(`departments/${ONLY_DEPT}`)]
    : await db.collection("departments").listDocuments();

  const todo = [];
  let alreadyDone = 0;
  for (const deptRef of deptRefs) {
    const listSnaps = (await deptRef.collection("lists").get()).docs.filter((d) => !ONLY_LIST || d.id === ONLY_LIST);
    if (!listSnaps.length) continue;
    console.log(`== ${deptRef.id}`);
    for (const snap of listSnaps) {
      const header = snap.data() || {};
      if (plan.isItemsStorage(header)) {
        alreadyDone += 1;
        console.log(`   ${snap.id.padEnd(36)} already per item`);
        continue;
      }
      const { items, dropped } = readItems(header);
      const bytes = Buffer.byteLength(JSON.stringify(header.items ?? []));
      const dupes = plan.duplicateItemIds(items);
      const missing = items.filter((i) => !String(i.id ?? "").trim()).length;
      const notes = [
        dupes.length ? `${dupes.length} repeated id(s) will get a suffix: ${dupes.slice(0, 5).join(", ")}` : "",
        missing ? `${missing} without id will get one` : "",
        dropped ? `${dropped} non-record value(s) will be dropped` : "",
      ].filter(Boolean).join("; ");
      console.log(`   ${snap.id.padEnd(36)} ${String(items.length).padStart(5)} items  ${(bytes / 1024).toFixed(1).padStart(8)} KB${notes ? `   ! ${notes}` : ""}`);
      todo.push({ ref: snap.ref, departmentId: deptRef.id, key: snap.id, header });
    }
  }

  console.log(`\n${todo.length} list(s) to migrate, ${alreadyDone} already per item.`);
  if (!APPLY) {
    console.log("Dry run only. Nothing changed. Re-run with --apply.\n");
    return;
  }
  if (!todo.length) return;

  mkdirSync("backups", { recursive: true });
  const path = `backups/lists-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(Object.fromEntries(todo.map((t) => [t.ref.path, t.header])), null, 2));
  console.log(`Backup saved: ${path}\n`);

  for (const t of todo) {
    const result = await migrateList(t.ref, t.departmentId);
    console.log(`   ${t.departmentId}/${t.key}: ${result.status}${result.count != null ? ` (${result.count} items)` : ""}`);
  }
  console.log("\nDone.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
