/**
 * Remove the made-up sample records older Fleet screens added to every department
 * just by being opened:
 *   - fuel sites "HQ diesel tank", "HQ gasoline tank", "EV charger bay 1"
 *   - tow providers "Mid-South Heavy Recovery", "Local Light Duty Tow"
 *   - vendors "Mid-South Apparatus" and "Internal Fleet"
 *   - the starter shop "Internal fleet shop" at "Headquarters" is renamed "In-house shop"
 *   - recall "DEMO-2026-001" (brake bulletin)
 *
 * A record is deleted only if nothing in the department refers to it (work orders,
 * fuel entries, roadside events, recall assignments, ...). If something does, it is
 * turned off (active: false) instead, so history stays intact.
 *
 * Default: dry run, changes nothing.
 *   --department=<id>   only this department (default: all)
 *   --apply             make the changes
 *
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/cleanup-fleet-seeds.mjs *> cleanup-fleet-seeds.txt
 *   $env:GOOGLE_CLOUD_PROJECT = "rms-dashboard-7562e"; node scripts/cleanup-fleet-seeds.mjs --apply *> cleanup-fleet-seeds.txt
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "rms-dashboard-7562e";
const arg = (name) => process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
const argValue = (name) => (arg(name) || "").split("=").slice(1).join("=").trim();
const APPLY = Boolean(arg("apply"));
const ONLY = argValue("department");

// collection → seeded ids (and the name each was given, to skip records someone renamed)
const SEEDS = {
  fleetFuelSites: { "site-hq-diesel": "HQ diesel tank", "site-hq-gas": "HQ gasoline tank", "site-ev-bay1": "EV charger bay 1" },
  fleetTowProviders: { "tow-midsouth": "Mid-South Heavy Recovery", "tow-local": "Local Light Duty Tow" },
  fleetVendors: { "vendor-midsouth": "Mid-South Apparatus", "vendor-internal": "Internal Fleet" },
  fleetRecalls: { "recall-demo-brake": null },
};

// Where a seeded id could be referenced.
const REFERENCE_COLLECTIONS = [
  "fleetWorkOrders", "fleetFuelTransactions", "fleetChargingSessions", "fleetRoadsideEvents",
  "fleetAccidentEvents", "fleetPmPrograms", "fleetPmSchedules", "fleetWarranties",
  "fleetWarrantyClaims", "fleetDefects", "fleetTests", "fleetCostEntries",
];

initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

async function referencedIn(deptRef, id) {
  const hits = [];
  for (const name of REFERENCE_COLLECTIONS) {
    const snap = await deptRef.collection(name).get().catch(() => null);
    if (!snap) continue;
    for (const doc of snap.docs) {
      if (JSON.stringify(doc.data()).includes(`"${id}"`)) {
        hits.push(`${name}/${doc.id}`);
        if (hits.length >= 3) return hits;
      }
    }
  }
  return hits;
}

async function main() {
  console.log(`\nProject ${PROJECT_ID}: ${APPLY ? "APPLY" : "dry run (no changes)"}\n`);
  const departments = ONLY ? [db.doc(`departments/${ONLY}`)] : await db.collection("departments").listDocuments();
  let deleted = 0;
  let turnedOff = 0;
  let renamed = 0;
  for (const deptRef of departments) {
    const lines = [];
    // The old starter shop is real enough to keep; give it the new generic name.
    const shopRef = deptRef.collection("fleetShops").doc("shop-internal");
    const shop = await shopRef.get();
    if (shop.exists && shop.data()?.name === "Internal fleet shop" && (shop.data()?.location || "") === "Headquarters") {
      lines.push("  rename  fleetShops/shop-internal to \"In-house shop\" (no location)");
      if (APPLY) await shopRef.set({ name: "In-house shop", location: "", updatedAt: new Date().toISOString() }, { merge: true });
      renamed += 1;
    }
    for (const [collection, ids] of Object.entries(SEEDS)) {
      for (const [id, seededName] of Object.entries(ids)) {
        const ref = deptRef.collection(collection).doc(id);
        const snap = await ref.get();
        if (!snap.exists) continue;
        const data = snap.data() || {};
        if (seededName && data.name && data.name !== seededName) {
          lines.push(`  keep    ${collection}/${id}: renamed to "${data.name}", so someone is using it`);
          continue;
        }
        const refs = await referencedIn(deptRef, id);
        if (refs.length) {
          lines.push(`  turn off ${collection}/${id} (used by ${refs.join(", ")})`);
          if (APPLY && data.active !== false) await ref.set({ active: false, updatedAt: new Date().toISOString() }, { merge: true });
          turnedOff += 1;
        } else {
          lines.push(`  delete  ${collection}/${id} "${data.name || data.campaignNumber || ""}"`);
          if (APPLY) await ref.delete();
          deleted += 1;
        }
      }
    }
    if (lines.length) {
      console.log(`${deptRef.id}:`);
      lines.forEach((line) => console.log(line));
    }
  }
  console.log(`\n${APPLY ? "Done" : "Would"}: delete ${deleted}, turn off ${turnedOff}, rename ${renamed}.`);
  if (!APPLY) console.log("Dry run only. Add --apply to make the changes.\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
