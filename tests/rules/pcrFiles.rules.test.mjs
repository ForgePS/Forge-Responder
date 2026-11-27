// Billing documents on patient care reports (PHI): Firestore records and Storage files, against the local emulators.
// Run: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getBytes, ref, uploadString } from "firebase/storage";

const PROJECT_ID = "demo-forge-rms";
const FIRESTORE_RULES = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const STORAGE_RULES = readFileSync(new URL("../../storage.rules", import.meta.url), "utf8");
function emulatorAddress(name, fallbackPort) {
  const [host, port] = (process.env[name] || `127.0.0.1:${fallbackPort}`).split(":");
  return { host, port: Number(port) };
}
// The Storage emulator keeps files between tests, so every test gets its own departments.
let run = 0;
let A = "dept-a-0";
let B = "dept-b-0";
let env;

// crew: on the report, may chart. charter: may chart, not on it. reader: reads every report. unlocker: unlocks reports.
const USERS = {
  crew: { dept: "A", grant: { editPcrs: true } },
  charter: { dept: "A", grant: { editPcrs: true } },
  reader: { dept: "A", grant: { viewAllPcrs: true } },
  unlocker: { dept: "A", grant: { unlockPcrs: true } },
  member: { dept: "A", grant: { viewSchedule: true } },
  other: { dept: "B", grant: { editPcrs: true, viewAllPcrs: true, unlockPcrs: true } },
};
const as = (uid) => env.authenticatedContext(uid, { email: `${uid}@example.com`, email_verified: true });
const fs = (uid) => as(uid).firestore();
const st = (uid) => as(uid).storage();

const pcrPath = (id = "pcr-1") => `departments/${A}/pcrs/${id}`;
const recordPath = (fileId = "fileid0001", pcrId = "pcr-1") => `${pcrPath(pcrId)}/files/${fileId}`;
const storagePath = (fileId = "fileid0001", pcrId = "pcr-1", ext = "jpg") => `pcrFiles/${A}/${pcrId}/${fileId}.${ext}`;
const fileRecord = (uid, fileId = "fileid0001", pcrId = "pcr-1", extra = {}) => ({
  id: fileId, kind: "insurance", contentType: "image/jpeg", size: 3, fileName: `${fileId}.jpg`,
  storagePath: storagePath(fileId, pcrId), createdAt: "2026-11-27T10:00:00.000Z", createdByUid: uid, createdByName: uid, source: "rms", ...extra,
});
const jpeg = (uid) => ({ contentType: "image/jpeg", customMetadata: { uploadedBy: uid } });
const upload = (uid, path = storagePath(), meta = jpeg(uid)) => uploadString(ref(st(uid), path), "img", "raw", meta);

async function seedReport(status = "draft", pcrId = "pcr-1") {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), pcrPath(pcrId)), { id: pcrId, status, crewUids: ["crew"] });
  });
}
async function seedFile(uid = "crew", fileId = "fileid0001", pcrId = "pcr-1") {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), recordPath(fileId, pcrId)), fileRecord(uid, fileId, pcrId));
    await uploadString(ref(ctx.storage(), storagePath(fileId, pcrId)), "img", "raw", jpeg(uid));
  });
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: FIRESTORE_RULES, ...emulatorAddress("FIRESTORE_EMULATOR_HOST", 8080) },
    storage: { rules: STORAGE_RULES, ...emulatorAddress("FIREBASE_STORAGE_EMULATOR_HOST", 9199) },
  });
});
after(async () => { await env?.cleanup(); });

beforeEach(async () => {
  run += 1;
  A = `dept-a-${run}`;
  B = `dept-b-${run}`;
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    for (const [uid, u] of Object.entries(USERS)) {
      const dept = u.dept === "A" ? A : B;
      await setDoc(doc(d, `departments/${dept}/users/${uid}`), { uid, role: "firefighter", roleIds: ["firefighter"], status: "active", departmentId: dept });
      await setDoc(doc(d, `departments/${dept}/memberGrants/${uid}`), { permissions: u.grant });
    }
  });
});

describe("billing documents: reading", () => {
  it("the crew and members who read every report open them; nobody else does", async () => {
    await seedReport();
    await seedFile();
    for (const uid of ["crew", "reader", "unlocker"]) {
      await assertSucceeds(getDoc(doc(fs(uid), recordPath())));
      await assertSucceeds(getDocs(collection(fs(uid), `${pcrPath()}/files`)));
      await assertSucceeds(getBytes(ref(st(uid), storagePath())));
    }
    for (const uid of ["charter", "member", "other"]) {
      await assertFails(getDoc(doc(fs(uid), recordPath())));
      await assertFails(getDocs(collection(fs(uid), `${pcrPath()}/files`)));
      await assertFails(getBytes(ref(st(uid), storagePath())));
    }
  });

  it("before the report reaches the server only the uploader reads them", async () => {
    await seedFile("crew", "fileid0001", "pcr-new");
    await assertSucceeds(getDoc(doc(fs("crew"), recordPath("fileid0001", "pcr-new"))));
    await assertSucceeds(getBytes(ref(st("crew"), storagePath("fileid0001", "pcr-new"))));
    for (const uid of ["charter", "reader"]) {
      await assertFails(getDoc(doc(fs(uid), recordPath("fileid0001", "pcr-new"))));
      await assertFails(getBytes(ref(st(uid), storagePath("fileid0001", "pcr-new"))));
    }
  });
});

describe("billing documents: after the report arrives", () => {
  it("an uploader taken off the crew no longer reads them", async () => {
    await seedFile("charter", "fileid0001", "pcr-1");
    await assertSucceeds(getBytes(ref(st("charter"), storagePath())));
    await assertSucceeds(getDoc(doc(fs("charter"), recordPath())));
    await seedReport();
    await assertFails(getBytes(ref(st("charter"), storagePath())));
    await assertFails(getDoc(doc(fs("charter"), recordPath())));
  });
});

describe("billing documents: adding", () => {
  it("the crew adds them to a draft; members who may unlock reports do too", async () => {
    await seedReport();
    for (const [uid, id] of [["crew", "fileid0001"], ["unlocker", "fileid0002"]]) {
      await assertSucceeds(upload(uid, storagePath(id)));
      await assertSucceeds(setDoc(doc(fs(uid), recordPath(id)), fileRecord(uid, id)));
    }
  });

  it("members not on the crew, readers, other members and other departments can't", async () => {
    await seedReport();
    for (const uid of ["charter", "reader", "member", "other"]) {
      await assertFails(upload(uid, storagePath(`fileid${uid}`)));
      await assertFails(setDoc(doc(fs(uid), recordPath(`fileid${uid}`)), fileRecord(uid, `fileid${uid}`)));
    }
  });

  it("nothing is added to a posted report, even by someone who may unlock it", async () => {
    await seedReport("posted");
    for (const uid of ["crew", "unlocker"]) {
      await assertFails(upload(uid));
      await assertFails(setDoc(doc(fs(uid), recordPath()), fileRecord(uid)));
    }
  });

  it("photos taken offline go up before the report itself", async () => {
    await assertSucceeds(upload("charter", storagePath("fileid0001", "pcr-new")));
    await assertSucceeds(setDoc(doc(fs("charter"), recordPath("fileid0001", "pcr-new")), fileRecord("charter", "fileid0001", "pcr-new")));
    await assertFails(upload("member", storagePath("fileid0002", "pcr-new")));
  });

  it("files must be photos or PDFs under 10 MB, named by their id, uploaded as the signed-in person, never replaced", async () => {
    await seedReport();
    await assertFails(upload("crew", storagePath("fileid0001", "pcr-1", "jpg"), { contentType: "text/html", customMetadata: { uploadedBy: "crew" } }));
    await assertFails(upload("crew", storagePath("fileid0001"), { contentType: "image/jpeg", customMetadata: { uploadedBy: "unlocker" } }));
    await assertFails(upload("crew", storagePath("fileid0001"), { contentType: "image/jpeg" }));
    await assertFails(upload("crew", `pcrFiles/${A}/pcr-1/x.jpg`));
    await assertFails(upload("crew", `pcrFiles/${A}/pcr-1/fileid0001.html`, { contentType: "image/jpeg", customMetadata: { uploadedBy: "crew" } }));
    await assertSucceeds(upload("crew", storagePath("fileid0001", "pcr-1", "pdf"), { contentType: "application/pdf", customMetadata: { uploadedBy: "crew" } }));
    await assertSucceeds(upload("crew"));
    await assertFails(upload("crew"));
    await assertFails(upload("unlocker"));
  });

  it("records must describe their own file in the report's folder", async () => {
    await seedReport();
    const db = fs("crew");
    await assertFails(setDoc(doc(db, recordPath()), fileRecord("crew", "fileid0001", "pcr-1", { id: "other" })));
    await assertFails(setDoc(doc(db, recordPath()), fileRecord("crew", "fileid0001", "pcr-1", { createdByUid: "unlocker" })));
    await assertFails(setDoc(doc(db, recordPath()), fileRecord("crew", "fileid0001", "pcr-1", { kind: "selfie" })));
    await assertFails(setDoc(doc(db, recordPath()), fileRecord("crew", "fileid0001", "pcr-1", { storagePath: `departments/${A}/x.jpg` })));
    await assertFails(setDoc(doc(db, recordPath()), fileRecord("crew", "fileid0001", "pcr-1", { fileName: "fileid0001.exe" })));
    await assertSucceeds(setDoc(doc(db, recordPath()), fileRecord("crew")));
    await assertFails(updateDoc(doc(db, recordPath()), { kind: "license" }));
  });
});

describe("billing documents: the shared demo", () => {
  it("nobody adds them in the demo department, whose login is public", async () => {
    const demo = env.authenticatedContext("demo-user", { email: "demo@forge.demo", email_verified: true });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "departments/forge-demo/pcrs/pcr-1"), { id: "pcr-1", status: "draft", crewUids: ["demo-user"] });
    });
    await assertFails(uploadString(ref(demo.storage(), "pcrFiles/forge-demo/pcr-1/fileid0001.jpg"), "img", "raw", jpeg("demo-user")));
    await assertFails(setDoc(doc(demo.firestore(), "departments/forge-demo/pcrs/pcr-1/files/fileid0001"), {
      ...fileRecord("demo-user"), storagePath: "pcrFiles/forge-demo/pcr-1/fileid0001.jpg",
    }));
  });
});

describe("billing documents: removing", () => {
  it("the crew removes them from a draft; members who may unlock too; nobody from a posted report", async () => {
    await seedReport();
    await seedFile("unlocker", "fileid0001");
    await seedFile("crew", "fileid0002");
    for (const uid of ["charter", "reader", "member", "other"]) {
      await assertFails(deleteObject(ref(st(uid), storagePath("fileid0001"))));
      await assertFails(deleteDoc(doc(fs(uid), recordPath("fileid0001"))));
    }
    await assertSucceeds(deleteObject(ref(st("crew"), storagePath("fileid0001"))));
    await assertSucceeds(deleteDoc(doc(fs("crew"), recordPath("fileid0001"))));
    await assertSucceeds(deleteObject(ref(st("unlocker"), storagePath("fileid0002"))));
    await assertSucceeds(deleteDoc(doc(fs("unlocker"), recordPath("fileid0002"))));

    await seedReport("posted", "pcr-2");
    await seedFile("crew", "fileid0003", "pcr-2");
    for (const uid of ["crew", "unlocker"]) {
      await assertFails(deleteObject(ref(st(uid), storagePath("fileid0003", "pcr-2"))));
      await assertFails(deleteDoc(doc(fs(uid), recordPath("fileid0003", "pcr-2"))));
    }
  });

  it("before the report reaches the server only the uploader removes them", async () => {
    await seedFile("crew", "fileid0001", "pcr-new");
    await assertFails(deleteObject(ref(st("charter"), storagePath("fileid0001", "pcr-new"))));
    await assertFails(deleteDoc(doc(fs("charter"), recordPath("fileid0001", "pcr-new"))));
    await assertSucceeds(deleteObject(ref(st("crew"), storagePath("fileid0001", "pcr-new"))));
    await assertSucceeds(deleteDoc(doc(fs("crew"), recordPath("fileid0001", "pcr-new"))));
  });
});
