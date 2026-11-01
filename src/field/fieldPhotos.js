/** Shrink phone photos before saving them on the device (faster sync, less storage). */

const MAX_EDGE = 1600;
const QUALITY = 0.8;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That photo couldn't be read."));
    };
    image.src = url;
  });
}

export async function compressPhoto(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return file;
  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    if (scale === 1 && file.size < 900_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    return blob || file;
  } catch {
    return file;
  }
}
