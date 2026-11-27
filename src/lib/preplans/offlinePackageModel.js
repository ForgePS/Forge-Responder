/**
 * Offline preplan packages: what goes on a device, how fresh it is, and what a
 * sync should do with it. Pure functions plus Web Crypto helpers (which exist
 * in browsers and in Node), so all of it is testable without a device.
 *
 * A package holds only the PUBLISHED revision: the same information the
 * response view shows (approved plan, buildings and floor plans, site map,
 * current alerts, linked and nearby hydrants, verification dates) plus the
 * authorized photos and documents. Restricted answers are in it only when the
 * person who downloaded it may see them. Map imagery is never stored: the
 * imagery provider's terms don't allow offline caching.
 *
 * On the device a package is encrypted with AES-GCM under a key the browser
 * generates and keeps as non-exportable. That protects the data at rest (a
 * copied browser profile or backup can't be read without the browser's key
 * store) and lets a sign-out or revocation make the data unreadable at once by
 * deleting the key. It is not protection against someone who can run code in
 * the signed-in app on that device.
 */

export const PACKAGE_SCHEMA_VERSION = 1;

export const OFFLINE_DEFAULTS = Object.freeze({
  /** A package is "expired" this many days after it was last brought up to date. */
  packageDays: 14,
  /** Alerts and verification dates older than this are flagged as possibly out of date. */
  staleHours: 24,
  includePhotos: true,
  includeDocuments: true,
  /** Photos and documents per package, total. */
  maxFileMb: 40,
  /** Preplans one device may hold. */
  maxPackages: 300,
});

const DAY = 86_400_000;
const HOUR = 3_600_000;

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.round(n), min), max) : fallback;
}

/** Department settings for offline packages (`preplanSettings/offline`). */
export function normalizeOfflineSettings(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    packageDays: clampNumber(data.packageDays, 1, 90, OFFLINE_DEFAULTS.packageDays),
    staleHours: clampNumber(data.staleHours, 1, 168, OFFLINE_DEFAULTS.staleHours),
    includePhotos: data.includePhotos !== false,
    includeDocuments: data.includeDocuments !== false,
    maxFileMb: clampNumber(data.maxFileMb, 0, 200, OFFLINE_DEFAULTS.maxFileMb),
    maxPackages: clampNumber(data.maxPackages, 1, 1000, OFFLINE_DEFAULTS.maxPackages),
  };
}

// ---------------------------------------------------------------- contents

const PREPLAN_FIELDS = [
  "id", "preplanNumber", "facilityName", "occupancyName", "businessName", "address", "latitude", "longitude",
  "occupancyId", "hydrantIds", "status", "riskLevel", "responsibleStation", "firstDueCompany",
  "publishedRevisionId", "lastVerifiedAt", "verificationDueAt", "updatedAt",
];
const REVISION_FIELDS = [
  "id", "preplanId", "status", "revisionNumber", "publishedAt", "approvedAt", "sectionAnswers", "restrictedLoaded",
  "accessPlan", "waterSupply", "fireProtection", "utilities", "hazards", "tacticalPlan", "dispatchSummary", "contactsSummary",
];

function pick(source = {}, fields) {
  const out = {};
  for (const key of fields) if (source?.[key] !== undefined) out[key] = source[key];
  return out;
}

const PHOTO_CATEGORIES = new Set(["photo", "photos", "site_photo", "exterior", "interior"]);

/** "photo" | "document" | "" (not carried offline). Floor plan sources stay online: the floor plan itself is in the package. */
export function offlineFileKind(file = {}) {
  const category = String(file.category || "").toLowerCase();
  const type = String(file.mimeType || file.type || "").toLowerCase();
  if (category === "floor_plan") return "";
  if (/^image\/(png|jpe?g|webp|gif)$/.test(type)) return PHOTO_CATEGORIES.has(category) || category === "" || category === "other" ? "photo" : "document";
  if (type === "application/pdf") return "document";
  return "";
}

/**
 * Which files go in the package: not archived, not restricted (unless the
 * person may see restricted items), allowed kinds, newest first, within the
 * size budget. Returns the chosen rows and how many were left out.
 */
export function chooseOfflineFiles(files = [], { settings = OFFLINE_DEFAULTS, canSeeRestricted = false } = {}) {
  const budget = (Number(settings.maxFileMb) || 0) * 1024 * 1024;
  const eligible = files
    .filter((file) => file && !file.archived && !file.deleted && (file.storagePath || file.downloadUrl))
    .filter((file) => canSeeRestricted || !file.sensitive)
    .map((file) => ({ file, kind: offlineFileKind(file) }))
    .filter(({ kind }) => (kind === "photo" && settings.includePhotos) || (kind === "document" && settings.includeDocuments))
    .sort((a, b) => String(b.file.createdAt || b.file.uploadedAt || "").localeCompare(String(a.file.createdAt || a.file.uploadedAt || "")));
  const chosen = [];
  let used = 0;
  let leftOut = 0;
  for (const { file, kind } of eligible) {
    const size = Number(file.fileSize || file.size) || 0;
    if (!size || used + size > budget) { leftOut += 1; continue; }
    used += size;
    chosen.push({
      id: String(file.id),
      name: String(file.fileName || file.description || "File").slice(0, 200),
      type: String(file.mimeType || ""),
      size,
      kind,
      category: String(file.category || ""),
      description: String(file.description || "").slice(0, 300),
      storagePath: String(file.storagePath || ""),
      sensitive: Boolean(file.sensitive),
    });
  }
  return { files: chosen, leftOut, bytes: used };
}

/** The source drawings under the package's floor plans, as file ids. */
export function backgroundFileIds(buildings = []) {
  const ids = new Set();
  for (const building of buildings) {
    for (const floor of building?.floors || []) {
      const id = floor?.plan?.background?.fileId;
      if (id) ids.add(String(id));
    }
  }
  return ids;
}

/**
 * The source drawings the floor plans are drawn over. They go in every package
 * (whatever the photo and document settings and size budget), because a floor
 * plan without its drawing is markers on an empty page. Restricted ones only for
 * people who may see restricted items.
 */
export function chooseBackgroundFiles(files = [], buildings = [], { canSeeRestricted = false } = {}) {
  const wanted = backgroundFileIds(buildings);
  return files
    .filter((file) => file && wanted.has(String(file.id)) && !file.deleted && file.storagePath)
    .filter((file) => canSeeRestricted || !file.sensitive)
    .map((file) => ({
      id: String(file.id),
      name: String(file.fileName || file.description || "Source drawing").slice(0, 200),
      type: String(file.mimeType || ""),
      size: Number(file.fileSize || file.size) || 0,
      kind: "background",
      category: String(file.category || ""),
      description: String(file.description || "").slice(0, 300),
      storagePath: String(file.storagePath || ""),
      sensitive: Boolean(file.sensitive),
    }));
}

/** Whether a package was built with restricted details (answers or files) in it. */
export function packageHasRestricted(pkg = {}) {
  return Boolean(pkg?.builtWithRestricted || pkg?.restrictedIncluded
    || (pkg?.content?.files || []).some((file) => file?.sensitive));
}

/**
 * The package's content from what the response view loads. `hydrantIdsToKeep`
 * is the set the response map would show (linked plus nearby), so the device
 * doesn't carry the whole department's hydrant list.
 */
export function buildPackageContent({
  preplan, revision, buildings = [], catalog = [], alerts = [], siteMap = null,
  hydrantRows = [], hydrantIdsToKeep = null, files = [],
} = {}) {
  if (!preplan?.id) throw new Error("Preplan required.");
  if (!revision?.id || revision.id !== preplan.publishedRevisionId) {
    throw new Error("Only a published preplan can be saved for offline use.");
  }
  const keep = hydrantIdsToKeep ? new Set([...hydrantIdsToKeep].map(String)) : null;
  return {
    preplan: pick(preplan, PREPLAN_FIELDS),
    revision: pick(revision, REVISION_FIELDS),
    buildings: buildings.map((building) => ({
      id: building.id,
      name: building.name || "Building",
      floors: (building.floors || []).map((floor) => ({
        id: floor.id,
        name: floor.name || "Floor",
        kind: floor.kind || "",
        level: floor.level ?? null,
        plan: floor.plan
          ? { ...floor.plan, objects: (floor.plan.objects || []).filter((object) => object.verificationStatus !== "rejected") }
          : null,
      })),
    })),
    catalog,
    alerts,
    siteMap,
    hydrantRows: keep ? hydrantRows.filter((row) => keep.has(String(row.id)) || keep.has(String(row.hydrant_id))) : hydrantRows,
    files: files.map(({ storagePath: _omit, ...row }) => row),
  };
}

// ---------------------------------------------------------------- freshness

/**
 * How much to trust a package right now.
 *  - current: brought up to date within `staleHours`
 *  - stale:   alerts and dates may have changed since `syncedAt`
 *  - expired: past `expiresAt` (not updated for `packageDays`)
 * A newer published revision seen online makes it "outdated" until downloaded.
 */
export function packageFreshness(pkg, now = new Date(), settings = OFFLINE_DEFAULTS) {
  if (!pkg) return { state: "missing", label: "Not on this device" };
  const at = now instanceof Date ? now.getTime() : Number(now);
  const synced = Date.parse(pkg.syncedAt || pkg.builtAt || "");
  const expires = Date.parse(pkg.expiresAt || "");
  const hours = Number.isFinite(synced) ? (at - synced) / HOUR : Infinity;
  if (Number.isFinite(expires) && at >= expires) {
    return { state: "expired", label: "Expired", hours, message: `Not updated since ${new Date(synced).toLocaleString()}. Alerts, hydrants and the approved plan may have changed. Update it when you have a connection.` };
  }
  if (pkg.newerRevisionId) {
    return { state: "outdated", label: "Newer plan available", hours, message: "A newer approved version of this preplan was published. Update it when you have a connection." };
  }
  if (hours > (Number(settings.staleHours) || OFFLINE_DEFAULTS.staleHours)) {
    return { state: "stale", label: "May be out of date", hours, message: `Last updated ${new Date(synced).toLocaleString()}. Alerts and verification dates may have changed since.` };
  }
  return { state: "current", label: "Up to date", hours, message: "" };
}

export function expiryFrom(when, settings = OFFLINE_DEFAULTS) {
  const at = when instanceof Date ? when.getTime() : Date.parse(when);
  return new Date(at + (Number(settings.packageDays) || OFFLINE_DEFAULTS.packageDays) * DAY).toISOString();
}

// ---------------------------------------------------------------- sync

/**
 * What a sync should do with one saved package, given what the server says now.
 *  - remove: the preplan is gone, archived, withdrawn or no longer published
 *  - full:   a different revision is published (download it again)
 *  - light:  same revision; refresh the parts that change on their own
 *            (alerts, hydrants, verification dates)
 * Pass `canSeeRestricted` (the person's access now) so a change in restricted
 * access rebuilds the package instead of renewing it.
 */
export function packageSyncAction(local, serverPreplan, { canSeeRestricted = null } = {}) {
  if (!serverPreplan) return { action: "remove", reason: "The preplan no longer exists." };
  const status = String(serverPreplan.status || "").toLowerCase();
  if (["archived", "cancelled", "deleted", "retired"].includes(status)) return { action: "remove", reason: "The preplan was archived." };
  if (status === "temporarily_unavailable") return { action: "remove", reason: "The preplan was withdrawn from operational use." };
  if (!serverPreplan.publishedRevisionId) return { action: "remove", reason: "The preplan no longer has an approved version." };
  if (serverPreplan.publishedRevisionId !== local?.revisionId) return { action: "full", reason: "A newer approved version was published." };
  // Restricted details downloaded under earlier access must go when that access does:
  // rebuild without them (or remove the copy if that fails), never renew it as is.
  if (canSeeRestricted === false && packageHasRestricted(local)) {
    return { action: "full", reason: "You no longer have access to restricted details.", restrictedLost: true };
  }
  if (canSeeRestricted === true && local?.builtWithRestricted === false) {
    return { action: "full", reason: "You now have access to restricted details." };
  }
  return { action: "light", reason: "" };
}

/**
 * Whether this device may keep packages, checked each time it's online.
 * Returns the reason to wipe them, or "" to keep them.
 */
export function deviceWipeReason({ device = null, allowed = true, featureOn = true, uid = "" } = {}) {
  if (!allowed) return "You no longer have access to preplans.";
  if (!featureOn) return "Offline preplans were turned off for the department.";
  if (device && device.status === "revoked") return "This device's offline preplans were revoked by the department.";
  if (device && uid && device.uid && device.uid !== uid) return "This device was registered to someone else.";
  return "";
}

/** Short summary of the device's packages for its registration record. */
export function deviceSummary(packages = []) {
  return packages.slice(0, 200).map((pkg) => ({
    preplanId: String(pkg.preplanId || ""),
    revisionId: String(pkg.revisionId || ""),
    syncedAt: String(pkg.syncedAt || ""),
    expiresAt: String(pkg.expiresAt || ""),
  }));
}

// ---------------------------------------------------------------- crypto

/** JSON with object keys sorted, so the same content always hashes the same. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function subtle() {
  const api = globalThis.crypto?.subtle;
  if (!api) throw new Error("This browser can't encrypt data on the device (it needs a secure connection).");
  return api;
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(data) {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  return hex(await subtle().digest("SHA-256", bytes));
}

/** A new device key: AES-GCM 256, usable only to encrypt and decrypt, never exportable. */
export function generateDeviceKey() {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptBytes(key, bytes, label = "") {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const additional = new TextEncoder().encode(label);
  const data = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: additional }, key, bytes);
  return { iv, data };
}

export async function decryptBytes(key, sealed, label = "") {
  const additional = new TextEncoder().encode(label);
  return subtle().decrypt({ name: "AES-GCM", iv: sealed.iv, additionalData: additional }, key, sealed.data);
}

export class PackageIntegrityError extends Error {
  constructor(message = "This offline copy is damaged. Download it again.") {
    super(message);
    this.name = "PackageIntegrityError";
    this.code = "package-integrity";
  }
}

/**
 * Seal a package: hash its content, then encrypt the whole thing. The label
 * (department and preplan) is bound in, so a sealed package can't be swapped
 * in for another preplan's.
 */
export async function sealPackage(key, pkg, label) {
  const hash = await sha256Hex(canonicalJson(pkg.content));
  const body = new TextEncoder().encode(JSON.stringify({ ...pkg, hash }));
  const sealed = await encryptBytes(key, body, label);
  return { ...sealed, hash, bytes: body.byteLength };
}

/** Open a sealed package and check it. Throws PackageIntegrityError if it was altered or damaged. */
export async function openPackage(key, sealed, label) {
  let pkg;
  try {
    pkg = JSON.parse(new TextDecoder().decode(await decryptBytes(key, sealed, label)));
  } catch {
    throw new PackageIntegrityError();
  }
  if (!pkg?.content || pkg.schemaVersion !== PACKAGE_SCHEMA_VERSION) throw new PackageIntegrityError("This offline copy was made by an older version. Download it again.");
  if ((await sha256Hex(canonicalJson(pkg.content))) !== pkg.hash) throw new PackageIntegrityError();
  return pkg;
}
