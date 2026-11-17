/**
 * Digital Forms client. Every change goes through a Cloud Function
 * (functions/lib/digitalForms) that checks the caller's department membership
 * and permissions; the department id sent here only selects the department.
 * Firestore rules let the browser read: uploads under review (form managers),
 * published forms (members who fill them in) and submissions (your own, or all
 * of them with viewDigitalFormSubmissions).
 */
import { httpsCallable } from "firebase/functions";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { getDownloadURL, ref } from "firebase/storage";
import { getFirebaseFunctions, getFirebaseStorage, getFirestoreDb, uploadFirebaseFile } from "../firebaseClient.js";

export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

async function call(name, payload, timeout = 60000) {
  const functions = getFirebaseFunctions();
  if (!functions) throw new Error("Firebase Functions are not configured.");
  const result = await httpsCallable(functions, name, { timeout })(payload);
  return result.data || {};
}

/** Problems with a chosen file before anything is uploaded ("" when fine). */
export function checkFile(file) {
  if (!file) return "Choose a file.";
  if (!ACCEPTED_TYPES.includes(file.type)) return "Upload a PDF, PNG or JPG file.";
  if (!file.size) return "The file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 20 MB.";
  return "";
}

/** Start an import, upload the file where the server says, then convert it. */
export async function uploadAndConvert(departmentId, file, onStage = () => {}) {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  onStage("upload");
  const { importId, uploadPath } = await call("digitalFormsCreateImport", {
    departmentId, fileName: file.name, contentType: file.type, size: file.size,
  });
  await uploadFirebaseFile(uploadPath, file);
  onStage("convert");
  return convertImport(departmentId, importId);
}

export const convertImport = (departmentId, importId) => call("digitalFormsConvert", { departmentId, importId }, 540000);
export const saveImportDraft = (departmentId, importId, draft) => call("digitalFormsSaveDraft", { departmentId, importId, draft });
export const publishImport = (departmentId, importId, draft) => call("digitalFormsPublish", { departmentId, importId, draft });
export const discardImport = (departmentId, importId) => call("digitalFormsDiscardImport", { departmentId, importId });
export const reviseForm = (departmentId, templateId, draft) => call("digitalFormsRevise", { departmentId, templateId, draft });
export const setFormStatus = (departmentId, templateId, status) => call("digitalFormsSetStatus", { departmentId, templateId, status });
export const submitForm = (departmentId, templateId, versionId, answers) =>
  call("digitalFormsSubmit", { departmentId, templateId, versionId, answers });

const byNewest = (field) => (a, b) => String(b[field] || "").localeCompare(String(a[field] || ""));

function watch(target, sortField, onChange, onError) {
  return onSnapshot(
    target,
    (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byNewest(sortField))),
    (error) => onError?.(error)
  );
}

function tenantCollection(departmentId, name) {
  const db = getFirestoreDb();
  if (!db || !departmentId) return null;
  return collection(db, "departments", departmentId, name);
}

const noop = () => () => {};

export function watchImports(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "formImports");
  return target ? watch(target, "createdAt", onChange, onError) : noop();
}

export function watchForms(departmentId, onChange, onError) {
  const target = tenantCollection(departmentId, "formTemplates");
  return target ? watch(target, "updatedAt", onChange, onError) : noop();
}

/** Everyone's submissions (managers/reviewers) or only the member's own. */
export function watchSubmissions(departmentId, { uid, all }, onChange, onError) {
  const target = tenantCollection(departmentId, "formSubmissions");
  if (!target) return noop();
  const q = all ? target : query(target, where("submittedBy", "==", uid || "-"));
  return watch(q, "submittedAt", onChange, onError);
}

export async function loadFormVersion(departmentId, versionId) {
  const db = getFirestoreDb();
  const snap = await getDoc(doc(db, "departments", departmentId, "formTemplateVersions", versionId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Download link for an uploaded original (form managers only). */
export async function originalFileUrl(uploadPath) {
  const storage = getFirebaseStorage();
  if (!storage || !uploadPath) return "";
  return getDownloadURL(ref(storage, uploadPath));
}

export function describeError(error) {
  const message = String(error?.message || "").trim();
  if (!message || /^internal$/i.test(message)) return "Something went wrong. Try again.";
  return message;
}
