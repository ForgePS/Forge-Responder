/**
 * Photos attached to an employee-portal damage report. They stay on the device
 * while the form is being filled out and are uploaded (shrunk first) on submit.
 */
import { compressPhoto } from "../field/fieldPhotos.js";
import { uploadFirebaseFile } from "./firebaseClient.js";
import { buildDamageReportPhotoPath } from "./storagePaths.js";

export const MAX_DAMAGE_PHOTOS = 6;

/**
 * Upload the form's photos. Throws if any fails, so the member can try again
 * instead of the report going out without the pictures they added.
 * @param {string} departmentId
 * @param {string} reportId
 * @param {Array<{ file: File, name?: string }>} photos
 * @returns {Promise<Array<{ url: string, storagePath: string, name: string, contentType: string }>>}
 */
export async function uploadDamageReportPhotos(departmentId, reportId, photos = []) {
  const list = (Array.isArray(photos) ? photos : []).slice(0, MAX_DAMAGE_PHOTOS);
  return Promise.all(list.map(async (photo, index) => {
    const original = photo.file;
    const shrunk = await compressPhoto(original);
    const isJpeg = shrunk !== original || /jpe?g$/i.test(original?.type || "");
    const name = isJpeg ? String(original?.name || `photo-${index + 1}`).replace(/\.\w+$/, "") + ".jpg" : (original?.name || `photo-${index + 1}`);
    const file = shrunk instanceof File ? shrunk : new File([shrunk], name, { type: shrunk.type || "image/jpeg" });
    const uploaded = await uploadFirebaseFile(buildDamageReportPhotoPath(departmentId, reportId, index, name), file);
    return {
      url: uploaded.downloadUrl,
      storagePath: uploaded.storagePath,
      name,
      contentType: uploaded.contentType,
    };
  }));
}
