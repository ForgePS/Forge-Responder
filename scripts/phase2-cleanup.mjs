/**
 * Phase 2 cleanup: make Horn Lake an ordinary tenant and remove junk departments.
 *
 * DRY RUN by default (read-only report). Nothing is written unless you pass --apply.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; npm run cleanup:phase2 *> cleanup.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; npm run cleanup:phase2 -- --apply *> cleanup-apply.txt
 *
 * Every document that --apply changes or deletes is first saved to
 * backups/phase2-<timestamp>.json (gitignored), so it can be restored.
 *
 * Steps:
 *  1. (report) rmsData archive vs departments/horn-lake-fd/lists. rmsData is kept,
 *     locked, as an archive; nothing is copied.
 *  2. Records in other departments identical to Horn Lake records (archive or
 *     current lists). Report only, unless --strip-copies=<ids> names departments
 *     to remove them from (--personnel-only limits it to people/scheduling lists).
 *     Each department's own records are kept; the demo is never touched.
 *  3. Junk departments — accidental departments (placeholder ids, reserved
 *     paths, duplicates) holding only starter data are deleted with their
 *     registry, gateway and subscription records (--apply). Safety checks skip
 *     any department with real data or members other than platform creators.
 *  4. Horn Lake fire resources — copies the SOG manual link and form links that
 *     used to be hardcoded in the app into horn-lake-fd's profile (--apply).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const HORN_LAKE = "horn-lake-fd";

// From the 2026-10-21 inventory. Each is re-checked below before deletion.
const JUNK_DEPARTMENTS = [
  "%257bdepartment-id%257d",
  "%7bdepartment-id%7d",
  "admin",
  "api",
  "hornlake-fd",
  "st-charles",
  "st-charles-fire-dept",
];
// Collections a starter (never used) department may contain.
const STARTER_COLLECTIONS = new Set(["dropdowns", "lists", "users", "roles", "profile", "settings", "auditLogs"]);

const HORN_LAKE_FIRE_RESOURCES = {
  sogPdfUrl: "https://dept-app-k85k.onrender.com/documents/horn-lake-sogs.pdf",
  forms: [
    { label: "Liability Release Form", url: "https://form.jotform.com/260756661469065" },
    { label: "Pre Fire Plan Form", url: "https://form.jotform.com/260863576120053" },
  ],
};

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const backup = { createdAt: new Date().toISOString(), project: PROJECT_ID, docs: {} };
const actions = [];
let backupPath = "";

// Written to disk after every backup, i.e. BEFORE the matching write/delete runs.
function flushBackup() {
  if (backupPath) writeFileSync(backupPath, JSON.stringify(backup, null, 2));
}

function serialize(value) {
  if (value instanceof Timestamp) return { __timestamp: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  }
  return value;
}

async function backupDoc(ref) {
  const snap = await ref.get();
  if (snap.exists) backup.docs[ref.path] = serialize(snap.data());
  flushBackup();
}

async function backupTree(ref) {
  await backupDoc(ref);
  for (const col of await ref.listCollections()) {
    for (const docRef of await col.listDocuments()) await backupTree(docRef);
  }
}

/**
 * Legacy rmsData docs store their list either as `items` (array) or as a JSON
 * string in `json` / `data` (an array, or an object with `items`).
 * Returns the array, or null when the doc isn't a list.
 */
function legacyItems(data = {}) {
  if (Array.isArray(data.items)) return data.items;
  for (const field of ["json", "data", "value"]) {
    const raw = data[field];
    if (typeof raw !== "string") continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (Array.isArray(parsed?.items)) return parsed.items;
    } catch {
      // not JSON
    }
  }
  return null;
}

function describeFields(data = {}) {
  return Object.entries(data)
    .map(([key, value]) => `${key}:${Array.isArray(value) ? "array" : typeof value}${typeof value === "string" ? `(${value.length} chars)` : ""}`)
    .join(", ") || "no fields";
}

function itemIds(items) {
  return new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id ?? JSON.stringify(item))));
}

function line(...parts) {
  console.log(...parts);
}

// Report-only. rmsData stays in Firestore (locked by rules) as an archive.
async function step1RmsDataCoverage(rmsDocs) {
  line("\n== 1. rmsData lists vs horn-lake-fd/lists (report only) ==");
  for (const legacy of rmsDocs) {
    const items = legacyItems(legacy.data());
    if (!items) {
      line(`  ? ${legacy.id}: could not read as a list — fields: ${describeFields(legacy.data())}`);
      continue;
    }
    const tenant = await db.doc(`departments/${HORN_LAKE}/lists/${legacy.id}`).get();
    const tenantItems = tenant.exists && Array.isArray(tenant.data().items) ? tenant.data().items : [];
    if (tenantItems.length) {
      line(`  ok ${legacy.id}: Horn Lake has ${tenantItems.length} items of its own (archive has ${items.length})`);
    } else if (!items.length) {
      line(`  -  ${legacy.id}: archive is empty`);
    } else {
      line(`  !  ${legacy.id}: archive has ${items.length} items Horn Lake's lists don't: ${sampleLabels(items)}`);
    }
  }
}

function itemLabel(item = {}) {
  return String(item.name || item.title || item.unit || item.description || item.label || item.id || "?").slice(0, 40);
}

function sampleLabels(items, max = 4) {
  const labels = items.slice(0, max).map(itemLabel);
  return labels.join(" | ") + (items.length > max ? ` (+${items.length - max} more)` : "");
}

// Fingerprint ignoring bookkeeping fields, so identical records match even if
// timestamps differ.
function fingerprint(item = {}) {
  const { updatedAt, createdAt, migratedAt, _updatedAt, ...rest } = item || {};
  return JSON.stringify(Object.keys(rest).sort().map((k) => [k, rest[k]]));
}

// Optional removal of Horn Lake-identical records from other departments:
//   --strip-copies=camden,01002            all Horn Lake-identical records
//   --strip-copies=camden,01002 --personnel-only   only people/scheduling lists
// Only matching records are removed; each department's own records are kept.
// The demo department is never touched.
function readArg(name) {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : "";
}
const STRIP_DEPARTMENTS = new Set(readArg("strip-copies").split(",").map((s) => s.trim()).filter(Boolean));
STRIP_DEPARTMENTS.delete("forge-demo");
STRIP_DEPARTMENTS.delete(HORN_LAKE);
const PERSONNEL_ONLY = process.argv.includes("--personnel-only");
const PERSONNEL_LIST_KEYS = new Set([
  "hlfd-rms-personnel", "hlfd-rms-roster", "hlfd-rms-schedule-days", "hlfd-rms-time-cards",
  "hlfd-rms-leave-requests", "hlfd-rms-overtime-offers", "hlfd-rms-shift-trades",
  "hlfd-rms-certifications", "hlfd-rms-training", "hlfd-rms-daily-logs",
]);

// Matches by content (not just id) against both the rmsData archive and Horn
// Lake's current lists. Report-only unless --strip-copies names the department.
async function step2CopiedHornLakeData(rmsDocs) {
  line(`\n== 2. Horn Lake records found in other departments ${STRIP_DEPARTMENTS.size ? `(removing from: ${[...STRIP_DEPARTMENTS].join(", ")}${PERSONNEL_ONLY ? ", people/scheduling lists only" : ""})` : "(report only)"} ==`);
  const hornLakeLists = (await db.collection(`departments/${HORN_LAKE}/lists`).get()).docs;
  const hornLakeByKey = new Map();
  const add = (key, items) => {
    if (!Array.isArray(items)) return;
    const set = hornLakeByKey.get(key) || new Set();
    items.forEach((item) => set.add(fingerprint(item)));
    hornLakeByKey.set(key, set);
  };
  rmsDocs.forEach((d) => add(d.id, legacyItems(d.data())));
  hornLakeLists.forEach((d) => add(d.id, d.data().items));

  const departments = await db.collection("departments").listDocuments();
  let found = 0;
  for (const dept of departments) {
    if (dept.id === HORN_LAKE || JUNK_DEPARTMENTS.includes(dept.id)) continue;
    const lists = await dept.collection("lists").get();
    for (const list of lists.docs) {
      const known = hornLakeByKey.get(list.id);
      const items = Array.isArray(list.data().items) ? list.data().items : [];
      if (!known?.size || !items.length) continue;
      const matches = items.filter((item) => known.has(fingerprint(item)));
      if (!matches.length) continue;
      found += 1;
      const strip = STRIP_DEPARTMENTS.has(dept.id) && (!PERSONNEL_ONLY || PERSONNEL_LIST_KEYS.has(list.id));
      const remaining = items.filter((item) => !known.has(fingerprint(item)));
      const plan = !strip
        ? ""
        : remaining.length
          ? ` -> REMOVE ${matches.length}, keep ${remaining.length}`
          : " -> DELETE list (all Horn Lake records)";
      line(`  ${strip ? "x" : " "} ${dept.id}/lists/${list.id}: ${matches.length} of ${items.length} records are identical to Horn Lake records: ${sampleLabels(matches)}${plan}`);
      if (strip) {
        actions.push(async () => {
          await backupDoc(list.ref);
          if (remaining.length) {
            await list.ref.set({ items: remaining, updatedAt: new Date().toISOString(), cleanedBy: "phase2-cleanup" }, { merge: true });
          } else {
            await list.ref.delete();
          }
        });
      }
    }
  }
  if (!found) {
    line("  None: no other department holds records identical to Horn Lake's.");
  } else if (!STRIP_DEPARTMENTS.size) {
    line("  Report only. To remove them, add --strip-copies=<department ids> (optionally --personnel-only).");
  }
}

async function step3JunkDepartments() {
  line("\n== 3. Junk departments ==");
  const creators = new Set((await db.collection("platformCreators").get()).docs
    .filter((d) => d.data().status === "active").map((d) => d.id));

  for (const id of JUNK_DEPARTMENTS) {
    const ref = db.doc(`departments/${id}`);
    const cols = await ref.listCollections();
    const problems = [];
    let docCount = 0;
    for (const col of cols) {
      const n = (await col.count().get()).data().count;
      docCount += n;
      if (!STARTER_COLLECTIONS.has(col.id) && n > 0) problems.push(`has ${n} ${col.id}`);
    }
    const users = await ref.collection("users").get();
    const nonCreators = users.docs.filter((u) => !creators.has(u.id));
    if (nonCreators.length) problems.push(`${nonCreators.length} non-creator member(s): ${nonCreators.map((u) => u.data().email || u.id).join(", ")}`);
    const lists = await ref.collection("lists").get();
    const realLists = lists.docs.filter((l) => !(l.data().migratedFrom) && Array.isArray(l.data().items) && l.data().items.length);
    const [registry, gateway, subscription] = await Promise.all([
      db.doc(`platformDepartments/${id}`).get(),
      db.doc(`rmsGateways/${id}`).get(),
      db.doc(`platformSubscriptions/${id}`).get(),
    ]);

    if (problems.length) {
      line(`  ! ${id}: SKIPPED — ${problems.join("; ")}`);
      continue;
    }
    line(`  x ${id}: delete ${docCount} docs (${cols.map((c) => c.id).join(", ") || "none"})${realLists.length ? `, incl. ${realLists.length} non-empty lists` : ""}${registry.exists ? " + registry" : ""}${gateway.exists ? " + gateway" : ""}${subscription.exists ? " + subscription" : ""}`);
    actions.push(async () => {
      await backupTree(ref);
      for (const extra of [registry, gateway, subscription]) if (extra.exists) await backupDoc(extra.ref);
      await db.recursiveDelete(ref);
      for (const extra of [registry, gateway, subscription]) if (extra.exists) await extra.ref.delete();
    });
  }
}

async function step4FireResources() {
  line("\n== 4. Horn Lake fire resources in profile ==");
  const ref = db.doc(`departments/${HORN_LAKE}/profile/main`);
  const snap = await ref.get();
  if (!snap.exists) {
    line("  ! horn-lake-fd/profile/main not found — skipped");
    return;
  }
  if (snap.data().fireResources?.sogPdfUrl || snap.data().fireResources?.forms?.length) {
    line("  ✓ already set");
    return;
  }
  line(`  + set fireResources (SOG manual link + ${HORN_LAKE_FIRE_RESOURCES.forms.length} forms)`);
  actions.push(async () => {
    await backupDoc(ref);
    await ref.set({ fireResources: HORN_LAKE_FIRE_RESOURCES }, { merge: true });
  });
}

async function main() {
  line(`\nProject: ${PROJECT_ID}   Mode: ${APPLY ? "APPLY (backing up, then writing/deleting)" : "DRY RUN (no writes)"}`);
  const rmsDocs = (await db.collection("rmsData").get()).docs;

  await step1RmsDataCoverage(rmsDocs);
  await step2CopiedHornLakeData(rmsDocs);
  await step3JunkDepartments();
  await step4FireResources();

  line(`\nPlanned changes: ${actions.length}`);
  if (!APPLY) {
    line("Dry run only. Review, then re-run with --apply.\n");
    return;
  }
  if (!actions.length) {
    line("Nothing to do.\n");
    return;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  mkdirSync("backups", { recursive: true });
  backupPath = `backups/phase2-${stamp}.json`;
  flushBackup();
  // Each action backs up the documents it touches (saved to disk) before changing them.
  let done = 0;
  for (const run of actions) {
    await run();
    done += 1;
  }
  line(`Applied ${done} changes. Backup of everything changed/deleted: ${backupPath}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
