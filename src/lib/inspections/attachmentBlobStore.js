/**
 * On-device storage for files captured offline (photos, signatures, documents).
 * The queue entry (inspectionOfflineQueue.js) lives in localStorage; the file
 * itself lives here in IndexedDB until sync uploads it to Storage.
 */
const DB_NAME = "forge-inspection-attachments";
const STORE = "files";

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can't store files offline."));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Could not open offline file storage."));
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error || new Error("Offline file storage failed."));
      tx.onabort = () => reject(tx.error || new Error("Offline file storage was interrupted (device storage may be full)."));
    });
  } finally {
    db.close();
  }
}

export function saveAttachmentBlob(id, blob) {
  return run("readwrite", (store) => store.put(blob, id));
}

export function readAttachmentBlob(id) {
  return run("readonly", (store) => store.get(id));
}

export function deleteAttachmentBlob(id) {
  return run("readwrite", (store) => store.delete(id)).catch(() => undefined);
}
