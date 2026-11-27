// Incident ↔ preplan links: security rules, against the local Firestore emulator.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const USERS = {
  crew: { dept: A, grant: { viewPreplans: true } },
  noPreplans: { dept: A, grant: { viewHydrants: true } },
  outsider: { dept: B, grant: { viewPreplans: true } },
};
const linkPath = (id = "PIL-1") => `departments/${A}/preplanIncidentLinks/${id}`;
const link = (uid, extra = {}) => ({
  id: "PIL-1", incidentKey: "active911:A1", incidentAddress: "214 Main St", preplanId: "PP1", revisionId: "R1", revisionNumber: 1,
  matchMethod: "address", linkedBy: uid, linkedByName: uid, linkedAt: "2026-11-26T12:00:00Z", ...extra,
});

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
      await setDoc(doc(d, `departments/${u.dept}/users/${uid}`), { uid, role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId: u.dept });
      await setDoc(doc(d, `departments/${u.dept}/memberGrants/${uid}`), { permissions: u.grant });
    }
    await setDoc(doc(d, `departments/${A}/preplans/PP1`), { id: "PP1", publishedRevisionId: "R2", status: "operational" });
    await setDoc(doc(d, `departments/${A}/preplans/PP2`), { id: "PP2", publishedRevisionId: "R9", status: "operational" });
    await setDoc(doc(d, `departments/${A}/preplanRevisions/R1`), { id: "R1", preplanId: "PP1", status: "superseded" });
    await setDoc(doc(d, `departments/${A}/preplanRevisions/R2`), { id: "R2", preplanId: "PP1", status: "published" });
    await setDoc(doc(d, `departments/${A}/preplanRevisions/R3`), { id: "R3", preplanId: "PP1", status: "draft" });
    await setDoc(doc(d, `departments/${A}/preplanRevisions/R9`), { id: "R9", preplanId: "PP2", status: "published" });
    await setDoc(doc(d, linkPath("PIL-OLD")), link("crew", { id: "PIL-OLD" }));
  });
});

describe("linking a preplan to an incident", () => {
  it("records the approved version, or an earlier approved one used offline", async () => {
    await assertSucceeds(setDoc(doc(db("crew"), linkPath("PIL-2")), link("crew", { id: "PIL-2", revisionId: "R2" })));
    await assertSucceeds(setDoc(doc(db("crew"), linkPath("PIL-3")), link("crew", { id: "PIL-3", revisionId: "R1" })));
  });

  it("not a draft, not another preplan's version, not as someone else, not without preplan access or from another department", async () => {
    await assertFails(setDoc(doc(db("crew"), linkPath("PIL-4")), link("crew", { revisionId: "R3" })));
    await assertFails(setDoc(doc(db("crew"), linkPath("PIL-4")), link("crew", { revisionId: "R9" })));
    await assertFails(setDoc(doc(db("crew"), linkPath("PIL-4")), link("crew", { revisionId: "R-missing" })));
    await assertFails(setDoc(doc(db("crew"), linkPath("PIL-4")), link("someoneElse")));
    await assertFails(setDoc(doc(db("noPreplans"), linkPath("PIL-4")), link("noPreplans")));
    await assertFails(setDoc(doc(db("outsider"), linkPath("PIL-4")), link("outsider")));
  });

  it("a link is history: it can't be changed or deleted", async () => {
    await assertFails(updateDoc(doc(db("crew"), linkPath("PIL-OLD")), { revisionId: "R2" }));
    await assertFails(deleteDoc(doc(db("crew"), linkPath("PIL-OLD"))));
  });

  it("people with preplan access read links; others don't", async () => {
    await assertSucceeds(getDocs(collection(db("crew"), `departments/${A}/preplanIncidentLinks`)));
    await assertSucceeds(getDoc(doc(db("crew"), linkPath("PIL-missing"))));
    await assertFails(getDocs(collection(db("noPreplans"), `departments/${A}/preplanIncidentLinks`)));
    await assertFails(getDoc(doc(db("outsider"), linkPath("PIL-OLD"))));
  });
});
