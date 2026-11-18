/**
 * Offline demo only: switch the EMS patient care reports on for the Riverside demo. The roles, settings and sample
 * reports are shared with the online demo (src/data/demoEms.js, src/lib/demoEms.js).
 *
 *   - report permissions for the demo roles (Fire Chief: all; Battalion Chief: all; Captain: chart + review;
 *     Firefighter: chart)
 *   - EMS agency settings (made-up IDs) so NEMSIS export works
 *   - form settings: the AI narrator on, a destination drop-down
 *   - sample reports for the demo crew: posted, posted with NEMSIS errors ("Needs review"), and a draft
 *   - a few recent Active911-style dispatches so FORGE FIELD can start a report from one
 *
 * Every patient, address and ID here is invented. Runs against the LOCAL emulators only (project
 * demo-forge-rms): from seed.mjs on each demo start, or on its own while the demo is running:
 *
 *   node scripts/offline-demo/seedEms.mjs
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNemsisSchema } from "../../src/lib/nemsis/schema.js";
import { DEMO_EMS_FORM as EMS_FORM, DEMO_EMS_SETTINGS as EMS_SETTINGS, DEMO_PCR_ROLE_GRANTS as ROLE_GRANTS, buildDemoPcrs } from "../../src/data/demoEms.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPARTMENT_ID = "forge-demo";
const PROJECT_ID = "demo-forge-rms";
const ACTIVE911_LIST = "hlfd-rms-active911-alerts";

function loadSchema() {
  const dir = path.join(ROOT, "src", "data", "nemsis", "3.5.1");
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  return createNemsisSchema({ structure: read("structure.json"), types: read("types.json"), elements: read("elements.json"), enumerations: read("enumerations.json"), meta: read("meta.json") });
}

function sampleReports(schema, crewUid, crewName) {
  const sample = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "demoPcrSample.json"), "utf8"));
  return buildDemoPcrs(schema, { sample, crewUid, crewName, source: "offline-demo" });
}

function sampleDispatches(now = new Date()) {
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  return [
    { id: "demo-a911-1", description: "Breathing problems", address: "415 Oak Ave", city: "Riverside", state: "NC", units: "M1, E1", priority: "1", cadCode: "6D1", sentAt: ago(12), latitude: 35.7801, longitude: -78.6412, crossStreet: "4th St", source: "Active911", responses: [] },
    { id: "demo-a911-2", description: "Fall - hip injury", address: "88 Mill Creek Ln", city: "Riverside", state: "NC", units: "M1", priority: "2", cadCode: "17B1", sentAt: ago(95), latitude: 35.7712, longitude: -78.6299, crossStreet: "", source: "Active911", responses: [] },
    { id: "demo-a911-3", description: "Motor vehicle collision", address: "US-64 at Exit 12", city: "Riverside", state: "NC", units: "E1, M1, R1", priority: "1", cadCode: "29D1", sentAt: ago(240), latitude: 35.7905, longitude: -78.6011, crossStreet: "", source: "Active911", responses: [] },
  ].map((alert) => ({ ...alert, syncedAt: now.toISOString() }));
}

/**
 * The functions' helpers (memberGrants, listStore) use the firebase-admin installed under functions/, which can't
 * be mixed with the root copy, so this opens its own connection with that copy (emulator settings from env).
 */
function functionsFirestore() {
  const fnRequire = createRequire(path.join(ROOT, "functions", "package.json"));
  const { initializeApp, getApps } = fnRequire("firebase-admin/app");
  const { getFirestore } = fnRequire("firebase-admin/firestore");
  const app = getApps().find((a) => a.name === "offline-ems") || initializeApp({ projectId: PROJECT_ID }, "offline-ems");
  return getFirestore(app);
}

export async function seedOfflineEms() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("seedOfflineEms only runs against the emulators");
  const db = functionsFirestore();
  const dept = db.collection("departments").doc(DEPARTMENT_ID);
  const now = new Date().toISOString();

  for (const [roleId, keys] of Object.entries(ROLE_GRANTS)) {
    const ref = dept.collection("roles").doc(roleId);
    if (!(await ref.get()).exists) continue;
    await ref.set({ permissions: Object.fromEntries(keys.map((k) => [k, true])), updatedAt: now }, { merge: true });
  }
  const memberGrants = require("../../functions/lib/memberGrants.js");
  await memberGrants.refreshDepartment(db, DEPARTMENT_ID);
  // Saved demo data can carry a module list from before EMS existed: recompute it with the current code.
  const entitlements = require("../../functions/lib/entitlements.js");
  await entitlements.refreshDepartment(db, DEPARTMENT_ID);

  await dept.collection("settings").doc("ems").set({ ...EMS_SETTINGS, updatedAt: now, updatedBy: "offline-demo" }, { merge: true });
  // Only the first time: keep changes made to the form during a demo.
  const formRef = dept.collection("settings").doc("emsForm");
  if (!(await formRef.get()).exists) await formRef.set({ ...EMS_FORM, updatedAt: now, updatedBy: "offline-demo" });

  const byFlag = await dept.collection("users").where("isDemoUser", "==", true).limit(1).get();
  const byEmail = byFlag.empty ? await dept.collection("users").where("email", "==", "demo@forge.demo").limit(1).get() : byFlag;
  const crew = byEmail.docs[0];
  let reports = 0;
  if (crew) {
    const schema = loadSchema();
    for (const report of sampleReports(schema, crew.id, "Chief A. Sample")) {
      const ref = dept.collection("pcrs").doc(report.id);
      if ((await ref.get()).exists) continue; // keep what was changed during a demo
      await ref.set(JSON.parse(JSON.stringify(report)));
      reports += 1;
    }
    // Posted reports get the server NEMSIS check, as the checkPcrOnPost trigger does (done here too, so it
    // doesn't depend on the functions emulator having that trigger loaded).
    const pcrCheck = require("../../functions/lib/nemsis/pcrCheck.js");
    const posted = await dept.collection("pcrs").where("status", "==", "posted").get();
    for (const snap of posted.docs) {
      const pcr = snap.data();
      if (pcr.nemsisCheck || pcr.source !== "offline-demo") continue;
      const result = await pcrCheck.runPcrCheck({ pcr, settings: EMS_SETTINGS });
      await snap.ref.set({ nemsisCheck: pcrCheck.checkStamp(result, { at: new Date().toISOString(), trigger: "post", postedAt: pcr.postedAt || "" }) }, { merge: true });
    }
  }

  const { replaceListItems } = require("../../functions/lib/listStore.js");
  await replaceListItems(db, DEPARTMENT_ID, ACTIVE911_LIST, sampleDispatches(), { updatedBy: "offline-demo" });

  return { reports, dispatches: 3 };
}

// Standalone: against the running offline demo's emulators.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  const result = await seedOfflineEms();
  console.log(`[offline demo] EMS on: ${result.reports} sample report(s) added, ${result.dispatches} dispatches.`);
  process.exit(0);
}
