/**
 * Remove records that the FORGE Field end-to-end tests (scripts/field-e2e)
 * left in the demo department (forge-demo), so the demo shows only sample data.
 *
 * A record is a test record when its contents include one of the phrases the
 * tests type (TEST_MARKERS). Records that point at a test record (for example
 * a preplan revision's preplanId) are removed with it.
 *
 * Only touches departments/forge-demo. Prints ids and short titles only.
 * Default: dry run, changes nothing. --apply deletes.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/clean-demo-test-records.mjs *> clean-demo.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/clean-demo-test-records.mjs --apply *> clean-demo.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const APPLY = process.argv.includes("--apply");
const DEMO_DEPARTMENT_ID = "forge-demo";

// Phrases typed by scripts/field-e2e/field-offline.mjs and field-v2.mjs.
export const TEST_MARKERS = [
  "Riverside Feed Store ",
  "200 Station Ave ",
  "I-55 NB mile 112",
  "Bottom panel bent, door drifts when open. Field test",
  "Steamer cap missing, threads exposed.",
  "Blocked exit door ",
  "Faces away from street ",
  "Knox box moved to east entrance ",
  "Alarm activation, no fire. ",
  "Two-vehicle MVA, no entrapment",
  "Field log ",
  "FIELD-EDIT ",
  "DESK-EDIT ",
];

// Fields that link one record to another.
const LINK_FIELDS = ["preplanId", "reportId", "inspectionId", "workOrderId", "defectId", "parentId", "sourceId", "nerisReportId", "occupancyId"];

// Collections never touched (configuration, people, access).
const SKIP_COLLECTIONS = new Set(["users", "roles", "memberGrants", "profile", "settings", "public", "counters", "integrations", "personnelPrivate"]);

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

function titleOf(data) {
  return String(data.title || data.name || data.address || data.equipment || data.incidentType || data.summary || "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

async function walk(ref, out) {
  for (const col of await ref.listCollections()) {
    if (ref.path.split("/").length === 2 && SKIP_COLLECTIONS.has(col.id)) continue;
    const snap = await col.get();
    for (const doc of snap.docs) {
      out.push(doc);
      await walk(doc.ref, out);
    }
  }
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}, department ${DEMO_DEPARTMENT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const docs = [];
  await walk(db.collection("departments").doc(DEMO_DEPARTMENT_ID), docs);

  const matched = new Map();
  for (const doc of docs) {
    // List headers can hold a whole list as an array: never delete those, only single items.
    if (doc.ref.parent.id === "lists") continue;
    const text = JSON.stringify(doc.data() || {});
    if (TEST_MARKERS.some((marker) => text.includes(marker))) matched.set(doc.ref.path, doc);
  }

  // Records that point at a matched record go with it.
  const matchedIds = new Set([...matched.values()].map((doc) => doc.id));
  for (const doc of docs) {
    if (matched.has(doc.ref.path)) continue;
    const data = doc.data() || {};
    if (LINK_FIELDS.some((field) => typeof data[field] === "string" && matchedIds.has(data[field]))) {
      matched.set(doc.ref.path, doc);
    }
  }

  const byCollection = {};
  for (const doc of matched.values()) {
    const collection = doc.ref.parent.path.replace(`departments/${DEMO_DEPARTMENT_ID}/`, "");
    (byCollection[collection] ||= []).push(doc);
  }
  for (const [collection, list] of Object.entries(byCollection).sort()) {
    console.log(`${collection}: ${list.length}`);
    for (const doc of list) console.log(`  ${doc.id}  ${titleOf(doc.data() || {})}`);
  }
  console.log(`\nScanned ${docs.length} records, ${matched.size} test records found.`);

  if (!APPLY) {
    console.log("Dry run: nothing deleted. Re-run with --apply to delete.");
    return;
  }
  const writer = db.bulkWriter();
  for (const doc of matched.values()) writer.delete(doc.ref);
  await writer.close();
  console.log(`Deleted ${matched.size} records.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
