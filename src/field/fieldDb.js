/**
 * Field app storage on the device (IndexedDB). Everything a crew enters is
 * written here first, so nothing depends on a connection.
 *
 * Stores:
 *  - kv:      small values by key (access snapshot, reference data, recent picks)
 *  - records: field records and their sync state (one row per record)
 *  - blobs:   photos waiting to upload, keyed by attachment id
 */

const DB_NAME = "forge-field";
const DB_VERSION = 1;

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function openFieldDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("This browser can't store data on the device."));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("records")) {
        const records = db.createObjectStore("records", { keyPath: "localId" });
        records.createIndex("byScope", "scope");
      }
      if (!db.objectStoreNames.contains("blobs")) db.createObjectStore("blobs", { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Another tab upgraded the database: let it, reopen on next use.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });
  return dbPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openFieldDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    Promise.resolve(fn(store))
      .then((value) => { result = value; })
      .catch(reject);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Device storage write was cancelled."));
  });
}

export function kvGet(key) {
  return withStore("kv", "readonly", (store) => requestToPromise(store.get(key)));
}

export function kvSet(key, value) {
  return withStore("kv", "readwrite", (store) => requestToPromise(store.put(value, key)));
}

export function kvDelete(key) {
  return withStore("kv", "readwrite", (store) => requestToPromise(store.delete(key)));
}

export function recordGet(localId) {
  return withStore("records", "readonly", (store) => requestToPromise(store.get(localId)));
}

export function recordPut(record) {
  return withStore("records", "readwrite", (store) => requestToPromise(store.put(record)));
}

export function recordDelete(localId) {
  return withStore("records", "readwrite", (store) => requestToPromise(store.delete(localId)));
}

export function recordsForScope(scope) {
  return withStore("records", "readonly", (store) => requestToPromise(store.index("byScope").getAll(scope)));
}

export function blobGet(id) {
  return withStore("blobs", "readonly", (store) => requestToPromise(store.get(id)));
}

export function blobPut(entry) {
  return withStore("blobs", "readwrite", (store) => requestToPromise(store.put(entry)));
}

export function blobDelete(id) {
  return withStore("blobs", "readwrite", (store) => requestToPromise(store.delete(id)));
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted && await navigator.storage.persisted()) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    // not supported
  }
  return false;
}

export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch {
    // not supported
  }
  return null;
}
