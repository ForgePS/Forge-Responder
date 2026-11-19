// Digital Forms: upload -> convert -> review -> publish -> fill in, tenant
// isolation, permissions and abuse cases. Claude is replaced by a test double,
// so nothing is sent to Anthropic. A cross-tenant failure here blocks release.
// Run: npm run test:functions (Firestore + Storage emulators).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../functions/package.json", import.meta.url));
const admin = require("firebase-admin");
const forms = require("./lib/digitalForms/service.js");

const PROJECT_ID = "demo-forge-rms";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const A = "dept-a";
const B = "dept-b";
const DEMO = "forge-demo";
const PDF = Buffer.from("%PDF-1.7\n% test form\n");

let db;
let bucket;
const auth = (uid) => ({ uid, token: { email: `${uid}@example.test`, name: uid } });
const req = (uid, data) => ({ auth: uid ? auth(uid) : undefined, data });

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code, `expected ${code}, got ${error.code}: ${error.message}`);
    return true;
  });
}

const OUTPUT = {
  isForm: true,
  name: "Hose Test Record",
  description: "Annual hose test.",
  sections: [
    { title: "Test", fields: [
      { label: "Test date", type: "date", required: true, options: [], helpText: "" },
      { label: "Hose size", type: "dropdown", required: true, options: ["1.75 in", "2.5 in", "5 in"], helpText: "" },
      { label: "Result", type: "pass_fail", required: true, options: [], helpText: "" },
      { label: "Notes", type: "long_text", required: false, options: [], helpText: "" },
    ] },
    { title: "Sign-off", fields: [
      { label: "Tester signature", type: "signature", required: true, options: [], helpText: "" },
    ] },
  ],
  warnings: ["Footer unreadable"],
};

/** Stand-in for the Anthropic client; records every call. */
function fakeClient(output = OUTPUT, { fail } = {}) {
  const calls = [];
  const client = {
    beta: { messages: { async create(params) {
      calls.push(params);
      if (fail) throw fail;
      return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(output) }], usage: { input_tokens: 100, output_tokens: 50 } };
    } } },
  };
  return { calls, getClient: () => client };
}

const member = (departmentId, uid, roleIds, permissions) =>
  db.doc(`departments/${departmentId}/users/${uid}`).set({ uid, status: "active", departmentId, roleIds, role: roleIds[0], email: `${uid}@example.test`, ...(permissions ? { permissions } : {}) });

/** createImport + upload the file the way the browser does. */
async function startUpload(uid, departmentId, { contentType = "application/pdf", body = PDF, fileName = "hose-test.pdf" } = {}) {
  const started = await forms.createImport(db, req(uid, { departmentId, fileName, contentType, size: body.length }));
  await bucket.file(started.uploadPath).save(body, { contentType, metadata: { metadata: { uploadedBy: uid } } });
  return started;
}

async function convertedImport(uid = "chief-a", departmentId = A, fake = fakeClient()) {
  const { importId } = await startUpload(uid, departmentId);
  const result = await forms.convertImport(db, bucket, req(uid, { departmentId, importId }), fake);
  return { importId, result };
}

async function publishedForm(uid = "chief-a", departmentId = A) {
  const { importId, result } = await convertedImport(uid, departmentId);
  const published = await forms.publish(db, req(uid, { departmentId, importId, draft: result.draft }));
  return { importId, ...published, draft: result.draft };
}

function answersFor(draft) {
  const key = (label) => draft.sections.flatMap((s) => s.fields).find((f) => f.label === label).key;
  return {
    [key("Test date")]: "2026-11-10",
    [key("Hose size")]: "2.5 in",
    [key("Result")]: "Pass",
    [key("Tester signature")]: { name: "FF Example" },
  };
}

before(() => {
  process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
  process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= "127.0.0.1:9199";
  if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET });
  db = admin.firestore();
  bucket = admin.storage().bucket(BUCKET);
});

after(async () => {
  await admin.app().delete();
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: "DELETE" });
  const [files] = await bucket.getFiles({ prefix: "formImports/" }).catch(() => [[]]);
  const [photos] = await bucket.getFiles({ prefix: "formSubmissionPhotos/" }).catch(() => [[]]);
  files.push(...photos);
  await Promise.all(files.map((f) => f.delete().catch(() => undefined)));
  await Promise.all([
    member(A, "chief-a", ["fireChief"]),
    member(A, "officer-a", ["companyOfficer"]),
    member(A, "ff-a", ["firefighter"]),
    member(A, "ro-a", ["readOnly"]),
    member(B, "chief-b", ["fireChief"]),
    member(B, "ff-b", ["firefighter"]),
    member(DEMO, "demo-admin", ["fireChief"]),
    db.doc("platformCreators/creator-1").set({ status: "active" }),
  ]);
});

describe("upload -> convert -> review -> publish -> fill in", () => {
  it("works end to end and keeps a snapshot of what was answered", async () => {
    const started = await forms.createImport(db, req("chief-a", { departmentId: A, fileName: "hose-test.pdf", contentType: "application/pdf", size: PDF.length }));
    assert.equal(started.uploadPath, `formImports/${A}/${started.importId}/source.pdf`);
    await bucket.file(started.uploadPath).save(PDF, { contentType: "application/pdf" });

    const fake = fakeClient();
    const converted = await forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId: started.importId }), fake);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0].messages[0].content[0].source.data, PDF.toString("base64"), "the uploaded file is what is sent");
    assert.equal(converted.status, "review");
    assert.deepEqual(converted.problems, []);
    assert.deepEqual(converted.warnings, ["Footer unreadable"]);

    // Nothing is live before publish.
    assert.equal((await db.collection(`departments/${A}/formTemplates`).get()).size, 0);

    // Review: rename the form and make Notes required.
    const draft = structuredClone(converted.draft);
    draft.name = "Annual Hose Test";
    draft.sections[0].fields.find((f) => f.label === "Notes").required = true;
    const saved = await forms.saveDraft(db, req("chief-a", { departmentId: A, importId: started.importId, draft }));
    assert.equal(saved.draft.name, "Annual Hose Test");
    const stored = (await db.doc(`departments/${A}/formImports/${started.importId}`).get()).data();
    assert.equal(stored.draft.name, "Annual Hose Test");

    const { templateId, versionId } = await forms.publish(db, req("chief-a", { departmentId: A, importId: started.importId }));
    const template = (await db.doc(`departments/${A}/formTemplates/${templateId}`).get()).data();
    assert.equal(template.lifecycleStatus, "published");
    assert.equal(template.name, "Annual Hose Test");
    assert.equal(template.publishedVersionId, versionId);
    const version = (await db.doc(`departments/${A}/formTemplateVersions/${versionId}`).get()).data();
    assert.equal(version.snapshot.name, "Annual Hose Test");
    assert.equal((await db.doc(`departments/${A}/formImports/${started.importId}`).get()).data().status, "published");

    // A firefighter fills it in.
    const answers = { ...answersFor(saved.draft), [saved.draft.sections[0].fields.find((f) => f.label === "Notes").key]: "Coupling OK" };
    const { submissionId } = await forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, versionId, answers }));
    const submission = (await db.doc(`departments/${A}/formSubmissions/${submissionId}`).get()).data();
    assert.equal(submission.submittedBy, "ff-a");
    assert.equal(submission.templateVersionId, versionId);
    assert.equal(submission.templateSnapshot.name, "Annual Hose Test");
    assert.ok(submission.answers[saved.draft.sections[1].fields[0].key].signedAt, "server stamps the signature time");
  });

  it("rejects submissions missing required answers or with bad values", async () => {
    const { templateId, draft } = await publishedForm();
    await expectCode(forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, answers: {} })), "invalid-argument");
    const bad = { ...answersFor(draft), [draft.sections[0].fields[1].key]: "3 in" };
    await expectCode(forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, answers: bad })), "invalid-argument");
  });

  it("publishing is blocked until review problems are fixed", async () => {
    const { importId, result } = await convertedImport();
    const draft = structuredClone(result.draft);
    draft.sections[0].fields[1].options = ["Only one"];
    await expectCode(forms.publish(db, req("chief-a", { departmentId: A, importId, draft })), "failed-precondition");
    assert.equal((await db.collection(`departments/${A}/formTemplates`).get()).size, 0);
  });

  it("a published import can't be published twice", async () => {
    const { importId } = await publishedForm();
    await expectCode(forms.publish(db, req("chief-a", { departmentId: A, importId })), "failed-precondition");
    assert.equal((await db.collection(`departments/${A}/formTemplates`).get()).size, 1);
  });

  it("revisions add a version; old submissions keep their snapshot; stale fill-ins are refused", async () => {
    const { templateId, versionId, draft } = await publishedForm();
    const first = await forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, versionId, answers: answersFor(draft) }));
    const revised = await forms.reviseTemplate(db, req("chief-a", { departmentId: A, templateId, draft: { ...draft, name: "Hose Test v2" } }));
    assert.equal(revised.versionId, `${templateId}-v2`);
    await expectCode(forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, versionId, answers: answersFor(draft) })), "failed-precondition");
    const old = (await db.doc(`departments/${A}/formSubmissions/${first.submissionId}`).get()).data();
    assert.equal(old.templateSnapshot.name, "Hose Test Record");
  });

  it("archived forms can't be filled in", async () => {
    const { templateId, draft } = await publishedForm();
    await forms.setTemplateStatus(db, req("chief-a", { departmentId: A, templateId, status: "archived" }));
    await expectCode(forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, answers: answersFor(draft) })), "not-found");
  });

  it("discarding deletes the uploaded file", async () => {
    const { importId, uploadPath } = await startUpload("chief-a", A);
    await forms.discardImport(db, bucket, req("chief-a", { departmentId: A, importId }));
    assert.equal((await bucket.file(uploadPath).exists())[0], false);
    assert.equal((await db.doc(`departments/${A}/formImports/${importId}`).get()).data().status, "discarded");
  });
});

describe("tenant isolation (release blocking)", () => {
  it("department B can't start uploads, convert, review, publish or discard in department A", async () => {
    const { importId } = await startUpload("chief-a", A);
    const fake = fakeClient();
    await expectCode(forms.createImport(db, req("chief-b", { departmentId: A, fileName: "x.pdf", contentType: "application/pdf", size: 10 })), "permission-denied");
    await expectCode(forms.convertImport(db, bucket, req("chief-b", { departmentId: A, importId }), fake), "permission-denied");
    await expectCode(forms.saveDraft(db, req("chief-b", { departmentId: A, importId, draft: OUTPUT })), "permission-denied");
    await expectCode(forms.publish(db, req("chief-b", { departmentId: A, importId, draft: OUTPUT })), "permission-denied");
    await expectCode(forms.discardImport(db, bucket, req("chief-b", { departmentId: A, importId })), "permission-denied");
    assert.equal(fake.calls.length, 0, "A's file was never sent anywhere");
  });

  it("A's import id used from department B finds nothing", async () => {
    const { importId } = await startUpload("chief-a", A);
    const fake = fakeClient();
    await expectCode(forms.convertImport(db, bucket, req("chief-b", { departmentId: B, importId }), fake), "not-found");
    await expectCode(forms.saveDraft(db, req("chief-b", { departmentId: B, importId, draft: OUTPUT })), "not-found");
    await expectCode(forms.publish(db, req("chief-b", { departmentId: B, importId })), "not-found");
    await expectCode(forms.discardImport(db, bucket, req("chief-b", { departmentId: B, importId })), "not-found");
    assert.equal(fake.calls.length, 0);
    assert.equal((await bucket.file(`formImports/${A}/${importId}/source.pdf`).exists())[0], true);
  });

  it("an import record in B that points at A's file is refused (paths come from the verified department)", async () => {
    const { importId, uploadPath } = await startUpload("chief-a", A);
    await db.doc(`departments/${B}/formImports/${importId}`).set({
      id: importId, status: "awaiting_upload", fileName: "stolen.pdf", contentType: "application/pdf", size: PDF.length, uploadPath, createdBy: "chief-b",
    });
    const fake = fakeClient();
    await expectCode(forms.convertImport(db, bucket, req("chief-b", { departmentId: B, importId }), fake), "failed-precondition");
    assert.equal(fake.calls.length, 0);
  });

  it("B can't fill in A's form, even by id", async () => {
    const { templateId, draft } = await publishedForm();
    await expectCode(forms.submit(db, bucket, req("ff-b", { departmentId: A, templateId, answers: answersFor(draft) })), "permission-denied");
    await expectCode(forms.submit(db, bucket, req("ff-b", { departmentId: B, templateId, answers: answersFor(draft) })), "not-found");
    assert.equal((await db.collection(`departments/${B}/formSubmissions`).get()).size, 0);
  });

  it("each department's drafts and forms stay in its own collections", async () => {
    await publishedForm("chief-a", A);
    await publishedForm("chief-b", B);
    for (const dept of [A, B]) {
      const imports = await db.collection(`departments/${dept}/formImports`).get();
      assert.equal(imports.size, 1);
      assert.ok(imports.docs[0].data().uploadPath.startsWith(`formImports/${dept}/`));
      assert.equal((await db.collection(`departments/${dept}/formTemplates`).get()).size, 1);
    }
  });
});

describe("permissions", () => {
  it("only form managers upload, convert, review and publish", async () => {
    const data = { departmentId: A, fileName: "x.pdf", contentType: "application/pdf", size: 10 };
    await expectCode(forms.createImport(db, req("ff-a", data)), "permission-denied");
    await expectCode(forms.createImport(db, req("officer-a", data)), "permission-denied");
    await expectCode(forms.createImport(db, req(null, data)), "unauthenticated");
    const { importId } = await startUpload("chief-a", A);
    await expectCode(forms.convertImport(db, bucket, req("ff-a", { departmentId: A, importId }), fakeClient()), "permission-denied");
    await expectCode(forms.publish(db, req("ff-a", { departmentId: A, importId })), "permission-denied");
  });

  it("a member given manageDigitalForms can convert", async () => {
    await member(A, "clerk-a", ["firefighter"], { manageDigitalForms: true });
    await convertedImport("clerk-a", A);
  });

  it("read-only members can't fill in forms", async () => {
    const { templateId, draft } = await publishedForm();
    await expectCode(forms.submit(db, bucket, req("ro-a", { departmentId: A, templateId, answers: answersFor(draft) })), "permission-denied");
  });

  it("forms follow the Documents module", async () => {
    await db.doc(`platformEntitlements/${A}`).set({ modules: ["dashboard", "administration"] });
    await expectCode(forms.createImport(db, req("chief-a", { departmentId: A, fileName: "x.pdf", contentType: "application/pdf", size: 10 })), "permission-denied");
  });

  it("the public demo department can't convert files (cost), except FORGE staff", async () => {
    await expectCode(forms.createImport(db, req("demo-admin", { departmentId: DEMO, fileName: "x.pdf", contentType: "application/pdf", size: 10 })), "permission-denied");
    await forms.createImport(db, req("creator-1", { departmentId: DEMO, fileName: "x.pdf", contentType: "application/pdf", size: 10 }));
  });
});

describe("abuse and failure cases", () => {
  it("rejects wrong types and oversized files before anything is stored", async () => {
    const base = { departmentId: A, fileName: "x", size: 10 };
    await expectCode(forms.createImport(db, req("chief-a", { ...base, contentType: "text/html" })), "invalid-argument");
    await expectCode(forms.createImport(db, req("chief-a", { ...base, contentType: "application/pdf", size: forms.MAX_UPLOAD_BYTES + 1 })), "invalid-argument");
    assert.equal((await db.collection(`departments/${A}/formImports`).get()).size, 0);
  });

  it("a file whose bytes don't match its type is never sent", async () => {
    const { importId } = await startUpload("chief-a", A, { body: Buffer.from("<html>not a pdf</html>") });
    const fake = fakeClient();
    await expectCode(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId }), fake), "invalid-argument");
    assert.equal(fake.calls.length, 0);
  });

  it("converting before the upload finishes fails cleanly and can be retried", async () => {
    const started = await forms.createImport(db, req("chief-a", { departmentId: A, fileName: "x.pdf", contentType: "application/pdf", size: PDF.length }));
    const fake = fakeClient();
    await expectCode(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId: started.importId }), fake), "failed-precondition");
    await bucket.file(started.uploadPath).save(PDF, { contentType: "application/pdf" });
    const result = await forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId: started.importId }), fake);
    assert.equal(result.status, "review");
  });

  it("a converted upload isn't converted (and billed) again", async () => {
    const fake = fakeClient();
    const { importId } = await convertedImport("chief-a", A, fake);
    await expectCode(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId }), fake), "failed-precondition");
    assert.equal(fake.calls.length, 1);
  });

  it("an API failure marks the upload failed and gives back the day's allowance", async () => {
    const { importId } = await startUpload("chief-a", A);
    const fail = Object.assign(new Error("rate limited"), { status: 429 });
    await expectCode(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId }), fakeClient(OUTPUT, { fail })), "resource-exhausted");
    const record = (await db.doc(`departments/${A}/formImports/${importId}`).get()).data();
    assert.equal(record.status, "failed");
    const day = new Date().toISOString().slice(0, 10);
    assert.equal((await db.doc(`platformAiUsage/${A}_${day}`).get()).data().formConversions, 0);
  });

  it("stops at the daily conversion limit", async () => {
    const day = new Date().toISOString().slice(0, 10);
    await db.doc(`platformAiUsage/${A}_${day}`).set({ formConversions: forms.DAILY_CONVERSIONS_PER_DEPARTMENT });
    const { importId } = await startUpload("chief-a", A);
    const fake = fakeClient();
    await expectCode(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId }), fake), "resource-exhausted");
    assert.equal(fake.calls.length, 0);
  });

  it("missing API key gives a clear message", async () => {
    const { importId } = await startUpload("chief-a", A);
    const getClient = () => { throw Object.assign(new Error("Form conversion isn't set up yet (missing API key)."), { code: "failed-precondition" }); };
    await assert.rejects(forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId }), { getClient }));
    assert.equal((await db.doc(`departments/${A}/formImports/${importId}`).get()).data().status, "failed");
  });
});

describe("linked records", () => {
  async function seedRecords() {
    await Promise.all([
      db.doc(`departments/${A}/fleetAssets/asset-e1`).set({ fleetNumber: "E1", name: "Engine 1", station: "Station 1", status: "in_service" }),
      db.doc(`departments/${A}/fleetAssets/asset-old`).set({ fleetNumber: "E9", status: "decommissioned" }),
      db.doc(`departments/${A}/lists/hlfd-rms-apparatus`).set({ items: [{ id: "L1", unit: "Ladder 1", station: "Station 2" }] }),
      db.doc(`departments/${A}/occupancies/occ-1`).set({ name: "Main St Bakery", address: "1 Main St", status: "Active" }),
      db.doc(`departments/${A}/profile/main`).set({ stations: ["Station 1", "Station 2"], stationDetails: [{ name: "Station 1", address: "100 Fire Rd" }] }),
      db.doc(`departments/${A}/lists/hlfd-rms-personnel`).set({ items: [{ id: "p-1", name: "Jane Doe", rank: "Captain" }] }),
      db.doc(`departments/${B}/fleetAssets/asset-b1`).set({ fleetNumber: "B-E1", status: "in_service" }),
    ]);
  }

  async function linkedForm(linkType) {
    const started = await forms.createImport(db, req("chief-a", { departmentId: A, fileName: "check.pdf", contentType: "application/pdf", size: PDF.length, linkType }));
    await bucket.file(started.uploadPath).save(PDF, { contentType: "application/pdf" });
    const converted = await forms.convertImport(db, bucket, req("chief-a", { departmentId: A, importId: started.importId }), fakeClient());
    const published = await forms.publish(db, req("chief-a", { departmentId: A, importId: started.importId, draft: converted.draft }));
    return { ...published, draft: converted.draft };
  }

  it("the type picked at upload carries through review, publish and the published version", async () => {
    const { templateId, versionId, draft } = await linkedForm("apparatus");
    assert.equal(draft.linkType, "apparatus");
    assert.equal((await db.doc(`departments/${A}/formTemplates/${templateId}`).get()).data().linkType, "apparatus");
    assert.equal((await db.doc(`departments/${A}/formTemplateVersions/${versionId}`).get()).data().snapshot.linkType, "apparatus");
    const bad = await forms.createImport(db, req("chief-a", { departmentId: A, fileName: "x.pdf", contentType: "application/pdf", size: 10, linkType: "incident" }));
    assert.equal((await db.doc(`departments/${A}/formImports/${bad.importId}`).get()).data().linkType, "");
  });

  it("lists each type's records from the caller's own department only", async () => {
    await seedRecords();
    const labels = async (type) => (await forms.linkOptions(db, req("ff-a", { departmentId: A, type }))).options.map((o) => o.label);
    assert.deepEqual(await labels("apparatus"), ["E1", "Ladder 1"]);
    assert.deepEqual(await labels("occupancy"), ["Main St Bakery"]);
    assert.deepEqual(await labels("station"), ["Station 1", "Station 2"]);
    assert.deepEqual(await labels("personnel"), ["Jane Doe"]);
    await expectCode(forms.linkOptions(db, req("ff-b", { departmentId: A, type: "apparatus" })), "permission-denied");
    await expectCode(forms.linkOptions(db, req("ro-a", { departmentId: A, type: "apparatus" })), "permission-denied");
    await expectCode(forms.linkOptions(db, req("ff-a", { departmentId: A, type: "incident" })), "invalid-argument");
  });

  it("a linked form needs a record from this department, and saves the server's label", async () => {
    await seedRecords();
    const { templateId, versionId, draft } = await linkedForm("apparatus");
    const base = { departmentId: A, templateId, versionId, answers: answersFor(draft) };
    await expectCode(forms.submit(db, bucket, req("ff-a", base)), "invalid-argument");
    // B's apparatus id, or a made-up one, is not found in A.
    await expectCode(forms.submit(db, bucket, req("ff-a", { ...base, linkedRecord: { id: "fleet:asset-b1" } })), "invalid-argument");
    await expectCode(forms.submit(db, bucket, req("ff-a", { ...base, linkedRecord: { id: "fleet:asset-old" } })), "invalid-argument");
    const { submissionId } = await forms.submit(db, bucket, req("ff-a", { ...base, linkedRecord: { id: "fleet:asset-e1", label: "Spoofed" } }));
    const saved = (await db.doc(`departments/${A}/formSubmissions/${submissionId}`).get()).data();
    assert.deepEqual(saved.linkedRecord, { type: "apparatus", id: "fleet:asset-e1", label: "E1", detail: "Engine 1 · Station 1" });
    assert.equal(saved.linkedType, "apparatus");
    assert.equal(saved.linkedId, "fleet:asset-e1");
  });

  it("an unlinked form ignores a linked record", async () => {
    await seedRecords();
    const { templateId, versionId, draft } = await publishedForm();
    const { submissionId } = await forms.submit(db, bucket, req("ff-a", { departmentId: A, templateId, versionId, answers: answersFor(draft), linkedRecord: { id: "fleet:asset-e1" } }));
    assert.equal((await db.doc(`departments/${A}/formSubmissions/${submissionId}`).get()).data().linkedRecord, null);
  });
});

describe("remarks and photos on a Fail answer", () => {
  const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
  const photo = async (departmentId, uid, name = "abcdef1234.jpg", contentType = "image/jpeg") => {
    const path = `formSubmissionPhotos/${departmentId}/${uid}/${name}`;
    await bucket.file(path).save(JPEG, { contentType });
    return path;
  };
  async function failing() {
    const { templateId, versionId, draft } = await publishedForm();
    const answers = answersFor(draft);
    const resultKey = draft.sections.flatMap((s) => s.fields).find((f) => f.label === "Result").key;
    answers[resultKey] = "Fail";
    return { resultKey, base: { departmentId: A, templateId, versionId, answers } };
  }

  it("needs remarks, and saves them with the member's own photos", async () => {
    const { resultKey, base } = await failing();
    await expectCode(forms.submit(db, bucket, req("ff-a", base)), "invalid-argument");
    const mine = await photo(A, "ff-a");
    const { submissionId } = await forms.submit(db, bucket, req("ff-a", { ...base, details: { [resultKey]: { remarks: "Burst at 200 psi", photos: [mine] } } }));
    const saved = (await db.doc(`departments/${A}/formSubmissions/${submissionId}`).get()).data();
    assert.deepEqual(saved.details, { [resultKey]: { remarks: "Burst at 200 psi", photos: [mine] } });
  });

  it("refuses another member's, another department's, missing or non-image photos", async () => {
    const { resultKey, base } = await failing();
    const send = (path) => forms.submit(db, bucket, req("ff-a", { ...base, details: { [resultKey]: { remarks: "r", photos: [path] } } }));
    await expectCode(send(await photo(A, "officer-a")), "invalid-argument");
    await expectCode(send(await photo(B, "ff-a")), "invalid-argument");
    await expectCode(send(`formSubmissionPhotos/${A}/ff-a/missing0001.jpg`), "invalid-argument");
    await expectCode(send(await photo(A, "ff-a", "notaphoto01.jpg", "application/pdf")), "invalid-argument");
    await expectCode(send(`formImports/${A}/x/source.pdf`), "invalid-argument");
  });
});

describe("platform default inspection form", () => {
  const DEFAULT = {
    version: "forge-demo:form-1:v3:2026-11-18T12:00:00.000Z",
    name: "Fire Inspection Report",
    description: "Platform default",
    sections: [{ id: "s1", title: "Access", fields: [
      { id: "f1", key: "access", label: "Fire Department access is unobstructed", type: "dropdown", options: ["Yes", "No"], required: true },
      { id: "f2", key: "numbers", label: "Address numbers visible", type: "yes_no", options: [] },
    ] }],
  };

  it("a department copies it as its own editable form, once", async () => {
    await db.doc("platformConfig/defaultInspectionForm").set(DEFAULT);
    const first = await forms.copyPlatformDefault(db, req("chief-b", { departmentId: B }));
    assert.equal(first.existing, false);
    const copy = (await db.doc(`departments/${B}/formTemplates/${first.templateId}`).get()).data();
    assert.equal(copy.name, "Fire Inspection Report");
    assert.equal(copy.platformDefaultVersion, DEFAULT.version);
    assert.equal(copy.lifecycleStatus, "published");
    assert.deepEqual(copy.sections[0].fields.map((f) => f.key), ["access", "numbers"]);
    assert.deepEqual(copy.sections[0].fields[0].options, ["Yes", "No"]);
    assert.ok((await db.doc(`departments/${B}/formTemplateVersions/${first.versionId}`).get()).exists);

    const again = await forms.copyPlatformDefault(db, req("chief-b", { departmentId: B }));
    assert.equal(again.templateId, first.templateId);
    assert.equal(again.existing, true);

    // Editing the copy is an ordinary revision of the department's form.
    const revised = await forms.reviseTemplate(db, req("chief-b", { departmentId: B, templateId: first.templateId, draft: { ...copy, name: "Our Fire Inspection Report" } }));
    assert.equal(revised.versionId, `${first.templateId}-v2`);
    assert.equal((await db.doc(`departments/${A}/formTemplates/${first.templateId}`).get()).exists, false, "other departments untouched");
  });

  it("needs a default to be set and manageDigitalForms in that department", async () => {
    await expectCode(forms.copyPlatformDefault(db, req("chief-b", { departmentId: B })), "not-found");
    await db.doc("platformConfig/defaultInspectionForm").set(DEFAULT);
    await expectCode(forms.copyPlatformDefault(db, req("ff-b", { departmentId: B })), "permission-denied");
    await expectCode(forms.copyPlatformDefault(db, req("chief-b", { departmentId: A })), "permission-denied");
  });
});
