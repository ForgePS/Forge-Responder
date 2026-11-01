/**
 * Move private personnel details (birth date, SSN, demographics, driver's
 * license number) out of the personnel list, which every member downloads,
 * into departments/{id}/personnelPrivate/{personnelId}, which only people who
 * can see private info (and the person themself) can read.
 *
 * Looks at, for every department:
 *  - lists/hlfd-rms-personnel (per-item records, or the older single record with an items array)
 *  - lists/personnel and the personnel subcollection (older storage, if present)
 * Copies each value into personnelPrivate/{id} without overwriting a value that
 * is already there, then removes every private key (blank ones too) from the item.
 *
 * Prints counts only, never values. Default: dry run, changes nothing. --apply makes the move.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-personnel-private.mjs *> move-personnel-private.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/move-personnel-private.mjs --apply *> move-personnel-private.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  PERSONNEL_PRIVATE_COLLECTION,
  PERSONNEL_PRIVATE_KEYS,
  hasPrivateValue,
  personnelPrivateDocId,
  splitPersonnelRecord,
} from "../src/lib/personnelPrivateFields.js";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const LIST_KEYS = ["hlfd-rms-personnel", "personnel"];
const UPDATED_BY = "move-personnel-private script";

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function itemIdFromDocId(docId) {
  try {
    return decodeURIComponent(docId);
  } catch {
    return docId;
  }
}

function privateKeysPresent(item = {}) {
  return PERSONNEL_PRIVATE_KEYS.filter((key) => key in (item || {}));
}

function newTotals() {
  return { people: 0, withValues: 0, values: 0, alreadyThere: 0, differed: 0, noId: 0, cleaned: 0 };
}

/**
 * Copy one person's values into personnelPrivate (empty slots only).
 * Returns false when the person has no usable id (their values stay put).
 */
async function moveValues(deptRef, personnelId, privateFields, totals, written) {
  const docId = personnelPrivateDocId(personnelId);
  const keys = Object.keys(privateFields);
  if (!keys.length) return true;
  if (!docId) {
    totals.noId += 1;
    return false;
  }
  totals.withValues += 1;
  totals.values += keys.length;
  const ref = deptRef.collection(PERSONNEL_PRIVATE_COLLECTION).doc(docId);
  // Values already written in this run (another list holding the same person) count as stored.
  const existing = { ...((await ref.get()).data() || {}), ...(written.get(docId) || {}) };
  const update = {};
  for (const key of keys) {
    if (hasPrivateValue(existing[key])) {
      totals.alreadyThere += 1;
      if (String(existing[key]).trim() !== String(privateFields[key]).trim()) totals.differed += 1;
    } else {
      update[key] = privateFields[key];
    }
  }
  if (Object.keys(update).length) {
    written.set(docId, { ...(written.get(docId) || {}), ...update });
    if (APPLY) await ref.set({ ...update, updatedAt: new Date().toISOString(), updatedBy: UPDATED_BY }, { merge: true });
  }
  return true;
}

/** Per-item docs (items subcollection or the old personnel subcollection). */
async function moveFromItemDocs(deptRef, collectionRef, totals, written, idOf) {
  const snap = await collectionRef.get();
  for (const itemDoc of snap.docs) {
    const item = itemDoc.data() || {};
    const present = privateKeysPresent(item);
    if (!present.length) continue;
    totals.people += 1;
    const { privateFields } = splitPersonnelRecord(item);
    const moved = await moveValues(deptRef, idOf(itemDoc, item), privateFields, totals, written);
    // No usable id: only blank keys can go; real values stay until fixed by hand.
    const removable = moved ? present : present.filter((key) => !hasPrivateValue(item[key]));
    if (!removable.length) continue;
    totals.cleaned += 1;
    if (APPLY) await itemDoc.ref.update(Object.fromEntries(removable.map((key) => [key, FieldValue.delete()])));
  }
}

/** The older single record with every item in an `items` array. */
async function moveFromArrayDoc(deptRef, headerRef, items, totals, written) {
  let changed = false;
  const nextItems = [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      nextItems.push(item);
      continue;
    }
    const present = privateKeysPresent(item);
    if (!present.length) {
      nextItems.push(item);
      continue;
    }
    totals.people += 1;
    const { publicRecord, privateFields } = splitPersonnelRecord(item);
    const moved = await moveValues(deptRef, item.id, privateFields, totals, written);
    nextItems.push(moved ? publicRecord : { ...publicRecord, ...privateFields });
    totals.cleaned += 1;
    changed = true;
  }
  if (changed && APPLY) {
    const now = new Date().toISOString();
    await headerRef.update({ items: nextItems, updatedAt: now, updated_at: now, updatedBy: UPDATED_BY });
  }
}

function printTotals(label, totals) {
  if (!totals.people) return;
  console.log(
    `  ${label}: ${totals.people} people with private keys; ${totals.withValues} with values (${totals.values} values); `
      + `${totals.alreadyThere} already stored${totals.differed ? ` (${totals.differed} differ from the list; stored value kept)` : ""}; `
      + `${totals.noId} without a usable id (values left in place); ${totals.cleaned} list records ${APPLY ? "cleaned" : "to clean"}`,
  );
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}`);
  console.log(`Private keys: ${PERSONNEL_PRIVATE_KEYS.join(", ")}\n`);
  let departments = 0;
  let people = 0;
  for (const deptRef of await db.collection("departments").listDocuments()) {
    const written = new Map();
    const lines = [];
    for (const listKey of LIST_KEYS) {
      const headerRef = deptRef.collection("lists").doc(listKey);
      const headerSnap = await headerRef.get();
      if (!headerSnap.exists) continue;
      const header = headerSnap.data() || {};
      const totals = newTotals();
      if (header.storage === "items") {
        await moveFromItemDocs(deptRef, headerRef.collection("items"), totals, written, (d, item) => item.id ?? itemIdFromDocId(d.id));
      } else if (Array.isArray(header.items)) {
        await moveFromArrayDoc(deptRef, headerRef, header.items, totals, written);
      }
      lines.push([`lists/${listKey}`, totals]);
    }
    const legacyTotals = newTotals();
    await moveFromItemDocs(deptRef, deptRef.collection("personnel"), legacyTotals, written, (d, item) => item.id ?? d.id);
    lines.push(["personnel (old subcollection)", legacyTotals]);

    const deptPeople = lines.reduce((sum, [, totals]) => sum + totals.people, 0);
    if (!deptPeople) continue;
    departments += 1;
    people += deptPeople;
    console.log(`${deptRef.id}: ${written.size} private record(s) ${APPLY ? "written" : "to write"}`);
    lines.forEach(([label, totals]) => printTotals(label, totals));
  }
  console.log(`\n${departments} department(s), ${people} personnel record(s) with private keys ${APPLY ? "processed" : "found"}.`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the change.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
