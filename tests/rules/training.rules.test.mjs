// Training module security rules, against the local Firestore emulator.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, runTransaction, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
// emulators:exec sets FIRESTORE_EMULATOR_HOST; default to the standard port.
const [EMU_HOST, EMU_PORT] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8080").split(":");
const A = "dept-a";
const B = "dept-b";
let env;

const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true });
const db = (uid) => as(uid).firestore();

// officer: editTraining + evaluateSkills (company officer). bc: approveTraining. bc2: a second approver.
// ff: firefighter linked to P-FF (viewTraining only). ff2: another firefighter (P-FF2).
// ems: approveCeCredits. other: member of department B.
const USERS = {
  officer: { dept: A, pid: "P-OFF", grant: { viewTraining: true, editTraining: true, evaluateSkills: true } },
  bc: { dept: A, pid: "P-BC", grant: { viewTraining: true, editTraining: true, approveTraining: true, evaluateSkills: true } },
  bc2: { dept: A, pid: "P-BC2", grant: { viewTraining: true, editTraining: true, approveTraining: true } },
  ff: { dept: A, pid: "P-FF", grant: { viewTraining: true } },
  ff2: { dept: A, pid: "P-FF2", grant: { viewTraining: true } },
  ems: { dept: A, pid: "P-EMS", grant: { viewTraining: true, approveCeCredits: true } },
  ems2: { dept: A, pid: "P-EMS2", grant: { viewTraining: true, approveCeCredits: true } },
  noview: { dept: A, pid: "P-NV", grant: { viewSchedule: true } },
  other: { dept: B, pid: "P-B", grant: { viewTraining: true, editTraining: true, approveTraining: true } },
};

const rec = (id) => `departments/${A}/trainingRecords/${id}`;

function draft(createdBy, extra = {}) {
  return {
    id: "R1", title: "Ground ladders", date: "2026-11-01", durationHours: 2, status: "draft", createdBy,
    participants: [{ personId: "P-FF", attendance: "present" }], participantIds: ["P-FF"], history: [], ...extra,
  };
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: FIRESTORE_RULES, host: EMU_HOST, port: Number(EMU_PORT) } });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const [uid, u] of Object.entries(USERS)) {
      await setDoc(doc(d, `departments/${u.dept}/users/${uid}`), { uid, role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId: u.dept, personnelId: u.pid });
      await setDoc(doc(d, `departments/${u.dept}/memberGrants/${uid}`), { permissions: u.grant });
    }
  });
});

async function seed(path, data) {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));
}

describe("training records workflow", () => {
  it("editors create drafts as themselves; plain members and other departments can't", async () => {
    await assertSucceeds(setDoc(doc(db("officer"), rec("R1")), draft("officer")));
    await assertFails(setDoc(doc(db("officer"), rec("R2")), draft("bc")));
    await assertFails(setDoc(doc(db("officer"), rec("R3")), draft("officer", { status: "approved" })));
    await assertFails(setDoc(doc(db("ff"), rec("R4")), draft("ff")));
    await assertFails(setDoc(doc(db("other"), rec("R5")), draft("other")));
  });

  it("members with view permission read records; members without it and other departments don't", async () => {
    await seed(rec("R1"), draft("officer"));
    await assertSucceeds(getDoc(doc(db("ff"), rec("R1"))));
    await assertFails(getDoc(doc(db("noview"), rec("R1"))));
    await assertFails(getDoc(doc(db("other"), rec("R1"))));
  });

  it("submit, then only a different approver can approve", async () => {
    await seed(rec("R1"), draft("officer"));
    await assertSucceeds(updateDoc(doc(db("officer"), rec("R1")), { status: "submitted", submittedBy: "officer" }));
    // Officer (no approve permission) can't approve.
    await assertFails(updateDoc(doc(db("officer"), rec("R1")), { status: "approved", approvedBy: "officer" }));
    // Firefighter can't approve.
    await assertFails(updateDoc(doc(db("ff"), rec("R1")), { status: "approved", approvedBy: "ff" }));
    // Approver can't change content while approving.
    await assertFails(updateDoc(doc(db("bc"), rec("R1")), { status: "approved", approvedBy: "bc", durationHours: 9 }));
    await assertSucceeds(updateDoc(doc(db("bc"), rec("R1")), { status: "approved", approvedBy: "bc", approvedAt: "x" }));
  });

  it("an approver can't approve their own submission", async () => {
    await seed(rec("R1"), draft("bc", { status: "submitted", submittedBy: "bc" }));
    await assertFails(updateDoc(doc(db("bc"), rec("R1")), { status: "approved", approvedBy: "bc" }));
    await assertSucceeds(updateDoc(doc(db("bc2"), rec("R1")), { status: "approved", approvedBy: "bc2" }));
  });

  it("returned records go back to the author; submitted records can't be edited by the author", async () => {
    await seed(rec("R1"), draft("officer", { status: "submitted", submittedBy: "officer" }));
    await assertFails(updateDoc(doc(db("officer"), rec("R1")), { durationHours: 5 }));
    await assertSucceeds(updateDoc(doc(db("bc"), rec("R1")), { status: "returned", returnReason: "Add the roster", returnedBy: "bc" }));
    await assertSucceeds(updateDoc(doc(db("officer"), rec("R1")), { durationHours: 3 }));
    await assertSucceeds(updateDoc(doc(db("officer"), rec("R1")), { status: "submitted", submittedBy: "officer" }));
  });

  it("approved records can't be edited directly; locked records can't change at all", async () => {
    await seed(rec("R1"), draft("officer", { status: "approved", submittedBy: "officer", approvedBy: "bc" }));
    await assertFails(updateDoc(doc(db("officer"), rec("R1")), { durationHours: 5 }));
    await assertFails(updateDoc(doc(db("bc"), rec("R1")), { durationHours: 5 }));
    await assertSucceeds(updateDoc(doc(db("bc"), rec("R1")), { status: "locked", lockedBy: "bc" }));
    await assertFails(updateDoc(doc(db("bc"), rec("R1")), { status: "approved" }));
    await assertFails(updateDoc(doc(db("bc"), rec("R1")), { notes: "changed" }));
  });

  it("amendments: record and amendment written together; history is append-only", async () => {
    await seed(rec("R1"), draft("officer", { status: "approved", submittedBy: "officer", approvedBy: "bc" }));
    const d = db("bc2");
    // Without the amendment entry, the change is refused.
    await assertFails(updateDoc(doc(d, rec("R1")), { durationHours: 3, lastAmendmentId: "AMD-1" }));
    // The amendment alone is refused too.
    await assertFails(setDoc(doc(d, `${rec("R1")}/amendments/AMD-1`), { by: "bc2", reason: "x" }));
    const batch = writeBatch(d);
    batch.set(doc(d, `${rec("R1")}/amendments/AMD-1`), { by: "bc2", reason: "Wrong duration", changes: [{ field: "durationHours", from: 2, to: 3 }] });
    batch.update(doc(d, rec("R1")), { durationHours: 3, lastAmendmentId: "AMD-1" });
    await assertSucceeds(batch.commit());
    await assertFails(updateDoc(doc(d, `${rec("R1")}/amendments/AMD-1`), { reason: "rewritten" }));
    await assertFails(deleteDoc(doc(d, `${rec("R1")}/amendments/AMD-1`)));
    // Amending can't rewrite who approved it.
    const b2 = writeBatch(d);
    b2.set(doc(d, `${rec("R1")}/amendments/AMD-2`), { by: "bc2", reason: "x" });
    b2.update(doc(d, rec("R1")), { approvedBy: "bc2", lastAmendmentId: "AMD-2" });
    await assertFails(b2.commit());
    // A non-approver can't amend.
    const od = db("officer");
    const b3 = writeBatch(od);
    b3.set(doc(od, `${rec("R1")}/amendments/AMD-3`), { by: "officer", reason: "x" });
    b3.update(doc(od, rec("R1")), { durationHours: 4, lastAmendmentId: "AMD-3" });
    await assertFails(b3.commit());
  });

  it("only drafts can be deleted", async () => {
    await seed(rec("R1"), draft("officer"));
    await seed(rec("R2"), draft("officer", { status: "submitted" }));
    await assertFails(deleteDoc(doc(db("ff"), rec("R1"))));
    await assertSucceeds(deleteDoc(doc(db("officer"), rec("R1"))));
    await assertFails(deleteDoc(doc(db("officer"), rec("R2"))));
  });

  it("transactions (as the app runs them) pass the rules", async () => {
    await seed(rec("R1"), draft("officer", { status: "submitted", submittedBy: "officer" }));
    const d = db("bc");
    await assertSucceeds(runTransaction(d, async (tx) => {
      const snap = await tx.get(doc(d, rec("R1")));
      tx.update(doc(d, rec("R1")), { status: "approved", approvedBy: "bc", history: [...(snap.data().history || []), { action: "approve" }] });
    }));
  });
});

describe("course versions, sessions and enrollment", () => {
  it("published course versions are permanent", async () => {
    const d = db("officer");
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingCourses/C1`), { title: "SCBA" }));
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingCourses/C1/versions/1`), { version: 1 }));
    await assertFails(setDoc(doc(d, `departments/${A}/trainingCourses/C1/versions/1`), { version: 1, changed: true }));
    await assertFails(deleteDoc(doc(d, `departments/${A}/trainingCourses/C1/versions/1`)));
    await assertFails(setDoc(doc(db("ff"), `departments/${A}/trainingCourses/C2`), { title: "x" }));
  });

  it("members enroll only themselves and can't mark themselves as assigned", async () => {
    await seed(`departments/${A}/trainingSessions/S1`, { title: "Pump ops", capacity: 2 });
    const d = db("ff");
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingSessions/S1/enrollments/P-FF`), { personId: "P-FF", status: "active", assigned: false }));
    await assertFails(setDoc(doc(d, `departments/${A}/trainingSessions/S1/enrollments/P-FF2`), { personId: "P-FF2", status: "active", assigned: false }));
    await assertFails(setDoc(doc(db("ff2"), `departments/${A}/trainingSessions/S1/enrollments/P-FF2`), { personId: "P-FF2", status: "active", assigned: true }));
    await assertSucceeds(setDoc(doc(db("officer"), `departments/${A}/trainingSessions/S1/enrollments/P-FF2`), { personId: "P-FF2", status: "active", assigned: true }));
    // An assigned (mandatory) enrollment can't be cancelled by the member.
    await assertFails(setDoc(doc(db("ff2"), `departments/${A}/trainingSessions/S1/enrollments/P-FF2`), { personId: "P-FF2", status: "cancelled", assigned: false }));
    await assertFails(setDoc(doc(d, `departments/${A}/trainingSessions/S1`), { title: "renamed" }));
  });
});

describe("skills evaluations are private and need a second approver", () => {
  const ev = `departments/${A}/trainingEvaluations/E1`;
  it("evaluators create as themselves; members read only their own", async () => {
    await assertSucceeds(setDoc(doc(db("officer"), ev), { personId: "P-FF", evaluatorUid: "officer", status: "submitted", result: "pass" }));
    await assertFails(setDoc(doc(db("officer"), `${ev}x`), { personId: "P-FF", evaluatorUid: "bc", status: "submitted" }));
    await assertFails(setDoc(doc(db("ff"), `${ev}y`), { personId: "P-FF", evaluatorUid: "ff", status: "submitted" }));
    await assertFails(setDoc(doc(db("officer"), `${ev}z`), { personId: "P-FF", evaluatorUid: "officer", status: "approved" }));
    await assertSucceeds(getDoc(doc(db("ff"), ev)));
    await assertFails(getDoc(doc(db("ff2"), ev)));
    await assertSucceeds(getDoc(doc(db("bc"), ev)));
  });

  it("approval needs someone other than the evaluator, and approved results are final", async () => {
    await seed(ev, { personId: "P-FF", evaluatorUid: "bc", status: "submitted", result: "pass" });
    await assertFails(updateDoc(doc(db("bc"), ev), { status: "approved", approvedBy: "bc" }));
    await assertFails(updateDoc(doc(db("bc2"), ev), { status: "approved", approvedBy: "bc2", result: "fail" }));
    await assertSucceeds(updateDoc(doc(db("bc2"), ev), { status: "approved", approvedBy: "bc2" }));
    await assertFails(updateDoc(doc(db("bc"), ev), { result: "fail" }));
    await assertFails(deleteDoc(doc(db("bc2"), ev)));
  });
});

describe("EMS CE credit", () => {
  const aw = `departments/${A}/trainingCeAwards/CE-1`;
  it("pending only, approved by someone else, never overwritten", async () => {
    await assertFails(setDoc(doc(db("ems"), aw), { personId: "P-FF", status: "approved", createdBy: "ems" }));
    await assertSucceeds(setDoc(doc(db("ems"), aw), { personId: "P-FF", status: "pending", createdBy: "ems", creditHours: 2 }));
    // Re-creating the same id is an overwrite and is refused for a member without approval rights.
    await assertFails(setDoc(doc(db("ff"), aw), { personId: "P-FF", status: "pending", createdBy: "ff", creditHours: 20 }));
    await assertFails(updateDoc(doc(db("ems"), aw), { status: "approved", reviewedBy: "ems" }));
    await assertFails(updateDoc(doc(db("ems2"), aw), { status: "approved", creditHours: 20 }));
    await assertSucceeds(updateDoc(doc(db("ems2"), aw), { status: "approved", reviewedBy: "ems2" }));
    await assertFails(deleteDoc(doc(db("ems2"), aw)));
  });

  it("a member's self-report transaction (read, then create) passes", async () => {
    const d = db("ff");
    await assertSucceeds(runTransaction(d, async (tx) => {
      const snap = await tx.get(doc(d, `${aw}tx`));
      if (snap.exists()) throw new Error("exists");
      tx.set(doc(d, `${aw}tx`), { personId: "P-FF", status: "pending", createdBy: "ff", creditHours: 1 });
    }));
  });

  it("members self-report only their own outside education and read only their own", async () => {
    await assertSucceeds(setDoc(doc(db("ff"), `${aw}a`), { personId: "P-FF", status: "pending", createdBy: "ff" }));
    await assertFails(setDoc(doc(db("ff"), `${aw}b`), { personId: "P-FF2", status: "pending", createdBy: "ff" }));
    await assertSucceeds(getDoc(doc(db("ff"), `${aw}a`)));
    await assertFails(getDoc(doc(db("ff2"), `${aw}a`)));
  });
});

describe("requirements, snapshots and requests", () => {
  it("requirement versions and compliance snapshots are append-only", async () => {
    await seed(`departments/${A}/memberGrants/cfg`, { permissions: { manageTrainingConfig: true } });
    await seed(`departments/${A}/users/cfg`, { uid: "cfg", status: "active", roleIds: [], personnelId: "" });
    const d = db("cfg");
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingRequirements/Q1`), { name: "Annual", version: 1 }));
    await assertFails(setDoc(doc(db("officer"), `departments/${A}/trainingRequirements/Q2`), { name: "x" }));
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingRequirements/Q1/versions/1`), { version: 1 }));
    await assertFails(setDoc(doc(d, `departments/${A}/trainingRequirements/Q1/versions/1`), { version: 1, x: 1 }));
    await assertSucceeds(setDoc(doc(d, `departments/${A}/trainingComplianceSnapshots/S1`), { createdBy: "cfg", results: [] }));
    await assertFails(updateDoc(doc(d, `departments/${A}/trainingComplianceSnapshots/S1`), { results: [1] }));
  });

  it("members file their own requests; someone else decides", async () => {
    const r = `departments/${A}/trainingRequests/TR1`;
    await assertSucceeds(setDoc(doc(db("ff"), r), { requesterUid: "ff", status: "submitted", title: "FDIC" }));
    await assertFails(setDoc(doc(db("ff"), `${r}b`), { requesterUid: "ff2", status: "submitted" }));
    await assertFails(updateDoc(doc(db("ff"), r), { status: "approved" }));
    await assertFails(getDoc(doc(db("ff2"), r)));
    await assertSucceeds(updateDoc(doc(db("bc"), r), { status: "approved" }));
    await assertSucceeds(updateDoc(doc(db("ff"), r), { status: "cancelled" }));
  });

  it("other departments see nothing", async () => {
    await seed(`departments/${A}/trainingRequirements/Q1`, { name: "Annual" });
    await assertFails(getDoc(doc(db("other"), `departments/${A}/trainingRequirements/Q1`)));
    await assertFails(setDoc(doc(db("other"), `departments/${A}/trainingSessions/S9`), { title: "x" }));
  });
});
