// EMS medication security rules (slice E4), against the local Firestore emulator.
// Medications share the inventory collections; members with a medication permission
// read them, and read recalls and lot holds. Nobody writes them (Cloud Functions do).
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
const NEW = ["emsLotHolds", "emsMedicationRecalls"];
const SHARED = ["emsInventoryItems", "emsInventoryBalances", "emsInventoryTransactions"];
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();

const USERS = {
  medViewer: { dept: A, grant: { viewEmsMedications: true } },
  medUser: { dept: A, grant: { useEmsMedications: true } },
  medManager: { dept: A, grant: { manageEmsMedications: true } },
  supplyViewer: { dept: A, grant: { viewEmsInventory: true } },
  checkoffsOnly: { dept: A, grant: { viewEmsCheckoffs: true } },
  none: { dept: A, grant: { viewSchedule: true } },
  other: { dept: B, grant: { viewEmsMedications: true, manageEmsMedications: true } },
};

const path = (c, id = "x1") => `departments/${A}/${c}/${id}`;

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
    for (const c of [...NEW, ...SHARED]) await setDoc(doc(d, path(c)), { id: "x1", status: "active", itemClass: "medication" });
  });
});

describe("EMS medication reads", () => {
  it("medication permissions read medications, recalls and holds; so do supply readers", async () => {
    for (const uid of ["medViewer", "medUser", "medManager", "supplyViewer"]) {
      for (const c of [...NEW, ...SHARED]) await assertSucceeds(getDoc(doc(db(uid), path(c))));
    }
    await assertSucceeds(getDocs(query(collection(db("medViewer"), `departments/${A}/emsLotHolds`), where("status", "==", "active"))));
  });

  it("members without one, and other departments, read nothing", async () => {
    for (const uid of ["checkoffsOnly", "none", "other"]) {
      for (const c of [...NEW, ...SHARED]) await assertFails(getDoc(doc(db(uid), path(c))));
    }
  });

  it("nothing is readable when the plan leaves out EMS Management", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformEntitlements/${A}`), { modules: ["schedule"] });
    });
    for (const c of NEW) await assertFails(getDoc(doc(db("medManager"), path(c))));
  });
});

describe("EMS medication writes", () => {
  it("no browser places or releases a hold, or writes a recall (a forged release included)", async () => {
    for (const uid of ["medManager", "other"]) {
      for (const c of NEW) {
        await assertFails(setDoc(doc(db(uid), path(c, "new1")), { id: "new1" }));
        await assertFails(updateDoc(doc(db(uid), path(c)), { status: "released" }));
        await assertFails(deleteDoc(doc(db(uid), path(c))));
      }
    }
  });
});
