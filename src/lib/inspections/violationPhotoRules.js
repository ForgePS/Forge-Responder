/** Firebase-free rules for violation photos (shared with tests). */
export const MAX_VIOLATION_PHOTOS = 10;
export const MAX_VIOLATION_PHOTO_BYTES = 20 * 1024 * 1024;

/** Why a picked file can't be used ("" = fine). */
export function checkViolationPhoto(file) {
  if (!file) return "No file.";
  if (!String(file.type || "").startsWith("image/")) return `${file.name || "That file"} isn't a photo.`;
  if (file.size > MAX_VIOLATION_PHOTO_BYTES) return `${file.name || "That photo"} is over 20 MB.`;
  return "";
}

export function violationPhotoPath(departmentId, violationId, photoId, fileName = "photo.jpg") {
  const safe = String(fileName || "photo.jpg").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "photo.jpg";
  return `departments/${departmentId}/violations/${violationId}/photos/${photoId}-${safe}`;
}

/** The photo evidence on a violation, newest first. */
export function violationPhotosOf(violation) {
  return (violation?.evidence || []).filter((item) => item?.type === "photo" && item.url);
}
