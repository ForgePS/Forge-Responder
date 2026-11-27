// Preplan field survey security rules, against the local Firestore emulator.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const USERS = {
  supervisor: { dept: A, grant: { viewPreplans: true, editPreplans: true }, station: "Station 9" },
  officer: { dept: A, grant: { viewPreplans: true, conductPreplanSurveys: true }, station: "Station 1", shift: "A Shift" },
  bShift: { dept: A, grant: { viewPreplans: true, conductPreplanSurveys: true }, station: "Station 1", shift: "B Shift" },
  named: { dept: A, grant: { viewPreplans: true, conductPreplanSurveys: true }, station: "Station 5" },
  viewer: { dept: A, grant: { viewPreplans: true }, station: "Station 1", shift: "A Shift" },
  outsider: { dept: B, grant: { viewPreplans: true, editPreplans: true, conductPreplanSurveys: true }, station: "Station 1", shift: "A Shift" },
};
const path = (id = "S1") => `departments/${A}/preplanSurveys/${id}`;
const survey = {
  preplanId: "PP1", status: "assigned", assignedStation: "Station 1", assignedShift: "A Shift",
  assignedUserIds: ["named"], assignedUserNames: ["Named"], checklist: [{ id: "a", group: "G", label: "Address" }],
  results: {}, version: 1, assignedBy: "supervisor",
};
// What the app writes for a surveyor's save (only surveyor fields, version + 1).
const work = (extra = {}) => ({ status: "in_progress", results: { a: { result: "confirmed", note: "" } }, notes: "ok", updatedAt: "2026-11-26T12:00:00Z", version: 2, ...extra });

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: FIRESTORE_RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
  let demoRunning = false;
  await env.withSecurityRulesDisabled(async (ctx) => {
    demoRunning = (await getDoc(doc(ctx.firestore(), "rmsGateways/forge-demo"))).exists();
  });
  if (demoRunning) {
    await env.cleanup();
    env = null;
    throw new Error("The offline demo is running on these emulators. Stop it before running the rules tests: they would erase its data.");
  }
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(d, `departments/${u.dept}/users/${uid}`), {
        uid, role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId: u.dept,
        assignedStation: u.station || "", assignedShift: u.shift || "",
      });
      await setDoc(doc(d, `departments/${u.dept}/memberGrants/${uid}`), { permissions: u.grant });
    }
    await setDoc(doc(d, path()), survey);
    await setDoc(doc(d, path("SUB")), { ...survey, status: "submitted", version: 4 });
  });
});

describe("assigning and reviewing", () => {
  it("preplan staff assign, return and accept; surveyors and viewers can't assign", async () => {
    await assertSucceeds(setDoc(doc(db("supervisor"), path("S2")), { ...survey }));
    await assertFails(setDoc(doc(db("officer"), path("S3")), { ...survey }));
    await assertFails(setDoc(doc(db("viewer"), path("S3")), { ...survey }));
    await assertFails(setDoc(doc(db("supervisor"), path("S4")), { ...survey, status: "accepted" }));
    await assertSucceeds(updateDoc(doc(db("supervisor"), path("SUB")), { status: "returned", reviewNotes: "Check the Knox box again", version: 5 }));
  });

  it("other departments can't read or write", async () => {
    await assertFails(getDoc(doc(db("outsider"), path())));
    await assertFails(updateDoc(doc(db("outsider"), path()), work()));
  });
});

describe("surveyors", () => {
  it("the station's shift and named people record results", async () => {
    await assertSucceeds(updateDoc(doc(db("officer"), path()), work()));
    await assertSucceeds(updateDoc(doc(db("named"), path()), work({ version: 3, status: "submitted", submittedBy: "named" })));
  });

  it("another shift, people without the permission, and viewers can't", async () => {
    await assertFails(updateDoc(doc(db("bShift"), path()), work()));
    await assertFails(updateDoc(doc(db("viewer"), path()), work()));
    await assertSucceeds(getDoc(doc(db("viewer"), path())));
  });

  it("can't review their own survey, change the checklist or the station, or skip versions", async () => {
    await assertFails(updateDoc(doc(db("officer"), path()), work({ status: "accepted" })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ checklist: [] })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ assignedStation: "Station 2" })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ reviewNotes: "Looks fine" })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ version: 7 })));
  });

  it("may add themselves to a station survey but not add or remove others", async () => {
    await assertSucceeds(updateDoc(doc(db("officer"), path()), work({ assignedUserIds: ["named", "officer"], assignedUserNames: ["Named", "Officer"] })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ version: 3, assignedUserIds: ["named", "officer", "bShift"] })));
    await assertFails(updateDoc(doc(db("officer"), path()), work({ version: 3, assignedUserIds: [] })));
  });

  it("a full-size save stays within the rules' limits", async () => {
    const results = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`item-${i}`, { result: "changed", note: "x".repeat(200) }]));
    const photos = Array.from({ length: 40 }, (_, i) => ({ id: `pho-${i}`, storagePath: `departments/${A}/preplanSurveys/S1/pho-${i}.jpg`, caption: "c" }));
    const observations = Array.from({ length: 100 }, (_, i) => ({ id: `obs-${i}`, note: "n".repeat(300), location: { lat: 32.3, lng: -90.18 } }));
    const referrals = Array.from({ length: 20 }, (_, i) => ({ id: `ref-${i}`, reason: "r", urgency: "soon" }));
    await assertSucceeds(updateDoc(doc(db("officer"), path()), work({
      results, photos, observations, referrals, assignedUserIds: ["named", "officer"], assignedUserNames: ["Named", "Officer"],
      proposedAnswers: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`field${i}`, "value"])),
      startedAt: "2026-11-26T12:00:00Z", startedBy: "officer",
    })));
  });

  it("can't change a survey once it's sent for review", async () => {
    await assertFails(updateDoc(doc(db("named"), path("SUB")), work({ version: 5 })));
  });
});
