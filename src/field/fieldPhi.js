/**
 * Protected health information on the device.
 *
 * Patient care reports are PHI. On the device their contents (record.data and record.base) are encrypted with
 * AES-GCM under a key generated in the browser as non-extractable: scripts can use it but can't read it out, and it
 * never leaves the device. There is one key per signed-in person and department (the record scope).
 * Forgetting the key (sign-out, "remove this device") makes every sealed record unreadable at once, even if a copy
 * of the browser's storage was taken; the records themselves are deleted too.
 *
 * What this does not do: protect against someone using the unlocked device while signed in (the app's auto-lock
 * covers that), or against malware running in the browser.
 */
import { kvDelete, kvGet, kvSet } from "./fieldDb.js";

/** Record kinds whose data is PHI and is stored sealed. */
export const SEALED_KINDS = new Set(["pcr"]);

const KEY_PREFIX = "phi-key::";
const ALGORITHM = "AES-GCM";
const FORMAT_VERSION = 1;

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error("This browser can't encrypt data on the device, so patient care reports can't be stored here.");
  return s;
}

/** A fresh non-extractable AES-GCM 256 key. */
export function generateDeviceKey() {
  return subtle().generateKey({ name: ALGORITHM, length: 256 }, false, ["encrypt", "decrypt"]);
}

const keyCache = new Map();

/** The device key for a record scope, created on first use. */
export async function deviceKey(scope) {
  if (keyCache.has(scope)) return keyCache.get(scope);
  const pending = (async () => {
    let key = await kvGet(KEY_PREFIX + scope);
    if (!key) {
      key = await generateDeviceKey();
      await kvSet(KEY_PREFIX + scope, key);
    }
    return key;
  })();
  keyCache.set(scope, pending);
  try {
    return await pending;
  } catch (error) {
    keyCache.delete(scope);
    throw error;
  }
}

/** Forget the key for a scope: everything sealed under it becomes unreadable. */
export async function forgetDeviceKey(scope) {
  keyCache.delete(scope);
  await kvDelete(KEY_PREFIX + scope);
}

/** Encrypt a JSON value. `aad` binds the ciphertext to its record so it can't be swapped into another one. */
export async function sealJson(key, value, aad = "") {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(value ?? null));
  const data = await subtle().encrypt({ name: ALGORITHM, iv, additionalData: new TextEncoder().encode(aad) }, key, plain);
  return { sealed: FORMAT_VERSION, iv, data: new Uint8Array(data) };
}

export function isSealed(value) {
  return Boolean(value && typeof value === "object" && value.sealed === FORMAT_VERSION && value.iv && value.data);
}

/** Decrypt a value made by sealJson. Throws when the key is wrong/forgotten or the data was changed. */
export async function openJson(key, sealed, aad = "") {
  if (!isSealed(sealed)) return sealed;
  try {
    const plain = await subtle().decrypt({ name: ALGORITHM, iv: sealed.iv, additionalData: new TextEncoder().encode(aad) }, key, sealed.data);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    const error = new Error("This patient care report can't be opened on this device (it was locked when you signed out).");
    error.code = "phi-locked";
    throw error;
  }
}

/** Encrypt bytes (a photo of a patient's ID or insurance card). Same key and format as sealJson. */
export async function sealBytes(key, bytes, aad = "") {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle().encrypt({ name: ALGORITHM, iv, additionalData: new TextEncoder().encode(aad) }, key, bytes);
  return { sealed: FORMAT_VERSION, iv, data: new Uint8Array(data) };
}

/** Decrypt bytes made by sealBytes. Throws (code "phi-locked") when the key is wrong/forgotten or the data was changed. */
export async function openBytes(key, sealed, aad = "") {
  try {
    const plain = await subtle().decrypt({ name: ALGORITHM, iv: sealed.iv, additionalData: new TextEncoder().encode(aad) }, key, sealed.data);
    return new Uint8Array(plain);
  } catch {
    const error = new Error("This photo can't be opened on this device (it was locked when you signed out).");
    error.code = "phi-locked";
    throw error;
  }
}

/**
 * Record fields that can hold PHI: the chart, the server copy it merges against, and `attention`, where a sync
 * conflict keeps both sides of the conflicting sections and the merged report.
 */
export const SEALED_FIELDS = ["data", "base", "attention"];

/** Seal a record's PHI fields before it is written to the device (no-op for other kinds). */
export async function sealRecord(record) {
  if (!SEALED_KINDS.has(record?.kind)) return record;
  return sealRecordWithKey(record, await deviceKey(record.scope));
}

export async function sealRecordWithKey(record, key) {
  if (!SEALED_KINDS.has(record?.kind)) return record;
  const out = { ...record, sealedFields: SEALED_FIELDS };
  for (const field of SEALED_FIELDS) {
    if (!isSealed(record[field])) out[field] = await sealJson(key, record[field], `${record.localId}:${field}`);
  }
  return out;
}

/** Open a record read from the device (no-op for other kinds). */
export async function openRecord(record) {
  if (!record?.sealedFields) return record;
  return openRecordWithKey(record, await deviceKey(record.scope));
}

export async function openRecordWithKey(record, key) {
  if (!record?.sealedFields) return record;
  const out = { ...record };
  for (const field of record.sealedFields) out[field] = await openJson(key, record[field], `${record.localId}:${field}`);
  delete out.sealedFields;
  return out;
}

/** Like openRecord, but a record that can't be opened comes back marked `locked` instead of throwing. */
export async function openRecordSafe(record) {
  try {
    return await openRecord(record);
  } catch (error) {
    if (error.code !== "phi-locked") throw error;
    const { data: _data, base: _base, attention: _attention, sealedFields: _f, ...rest } = record;
    return { ...rest, data: null, base: null, attention: null, locked: true };
  }
}
