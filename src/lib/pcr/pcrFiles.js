/**
 * Billing documents on a patient care report: photos or scans of the patient's driver's license or ID, insurance
 * cards and other papers the billing office needs.
 *
 * PHI. Each file is kept in Storage at pcrFiles/{departmentId}/{pcrId}/{fileName}, readable only by the report's
 * crew and members who may read every report (storage.rules). It's described by a record in
 * departments/{departmentId}/pcrs/{pcrId}/files/{fileId} (firestore.rules). Files are always read with the
 * signed-in person's credentials: no download links are made or saved, so the rules always apply.
 *
 * Pure helpers (no Firebase): kinds, checks and the record shape, shared by the RMS editor and the field app.
 */

export const PCR_FILES_COLLECTION = "files";
export const PCR_FILES_ROOT = "pcrFiles";

/** Largest file accepted (Storage rules allow just under 10 MB). */
export const MAX_PCR_FILE_BYTES = 10 * 1024 * 1024 - 1;

/** What a document is; `nemsis` is its External Electronic Document Type (eOther.09). */
export const PCR_FILE_KINDS = Object.freeze([
  { id: "license", label: "Driver's license or ID", nemsis: "4509017" },
  { id: "insurance", label: "Insurance card", nemsis: "4509003" },
  { id: "other", label: "Other document", nemsis: "4509015" },
]);

const KIND_IDS = new Set(PCR_FILE_KINDS.map((k) => k.id));

const EXTENSIONS = Object.freeze({
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
});

/** File types accepted, for an <input accept>. */
export const PCR_FILE_ACCEPT = Object.keys(EXTENSIONS).join(",");

export function pcrFileKindLabel(kind) {
  return PCR_FILE_KINDS.find((k) => k.id === kind)?.label || "Document";
}

export function isPcrFileImage(contentType) {
  return String(contentType || "").startsWith("image/");
}

/** Why a file can't be added, or "" when it can. */
export function pcrFileProblem(file) {
  if (!file) return "Choose a file.";
  if (!EXTENSIONS[file.type]) return "Only photos (JPEG, PNG, WebP) and PDFs can be added.";
  if (!(file.size > 0)) return "That file is empty.";
  if (file.size > MAX_PCR_FILE_BYTES) return "That file is over 10 MB.";
  return "";
}

/** A new file id: 20 random URL-safe characters. */
export function newPcrFileId(random = globalThis.crypto) {
  const bytes = random.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_");
}

export function pcrFileStoragePath(departmentId, pcrId, fileName) {
  return `${PCR_FILES_ROOT}/${departmentId}/${pcrId}/${fileName}`;
}

/**
 * The files record for a new upload. No original file name is kept (a phone's names can hold a patient's name);
 * the label shown is the kind.
 */
export function pcrFileRecord({ departmentId, pcrId, id, kind, contentType, size, actor = {}, source = "rms", now = new Date().toISOString() }) {
  if (!KIND_IDS.has(kind)) throw new Error("pcrFiles: unknown document kind");
  const ext = EXTENSIONS[contentType];
  if (!ext) throw new Error("pcrFiles: unsupported file type");
  const fileName = `${id}.${ext}`;
  return {
    id,
    kind,
    contentType,
    size: Number(size) || 0,
    fileName,
    storagePath: pcrFileStoragePath(departmentId, pcrId, fileName),
    createdAt: now,
    createdByUid: actor.actorUid || "",
    createdByName: actor.actorName || "",
    source,
  };
}

/** Newest first. */
export function sortPcrFiles(files = []) {
  return [...files].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}
