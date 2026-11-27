// Interactive preplan security rules (floors, floor plans, site maps, alerts, links,
// review tasks, conversions), against the local Firestore emulator.
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
  viewer: { dept: A, grant: { viewPreplans: true } },
  editor: { dept: A, grant: { viewPreplans: true, editPreplans: true, createPreplans: true } },
  approver: { dept: A, grant: { viewPreplans: true, editPreplans: true, approvePreplans: true } },
  inspector: { dept: A, grant: { viewInspections: true, conductInspections: true } },
  otherEditor: { dept: B, grant: { viewPreplans: true, editPreplans: true, approvePreplans: true } },
  demoEditor: { dept: "forge-demo", grant: { viewPreplans: true, editPreplans: true } },
};

const p = (collection, id) => `departments/${A}/${collection}/${id}`;
const plan = (revisionId, floorId, version, extra = {}) => ({
  preplanId: "PP1", revisionId, floorId, version, objects: [], ...extra,
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: FIRESTORE_RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
  // Same guard as firestore.rules.test.mjs: these tests clear the database, so never
  // run them against a running offline demo (same project id and default ports).
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
    await setDoc(doc(d, p("preplans", "PP1")), { status: "draft", currentRevisionId: "RD" });
    await setDoc(doc(d, p("preplanRevisions", "RD")), { preplanId: "PP1", status: "draft" });
    await setDoc(doc(d, p("preplanRevisions", "RP")), { preplanId: "PP1", status: "published" });
    await setDoc(doc(d, p("preplanRevisions", "RX")), { preplanId: "PP-OTHER", status: "draft" });
    await setDoc(doc(d, p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 1));
    await setDoc(doc(d, p("preplanFloorPlans", "RP__F1")), plan("RP", "F1", 3));
    await setDoc(doc(d, p("preplanFloors", "F1")), { preplanId: "PP1", buildingId: "B1", name: "Ground" });
    await setDoc(doc(d, p("preplanAlerts", "AL1")), { verificationStatus: "reported", resolutionStatus: "active", description: "Riser valve closed" });
    // Department B's own floor plan, to prove A can't see it.
    await setDoc(doc(d, `departments/${B}/preplanRevisions/RB`), { preplanId: "PPB", status: "draft" });
    await setDoc(doc(d, `departments/${B}/preplanFloorPlans/RB__F9`), plan("RB", "F9", 1, { preplanId: "PPB" }));
  });
});

describe("floor plans", () => {
  it("editors save the next version of a draft revision's floor plan", async () => {
    await assertSucceeds(setDoc(doc(db("editor"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 2)));
    await assertSucceeds(setDoc(doc(db("editor"), p("preplanFloorPlans", "RD__F2")), plan("RD", "F2", 1)));
  });

  it("stale or skipped versions are refused (optimistic concurrency)", async () => {
    await assertFails(setDoc(doc(db("editor"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 1)));
    await assertFails(setDoc(doc(db("editor"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 5)));
  });

  it("published geometry is immutable, even for approvers", async () => {
    await assertFails(setDoc(doc(db("approver"), p("preplanFloorPlans", "RP__F1")), plan("RP", "F1", 4)));
    await assertFails(setDoc(doc(db("approver"), p("preplanFloorPlans", "RP__F2")), plan("RP", "F2", 1)));
    await assertFails(deleteDoc(doc(db("approver"), p("preplanFloorPlans", "RP__F1"))));
  });

  it("the doc id must match the revision and floor, and the revision must belong to the preplan", async () => {
    await assertFails(setDoc(doc(db("editor"), p("preplanFloorPlans", "RD__F7")), plan("RD", "F1", 1)));
    await assertFails(setDoc(doc(db("editor"), p("preplanFloorPlans", "RX__F1")), plan("RX", "F1", 1)));
    await assertFails(setDoc(doc(db("editor"), p("preplanFloorPlans", "NOPE__F1")), plan("NOPE", "F1", 1)));
  });

  it("viewers and inspectors read but can't edit", async () => {
    await assertSucceeds(getDoc(doc(db("viewer"), p("preplanFloorPlans", "RP__F1"))));
    await assertFails(setDoc(doc(db("viewer"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 2)));
    await assertFails(setDoc(doc(db("inspector"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 2)));
  });

  it("other departments can't read or write", async () => {
    await assertFails(getDoc(doc(db("otherEditor"), p("preplanFloorPlans", "RP__F1"))));
    await assertFails(setDoc(doc(db("otherEditor"), p("preplanFloorPlans", "RD__F1")), plan("RD", "F1", 2)));
    await assertFails(getDoc(doc(db("editor"), `departments/${B}/preplanFloorPlans/RB__F9`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), p("preplanFloorPlans", "RP__F1"))));
  });
});

describe("floors and site maps", () => {
  it("floors can't move to another preplan or be deleted", async () => {
    await assertSucceeds(updateDoc(doc(db("editor"), p("preplanFloors", "F1")), { name: "Level 1" }));
    await assertFails(updateDoc(doc(db("editor"), p("preplanFloors", "F1")), { preplanId: "PP2" }));
    await assertFails(deleteDoc(doc(db("approver"), p("preplanFloors", "F1"))));
    await assertFails(setDoc(doc(db("viewer"), p("preplanFloors", "F2")), { preplanId: "PP1", buildingId: "B1" }));
  });

  it("site maps follow the same revision lock", async () => {
    await assertSucceeds(setDoc(doc(db("editor"), p("preplanSiteMaps", "RD")), { preplanId: "PP1", revisionId: "RD", features: [] }));
    await assertFails(setDoc(doc(db("editor"), p("preplanSiteMaps", "RP")), { preplanId: "PP1", revisionId: "RP", features: [] }));
    await assertFails(setDoc(doc(db("editor"), p("preplanSiteMaps", "RD")), { preplanId: "PP1", revisionId: "RP", features: [] }));
  });

  it("site map saves must bump the version by one (no silent overwrites)", async () => {
    const ref = doc(db("editor"), p("preplanSiteMaps", "RD"));
    await assertSucceeds(setDoc(ref, { preplanId: "PP1", revisionId: "RD", features: [], version: 1 }));
    await assertFails(setDoc(ref, { preplanId: "PP1", revisionId: "RD", features: [], version: 1 }));
    await assertFails(setDoc(ref, { preplanId: "PP1", revisionId: "RD", features: [], version: "2" }));
    await assertSucceeds(setDoc(ref, { preplanId: "PP1", revisionId: "RD", features: [], version: 2 }));
  });
});

describe("operational alerts", () => {
  it("inspectors and editors report alerts, but can't create them already verified", async () => {
    await assertSucceeds(setDoc(doc(db("inspector"), p("preplanAlerts", "AL2")), { verificationStatus: "reported", resolutionStatus: "active" }));
    await assertSucceeds(setDoc(doc(db("editor"), p("preplanAlerts", "AL3")), { verificationStatus: "reported", resolutionStatus: "active" }));
    await assertFails(setDoc(doc(db("inspector"), p("preplanAlerts", "AL4")), { verificationStatus: "verified", resolutionStatus: "active" }));
    await assertFails(setDoc(doc(db("viewer"), p("preplanAlerts", "AL5")), { verificationStatus: "reported", resolutionStatus: "active" }));
  });

  it("only approvers verify or resolve", async () => {
    await assertFails(updateDoc(doc(db("editor"), p("preplanAlerts", "AL1")), { verificationStatus: "verified" }));
    await assertFails(updateDoc(doc(db("inspector"), p("preplanAlerts", "AL1")), { resolutionStatus: "resolved" }));
    await assertSucceeds(updateDoc(doc(db("editor"), p("preplanAlerts", "AL1")), { description: "Riser valve closed, chained" }));
    await assertSucceeds(updateDoc(doc(db("approver"), p("preplanAlerts", "AL1")), { verificationStatus: "verified" }));
    await assertFails(deleteDoc(doc(db("approver"), p("preplanAlerts", "AL1"))));
  });

  it("other departments can't see or change alerts", async () => {
    await assertFails(getDoc(doc(db("otherEditor"), p("preplanAlerts", "AL1"))));
    await assertFails(updateDoc(doc(db("otherEditor"), p("preplanAlerts", "AL1")), { verificationStatus: "verified" }));
  });
});

describe("links, review tasks and conversions", () => {
  it("inspectors link findings and open review tasks; only preplan staff work them", async () => {
    await assertSucceeds(setDoc(doc(db("inspector"), p("preplanFindingLinks", "L1")), { inspectionId: "INS-1", preplanId: "PP1", objectId: "o-1" }));
    await assertSucceeds(setDoc(doc(db("inspector"), p("preplanReviewTasks", "T1")), { status: "open", preplanId: "PP1" }));
    await assertFails(setDoc(doc(db("inspector"), p("preplanReviewTasks", "T2")), { status: "accepted" }));
    await assertFails(updateDoc(doc(db("inspector"), p("preplanReviewTasks", "T1")), { status: "accepted" }));
    await assertSucceeds(updateDoc(doc(db("editor"), p("preplanReviewTasks", "T1")), { status: "accepted" }));
    await assertFails(setDoc(doc(db("viewer"), p("preplanFindingLinks", "L2")), { inspectionId: "INS-1" }));
  });

  it("browsers record deterministic conversions but can't fabricate AI results", async () => {
    await assertSucceeds(setDoc(doc(db("editor"), p("preplanConversions", "C1")), { method: "vector_import", status: "needs_review" }));
    await assertFails(setDoc(doc(db("editor"), p("preplanConversions", "C2")), { method: "ai_vision", status: "needs_review", objects: [] }));
    await assertFails(setDoc(doc(db("editor"), p("preplanConversions", "C3")), { method: "magic" }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), p("preplanConversions", "C4")), { method: "ai_vision", status: "needs_review", proposalCount: 3 }));
    await assertSucceeds(updateDoc(doc(db("editor"), p("preplanConversions", "C4")), { reviewStatus: "accepted", updatedAt: "now" }));
    await assertFails(updateDoc(doc(db("editor"), p("preplanConversions", "C4")), { proposalCount: 99 }));
  });
});

describe("deleting preplan records", () => {
  const demo = (collection, id) => `departments/forge-demo/${collection}/${id}`;
  const COLLECTIONS = ["preplans", "preplanRevisions", "preplanFloors", "preplanFloorPlans", "preplanSiteMaps",
    "preplanAlerts", "preplanReviewTasks", "preplanConversions"];

  it("only the demo department's reset may delete from the app", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (const name of COLLECTIONS) {
        await setDoc(doc(ctx.firestore(), demo(name, "X1")), { preplanId: "PP-DEMO-1" });
        await setDoc(doc(ctx.firestore(), p(name, "X1")), { preplanId: "PP1" });
      }
    });
    for (const name of COLLECTIONS) {
      await assertSucceeds(deleteDoc(doc(db("demoEditor"), demo(name, "X1"))));
      // Real departments delete through deleteRecordWithReason (reason + audit), never from the app.
      await assertFails(deleteDoc(doc(db("approver"), p(name, "X1"))));
    }
  });

  it("demo viewers can't delete", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "departments/forge-demo/users/demoViewer"), { uid: "demoViewer", role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId: "forge-demo" });
      await setDoc(doc(ctx.firestore(), "departments/forge-demo/memberGrants/demoViewer"), { permissions: { viewPreplans: true } });
      await setDoc(doc(ctx.firestore(), demo("preplans", "X2")), { status: "draft" });
    });
    await assertFails(deleteDoc(doc(db("demoViewer"), demo("preplans", "X2"))));
  });
});
