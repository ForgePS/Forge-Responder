// Offline preplan device register: security rules, against the local Firestore emulator.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();
const USERS = {
  crew: { dept: A, grant: { viewPreplans: true } },
  other: { dept: A, grant: { viewPreplans: true } },
  manager: { dept: A, grant: { viewPreplans: true, managePreplanConfig: true } },
  noPreplans: { dept: A, grant: { viewHydrants: true } },
  outsider: { dept: B, grant: { viewPreplans: true, managePreplanConfig: true } },
};
const path = (id = "PPD-1") => `departments/${A}/preplanOfflineDevices/${id}`;
const device = (uid, extra = {}) => ({ id: "PPD-1", uid, userName: uid, label: "Chrome on Android", status: "active", packages: [], lastSyncAt: "2026-11-26T12:00:00Z", ...extra });
const report = { packages: [{ preplanId: "PP1", revisionId: "R1", syncedAt: "2026-11-26T13:00:00Z", expiresAt: "2026-12-10T13:00:00Z" }], lastSyncAt: "2026-11-26T13:00:00Z", updatedAt: "2026-11-26T13:00:00Z" };
const revoke = (by) => ({ status: "revoked", revokedAt: "2026-11-26T14:00:00Z", revokedBy: by, revokedByName: by, revokeReason: "Lost phone", updatedAt: "2026-11-26T14:00:00Z" });

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
    await setDoc(doc(d, path("PPD-CREW")), { ...device("crew"), id: "PPD-CREW" });
    await setDoc(doc(d, path("PPD-GONE")), { ...device("crew"), id: "PPD-GONE", ...revoke("manager") });
  });
});

describe("registering", () => {
  it("a person with preplan access registers their own active device", async () => {
    await assertSucceeds(getDoc(doc(db("crew"), path("PPD-1"))), "checking a device that isn't registered yet");
    await assertSucceeds(setDoc(doc(db("crew"), path()), device("crew")));
  });

  it("not for someone else, not already revoked, not without preplan access, not in another department", async () => {
    await assertFails(setDoc(doc(db("crew"), path()), device("other")));
    await assertFails(setDoc(doc(db("crew"), path()), device("crew", { status: "revoked" })));
    await assertFails(setDoc(doc(db("crew"), path()), device("crew", { id: "PPD-OTHER" })));
    await assertFails(setDoc(doc(db("noPreplans"), path()), device("noPreplans")));
    await assertFails(setDoc(doc(db("outsider"), path()), device("outsider")));
  });
});

describe("reporting and revoking", () => {
  it("the device reports what it holds, but can't change who owns it or revive itself", async () => {
    await assertSucceeds(updateDoc(doc(db("crew"), path("PPD-CREW")), report));
    await assertFails(updateDoc(doc(db("crew"), path("PPD-CREW")), { ...report, uid: "other" }));
    await assertFails(updateDoc(doc(db("crew"), path("PPD-GONE")), report));
    await assertFails(updateDoc(doc(db("crew"), path("PPD-GONE")), { status: "active", updatedAt: "2026-11-27T00:00:00Z" }));
    await assertFails(updateDoc(doc(db("other"), path("PPD-CREW")), report));
  });

  it("the owner or a preplan manager revokes; others can't", async () => {
    await assertFails(updateDoc(doc(db("other"), path("PPD-CREW")), revoke("other")));
    await assertFails(updateDoc(doc(db("manager"), path("PPD-CREW")), revoke("crew")), "revokedBy must be the person revoking");
    await assertFails(updateDoc(doc(db("outsider"), path("PPD-CREW")), revoke("outsider")));
    await assertSucceeds(updateDoc(doc(db("manager"), path("PPD-CREW")), revoke("manager")));
  });

  it("the owner can revoke their own device", async () => {
    await assertSucceeds(updateDoc(doc(db("crew"), path("PPD-CREW")), revoke("crew")));
  });
});

describe("reading", () => {
  it("people see their own devices; managers see all; others and other departments see none", async () => {
    await assertSucceeds(getDoc(doc(db("crew"), path("PPD-CREW"))));
    await assertSucceeds(getDocs(query(collection(db("crew"), `departments/${A}/preplanOfflineDevices`), where("uid", "==", "crew"))));
    await assertFails(getDoc(doc(db("other"), path("PPD-CREW"))));
    await assertFails(getDocs(collection(db("other"), `departments/${A}/preplanOfflineDevices`)));
    await assertSucceeds(getDocs(collection(db("manager"), `departments/${A}/preplanOfflineDevices`)));
    await assertFails(getDoc(doc(db("outsider"), path("PPD-CREW"))));
  });
});
