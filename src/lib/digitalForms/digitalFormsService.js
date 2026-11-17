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
export async function uploadAndConvert(departmentId, file, onStage = () => {}, { linkType = "" } = {}) {
  const problem = checkFile(file);
  if (problem) throw new Error(problem);
  onStage("upload");
  const { importId, uploadPath } = await call("digitalFormsCreateImport", {
    departmentId, fileName: file.name, contentType: file.type, size: file.size, linkType,
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
export const submitForm = (departmentId, templateId, versionId, answers, { details = {}, linkedRecordId = "" } = {}) =>
  call("digitalFormsSubmit", {
    departmentId, templateId, versionId, answers, details,
    linkedRecord: linkedRecordId ? { id: linkedRecordId } : null,
  });

/** Records of one type (apparatus, occupancy, station, personnel) a form can be linked to. */
export const listLinkOptions = (departmentId, type) =>
  call("digitalFormsLinkOptions", { departmentId, type }).then((r) => r.options || []);

export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/**
 * Shrink a camera photo to at most 2000 px on its long side as a JPEG, so it
 * uploads quickly from the field. Falls back to the original file when the
 * browser can't read it.
 */
async function shrinkPhoto(file) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function randomName() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Upload a photo for a No/Fail answer into the member's own folder
 * (formSubmissionPhotos/{department}/{uid}/). Returns { path, url, name }.
 */
export async function uploadFormPhoto(departmentId, uid, file) {
  if (!departmentId || !uid) throw new Error("Sign in again to add photos.");
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("You're offline. Photos need a connection.");
  const photo = await shrinkPhoto(file);
  if (!PHOTO_TYPES.includes(photo.type)) throw new Error("Use a JPG, PNG or WebP photo.");
  if (photo.size > MAX_PHOTO_BYTES) throw new Error("That photo is larger than 10 MB.");
  const path = `formSubmissionPhotos/${departmentId}/${uid}/${randomName()}.${PHOTO_EXT[photo.type]}`;
  const uploaded = await uploadFirebaseFile(path, photo);
  return { path, url: uploaded.downloadUrl, name: file.name || "photo" };
}

/** Download link for a saved photo (the member who took it, or submission reviewers). */
export async function photoUrl(path) {
  const storage = getFirebaseStorage();
  if (!storage || !path) return "";
  return getDownloadURL(ref(storage, path));
}

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
