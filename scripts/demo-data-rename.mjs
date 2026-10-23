/**
 * Replace leftover Horn Lake place names in the demo department's data
 * (departments/forge-demo/...) with Riverside equivalents.
 *
 * DRY RUN by default. --apply writes, after saving the original documents to
 * backups/demo-rename-<timestamp>.json (gitignored).
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/demo-data-rename.mjs *> demo-rename.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/demo-data-rename.mjs --apply *> demo-rename.txt
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const DEMO = "forge-demo";

// Longest first so full addresses are replaced before their parts.
const REPLACEMENTS = [
  ["3101 Goodman Rd W, Horn Lake, MS 38637", "3101 Main St, Riverside, MS 38600"],
  ["120 Commerce Dr, Horn Lake, MS 38637", "120 Commerce Dr, Riverside, MS 38600"],
  ["Horn Lake High School", "Riverside High School"],
  ["Horn Lake City Hall", "Riverside City Hall"],
  ["4710 Horn Lake Rd", "4710 Riverside Rd"],
  ["3101 Goodman Rd W", "3101 Main St"],
  ["6530 Hise Parkway", "100 Station Rd"],
  ["Horn Lake Fire Department", "Riverside Fire & EMS"],
  ["Horn Lake", "Riverside"],
];

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function replaceText(value) {
  let next = value;
  for (const [from, to] of REPLACEMENTS) next = next.split(from).join(to);
  return next;
}

/** Returns [newValue, changeCount]; leaves timestamps and non-strings alone. */
function rewrite(value) {
  if (typeof value === "string") {
    const next = replaceText(value);
    return [next, next === value ? 0 : 1];
  }
  if (value instanceof Timestamp || value === null || typeof value !== "object") return [value, 0];
  if (Array.isArray(value)) {
    let count = 0;
    const out = value.map((item) => {
      const [next, n] = rewrite(item);
      count += n;
      return next;
    });
    return [out, count];
  }
  let count = 0;
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    const [next, n] = rewrite(item);
    out[key] = next;
    count += n;
  }
  return [out, count];
}

async function walk(docRef, changes) {
  const snap = await docRef.get();
  if (snap.exists) {
    const [next, count] = rewrite(snap.data());
    if (count) changes.push({ ref: docRef, before: snap.data(), after: next, count });
  }
  for (const col of await docRef.listCollections()) {
    for (const child of await col.listDocuments()) await walk(child, changes);
  }
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);
  const changes = [];
  await walk(db.doc(`departments/${DEMO}`), changes);
  for (const c of changes) console.log(`  ~ ${c.ref.path}: ${c.count} text value(s)`);
  console.log(`\n${changes.length} document(s) to update.`);
  if (!APPLY) {
    console.log("Dry run only. Re-run with --apply.\n");
    return;
  }
  if (!changes.length) return;
  mkdirSync("backups", { recursive: true });
  const path = `backups/demo-rename-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(Object.fromEntries(changes.map((c) => [c.ref.path, c.before])), null, 2));
  for (const c of changes) await c.ref.set(c.after);
  console.log(`Updated ${changes.length} document(s). Backup: ${path}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
