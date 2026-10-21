/**
 * Creator Console: per-department usage and full data export.
 * Both are platform-creator only.
 */
const crypto = require("node:crypto");
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp, GeoPoint, DocumentReference } = require("firebase-admin/firestore");
const { isPlatformCreator } = require("./access");

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
  const [collections, subscription, personnelDoc, activeMembers, totalMembers, pendingInvites, last, storage] = await Promise.all([
    ref.listCollections(),
    db.doc(`platformSubscriptions/${id}`).get(),
    db.doc(`departments/${id}/lists/${PERSONNEL_LIST}`).get(),
    countOf(ref.collection("users").where("status", "==", "active")),
    countOf(ref.collection("users")),
    countOf(db.collection("invites").where("departmentId", "==", id).where("status", "==", "pending")),
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
  const personnelItems = personnelDoc.exists ? personnelDoc.data()?.items : null;

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
    personnel: Array.isArray(personnelItems) ? personnelItems.length : 0,
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

/** Walk a document and all its subcollections into { [path]: data }. */
async function collectTree(docRef, out, stats) {
  const snap = await docRef.get();
  if (snap.exists) {
    out[docRef.path] = toJson(snap.data());
    stats.documents += 1;
  }
  for (const col of await docRef.listCollections()) {
    if (EXCLUDED_FROM_EXPORT.has(col.id)) {
      stats.excluded.push(col.path);
      continue;
    }
    for (const child of await col.listDocuments()) await collectTree(child, out, stats);
  }
}

async function buildDepartmentExport(db, bucket, departmentId) {
  const documents = {};
  const stats = { documents: 0, excluded: [] };
  await collectTree(db.doc(`departments/${departmentId}`), documents, stats);

  for (const path of [`platformDepartments/${departmentId}`, `platformSubscriptions/${departmentId}`]) {
    const snap = await db.doc(path).get();
    if (snap.exists) {
      documents[path] = toJson(snap.data());
      stats.documents += 1;
    }
  }
  const gateways = await db.collection("rmsGateways").where("departmentId", "==", departmentId).get();
  gateways.docs.forEach((doc) => {
    documents[doc.ref.path] = toJson(doc.data());
    stats.documents += 1;
  });

  let files = [];
  try {
    const [list] = await bucket.getFiles({ prefix: `departments/${departmentId}/` });
    files = list.map((file) => ({
      path: file.name,
      size: Number(file.metadata?.size || 0),
      contentType: file.metadata?.contentType || "",
      updated: file.metadata?.updated || "",
    }));
  } catch (error) {
    console.warn("Export: listing files failed", error.message);
  }

  return {
    format: "forge-responder-department-export",
    version: 1,
    departmentId,
    exportedAt: new Date().toISOString(),
    notes: [
      "documents: every Firestore document for the department, keyed by path.",
      `Not included: ${[...EXCLUDED_FROM_EXPORT].join(", ")} (integration credentials) and invite tokens.`,
      "files: list of uploaded files (contents stay in Cloud Storage).",
    ],
    counts: { documents: stats.documents, files: files.length, excludedCollections: stats.excluded },
    documents,
    files,
  };
}

/** Creator-only: write a JSON export to Storage and return a private download link. */
async function exportDepartmentData(db, bucket, request) {
  await assertCreator(db, request);
  const departmentId = String(request.data?.departmentId || "").trim();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");
  const exists = (await db.doc(`platformDepartments/${departmentId}`).get()).exists
    || (await db.doc(`departments/${departmentId}`).listCollections()).length > 0;
  if (!exists) throw new HttpsError("not-found", "Department not found.");

  const data = await buildDepartmentExport(db, bucket, departmentId);
  const stamp = data.exportedAt.replace(/[:.]/g, "-");
  const path = `exports/${departmentId}/${departmentId}-${stamp}.json`;
  const token = crypto.randomUUID();
  await bucket.file(path).save(JSON.stringify(data, null, 2), {
    contentType: "application/json",
    resumable: false,
    metadata: { metadata: { firebaseStorageDownloadTokens: token, exportedBy: request.auth.uid } },
  });

  await db.collection("platformAuditLogs").add({
    action: "department.exported",
    module: "Creator Console",
    recordId: departmentId,
    summary: `Exported ${data.counts.documents} documents and ${data.counts.files} file references for ${departmentId}`,
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
    counts: data.counts,
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
