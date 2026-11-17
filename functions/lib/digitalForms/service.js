/**
 * Digital Forms: turn an uploaded paper form into a form members fill in.
 *
 * Data (all under departments/{departmentId}/, written by Cloud Functions only):
 *   formImports/{importId}           one upload: status, file details, the draft definition under review
 *   formTemplates/{templateId}       a published form (current definition + version pointer)
 *   formTemplateVersions/{id}        immutable snapshot of each published version ("<templateId>-v<N>")
 *   formSubmissions/{submissionId}   a member's answers, with the version snapshot they answered
 * Storage:
 *   formImports/{departmentId}/{importId}/source.{pdf|png|jpg}   the uploaded file
 *
 * Flow: createImport (server picks the upload path) -> the browser uploads the
 * file -> convertImport (Claude reads it into a draft) -> saveDraft (review edits)
 * -> publish (nothing is live before this) -> submit (members fill it in).
 *
 * The department id in a request only selects a department. Membership and
 * permissions are checked on the server, and every document and file path is
 * built from that verified department, so one department can never read,
 * convert or publish another department's upload.
 */
const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { assertMemberPermission, isPlatformCreator } = require("../access");
const { isDemoDepartment } = require("../demoGuard");
const { cleanAnswers, countFields, normalizeDefinition, normalizeLinkType, validateDefinition } = require("./schema");
const { ExtractionError, extractForm } = require("./extract");
const { listLinkOptions, resolveLinkedRecord } = require("./links");

const PERMISSIONS = Object.freeze({
  manage: "manageDigitalForms",
  fill: "fillDigitalForms",
  viewSubmissions: "viewDigitalFormSubmissions",
});
const MODULE_KEY = "documents";
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const DAILY_CONVERSIONS_PER_DEPARTMENT = 25;
const STALE_CONVERSION_MS = 10 * 60 * 1000;
const FILE_TYPES = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };
/** Photos on a No/Fail answer, uploaded by the member before submitting. */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_NAME = /^[A-Za-z0-9_-]{8,64}\.(jpg|png|webp)$/;
const LINK_LABELS = { apparatus: "apparatus", occupancy: "occupancy", station: "station", personnel: "member" };

const text = (v, max = 200) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const nowIso = () => new Date().toISOString();

const paths = {
  imports: (d) => `departments/${d}/formImports`,
  importDoc: (d, id) => `departments/${d}/formImports/${id}`,
  templates: (d) => `departments/${d}/formTemplates`,
  templateDoc: (d, id) => `departments/${d}/formTemplates/${id}`,
  versionDoc: (d, id) => `departments/${d}/formTemplateVersions/${id}`,
  submissions: (d) => `departments/${d}/formSubmissions`,
  upload: (d, importId, ext) => `formImports/${d}/${importId}/source.${ext}`,
  photoFolder: (d, uid) => `formSubmissionPhotos/${d}/${uid}/`,
  usage: (d, day) => `platformAiUsage/${d}_${day}`,
};

function cleanDepartmentId(value) {
  const id = text(value, 200);
  if (!id || id.length > 120 || id.includes("/") || id === "." || id === "..") {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }
  return id;
}

function cleanDocId(value, label) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

/** Verify the caller (membership + one of the permissions) and the Documents module. */
async function resolveCaller(db, request, anyOf) {
  const departmentId = cleanDepartmentId(request.data?.departmentId);
  const permissions = await assertMemberPermission(db, departmentId, request.auth, anyOf,
    "You don't have permission to do that with digital forms.");
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes(MODULE_KEY)) {
    throw new HttpsError("permission-denied", "Documents aren't included in your department's plan.");
  }
  return {
    departmentId,
    uid: request.auth.uid,
    name: text(request.auth.token?.name || request.auth.token?.email, 200),
    permissions,
  };
}

// The demo department's sign-in is public, so only FORGE staff may convert
// files there (conversion sends the file to Anthropic and costs money).
async function assertConvertAllowed(db, caller, request) {
  if (isDemoDepartment(caller.departmentId) && !(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Form conversion is turned off in the demo department.");
  }
}

async function loadImport(db, departmentId, importId) {
  const snap = await db.doc(paths.importDoc(departmentId, importId)).get();
  if (!snap.exists) throw new HttpsError("not-found", "That upload wasn't found.");
  return { id: snap.id, ...snap.data() };
}

function audit(db, caller, action, recordId, summary) {
  return db.collection(`departments/${caller.departmentId}/auditLogs`).add({
    action,
    module: "Digital Forms",
    recordId,
    summary,
    actorUid: caller.uid,
    actorName: caller.name,
    created_at: nowIso(),
  }).catch(() => undefined);
}

function publicImport(record) {
  return {
    id: record.id,
    status: record.status,
    fileName: record.fileName || "",
    contentType: record.contentType || "",
    draft: record.draft || null,
    warnings: record.warnings || [],
    problems: record.draft ? validateDefinition(record.draft) : [],
    error: record.error || "",
    templateId: record.templateId || "",
  };
}

// ---------------------------------------------------------------- daily cap

async function reserveDailyConversion(db, departmentId) {
  const day = nowIso().slice(0, 10);
  const ref = db.doc(paths.usage(departmentId, day));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.formConversions || 0);
    if (count >= DAILY_CONVERSIONS_PER_DEPARTMENT) {
      throw new HttpsError("resource-exhausted", "Your department has reached today's limit for form conversions. Try again tomorrow.");
    }
    tx.set(ref, { departmentId, day, formConversions: count + 1, updatedAt: nowIso() }, { merge: true });
  });
}

async function releaseDailyConversion(db, departmentId) {
  const day = nowIso().slice(0, 10);
  const ref = db.doc(paths.usage(departmentId, day));
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = Number(snap.data()?.formConversions || 0);
    if (count > 0) tx.set(ref, { formConversions: count - 1, updatedAt: nowIso() }, { merge: true });
  });
}

// ---------------------------------------------------------------- upload + convert

/** Start an upload: the server picks where the file goes. Needs manageDigitalForms. */
async function createImport(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  await assertConvertAllowed(db, caller, request);
  const contentType = text(request.data?.contentType, 100).toLowerCase();
  const ext = FILE_TYPES[contentType];
  if (!ext) throw new HttpsError("invalid-argument", "Upload a PDF, PNG or JPG file.");
  const size = Number(request.data?.size);
  if (!Number.isFinite(size) || size <= 0) throw new HttpsError("invalid-argument", "The file is empty.");
  if (size > MAX_UPLOAD_BYTES) throw new HttpsError("invalid-argument", "The file is larger than 20 MB.");
  const fileName = text(request.data?.fileName, 200).replace(/[\\/]/g, "_") || `form.${ext}`;

  const ref = db.collection(paths.imports(caller.departmentId)).doc();
  const uploadPath = paths.upload(caller.departmentId, ref.id, ext);
  await ref.set({
    id: ref.id,
    status: "awaiting_upload",
    fileName,
    contentType,
    size,
    uploadPath,
    linkType: normalizeLinkType(request.data?.linkType),
    createdBy: caller.uid,
    createdByName: caller.name,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { importId: ref.id, uploadPath, maxBytes: MAX_UPLOAD_BYTES };
}

/** The file's first bytes must match its declared type. */
function matchesSignature(buffer, contentType) {
  const b = Buffer.from(buffer);
  if (contentType === "application/pdf") return b.subarray(0, 5).toString("latin1") === "%PDF-";
  if (contentType === "image/png") return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (contentType === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return false;
}

function conversionError(error) {
  if (error instanceof HttpsError) return error;
  if (error instanceof ExtractionError) {
    const code = ["not-a-form", "no-fields", "unsupported-type"].includes(error.reason) ? "invalid-argument" : "failed-precondition";
    return new HttpsError(code, error.message);
  }
  const status = Number(error?.status) || 0;
  const message = String(error?.message || "");
  if (status === 429 || status === 529) return new HttpsError("resource-exhausted", "The conversion service is busy. Try again in a minute.");
  if (status === 401 || status === 403) {
    console.error("digitalForms: API key rejected", status);
    return new HttpsError("failed-precondition", "Form conversion isn't set up correctly. Contact FORGE Public Safety.");
  }
  if (status === 413 || (status === 400 && /too (large|long)|pages|maximum/i.test(message))) {
    return new HttpsError("invalid-argument", "This file is too large to convert. Try a smaller PDF or one page at a time.");
  }
  if (status === 400 && /credit balance/i.test(message)) {
    console.error("digitalForms: Anthropic account is out of credits");
    return new HttpsError("failed-precondition", "Form conversion is paused right now. Contact FORGE Public Safety.");
  }
  if (!status && /connection|network|timeout|ECONN/i.test(`${error?.name} ${message}`)) {
    return new HttpsError("unavailable", "Couldn't reach the conversion service. Try again.");
  }
  console.error("digitalForms: conversion failed", status, message);
  return new HttpsError("internal", "Couldn't convert the form. Try again.");
}

/**
 * Read the uploaded file into a draft for review. Needs manageDigitalForms.
 * `getClient()` returns the Anthropic client (or throws when it isn't set up).
 */
async function convertImport(db, bucket, request, { getClient }) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  await assertConvertAllowed(db, caller, request);
  const importId = cleanDocId(request.data?.importId, "importId");
  const ref = db.doc(paths.importDoc(caller.departmentId, importId));

  // Claim the import so two clicks can't convert (and bill) it twice.
  const record = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "That upload wasn't found.");
    const data = snap.data();
    const stale = data.status === "converting" && Date.now() - Date.parse(data.updatedAt || 0) > STALE_CONVERSION_MS;
    if (!["awaiting_upload", "failed"].includes(data.status) && !stale) {
      throw new HttpsError("failed-precondition", data.status === "converting"
        ? "This form is already being converted."
        : "This upload has already been converted.");
    }
    tx.update(ref, { status: "converting", error: "", updatedAt: nowIso() });
    return { id: snap.id, ...data };
  });

  let reserved = false;
  try {
    const expectedPath = paths.upload(caller.departmentId, importId, FILE_TYPES[record.contentType]);
    if (record.uploadPath !== expectedPath) throw new HttpsError("failed-precondition", "That upload is incomplete. Upload the file again.");
    const file = bucket.file(expectedPath);
    const [exists] = await file.exists();
    if (!exists) throw new HttpsError("failed-precondition", "The file hasn't finished uploading. Try again.");
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > MAX_UPLOAD_BYTES) throw new HttpsError("invalid-argument", "The file is larger than 20 MB.");
    if (metadata.contentType !== record.contentType) throw new HttpsError("invalid-argument", "The file type doesn't match the upload.");
    const [buffer] = await file.download();
    if (!matchesSignature(buffer, record.contentType)) {
      throw new HttpsError("invalid-argument", "The file isn't a valid PDF, PNG or JPG.");
    }

    const client = getClient();
    await reserveDailyConversion(db, caller.departmentId);
    reserved = true;
    const result = await extractForm(client, { buffer, contentType: record.contentType, fileName: record.fileName });
    // The record type picked on the upload screen; the model never chooses it.
    result.definition = { ...result.definition, linkType: normalizeLinkType(record.linkType) };
    await ref.update({
      status: "review",
      draft: result.definition,
      warnings: result.warnings,
      model: result.model,
      usage: result.usage,
      convertedAt: nowIso(),
      convertedBy: caller.uid,
      updatedAt: nowIso(),
    });
    await audit(db, caller, "digitalForms.converted", importId, `Converted ${record.fileName} (${countFields(result.definition)} fields)`);
    return publicImport({ ...record, status: "review", draft: result.definition, warnings: result.warnings });
  } catch (error) {
    const mapped = conversionError(error);
    // Give the day's allowance back unless the file itself was the problem.
    if (reserved && !(error instanceof ExtractionError)) await releaseDailyConversion(db, caller.departmentId).catch(() => undefined);
    await ref.update({ status: "failed", error: mapped.message, updatedAt: nowIso() }).catch(() => undefined);
    throw mapped;
  }
}

// ---------------------------------------------------------------- review + publish

/** Save review edits to the draft. Needs manageDigitalForms. */
async function saveDraft(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const importId = cleanDocId(request.data?.importId, "importId");
  const record = await loadImport(db, caller.departmentId, importId);
  if (record.status !== "review") throw new HttpsError("failed-precondition", "Only a converted form waiting for review can be edited.");
  const draft = normalizeDefinition(request.data?.draft);
  await db.doc(paths.importDoc(caller.departmentId, importId)).update({ draft, updatedAt: nowIso(), updatedBy: caller.uid });
  return publicImport({ ...record, draft });
}

function versionRecord(templateId, version, definition, caller) {
  return {
    id: `${templateId}-v${version}`,
    templateId,
    version,
    snapshot: { name: definition.name, description: definition.description, linkType: definition.linkType || "", sections: definition.sections },
    publishedAt: nowIso(),
    publishedBy: caller.uid,
    publishedByName: caller.name,
  };
}

function assertPublishable(definition) {
  const problems = validateDefinition(definition);
  if (problems.length) throw new HttpsError("failed-precondition", `Fix these before publishing: ${problems.join(" ")}`, { problems });
}

/** Publish a reviewed draft as a new form. Needs manageDigitalForms. */
async function publish(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const importId = cleanDocId(request.data?.importId, "importId");
  const importRef = db.doc(paths.importDoc(caller.departmentId, importId));
  const templateRef = db.collection(paths.templates(caller.departmentId)).doc();

  const definition = await db.runTransaction(async (tx) => {
    const snap = await tx.get(importRef);
    if (!snap.exists) throw new HttpsError("not-found", "That upload wasn't found.");
    const record = snap.data();
    if (record.status !== "review") throw new HttpsError("failed-precondition", "Only a converted form waiting for review can be published.");
    const def = normalizeDefinition(request.data?.draft || record.draft);
    assertPublishable(def);
    const version = versionRecord(templateRef.id, 1, def, caller);
    tx.set(templateRef, {
      id: templateRef.id,
      name: def.name,
      description: def.description,
      linkType: def.linkType || "",
      sections: def.sections,
      fieldCount: countFields(def),
      lifecycleStatus: "published",
      currentVersion: 1,
      publishedVersionId: version.id,
      sourceImportId: importId,
      createdAt: nowIso(),
      createdBy: caller.uid,
      updatedAt: nowIso(),
      publishedAt: nowIso(),
      publishedBy: caller.uid,
    });
    tx.set(db.doc(paths.versionDoc(caller.departmentId, version.id)), version);
    tx.update(importRef, { status: "published", draft: def, templateId: templateRef.id, updatedAt: nowIso() });
    return def;
  });
  await audit(db, caller, "digitalForms.published", templateRef.id, `Published form "${definition.name}"`);
  return { templateId: templateRef.id, versionId: `${templateRef.id}-v1` };
}

/** Publish changes to a live form as its next version. Needs manageDigitalForms. */
async function reviseTemplate(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const templateId = cleanDocId(request.data?.templateId, "templateId");
  const templateRef = db.doc(paths.templateDoc(caller.departmentId, templateId));
  const def = normalizeDefinition(request.data?.draft);
  assertPublishable(def);
  const versionId = await db.runTransaction(async (tx) => {
    const snap = await tx.get(templateRef);
    if (!snap.exists) throw new HttpsError("not-found", "That form wasn't found.");
    const next = Number(snap.data().currentVersion || 0) + 1;
    const version = versionRecord(templateId, next, def, caller);
    tx.set(db.doc(paths.versionDoc(caller.departmentId, version.id)), version);
    tx.update(templateRef, {
      name: def.name,
      description: def.description,
      linkType: def.linkType || "",
      sections: def.sections,
      fieldCount: countFields(def),
      currentVersion: next,
      publishedVersionId: version.id,
      updatedAt: nowIso(),
      publishedAt: nowIso(),
      publishedBy: caller.uid,
    });
    return version.id;
  });
  await audit(db, caller, "digitalForms.revised", templateId, `Published a new version of "${def.name}"`);
  return { templateId, versionId };
}

/** Archive (hide from members) or restore a form. Needs manageDigitalForms. */
async function setTemplateStatus(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const templateId = cleanDocId(request.data?.templateId, "templateId");
  const status = request.data?.status === "archived" ? "archived" : "published";
  const ref = db.doc(paths.templateDoc(caller.departmentId, templateId));
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "That form wasn't found.");
  await ref.update({ lifecycleStatus: status, updatedAt: nowIso() });
  await audit(db, caller, `digitalForms.${status}`, templateId, `${status === "archived" ? "Archived" : "Restored"} form "${snap.data().name}"`);
  return { templateId, lifecycleStatus: status };
}

/** Drop an upload that won't be published, and delete its file. Needs manageDigitalForms. */
async function discardImport(db, bucket, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.manage]);
  const importId = cleanDocId(request.data?.importId, "importId");
  const record = await loadImport(db, caller.departmentId, importId);
  if (["published", "converting"].includes(record.status)) {
    throw new HttpsError("failed-precondition", "This upload can't be discarded now.");
  }
  const ext = FILE_TYPES[record.contentType];
  if (ext) await bucket.file(paths.upload(caller.departmentId, importId, ext)).delete({ ignoreNotFound: true });
  await db.doc(paths.importDoc(caller.departmentId, importId)).update({ status: "discarded", draft: FieldValue.delete(), updatedAt: nowIso() });
  await audit(db, caller, "digitalForms.discarded", importId, `Discarded upload ${record.fileName}`);
  return { importId, status: "discarded" };
}

// ---------------------------------------------------------------- fill in

/** Save a member's filled-in form. Needs fillDigitalForms (or manageDigitalForms). */
/**
 * Photo paths the caller uploaded for this submission that really exist: under
 * formSubmissionPhotos/{verified department}/{caller uid}/, an image, ≤ 10 MB.
 * Anything else (another member's or department's photo, a made-up path) is left out,
 * and cleanAnswers then refuses the answer it was attached to.
 */
async function verifiedPhotoPaths(bucket, departmentId, uid, rawDetails) {
  const folder = paths.photoFolder(departmentId, uid);
  const wanted = new Set();
  const details = rawDetails && typeof rawDetails === "object" ? rawDetails : {};
  for (const entry of Object.values(details)) {
    for (const p of Array.isArray(entry?.photos) ? entry.photos : []) {
      const value = String(p || "");
      if (value.startsWith(folder) && PHOTO_NAME.test(value.slice(folder.length))) wanted.add(value);
      if (wanted.size > 60) break;
    }
  }
  const ok = new Set();
  await Promise.all([...wanted].map(async (p) => {
    try {
      const [metadata] = await bucket.file(p).getMetadata();
      if (PHOTO_TYPES.includes(metadata.contentType) && Number(metadata.size) <= MAX_PHOTO_BYTES) ok.add(p);
    } catch {
      // Missing file: not verified.
    }
  }));
  return ok;
}

/** Records a member can link a submission to. Needs any Digital Forms permission. */
async function linkOptions(db, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.fill, PERMISSIONS.manage, PERMISSIONS.viewSubmissions]);
  const type = normalizeLinkType(request.data?.type);
  if (!type) throw new HttpsError("invalid-argument", "Choose apparatus, occupancy, station or personnel.");
  return { type, options: await listLinkOptions(db, caller.departmentId, type) };
}

async function submit(db, bucket, request) {
  const caller = await resolveCaller(db, request, [PERMISSIONS.fill, PERMISSIONS.manage]);
  const templateId = cleanDocId(request.data?.templateId, "templateId");
  const templateSnap = await db.doc(paths.templateDoc(caller.departmentId, templateId)).get();
  if (!templateSnap.exists || templateSnap.data().lifecycleStatus !== "published") {
    throw new HttpsError("not-found", "That form isn't available.");
  }
  const template = templateSnap.data();
  const versionSnap = await db.doc(paths.versionDoc(caller.departmentId, template.publishedVersionId)).get();
  if (!versionSnap.exists) throw new HttpsError("not-found", "That form isn't available.");
  const version = versionSnap.data();
  // A member who opened an older version gets told to reload instead of saving mismatched answers.
  const askedVersion = text(request.data?.versionId, 200);
  if (askedVersion && askedVersion !== version.id) {
    throw new HttpsError("failed-precondition", "This form was updated while you were filling it in. Reload it and check your answers.");
  }
  const photoPaths = await verifiedPhotoPaths(bucket, caller.departmentId, caller.uid, request.data?.details);
  const { answers, details, problems } = cleanAnswers(version.snapshot, request.data?.answers, {
    details: request.data?.details,
    isPhotoPath: (p) => photoPaths.has(p),
  });
  const linkType = normalizeLinkType(version.snapshot.linkType);
  let linkedRecord = null;
  if (linkType) {
    const wantedId = text(request.data?.linkedRecord?.id, 200);
    if (!wantedId) {
      problems.unshift(`Choose the ${LINK_LABELS[linkType]} this form is for.`);
    } else {
      linkedRecord = await resolveLinkedRecord(db, caller.departmentId, linkType, wantedId);
      if (!linkedRecord) problems.unshift(`That ${LINK_LABELS[linkType]} wasn't found. Choose it again.`);
    }
  }
  if (problems.length) throw new HttpsError("invalid-argument", problems.join(" "), { problems });

  const ref = db.collection(paths.submissions(caller.departmentId)).doc();
  await ref.set({
    id: ref.id,
    templateId,
    templateVersionId: version.id,
    templateName: version.snapshot.name,
    templateSnapshot: version.snapshot,
    answers,
    details,
    linkedRecord,
    // Flat copies so a record's page can query its submissions.
    linkedType: linkedRecord?.type || "",
    linkedId: linkedRecord?.id || "",
    status: "submitted",
    submittedBy: caller.uid,
    submittedByName: caller.name,
    submittedAt: nowIso(),
  });
  return { submissionId: ref.id };
}

module.exports = {
  FILE_TYPES,
  MAX_UPLOAD_BYTES,
  DAILY_CONVERSIONS_PER_DEPARTMENT,
  PERMISSIONS,
  paths,
  convertImport,
  createImport,
  discardImport,
  linkOptions,
  matchesSignature,
  publish,
  reviseTemplate,
  saveDraft,
  setTemplateStatus,
  submit,
};
