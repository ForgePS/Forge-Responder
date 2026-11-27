/**
 * Billing documents on a patient care report (see src/lib/pcr/pcrFiles.js): upload, list, open, remove.
 *
 * PHI. Files are uploaded and read with the signed-in person's credentials (getBlob), never through download links,
 * so storage.rules always decide who can open them. Audit entries name the report and the document kind only.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { deleteObject, getBlob, getMetadata, ref, uploadBytes } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage, getFirestoreDb } from "./firebaseClient.js";
import { writeAuditLog } from "./auditService.js";
import { PCR_FILES_COLLECTION, newPcrFileId, pcrFileKindLabel, pcrFileProblem, pcrFileRecord, sortPcrFiles } from "./pcr/pcrFiles.js";

const AUDIT_MODULE = "EMS";

function filesCollection(departmentId, pcrId) {
  return collection(getFirestoreDb(), "departments", departmentId, "pcrs", pcrId, PCR_FILES_COLLECTION);
}

export async function listPcrFiles(departmentId, pcrId) {
  const snap = await getDocs(filesCollection(departmentId, pcrId));
  return sortPcrFiles(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
}

/**
 * Put one file in Storage (uploadedBy = the signed-in person, as storage.rules require). No download link is made.
 */
export async function putPcrFileBytes(storagePath, blob, contentType) {
  const uid = getFirebaseAuth()?.currentUser?.uid || "";
  await uploadBytes(ref(getFirebaseStorage(), storagePath), blob, { contentType, customMetadata: { uploadedBy: uid } });
}

/**
 * Upload a document and record it on the report. When the record can't be written the uploaded file is removed
 * again, so no unlisted PHI is left behind.
 * @returns {Promise<object>} the files record
 */
export async function addPcrFile(departmentId, pcr, { file, kind }, actor = {}, { source = "rms", id = newPcrFileId() } = {}) {
  const problem = pcrFileProblem(file);
  if (problem) throw new Error(problem);
  const record = pcrFileRecord({ departmentId, pcrId: pcr.id, id, kind, contentType: file.type, size: file.size, actor, source });
  await putPcrFileBytes(record.storagePath, file, record.contentType);
  try {
    await setDoc(doc(filesCollection(departmentId, pcr.id), record.id), record);
  } catch (error) {
    await deleteObject(ref(getFirebaseStorage(), record.storagePath)).catch(() => null);
    throw error;
  }
  await writeAuditLog(departmentId, {
    ...actor,
    action: "pcr.file.add",
    module: AUDIT_MODULE,
    recordId: pcr.id,
    summary: `Added a billing document (${pcrFileKindLabel(kind)}) to patient care report ${pcr.number || pcr.id}`,
  }).catch(() => null);
  return record;
}

/** Whether a file is already in Storage (a retried upload from the field app). */
export async function pcrFileExists(storagePath) {
  try {
    await getMetadata(ref(getFirebaseStorage(), storagePath));
    return true;
  } catch (error) {
    if (error?.code === "storage/object-not-found") return false;
    throw error;
  }
}

/** Whether a files record is already on the report. */
export async function pcrFileRecordExists(departmentId, pcrId, fileId) {
  return (await getDoc(doc(filesCollection(departmentId, pcrId), fileId))).exists();
}

export async function writePcrFileRecord(departmentId, pcrId, record) {
  await setDoc(doc(filesCollection(departmentId, pcrId), record.id), record);
}

/** The file's bytes, read with the signed-in person's credentials. */
export function readPcrFile(file) {
  return getBlob(ref(getFirebaseStorage(), file.storagePath));
}

/** Remove a document: the file first (so no PHI is left without a record pointing at it), then its record. */
export async function removePcrFile(departmentId, pcr, file, actor = {}) {
  try {
    await deleteObject(ref(getFirebaseStorage(), file.storagePath));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") throw error;
  }
  await deleteDoc(doc(filesCollection(departmentId, pcr.id), file.id));
  await writeAuditLog(departmentId, {
    ...actor,
    action: "pcr.file.remove",
    module: AUDIT_MODULE,
    recordId: pcr.id,
    summary: `Removed a billing document (${pcrFileKindLabel(file.kind)}) from patient care report ${pcr.number || pcr.id}`,
  }).catch(() => null);
}
