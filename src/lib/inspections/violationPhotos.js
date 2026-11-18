/**
 * Photos as visual proof of a violation. Uploaded to
 * departments/{departmentId}/violations/{violationId}/photos/ and kept on the
 * violation as evidence items of type "photo" (see addViolationPhotos).
 */
import { uploadFirebaseFile } from "../firebaseClient.js";
import { addViolationPhotos } from "./violationService.js";
import { checkViolationPhoto, violationPhotoPath } from "./violationPhotoRules.js";

export { MAX_VIOLATION_PHOTOS, checkViolationPhoto, violationPhotoPath } from "./violationPhotoRules.js";

/**
 * Upload files and attach them to the violation.
 * @returns {Promise<{ violation: object|null, failed: number }>}
 */
export async function uploadViolationPhotos(departmentId, violationId, files = [], audit = {}) {
  const uploaded = [];
  let failed = 0;
  for (const file of files) {
    if (checkViolationPhoto(file)) { failed += 1; continue; }
    const id = `PH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    try {
      const result = await uploadFirebaseFile(violationPhotoPath(departmentId, violationId, id, file.name), file);
      uploaded.push({ id, fileName: file.name || "photo", storagePath: result.storagePath, url: result.downloadUrl });
    } catch (error) {
      console.error("Violation photo upload failed", error);
      failed += 1;
    }
  }
  const violation = uploaded.length ? await addViolationPhotos(departmentId, violationId, uploaded, audit) : null;
  return { violation, failed };
}
