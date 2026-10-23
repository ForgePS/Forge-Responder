/**
 * Remove every personnel record from one department: its Personnel list
 * (departments/<id>/lists/hlfd-rms-personnel) and the older per-person
 * records (departments/<id>/personnel/*, including anything nested under them).
 *
 * DRY RUN by default: lists who would be removed and what else still refers
 * to them (certifications, training, logins), and changes nothing.
 * --apply first saves the whole list to backups/personnel-<dept>-<timestamp>.json
 * (gitignored), then empties it. The list record itself is kept (empty), so
 * browsers with an old cached copy load the empty list instead of re-saving it.
 *
 * Does NOT touch: user logins/memberships, certifications, training records,
 * schedules, or profile photo/document files in Storage.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/clear-department-personnel.mjs '--department=horn-lake-fd' *> personnel-clear.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/clear-department-personnel.mjs '--department=horn-lake-fd' --apply *> personnel-clear.txt
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const DEPT = (process.argv.find((a) => a.startsWith("--department=")) || "").split("=")[1]?.trim();
const PERSONNEL_KEY = "hlfd-rms-personnel";
const RELATED_KEYS = ["hlfd-rms-certifications", "hlfd-rms-training"];

if (!DEPT) {
  console.error("Name the department: '--department=horn-lake-fd'");
  process.exit(1);
}

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

/** Array lists may hold JSON strings. */
function readItems(data) {
  const raw = Array.isArray(data?.items) ? data.items : [];
  return raw.map((item) => {
    if (typeof item !== "string") return item;
    try { return JSON.parse(item); } catch { return item; }
  });
}

/** A list in either format: one array record, or a header plus per-item records. */
async function readList(ref) {
  const snap = await ref.get();
  if (snap.exists && snap.data()?.storage === "items") {
    const itemDocs = (await ref.collection("items").orderBy("_order").get()).docs;
    return { snap, perItem: true, itemDocs, items: itemDocs.map((d) => { const { _order, ...rest } = d.data(); return rest; }) };
  }
  return { snap, perItem: false, itemDocs: [], items: snap.exists ? readItems(snap.data()) : [] };
}

const personName = (p) =>
  String(p?.name || [p?.firstName, p?.lastName].filter(Boolean).join(" ") || p?.fullName || "").trim();

async function main() {
  console.log(`\nProject ${PROJECT_ID}   Department ${DEPT}   Mode: ${APPLY ? "APPLY" : "DRY RUN"}\n`);

  // The department is registered in platformDepartments; its data lives under
  // departments/<id>/... (the departments/<id> record itself may not exist).
  const deptSnap = await db.doc(`platformDepartments/${DEPT}`).get();
  if (!deptSnap.exists) {
    console.error(`platformDepartments/${DEPT} does not exist. Check the department ID.`);
    process.exit(1);
  }
  console.log(`Department name: ${deptSnap.data()?.name || deptSnap.data()?.departmentName || "(none)"}\n`);

  const ref = db.doc(`departments/${DEPT}/lists/${PERSONNEL_KEY}`);
  const list = await readList(ref);
  const { snap } = list;
  const listPeople = list.items;
  const show = (p, id) => `  - ${p?.id || id || "(no id)"}  ${personName(p) || "(no name)"}  ${p?.rank || ""}  ${p?.status || ""}`.trimEnd();
  console.log(`Personnel list (departments/${DEPT}/lists/${PERSONNEL_KEY}): ${listPeople.length} to remove`);
  for (const p of listPeople) console.log(show(p));

  // Older storage: one record per person. Some screens fall back to it when
  // the list is empty, so it is removed too.
  const subDocs = (await db.collection(`departments/${DEPT}/personnel`).get()).docs;
  console.log(`\nPer-person records (departments/${DEPT}/personnel): ${subDocs.length} to remove`);
  for (const d of subDocs) {
    const nested = (await d.ref.listCollections()).map((c) => c.id);
    console.log(`${show(d.data(), d.id)}${nested.length ? `  [also: ${nested.join(", ")}]` : ""}`);
  }
  const people = [...listPeople, ...subDocs.map((d) => ({ id: d.id, ...d.data() }))];

  // What still refers to these people (reported only, not changed).
  const ids = new Set(people.map((p) => String(p?.id || "")).filter(Boolean));
  const names = new Set(people.map((p) => personName(p).toLowerCase()).filter(Boolean));
  console.log("\nStill referring to these people (left unchanged):");
  for (const key of RELATED_KEYS) {
    const { items } = await readList(db.doc(`departments/${DEPT}/lists/${key}`));
    const linked = items.filter((item) => {
      const text = JSON.stringify(item || {}).toLowerCase();
      return [...ids].some((id) => text.includes(id.toLowerCase())) || [...names].some((n) => text.includes(n));
    });
    console.log(`  ${key}: ${linked.length} of ${items.length} records mention a removed person`);
  }
  const members = await db.collection(`departments/${DEPT}/users`).get();
  const linkedLogins = members.docs.filter((d) => {
    const m = d.data();
    return ids.has(String(m.personnelId || m.personId || ""));
  });
  console.log(`  logins (departments/${DEPT}/users): ${linkedLogins.length} of ${members.size} are linked to a removed person`);
  for (const d of linkedLogins) console.log(`    - ${d.data().email || d.id}`);

  if (!APPLY) {
    console.log("\nDry run only. Nothing changed. Re-run with --apply to remove them.\n");
    return;
  }
  if (!listPeople.length && !subDocs.length) {
    console.log("\nNothing to remove.\n");
    return;
  }

  // Back up everything first, including records nested under each person.
  const backup = {
    list: snap.exists ? { path: ref.path, data: snap.data() } : null,
    listItems: list.itemDocs.map((d) => ({ path: d.ref.path, data: d.data() })),
    perPerson: [],
  };
  for (const d of subDocs) {
    const nested = {};
    for (const col of await d.ref.listCollections()) {
      nested[col.id] = (await col.get()).docs.map((n) => ({ id: n.id, data: n.data() }));
    }
    backup.perPerson.push({ path: d.ref.path, data: d.data(), nested });
  }
  mkdirSync("backups", { recursive: true });
  const path = `backups/personnel-${DEPT}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  writeFileSync(path, JSON.stringify(backup, null, 2));
  console.log(`\nBackup saved: ${path}`);

  if (list.perItem) {
    for (const d of list.itemDocs) await d.ref.delete();
    await ref.update({ itemCount: 0, updatedAt: FieldValue.serverTimestamp(), clearedBy: "scripts/clear-department-personnel.mjs" });
  } else if (listPeople.length) {
    await ref.update({ items: [], updatedAt: FieldValue.serverTimestamp(), clearedBy: "scripts/clear-department-personnel.mjs" });
  }
  for (const d of subDocs) await db.recursiveDelete(d.ref);

  const listAfter = (await readList(ref)).items.length;
  const subAfter = (await db.collection(`departments/${DEPT}/personnel`).get()).size;
  console.log(`Removed ${listPeople.length} from the list and ${subDocs.length} per-person record(s).`);
  console.log(`Now: list has ${listAfter}, per-person records ${subAfter}.\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
