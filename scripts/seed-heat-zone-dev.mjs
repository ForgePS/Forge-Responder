/**
 * DEVELOPMENT ONLY. Adds clearly labelled sample district and response-zone
 * boundaries for Heat Zone Analytics to the demo / staging departments, around
 * the demo incident area (src/data/demoNerisReports.js), then recalculates
 * their analytics. Uses the existing demo incident data; adds no incidents.
 *
 * Refuses to run anywhere except the local emulator project (demo-forge-rms)
 * or the staging project (forge-rms-staging), and only touches demo/staging
 * departments.
 *
 *   # emulator (firebase emulators running)
 *   $env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"; $env:GOOGLE_CLOUD_PROJECT = "demo-forge-rms"; node scripts/seed-heat-zone-dev.mjs
 *   # staging
 *   $env:GOOGLE_CLOUD_PROJECT = "forge-rms-staging"; node scripts/seed-heat-zone-dev.mjs
 */
import { createRequire } from "node:module";

const require = createRequire(new URL("../functions/package.json", import.meta.url));
// Same firebase-admin copy as the functions code (FieldValue must match the SDK instance).
const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");
const { rebuildDepartment } = require("./lib/heatZone/service.js");
const { validateGeometry } = require("./lib/heatZone/geo.js");

const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || "";
const ALLOWED = {
  "demo-forge-rms": ["forge-demo"],
  "forge-rms-staging": ["staging-east", "staging-west"],
};
if (!ALLOWED[PROJECT_ID]) {
  console.error(`Refusing to run: GOOGLE_CLOUD_PROJECT is "${PROJECT_ID}". Only ${Object.keys(ALLOWED).join(" or ")} are allowed.`);
  process.exit(1);
}
if (PROJECT_ID === "demo-forge-rms" && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to run: set FIRESTORE_EMULATOR_HOST for the emulator project.");
  process.exit(1);
}

initializeApp(PROJECT_ID === "demo-forge-rms" ? { projectId: PROJECT_ID } : { credential: applicationDefault(), projectId: PROJECT_ID });
const db = getFirestore();

// Demo incidents are generated around this point ± 0.035° (src/data/demoNerisReports.js).
const CENTER = { lat: 32.3601, lng: -89.4762 };
const R = 0.04;
const box = (s, w, n, e) => ({ type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] });
const { lat, lng } = CENTER;

const SAMPLE = [
  { id: "dev-district-1", name: "District 1 (sample)", kind: "district", color: "#25a194", geometry: box(lat, lng - R, lat + R, lng) },
  { id: "dev-district-2", name: "District 2 (sample)", kind: "district", color: "#2563eb", geometry: box(lat, lng, lat + R, lng + R) },
  { id: "dev-district-3", name: "District 3 (sample)", kind: "district", color: "#d97706", geometry: box(lat - R, lng - R, lat, lng) },
  { id: "dev-district-4", name: "District 4 (sample)", kind: "district", color: "#9333ea", geometry: box(lat - R, lng, lat, lng + R) },
  { id: "dev-zone-downtown", name: "Downtown response zone (sample)", kind: "zone", color: "#e11d48", geometry: box(lat - 0.012, lng - 0.015, lat + 0.012, lng + 0.015) },
];

async function main() {
  for (const departmentId of ALLOWED[PROJECT_ID]) {
    const dept = await db.doc(`departments/${departmentId}/profile/main`).get();
    if (!dept.exists) {
      console.log(`${departmentId}: no profile, skipped`);
      continue;
    }
    for (const zone of SAMPLE) {
      const check = validateGeometry(zone.geometry);
      if (!check.ok) throw new Error(`${zone.name}: ${check.error}`);
      await db.doc(`departments/${departmentId}/heatZoneZones/${zone.id}`).set({
        name: zone.name, kind: zone.kind, color: zone.color, priority: 0, active: true,
        geometryJson: JSON.stringify(zone.geometry), geometryType: "Polygon", bbox: check.bbox,
        departmentId, sample: true, updatedAt: Date.now(), updatedBy: "seed-heat-zone-dev",
      });
    }
    // Open dashboards redraw boundaries when zonesVersion changes.
    await db.doc(`departments/${departmentId}/heatZoneMeta/state`).set({ zonesVersion: FieldValue.increment(1) }, { merge: true });
    const counts = await rebuildDepartment(db, departmentId, { reason: "dev-seed" });
    console.log(`${departmentId}: ${SAMPLE.length} sample boundaries, ${counts.projected} incidents analysed`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
