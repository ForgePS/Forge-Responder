/**
 * Phase 2 inventory (READ-ONLY): legacy top-level collections and every department.
 * Nothing is written.
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; npm run inventory:legacy
 *
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

const LEGACY_COLLECTIONS = [
  "rmsData", "appData", "hydrants", "hydrantInspections", "hydrantFlowTests",
  "dailyActivity", "hoseTests", "preFirePlans", "integrationSettings",
  "emsProtocolsFull", "fireSogsFull", "fireSogDetails", "fireCodesFull",
  "fireCodeIndexFull", "fireCodePdfSections", "fireCodeDocxSections", "hoseInventory",
];
// Keep in sync with RESERVED_GATEWAY_PATHS in src/lib/gatewayRouting.js.
const RESERVED = new Set([
  "demo", "creator-console", "alerts", "admin", "api", "assets", "static", "favicon.ico",
  "robots.txt", "manifest.json", "index.html", "login", "logout", "auth", "health",
  "status", "null", "undefined", "utility-ack",
]);

async function count(ref) {
  try {
    return (await ref.count().get()).data().count;
  } catch (error) {
    return `error: ${error.code || error.message}`;
  }
}

function approxBytes(data) {
  try {
    return JSON.stringify(data).length;
  } catch {
    return 0;
  }
}

async function main() {
  console.log(`\nProject: ${PROJECT_ID}  (read-only inventory)\n`);

  console.log("== Legacy top-level collections ==");
  for (const name of LEGACY_COLLECTIONS) {
    const n = await count(db.collection(name));
    let detail = "";
    if (typeof n === "number" && n > 0) {
      const sample = await db.collection(name).limit(5).get();
      detail = " sample: " + sample.docs.map((d) => {
        const data = d.data();
        const items = Array.isArray(data.items) ? ` items=${data.items.length}` : "";
        const dept = data.departmentId ? ` dept=${data.departmentId}` : "";
        return `${d.id}(${Math.round(approxBytes(data) / 1024)}KB${items}${dept})`;
      }).join(", ");
    }
    console.log(`  ${name.padEnd(22)} ${String(n).padStart(6)}${detail}`);
  }

  console.log("\n== Departments ==");
  const deptRefs = await db.collection("departments").listDocuments();
  const registry = new Map((await db.collection("platformDepartments").get()).docs.map((d) => [d.id, d.data()]));
  const gateways = new Set((await db.collection("rmsGateways").get()).docs.map((d) => d.id));
  const subs = new Map((await db.collection("platformSubscriptions").get()).docs.map((d) => [d.id, d.data()]));
  const allIds = [...new Set([...deptRefs.map((r) => r.id), ...registry.keys()])].sort();

  for (const id of allIds) {
    const ref = db.doc(`departments/${id}`);
    const [profile, subcols] = await Promise.all([
      db.doc(`departments/${id}/profile/main`).get(),
      ref.listCollections(),
    ]);
    const counts = {};
    for (const col of subcols) counts[col.id] = await count(col);
    const listCount = counts.lists ?? 0;
    const reg = registry.get(id) || {};
    const flags = [];
    if (RESERVED.has(id)) flags.push("RESERVED-PATH");
    if (/%|\{|\}/.test(decodeURIComponent(id))) flags.push("PLACEHOLDER-ID");
    if (!registry.has(id)) flags.push("not-in-registry");
    if (!gateways.has(id)) flags.push("no-gateway");
    if (!profile.exists) flags.push("no-profile");
    const userDocs = counts.users ?? 0;
    const dataCols = Object.entries(counts).filter(([k]) => !["users", "roles", "profile", "settings"].includes(k));
    const dataDocs = dataCols.reduce((sum, [, v]) => sum + (typeof v === "number" ? v : 0), 0);
    if (dataDocs === 0) flags.push("NO-DATA");

    console.log(`\n  [${id}] "${profile.data()?.name || reg.name || "?"}" registry=${reg.status || "-"} subscription=${subs.get(id)?.status || "-"}/${subs.get(id)?.planId || "-"} users=${userDocs} lists=${listCount} dataDocs=${dataDocs}`);
    if (flags.length) console.log(`     flags: ${flags.join(", ")}`);
    const top = dataCols.sort((a, b) => (b[1] || 0) - (a[1] || 0)).slice(0, 12);
    if (top.length) console.log(`     collections: ${top.map(([k, v]) => `${k}=${v}`).join(" ")}`);
  }

  // Horn Lake list documents (size check against the 1 MB doc limit).
  console.log("\n== horn-lake-fd lists (largest first) ==");
  const lists = await db.collection("departments/horn-lake-fd/lists").get();
  lists.docs
    .map((d) => ({ id: d.id, kb: Math.round(approxBytes(d.data()) / 1024), items: Array.isArray(d.data().items) ? d.data().items.length : "-" }))
    .sort((a, b) => b.kb - a.kb)
    .slice(0, 15)
    .forEach((l) => console.log(`  ${l.id.padEnd(44)} ${String(l.kb).padStart(5)} KB  items=${l.items}`));

  console.log("\nDone (no writes).\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
