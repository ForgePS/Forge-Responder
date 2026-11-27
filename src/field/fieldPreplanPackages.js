/**
 * Offline preplan packages on this device (FORGE FIELD).
 *
 * A package is the published preplan as the response view shows it, plus its
 * authorized photos and documents, sealed with this device's key (see
 * src/lib/preplans/offlinePackageModel.js) and kept in IndexedDB. Each person
 * on a shared device has their own key and packages.
 *
 * When the device is online, syncPackages() checks the device is still
 * authorized (not revoked, the person still has preplan access, offline access
 * still on), brings each package up to date (only alerts, hydrants and dates
 * when the approved plan is unchanged; the whole package when a new revision
 * was published) and removes packages whose preplan was archived, withdrawn or
 * unpublished. Revocation can only reach a device that comes online; until
 * then a package still expires on its own and says so.
 */
import { getBlob, ref } from "firebase/storage";
import { blobDelete, blobGet, blobPut, kvDelete, kvGet, kvSet, requestPersistentStorage } from "./fieldDb.js";
import { getFirebaseStorage } from "../lib/firebaseClient.js";
import { getPreplan, listPreplanFiles } from "../lib/inspections/preplanService.js";
import { getDepartmentPreplanFeatures, isPreplanFeatureEnabled } from "../lib/inspections/preplanFeatures.js";
import { LiveDataError, loadLiveResponseParts, loadResponseData } from "../lib/preplans/responseData.js";
import { buildResponseMap } from "../lib/preplans/responseMapModel.js";
import {
  PACKAGE_SCHEMA_VERSION,
  PackageIntegrityError,
  buildPackageContent,
  chooseBackgroundFiles,
  chooseOfflineFiles,
  decryptBytes,
  deviceWipeReason,
  encryptBytes,
  expiryFrom,
  generateDeviceKey,
  openPackage,
  packageSyncAction,
  sealPackage,
} from "../lib/preplans/offlinePackageModel.js";
import {
  describeDevice,
  getOfflineDevice,
  getOfflineSettings,
  registerOfflineDevice,
  reportOfflineDevice,
} from "../lib/preplans/offlinePackageService.js";

const keyName = (dept, uid) => `pkgkey:${dept}:${uid}`;
const indexName = (dept, uid) => `pkgindex:${dept}:${uid}`;
const packageName = (dept, uid, preplanId) => `pkg:${dept}:${uid}:${preplanId}`;
const fileName = (dept, uid, preplanId, fileId) => `pkgfile:${dept}:${uid}:${preplanId}:${fileId}`;
// One registration per person on a device, so the next crew member on a shared
// tablet registers their own instead of being refused as "someone else".
const deviceName = (dept, uid) => `pkgdevice:${dept}:${uid}`;
const legacyDeviceName = (dept) => `pkgdevice:${dept}`;
const label = (dept, preplanId) => `forge-preplan:${dept}:${preplanId}`;

export class OfflineNotAllowedError extends Error {
  constructor(message) {
    super(message);
    this.name = "OfflineNotAllowedError";
  }
}

// ---------------------------------------------------------------- keys and index

async function deviceKey(dept, uid, { create = false } = {}) {
  const existing = await kvGet(keyName(dept, uid)).catch(() => null);
  if (existing || !create) return existing || null;
  const key = await generateDeviceKey();
  await kvSet(keyName(dept, uid), key);
  return key;
}

async function readIndex(dept, uid) {
  const rows = await kvGet(indexName(dept, uid)).catch(() => null);
  return Array.isArray(rows) ? rows : [];
}

async function writeIndex(dept, uid, rows) {
  await kvSet(indexName(dept, uid), rows);
}

/**
 * This person's device id for the department (random; created on first download).
 * An id saved before ids were per person goes to whoever still has packages on
 * the device (sign-out wipes them, so that is the person who registered it).
 */
async function deviceId(dept, uid, { create = false } = {}) {
  const existing = await kvGet(deviceName(dept, uid)).catch(() => null);
  if (existing) return existing;
  const legacy = await kvGet(legacyDeviceName(dept)).catch(() => null);
  if (legacy && (await readIndex(dept, uid)).length) {
    await kvSet(deviceName(dept, uid), legacy);
    await kvDelete(legacyDeviceName(dept)).catch(() => null);
    return legacy;
  }
  if (!create) return "";
  const id = `PPD-${globalThis.crypto.randomUUID()}`;
  await kvSet(deviceName(dept, uid), id);
  return id;
}

// ---------------------------------------------------------------- reading

/**
 * Every package for this person on this device, opened and checked.
 * A package that fails its check is listed with `damaged: true`.
 */
export async function listPackages(dept, uid) {
  const key = await deviceKey(dept, uid);
  const index = await readIndex(dept, uid);
  if (!key) return [];
  const out = [];
  for (const row of index) {
    try {
      const sealed = await kvGet(packageName(dept, uid, row.preplanId));
      if (!sealed) continue;
      const pkg = await openPackage(key, sealed, label(dept, row.preplanId));
      out.push({ ...packageMeta(pkg), bytes: sealed.bytes || 0 });
    } catch (error) {
      out.push({ preplanId: row.preplanId, name: row.name || "Preplan", damaged: true, error: error?.message || "Damaged" });
    }
  }
  return out;
}

export function packageMeta(pkg) {
  const p = pkg.content?.preplan || {};
  return {
    preplanId: pkg.preplanId,
    revisionId: pkg.revisionId,
    revisionNumber: pkg.revisionNumber,
    name: p.facilityName || p.occupancyName || p.businessName || p.address || "Preplan",
    address: p.address || "",
    station: p.responsibleStation || "",
    builtAt: pkg.builtAt,
    syncedAt: pkg.syncedAt,
    expiresAt: pkg.expiresAt,
    newerRevisionId: pkg.newerRevisionId || "",
    staleHours: pkg.staleHours || 0,
    restrictedIncluded: Boolean(pkg.restrictedIncluded),
    fileCount: (pkg.content?.files || []).filter((row) => row.stored).length,
    filesLeftOut: pkg.filesLeftOut || 0,
  };
}

/** Open one package (throws PackageIntegrityError when damaged, null when not saved). */
export async function getPackage(dept, uid, preplanId) {
  const key = await deviceKey(dept, uid);
  const sealed = await kvGet(packageName(dept, uid, preplanId)).catch(() => null);
  if (!key || !sealed) return null;
  return openPackage(key, sealed, label(dept, preplanId));
}

/** One of a package's photos or documents, decrypted, as a Blob. */
export async function getPackageFile(dept, uid, preplanId, file) {
  const key = await deviceKey(dept, uid);
  const entry = await blobGet(fileName(dept, uid, preplanId, file.id)).catch(() => null);
  if (!key || !entry?.sealed) return null;
  try {
    const bytes = await decryptBytes(key, entry.sealed, `${label(dept, preplanId)}:${file.id}`);
    return new Blob([bytes], { type: file.type || entry.type || "" });
  } catch {
    throw new PackageIntegrityError("This file's offline copy is damaged. Update the preplan to download it again.");
  }
}

// ---------------------------------------------------------------- writing

async function storeFiles({ dept, uid, preplanId, key, files, previous = [] }) {
  const storage = getFirebaseStorage();
  const keepIds = new Set();
  const result = [];
  const old = new Map(previous.filter((row) => row.stored).map((row) => [row.id, row]));
  for (const file of files) {
    // Same file already on the device: keep it.
    if (old.has(file.id) && (await blobGet(fileName(dept, uid, preplanId, file.id)).catch(() => null))) {
      keepIds.add(file.id);
      result.push({ ...file, stored: true });
      continue;
    }
    try {
      if (!storage || !file.storagePath) throw new Error("no storage");
      const blob = await getBlob(ref(storage, file.storagePath));
      const sealed = await encryptBytes(key, await blob.arrayBuffer(), `${label(dept, preplanId)}:${file.id}`);
      await blobPut({ id: fileName(dept, uid, preplanId, file.id), sealed, type: blob.type || file.type || "", size: blob.size });
      keepIds.add(file.id);
      result.push({ ...file, stored: true });
    } catch {
      result.push({ ...file, stored: false });
    }
  }
  for (const row of previous) {
    if (!keepIds.has(row.id)) await blobDelete(fileName(dept, uid, preplanId, row.id)).catch(() => null);
  }
  return result;
}

async function writePackage(dept, uid, key, pkg) {
  const sealed = await sealPackage(key, pkg, label(dept, pkg.preplanId));
  await kvSet(packageName(dept, uid, pkg.preplanId), sealed);
  const index = (await readIndex(dept, uid)).filter((row) => row.preplanId !== pkg.preplanId);
  index.push({ preplanId: pkg.preplanId, name: packageMeta(pkg).name, savedAt: pkg.syncedAt });
  await writeIndex(dept, uid, index);
  return { ...packageMeta(pkg), bytes: sealed.bytes };
}

/** Make sure this device is registered and not revoked. Returns its id. */
async function ensureDevice(dept, actor) {
  const id = await deviceId(dept, actor.actorUid, { create: true });
  const record = await getOfflineDevice(dept, id).catch(() => null);
  if (record?.status === "revoked") throw new OfflineNotAllowedError("Offline preplans were revoked on this device by your department.");
  if (record && record.uid && record.uid !== actor.actorUid) throw new OfflineNotAllowedError("This device is registered to someone else for offline preplans.");
  if (!record) await registerOfflineDevice(dept, id, actor, describeDevice(globalThis.navigator?.userAgent));
  return id;
}

async function checkAllowed(dept, caps) {
  if (!caps?.preFirePlans || !caps?.preplanModule) throw new OfflineNotAllowedError("You don't have access to preplans.");
  const features = await getDepartmentPreplanFeatures(dept);
  if (!isPreplanFeatureEnabled(features, "offlineAccess")) throw new OfflineNotAllowedError("Offline preplans are turned off for your department.");
}

function keptHydrantIds(preplan, data) {
  const model = buildResponseMap({ siteMap: data.siteMap, preplan, plansByFloor: new Map(), hydrants: data.hydrantRows });
  return model.hydrants.map((row) => row.id);
}

/**
 * Download (or replace) the package for one preplan. Needs a connection.
 * @returns {Promise<object>} the package's summary
 */
export async function downloadPackage({ departmentId: dept, uid, actor, caps, preplanId }) {
  await checkAllowed(dept, caps);
  const [preplan, { settings }] = await Promise.all([getPreplan(dept, preplanId), getOfflineSettings(dept)]);
  if (!preplan) throw new Error("This preplan no longer exists.");
  if (!preplan.publishedRevisionId) throw new Error("This preplan has no approved version yet, so there's nothing to save for response.");
  const index = await readIndex(dept, uid);
  if (!index.some((row) => row.preplanId === preplanId) && index.length >= settings.maxPackages) {
    throw new OfflineNotAllowedError(`This device already holds ${settings.maxPackages} preplans, the department's limit. Remove some first.`);
  }
  await ensureDevice(dept, actor);
  const key = await deviceKey(dept, uid, { create: true });
  const canSeeRestricted = Boolean(caps.preplanSensitive);
  const data = await loadResponseData(dept, preplan, { withRestricted: canSeeRestricted });
  // Don't save a copy that says "no alerts" because the alerts couldn't be read.
  if (data.failed?.length) throw new LiveDataError(data.failed);
  const previous = await getPackage(dept, uid, preplanId).catch(() => null);
  const allFiles = await listPreplanFiles(dept, preplanId);
  const chosen = chooseOfflineFiles(allFiles, { settings, canSeeRestricted });
  const chosenIds = new Set(chosen.files.map((row) => row.id));
  const backgrounds = chooseBackgroundFiles(allFiles, data.buildings, { canSeeRestricted }).filter((row) => !chosenIds.has(row.id));
  const files = await storeFiles({ dept, uid, preplanId, key, files: [...chosen.files, ...backgrounds], previous: previous?.content?.files || [] });
  const now = new Date().toISOString();
  const content = buildPackageContent({
    preplan,
    revision: data.revision,
    buildings: data.buildings,
    catalog: data.catalog,
    alerts: data.alerts,
    siteMap: data.siteMap,
    hydrantRows: data.hydrantRows,
    hydrantIdsToKeep: keptHydrantIds(preplan, data),
    files,
  });
  const pkg = {
    schemaVersion: PACKAGE_SCHEMA_VERSION,
    departmentId: dept,
    preplanId,
    revisionId: data.revision.id,
    revisionNumber: data.revision.revisionNumber || null,
    builtAt: now,
    syncedAt: now,
    expiresAt: expiryFrom(now, settings),
    staleHours: settings.staleHours,
    builtBy: uid,
    builtWithRestricted: canSeeRestricted,
    restrictedIncluded: canSeeRestricted && Boolean(data.revision.restrictedLoaded),
    filesLeftOut: chosen.leftOut + files.filter((row) => !row.stored && row.kind !== "background").length,
    backgroundsMissing: files.filter((row) => !row.stored && row.kind === "background").length,
    content,
  };
  const summary = await writePackage(dept, uid, key, pkg);
  requestPersistentStorage().catch(() => null);
  await report(dept, uid).catch(() => null);
  return summary;
}

/** Same approved revision: refresh alerts, hydrants and verification dates only. */
async function refreshLive(dept, uid, key, pkg, serverPreplan, settings) {
  const live = await loadLiveResponseParts(dept, serverPreplan);
  // A failed read keeps the saved alerts and hydrants and their freshness: the copy
  // stays marked as of its last good update instead of claiming there are none.
  if (live.failed.length) throw new LiveDataError(live.failed);
  const now = new Date().toISOString();
  const preplan = { ...pkg.content.preplan };
  for (const field of ["lastVerifiedAt", "verificationDueAt", "status", "hydrantIds", "facilityName", "address", "riskLevel", "responsibleStation"]) {
    if (serverPreplan[field] !== undefined) preplan[field] = serverPreplan[field];
  }
  const data = { siteMap: pkg.content.siteMap, hydrantRows: live.hydrantRows };
  const keep = new Set(keptHydrantIds(preplan, data));
  const next = {
    ...pkg,
    syncedAt: now,
    expiresAt: expiryFrom(now, settings),
    staleHours: settings.staleHours,
    newerRevisionId: "",
    content: {
      ...pkg.content,
      preplan,
      alerts: live.alerts,
      hydrantRows: live.hydrantRows.filter((row) => keep.has(String(row.id)) || keep.has(String(row.hydrant_id))),
    },
  };
  delete next.hash;
  return writePackage(dept, uid, key, next);
}

export async function removePackage(dept, uid, preplanId) {
  const pkg = await getPackage(dept, uid, preplanId).catch(() => null);
  for (const file of pkg?.content?.files || []) await blobDelete(fileName(dept, uid, preplanId, file.id)).catch(() => null);
  await kvDelete(packageName(dept, uid, preplanId)).catch(() => null);
  await writeIndex(dept, uid, (await readIndex(dept, uid)).filter((row) => row.preplanId !== preplanId));
}

/**
 * Remove every package for this person on this device and destroy their key,
 * so anything left behind can't be read. Used on sign-out and revocation.
 */
export async function wipePackages(dept, uid) {
  const index = await readIndex(dept, uid);
  for (const row of index) await removePackage(dept, uid, row.preplanId).catch(() => null);
  await kvDelete(indexName(dept, uid)).catch(() => null);
  await kvDelete(keyName(dept, uid)).catch(() => null);
  return index.length;
}

async function report(dept, uid) {
  const id = await deviceId(dept, uid);
  if (!id) return;
  const rows = (await listPackages(dept, uid)).filter((row) => !row.damaged);
  await reportOfflineDevice(dept, id, rows);
}

/**
 * Bring this person's packages up to date. Call when online.
 * @returns {Promise<{wiped?:string, updated:number, replaced:number, removed:{name:string, reason:string}[], failed:{name:string, reason:string}[]}>}
 */
export async function syncPackages({ departmentId: dept, uid, actor, caps }) {
  const summary = { updated: 0, replaced: 0, removed: [], failed: [] };
  const index = await readIndex(dept, uid);
  if (!index.length) return summary;
  if (globalThis.navigator?.onLine === false) return summary;

  // Is this device still allowed to hold them?
  const features = await getDepartmentPreplanFeatures(dept);
  const id = await deviceId(dept, uid);
  const device = id ? await getOfflineDevice(dept, id).catch(() => null) : null;
  const wipe = deviceWipeReason({
    device,
    uid,
    allowed: Boolean(caps?.preFirePlans && caps?.preplanModule),
    featureOn: isPreplanFeatureEnabled(features, "offlineAccess"),
  });
  if (wipe) {
    await wipePackages(dept, uid);
    return { ...summary, wiped: wipe };
  }
  if (id && !device) await registerOfflineDevice(dept, id, actor, describeDevice(globalThis.navigator?.userAgent)).catch(() => null);

  const { settings } = await getOfflineSettings(dept);
  const key = await deviceKey(dept, uid);
  for (const row of index) {
    let pkg = null;
    try {
      pkg = await getPackage(dept, uid, row.preplanId);
    } catch {
      pkg = null;
    }
    const name = pkg ? packageMeta(pkg).name : row.name || "Preplan";
    let server = null;
    let decision = null;
    try {
      server = await getPreplan(dept, row.preplanId);
      decision = pkg
        ? packageSyncAction(pkg, server, { canSeeRestricted: Boolean(caps?.preplanSensitive) })
        : (server?.publishedRevisionId ? { action: "full" } : { action: "remove", reason: "It has no approved version." });
      if (decision.action === "remove") {
        await removePackage(dept, uid, row.preplanId);
        summary.removed.push({ name, reason: decision.reason });
      } else if (decision.action === "full") {
        await downloadPackage({ departmentId: dept, uid, actor, caps, preplanId: row.preplanId });
        summary.replaced += 1;
      } else {
        await refreshLive(dept, uid, key, pkg, server, settings);
        summary.updated += 1;
      }
    } catch (error) {
      // Restricted details from earlier access can't stay if the rebuild without them failed.
      if (decision?.restrictedLost) {
        await removePackage(dept, uid, row.preplanId).catch(() => null);
        summary.removed.push({ name, reason: `${decision.reason} Save it again to get a copy without them.` });
        continue;
      }
      summary.failed.push({ name, reason: error?.message || "Couldn't update." });
      // A newer approved version exists but couldn't be downloaded: say so on the saved copy.
      if (decision?.action === "full" && pkg && server?.publishedRevisionId && !pkg.newerRevisionId) {
        const { hash: _hash, ...rest } = pkg;
        await writePackage(dept, uid, key, { ...rest, newerRevisionId: server.publishedRevisionId }).catch(() => null);
      }
    }
  }
  await report(dept, uid).catch(() => null);
  return summary;
}
