// EMS check-off security rules, against the local Firestore emulator.
// Browsers read assignments, readiness rules and recorded results with a
// check-off permission; nobody writes them (Cloud Functions do).
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
const COLLECTIONS = ["emsCheckoffAssignments", "emsCheckoffSettings", "emsCheckoffResults"];
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();

const USERS = {
  viewer: { dept: A, grant: { viewEmsCheckoffs: true } },
  runner: { dept: A, grant: { runEmsCheckoffs: true } },
  signer: { dept: A, grant: { signOffEmsCheckoffs: true } },
  manager: { dept: A, grant: { manageEmsCheckoffs: true } },
  equipmentOnly: { dept: A, grant: { viewEmsEquipment: true } },
  none: { dept: A, grant: { viewSchedule: true } },
  other: { dept: B, grant: { viewEmsCheckoffs: true, manageEmsCheckoffs: true } },
};

const path = (collection, id = "x1") => `departments/${A}/${collection}/${id}`;

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: FIRESTORE_RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
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
    for (const c of COLLECTIONS) await setDoc(doc(d, path(c)), { id: "x1" });
  });
});

describe("EMS check-off reads", () => {
  it("anyone holding a check-off permission reads assignments, rules and results", async () => {
    for (const uid of ["viewer", "runner", "signer", "manager"]) {
      for (const c of COLLECTIONS) await assertSucceeds(getDoc(doc(db(uid), path(c))));
    }
  });

  it("members without one, equipment-only members, and other departments read nothing", async () => {
    for (const uid of ["none", "equipmentOnly", "other"]) {
      for (const c of COLLECTIONS) await assertFails(getDoc(doc(db(uid), path(c))));
    }
  });

  it("nothing is readable when the plan leaves out EMS Management", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformEntitlements/${A}`), { modules: ["schedule", "apparatus"] });
    });
    for (const c of COLLECTIONS) await assertFails(getDoc(doc(db("manager"), path(c))));
  });
});

describe("EMS check-off writes", () => {
  it("no browser creates, edits or deletes them, whatever its permissions (a forged sign-off included)", async () => {
    for (const uid of ["manager", "signer", "runner", "other"]) {
      for (const c of COLLECTIONS) {
        await assertFails(setDoc(doc(db(uid), path(c, "new1")), { id: "new1" }));
        await assertFails(updateDoc(doc(db(uid), path(c)), { verification: { status: "verified", by: uid } }));
        await assertFails(deleteDoc(doc(db(uid), path(c))));
      }
    }
  });
});
