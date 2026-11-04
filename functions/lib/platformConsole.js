/**
 * Creator Console: per-department usage and full data export.
 * Both are platform-creator only.
 */
const crypto = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp, GeoPoint, DocumentReference } = require("firebase-admin/firestore");
const { isPlatformCreator } = require("./access");
const { countListItems } = require("./listStore");

// Never exported: integration credentials (API keys/secrets) live here.
const EXCLUDED_FROM_EXPORT = new Set(["integrations", "academyIntegrations"]);
const PERSONNEL_LIST = "hlfd-rms-personnel";

async function assertCreator(db, request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in first.");
  if (!(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Platform creator access is required.");
  }
}

async function countOf(query) {
  try {
    return (await query.count().get()).data().count;
  } catch {
    return null;
  }
}

/** Pending invites that have not expired yet (expired ones don't hold a seat). */
async function countUnexpiredPendingInvites(db, departmentId) {
  try {
    const snap = await db.collection("invites")
      .where("departmentId", "==", departmentId)
      .where("status", "==", "pending")
      .get();
    const now = Date.now();
    return snap.docs.filter((doc) => {
      const millis = doc.data().expiresAt?.toMillis?.();
      return !(Number.isFinite(millis) && millis < now);
    }).length;
  } catch {
    return null;
  }
}

/** Latest audit timestamp; logs use created_at (older) or createdAt (newer). */
async function lastActivity(deptRef) {
  const logs = deptRef.collection("auditLogs");
  const [a, b] = await Promise.all([
    logs.orderBy("created_at", "desc").limit(1).get().catch(() => null),
    logs.orderBy("createdAt", "desc").limit(1).get().catch(() => null),
  ]);
  const values = [a?.docs[0]?.data()?.created_at, b?.docs[0]?.data()?.createdAt]
    .map((v) => (v?.toDate ? v.toDate().toISOString() : String(v || "")))
    .filter(Boolean)
    .sort();
  return values.at(-1) || "";
}

async function storageUsage(bucket, departmentId) {
  try {
    const [files] = await bucket.getFiles({ prefix: `departments/${departmentId}/` });
    return {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + Number(file.metadata?.size || 0), 0),
    };
  } catch (error) {
    console.warn(`Storage usage for ${departmentId} failed`, error.message);
    return { files: null, bytes: null };
  }
}

async function usageForDepartment(db, bucket, id, registry = {}) {
  const ref = db.doc(`departments/${id}`);
  const [collections, subscription, personnelCount, activeMembers, totalMembers, pendingInvites, last, storage] = await Promise.all([
    ref.listCollections(),
    db.doc(`platformSubscriptions/${id}`).get(),
    countListItems(db, id, PERSONNEL_LIST),
    countOf(ref.collection("users").where("status", "==", "active")),
    countOf(ref.collection("users")),
    countUnexpiredPendingInvites(db, id),
    lastActivity(ref),
    storageUsage(bucket, id),
  ]);
  const counts = await Promise.all(collections.map(async (col) => [col.id, await countOf(col)]));
  const records = counts.reduce((sum, [, n]) => sum + (n || 0), 0);
  const topCollections = counts
    .filter(([name]) => !["users", "roles", "profile", "settings", "dropdowns"].includes(name))
    .sort((x, y) => (y[1] || 0) - (x[1] || 0))
    .slice(0, 5)
    .map(([name, n]) => ({ name, count: n }));
  const sub = subscription.exists ? subscription.data() : null;

  return {
    departmentId: id,
    name: registry.name || id,
    subdomain: registry.subdomain || id,
    registryStatus: registry.status || "",
    subscription: sub && {
      planId: sub.planId || "",
      status: sub.status || "",
      billingCycle: sub.billingCycle || "",
      renewalDate: sub.renewalDate || sub.currentPeriodEnd || "",
    },
    members: { active: activeMembers, total: totalMembers },
    pendingInvites,
    personnel: personnelCount || 0,
    records,
    topCollections,
    storage,
    lastActivity: last,
  };
}

async function departmentUsage(db, bucket, request) {
  await assertCreator(db, request);
  const registry = await db.collection("platformDepartments").get();
  const rows = await Promise.all(registry.docs
    .filter((doc) => !["disabled", "archived"].includes(doc.data()?.status))
    .map((doc) => usageForDepartment(db, bucket, doc.id, doc.data())));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { generatedAt: new Date().toISOString(), departments: rows };
}

/** Firestore values -> plain JSON (timestamps as ISO strings). */
function toJson(value) {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if (value instanceof DocumentReference) return { ref: value.path };
  if (Buffer.isBuffer(value)) return { base64: value.toString("base64") };
  if (Array.isArray(value)) return value.map(toJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toJson(v)]));
  }
  return value;
}

// How many documents' subcollections are looked up at once.
const EXPORT_CONCURRENCY = 16;

async function mapLimit(items, limit, fn) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

/**
 * Walk a collection and everything under it. Each collection's documents come
 * back in one query (not one read per document), and subcollections are looked
 * up a few documents at a time. emit() is called once per document.
 */
async function walkCollection(col, emit, stats) {
  if (EXCLUDED_FROM_EXPORT.has(col.id)) {
    stats.excluded.push(col.path);
    return;
  }
  // Streamed, so even a very large collection is never held in memory at once.
  for await (const doc of col.stream()) await emit(doc.ref.path, toJson(doc.data()));
  // listDocuments also finds "empty" parents that only hold subcollections.
  const refs = await col.listDocuments();
  await mapLimit(refs, EXPORT_CONCURRENCY, async (ref) => {
    for (const sub of await ref.listCollections()) await walkCollection(sub, emit, stats);
  });
}

/**
 * Every document for a department, passed to emit(path, data) as it is read,
 * so a large department never has to fit in memory at once.
 */
async function streamDepartmentDocuments(db, departmentId, emit) {
  const stats = { documents: 0, excluded: [] };
  const counted = async (path, data) => {
    stats.documents += 1;
    await emit(path, data);
  };
  const root = db.doc(`departments/${departmentId}`);
  const rootSnap = await root.get();
  if (rootSnap.exists) await counted(root.path, toJson(rootSnap.data()));
  for (const col of await root.listCollections()) await walkCollection(col, counted, stats);

  for (const path of [`platformDepartments/${departmentId}`, `platformSubscriptions/${departmentId}`]) {
    const snap = await db.doc(path).get();
    if (snap.exists) await counted(path, toJson(snap.data()));
  }
  const gateways = await db.collection("rmsGateways").where("departmentId", "==", departmentId).get();
  for (const doc of gateways.docs) await counted(doc.ref.path, toJson(doc.data()));
  return stats;
}

async function listDepartmentFiles(bucket, departmentId) {
  try {
    const [list] = await bucket.getFiles({ prefix: `departments/${departmentId}/` });
    return list.map((file) => ({
      path: file.name,
      size: Number(file.metadata?.size || 0),
      contentType: file.metadata?.contentType || "",
      updated: file.metadata?.updated || "",
    }));
  } catch (error) {
    console.warn("Export: listing files failed", error.message);
    return [];
  }
}

const EXPORT_NOTES = [
  "documents: every Firestore document for the department, keyed by path.",
  `Not included: ${[...EXCLUDED_FROM_EXPORT].join(", ")} (integration credentials) and invite tokens.`,
  "files: list of uploaded files (contents stay in Cloud Storage).",
];

/** The whole export as one object (small departments and tests). */
async function buildDepartmentExport(db, bucket, departmentId) {
  const documents = {};
  const stats = await streamDepartmentDocuments(db, departmentId, (path, data) => { documents[path] = data; });
  const files = await listDepartmentFiles(bucket, departmentId);
  return {
    format: "forge-responder-department-export",
    version: 1,
    departmentId,
    exportedAt: new Date().toISOString(),
    notes: EXPORT_NOTES,
    counts: { documents: stats.documents, files: files.length, excludedCollections: stats.excluded },
    documents,
    files,
  };
}

/**
 * Write the export straight to a Storage file, one document at a time.
 * Same JSON shape as buildDepartmentExport (counts come last in the file).
 */
async function writeDepartmentExport(db, bucket, departmentId, path, metadata) {
  const exportedAt = new Date().toISOString();
  const out = bucket.file(path).createWriteStream({ contentType: "application/json", resumable: false, metadata });
  const finished = new Promise((resolve, reject) => {
    out.on("finish", resolve);
    out.on("error", reject);
  });
  const write = async (text) => {
    if (!out.write(text)) await new Promise((resolve) => out.once("drain", resolve));
  };

  try {
    await write(`{"format":"forge-responder-department-export","version":1,"departmentId":${JSON.stringify(departmentId)},`
      + `"exportedAt":${JSON.stringify(exportedAt)},"notes":${JSON.stringify(EXPORT_NOTES)},"documents":{`);
    let first = true;
    const stats = await streamDepartmentDocuments(db, departmentId, async (docPath, data) => {
      const entry = `${first ? "" : ","}\n${JSON.stringify(docPath)}:${JSON.stringify(data)}`;
      first = false;
      await write(entry);
    });
    const files = await listDepartmentFiles(bucket, departmentId);
    const counts = { documents: stats.documents, files: files.length, excludedCollections: stats.excluded };
    await write(`\n},"files":${JSON.stringify(files)},"counts":${JSON.stringify(counts)}}\n`);
    out.end();
    await finished;
    return { exportedAt, counts };
  } catch (error) {
    out.destroy(error);
    throw error;
  }
}

/** Creator-only: write a JSON export to Storage and return a private download link. */
async function exportDepartmentData(db, bucket, request) {
  await assertCreator(db, request);
  const departmentId = String(request.data?.departmentId || "").trim();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");
  const exists = (await db.doc(`platformDepartments/${departmentId}`).get()).exists
    || (await db.doc(`departments/${departmentId}`).listCollections()).length > 0;
  if (!exists) throw new HttpsError("not-found", "Department not found.");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `exports/${departmentId}/${departmentId}-${stamp}.json`;
  const token = crypto.randomUUID();
  const { counts } = await writeDepartmentExport(db, bucket, departmentId, path, {
    metadata: { firebaseStorageDownloadTokens: token, exportedBy: request.auth.uid },
  });

  await db.collection("platformAuditLogs").add({
    action: "department.exported",
    module: "Creator Console",
    recordId: departmentId,
    summary: `Exported ${counts.documents} documents and ${counts.files} file references for ${departmentId}`,
    actorUid: request.auth.uid,
    actorName: request.auth.token?.email || "",
    created_at: new Date().toISOString(),
  });

  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST
    ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}`
    : "https://firebasestorage.googleapis.com";
  return {
    path,
    url: `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    counts,
  };
}

module.exports = {
  EXCLUDED_FROM_EXPORT,
  buildDepartmentExport,
  departmentUsage,
  exportDepartmentData,
  toJson,
  usageForDepartment,
};
