/**
 * Pre-fire plan files (PDFs, photos) kept on the device for offline viewing.
 * A file is stored as a blob in IndexedDB when the storage server allows it;
 * otherwise the service worker keeps a copy that images can use offline.
 */
import { blobGet, blobPut } from "./fieldDb.js";

function fileKey(url) {
  let hash = 0;
  const text = String(url || "").split("&token=")[0];
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return `planfile:${(hash >>> 0).toString(36)}:${text.length}`;
}

export async function getSavedPlanFile(url) {
  const entry = await blobGet(fileKey(url)).catch(() => null);
  return entry?.blob ? entry : null;
}

/** Save one file for offline use. Returns "saved" | "cached" | "failed". */
export async function savePlanFileOffline(file) {
  if (!file?.url) return "failed";
  if (await getSavedPlanFile(file.url)) return "saved";
  try {
    const response = await fetch(file.url, { mode: "cors" });
    if (!response.ok) throw new Error(String(response.status));
    const blob = await response.blob();
    await blobPut({ id: fileKey(file.url), blob, name: file.name, type: blob.type || file.type || "", size: blob.size, savedAt: new Date().toISOString() });
    return "saved";
  } catch {
    try {
      await fetch(file.url, { mode: "no-cors" });
      return "cached";
    } catch {
      return "failed";
    }
  }
}

/** Open a plan file: the saved copy when there is one, otherwise the online file. */
export async function openPlanFile(file) {
  const saved = await getSavedPlanFile(file.url);
  const href = saved ? URL.createObjectURL(saved.blob) : file.url;
  const opened = window.open(href, "_blank", "noopener");
  if (!opened && saved) window.location.assign(href);
  if (saved) window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
  return Boolean(saved);
}

export function isImageFile(file) {
  return /^image\//.test(file?.type || "") || /\.(png|jpe?g|gif|webp|heic)(\?|$)/i.test(file?.name || file?.url || "");
}
