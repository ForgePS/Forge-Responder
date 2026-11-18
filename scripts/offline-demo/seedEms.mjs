/**
 * Offline demo only: switch the EMS patient care reports on for the Riverside demo.
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
import { getValue, newPcr, setLeaf } from "../../src/lib/nemsis/pcrModel.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEPARTMENT_ID = "forge-demo";
const PROJECT_ID = "demo-forge-rms";
const ACTIVE911_LIST = "hlfd-rms-active911-alerts";

// Demo-only grants: production roles keep these off until a department chooses who sees patient data.
const ROLE_GRANTS = {
  fireChief: ["editPcrs", "viewAllPcrs", "unlockPcrs", "exportPcrs"],
  battalionChief: ["editPcrs", "viewAllPcrs", "unlockPcrs", "exportPcrs"],
  companyOfficer: ["editPcrs", "viewAllPcrs"],
  firefighter: ["editPcrs"],
};

/** Demo form settings: the AI narrator on, and a department drop-down for destinations (all invented). */
const EMS_FORM = {
  aiNarrative: true,
  sections: {},
  fields: {
    "eDisposition.01": { label: "Destination", choices: ["Riverside Regional Medical Center", "St. Mary's Hospital", "Riverside Children's Hospital"] },
    "eNarrative.01": { help: "Write it yourself or use the AI narrator." },
  },
};

const EMS_SETTINGS = { stateAgencyId: "37-DEMO-0001", agencyNumber: "DEMO01", agencyName: "Riverside Fire & EMS", state: "37" };

function loadSchema() {
  const dir = path.join(ROOT, "src", "data", "nemsis", "3.5.1");
  const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  return createNemsisSchema({ structure: read("structure.json"), types: read("types.json"), elements: read("elements.json"), enumerations: read("enumerations.json"), meta: read("meta.json") });
}

/** "2026-11-15T14:03:05-06:00" moved by `days` (keeps the written offset). */
function shiftDays(value, days) {
  const m = /^(.*)([+-]\d{2}:\d{2})$/.exec(String(value));
  if (!m) return value;
  const t = new Date(`${m[1]}Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.toISOString().slice(0, 19)}${m[2]}`;
}

function shiftAllTimes(node, days) {
  if (Array.isArray(node)) return node.map((n) => shiftAllTimes(n, days));
  if (node && typeof node === "object") return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shiftAllTimes(v, days)]));
  return typeof node === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(node) ? shiftDays(node, days) : node;
}

function daysBetween(fromIso, to = new Date()) {
  return Math.max(0, Math.floor((to.getTime() - Date.parse(fromIso)) / 86_400_000));
}

function sampleReports(schema, crewUid, crewName) {
  const fixture = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "nemsis", "pcr-chest-pain.json"), "utf8"));
  // Move the sample call to yesterday (and two days ago), keeping its times of day.
  const base = daysBetween("2026-11-15T12:00:00Z");
  const reports = [];
  const make = ({ uuid, number, days, status, edit = (p) => p, patient }) => {
    let nemsis = edit(shiftAllTimes({ ...fixture.data, attrs: { UUID: uuid } }, base + days));
    nemsis = setLeaf(schema, nemsis, "eRecord.01", number);
    nemsis = setLeaf(schema, nemsis, "eResponse.01", EMS_SETTINGS.agencyNumber);
    nemsis = setLeaf(schema, nemsis, "eResponse.02", EMS_SETTINGS.agencyName);
    if (patient) {
      nemsis = setLeaf(schema, nemsis, "ePatient.02", patient.last);
      nemsis = setLeaf(schema, nemsis, "ePatient.03", patient.first);
    }
    const notified = getValue(schema, nemsis, "eTimes.03") || getValue(schema, nemsis, "eTimes.01") || new Date(Date.now() - 3 * 3600_000).toISOString();
    const at = new Date(Date.parse(notified) + 90 * 60_000).toISOString();
    reports.push({
      id: uuid,
      uuid,
      number,
      status,
      crewUids: [crewUid],
      incidentNumber: getValue(schema, nemsis, "eResponse.03") || "",
      unit: "Medic 1",
      nemsis,
      createdAt: at,
      createdByUid: crewUid,
      createdByName: crewName,
      updatedAt: at,
      updatedByUid: crewUid,
      updatedByName: crewName,
      source: "offline-demo",
      ...(status === "posted" ? { postedAt: at, postedByUid: crewUid, postedByName: crewName } : {}),
    });
  };
  make({ uuid: "0d3e8f1a-5b7c-4a1e-9c2d-000000000001", number: "DEMO-PCR-0001", days: -1, status: "posted" });
  // Posted with errors the server check will find: the unit-notified time is missing.
  make({
    uuid: "0d3e8f1a-5b7c-4a1e-9c2d-000000000002", number: "DEMO-PCR-0002", days: 0, status: "posted",
    patient: { first: "Jordan", last: "Samplecase" },
    edit: (p) => {
      const { eTimes, ...rest } = p;
      const { "eTimes.03": _notified, ...times } = eTimes;
      return { ...rest, eTimes: times };
    },
  });
  // A draft the crew is still charting: dispatch and times only.
  const draftUuid = "0d3e8f1a-5b7c-4a1e-9c2d-000000000003";
  const draft = newPcr(schema, {
    uuid: draftUuid, number: "DEMO-PCR-0003", softwareVersion: "demo",
    agency: { number: EMS_SETTINGS.agencyNumber, name: EMS_SETTINGS.agencyName },
    unit: { callSign: "MEDIC 1", vehicleNumber: "M1" },
    cad: { notified: shiftDays("2026-11-15T09:12:00-06:00", base), address: "220 River Rd", stateCode: "37" },
  });
  reports.push({
    id: draftUuid, uuid: draftUuid, number: "DEMO-PCR-0003", status: "draft", crewUids: [crewUid], incidentNumber: "", unit: "Medic 1",
    nemsis: draft, createdAt: new Date().toISOString(), createdByUid: crewUid, createdByName: crewName,
    updatedAt: new Date().toISOString(), updatedByUid: crewUid, updatedByName: crewName, source: "offline-demo",
  });
  return reports;
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
