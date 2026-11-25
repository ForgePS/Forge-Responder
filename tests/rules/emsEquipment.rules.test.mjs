// EMS equipment security rules, against the local Firestore emulator.
// Browsers read with an equipment permission; nobody writes (Cloud Functions do).
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
  viewer: { dept: A, grant: { viewEmsEquipment: true } },
  checker: { dept: A, grant: { checkEmsEquipment: true } },
  mover: { dept: A, grant: { transferEmsEquipment: true } },
  manager: { dept: A, grant: { manageEmsEquipment: true } },
  supplies: { dept: A, grant: { viewEmsInventory: true } },
  none: { dept: A, grant: { viewSchedule: true } },
  other: { dept: B, grant: { viewEmsEquipment: true, manageEmsEquipment: true } },
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
    await setDoc(doc(d, path("emsEquipment")), { id: "x1", name: "Monitor", status: "assigned" });
    await setDoc(doc(d, path("emsEquipmentEvents")), { equipmentId: "x1", type: "registered" });
    await setDoc(doc(d, path("emsEquipmentMigrations")), { status: "applied" });
    await setDoc(doc(d, path("emsInventoryLocations")), { name: "Supply room" });
  });
});

describe("EMS equipment reads", () => {
  it("anyone holding an equipment permission reads equipment and its history", async () => {
    for (const uid of ["viewer", "checker", "mover", "manager"]) {
      await assertSucceeds(getDoc(doc(db(uid), path("emsEquipment"))));
      await assertSucceeds(getDoc(doc(db(uid), path("emsEquipmentEvents"))));
    }
  });

  it("equipment readers also see storage location names", async () => {
    await assertSucceeds(getDoc(doc(db("viewer"), path("emsInventoryLocations"))));
    await assertSucceeds(getDoc(doc(db("supplies"), path("emsInventoryLocations"))));
    await assertFails(getDoc(doc(db("none"), path("emsInventoryLocations"))));
  });

  it("members without one, supply-only members, and other departments read nothing", async () => {
    for (const uid of ["none", "supplies", "other"]) {
      await assertFails(getDoc(doc(db(uid), path("emsEquipment"))));
      await assertFails(getDoc(doc(db(uid), path("emsEquipmentEvents"))));
    }
  });

  it("only managers read import reports", async () => {
    await assertSucceeds(getDoc(doc(db("manager"), path("emsEquipmentMigrations"))));
    for (const uid of ["viewer", "checker", "mover"]) await assertFails(getDoc(doc(db(uid), path("emsEquipmentMigrations"))));
  });

  it("nothing is readable when the plan leaves out EMS Management", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `platformEntitlements/${A}`), { modules: ["schedule", "ems"] });
    });
    await assertFails(getDoc(doc(db("manager"), path("emsEquipment"))));
    await assertFails(getDoc(doc(db("viewer"), path("emsEquipmentEvents"))));
  });
});

describe("EMS equipment writes", () => {
  it("no browser creates, edits or deletes equipment, history or imports, whatever its permissions", async () => {
    for (const uid of ["manager", "mover", "checker", "other"]) {
      for (const c of ["emsEquipment", "emsEquipmentEvents", "emsEquipmentMigrations"]) {
        await assertFails(setDoc(doc(db(uid), path(c, "new1")), { name: "x" }));
        await assertFails(updateDoc(doc(db(uid), path(c)), { status: "retired" }));
        await assertFails(deleteDoc(doc(db(uid), path(c))));
      }
    }
  });
});
