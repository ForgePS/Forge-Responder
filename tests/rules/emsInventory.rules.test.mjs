// EMS supply inventory security rules, against the local Firestore emulator.
// Browsers read with an EMS inventory permission; nobody writes (Cloud Functions do).
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
let env;

const db = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true }).firestore();

const USERS = {
  viewer: { dept: A, grant: { viewEmsInventory: true } },
  crew: { dept: A, grant: { useEmsSupplies: true } },
  manager: { dept: A, grant: { manageEmsInventory: true, viewEmsAudit: true, manageEmsSettings: true } },
  auditor: { dept: A, grant: { viewEmsAudit: true } },
  none: { dept: A, grant: { viewSchedule: true } },
  other: { dept: B, grant: { viewEmsInventory: true, manageEmsInventory: true, viewEmsAudit: true } },
};

const COLLECTIONS = ["emsInventoryItems", "emsInventoryLocations", "emsInventoryBalances", "emsInventoryTransactions", "emsInventoryCounts"];
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
    for (const c of COLLECTIONS) await setDoc(doc(d, path(c)), { id: "x1", createdBy: "crew" });
    await setDoc(doc(d, `departments/${A}/emsAuditEvents/e1`), { action: "ems.inventory.usage" });
    await setDoc(doc(d, `departments/${A}/emsSettings/main`), { rotationPolicy: "fefo" });
  });
});

describe("EMS inventory reads", () => {
  it("anyone holding an EMS inventory permission reads stock, catalog, ledger and counts", async () => {
    for (const uid of ["viewer", "crew", "manager"]) {
      for (const c of COLLECTIONS) await assertSucceeds(getDoc(doc(db(uid), path(c))));
      await assertSucceeds(getDoc(doc(db(uid), `departments/${A}/emsSettings/main`)));
    }
  });

  it("members without one, and other departments, read nothing", async () => {
    for (const uid of ["none", "other", "auditor"]) {
      for (const c of COLLECTIONS) await assertFails(getDoc(doc(db(uid), path(c))));
    }
    await assertFails(getDoc(doc(db("other"), `departments/${A}/emsSettings/main`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path("emsInventoryBalances"))));
  });

  it("the audit history needs viewEmsAudit", async () => {
    await assertSucceeds(getDoc(doc(db("auditor"), `departments/${A}/emsAuditEvents/e1`)));
    await assertSucceeds(getDoc(doc(db("manager"), `departments/${A}/emsAuditEvents/e1`)));
    await assertFails(getDoc(doc(db("viewer"), `departments/${A}/emsAuditEvents/e1`)));
    await assertFails(getDoc(doc(db("other"), `departments/${A}/emsAuditEvents/e1`)));
  });

  it("nothing is readable when the plan leaves out EMS Management", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `platformEntitlements/${A}`), { modules: ["dashboard", "administration"] }));
    await assertFails(getDoc(doc(db("manager"), path("emsInventoryBalances"))));
    await assertFails(getDoc(doc(db("manager"), `departments/${A}/emsAuditEvents/e1`)));
  });
});

describe("EMS inventory writes", () => {
  it("no browser can create, edit or delete inventory records, the ledger or the audit history", async () => {
    for (const uid of ["crew", "manager", "other"]) {
      for (const c of [...COLLECTIONS, "emsAuditEvents", "emsSettings"]) {
        await assertFails(setDoc(doc(db(uid), path(c, "new1")), { id: "new1" }));
      }
      await assertFails(updateDoc(doc(db(uid), path("emsInventoryBalances")), { onHand: 999 }));
      await assertFails(updateDoc(doc(db(uid), path("emsInventoryTransactions")), { quantity: 0 }));
      await assertFails(deleteDoc(doc(db(uid), path("emsInventoryTransactions"))));
      await assertFails(deleteDoc(doc(db(uid), `departments/${A}/emsAuditEvents/e1`)));
    }
  });
});
