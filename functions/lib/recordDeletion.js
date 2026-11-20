"use strict";
/**
 * Administrators delete an inspection or a preplan, with a reason picked from a
 * fixed list (src/lib/recordDeletionReasons.js keeps the same list for the RMS).
 *
 * Deleting only happens here, so it can't skip the record of it: before
 * anything is removed, a copy of everything deleted is kept in
 * departments/{id}/deletedRecords/{archiveId} (and its documents/ subcollection),
 * readable only by administrators, and the deletion goes in the audit log.
 * The Firestore rules refuse deletes of these records from the app.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { assertMemberPermission, isPlatformCreator } = require("./access");
const { isDemoDepartment } = require("./demoGuard");

const OTHER_REASON = "Other (explain in notes)";
const DELETE_REASONS = Object.freeze([
  "Created by mistake",
  "Duplicate record",
  "Entered for the wrong occupancy or address",
  "Test or training record",
  "Business closed or building demolished",
  "Replaced by a newer record",
  OTHER_REASON,
]);
const MAX_NOTES = 1000;
const BATCH_LIMIT = 400;

const KINDS = Object.freeze({
  inspection: {
    collection: "inspections",
    module: "Inspections",
    planModule: "inspections",
    permissions: ["manageInspectionConfig", "manageSystemSettings"],
    label: (r) => [r.inspectionNumber, r.occupancyName || r.occupancySnapshot?.name].filter(Boolean).join(" · "),
  },
  preplan: {
    collection: "preplans",
    module: "Preplans",
    planModule: "preplans",
    permissions: ["managePreplanConfig", "manageInspectionConfig", "manageSystemSettings"],
    label: (r) => [r.preplanNumber, r.facilityName || r.businessName || r.occupancyName || r.address].filter(Boolean).join(" · "),
  },
});

const text = (v, max = 200) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const nowIso = () => new Date().toISOString();

function cleanId(value, label) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

/** The checked reason and notes, or an error a person can act on. */
function cleanReason(data = {}) {
  const reason = text(data.reason, 120);
  if (!DELETE_REASONS.includes(reason)) throw new HttpsError("invalid-argument", "Choose why this is being deleted.");
  const notes = text(data.notes, MAX_NOTES);
  if (reason === OTHER_REASON && notes.length < 3) {
    throw new HttpsError("invalid-argument", "Explain why in the notes when the reason is Other.");
  }
  return { reason, notes };
}

/** The other documents that go with a record (a preplan's revisions and restricted answers). */
async function relatedDocs(db, departmentId, kind, recordId) {
  if (kind !== "preplan") return [];
  const revisions = await db.collection(`departments/${departmentId}/preplanRevisions`).where("preplanId", "==", recordId).get();
  const restricted = await Promise.all(revisions.docs.map((row) => db.doc(`departments/${departmentId}/preplanRestricted/${row.id}`).get()));
  return [
    ...revisions.docs.map((row) => ({ collection: "preplanRevisions", id: row.id, ref: row.ref, data: row.data() })),
    ...restricted.filter((row) => row.exists).map((row) => ({ collection: "preplanRestricted", id: row.id, ref: row.ref, data: row.data() })),
  ];
}

async function commitInChunks(db, ops) {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) op(batch);
    await batch.commit();
  }
}

async function deleteRecordWithReason(db, request) {
  const kind = text(request.data?.kind, 40);
  const config = KINDS[kind];
  if (!config) throw new HttpsError("invalid-argument", "Only inspections and preplans can be deleted here.");
  const departmentId = cleanId(String(request.data?.departmentId || "").toLowerCase(), "departmentId");
  const recordId = cleanId(request.data?.recordId, "recordId");
  const { reason, notes } = cleanReason(request.data);

  await assertMemberPermission(db, departmentId, request.auth, config.permissions,
    `Only administrators can delete ${kind === "inspection" ? "inspections" : "preplans"}.`);
  if (isDemoDepartment(departmentId) && !(await isPlatformCreator(db, request.auth))) {
    throw new HttpsError("permission-denied", "Deleting records is turned off in the demo department.");
  }
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes(config.planModule)) {
    throw new HttpsError("permission-denied", `${config.module} aren't included in your department's plan.`);
  }

  const recordRef = db.doc(`departments/${departmentId}/${config.collection}/${recordId}`);
  const snap = await recordRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "That record wasn't found. It may already have been deleted.");
  const record = snap.data();
  const related = await relatedDocs(db, departmentId, kind, recordId);

  const actorUid = request.auth.uid;
  const actorName = text(request.auth.token?.name || request.auth.token?.email, 200) || "User";
  const label = text(config.label(record), 300) || recordId;
  const stamp = nowIso();
  const archiveRef = db.collection(`departments/${departmentId}/deletedRecords`).doc();
  const summary = `Deleted ${kind} ${label}. Reason: ${reason}${notes ? ` (${notes})` : ""}`;

  // 1. Keep the copy and the audit entries. 2. Only then delete.
  await commitInChunks(db, [
    (b) => b.set(archiveRef, {
      id: archiveRef.id,
      kind,
      collection: config.collection,
      recordId,
      label,
      reason,
      notes,
      deletedAt: stamp,
      deletedByUid: actorUid,
      deletedByName: actorName,
      relatedCount: related.length,
      snapshot: record,
    }),
    ...related.map((row) => (b) => b.set(archiveRef.collection("documents").doc(), {
      collection: row.collection, id: row.id, data: row.data,
    })),
    (b) => b.set(db.collection(`departments/${departmentId}/auditLogs`).doc(), {
      action: "delete",
      module: config.module,
      recordId,
      summary,
      reason,
      notes,
      deletedRecordId: archiveRef.id,
      actorUid,
      actorName,
      before: { label, status: record.status || "" },
      after: null,
      created_at: stamp,
    }),
    ...(kind === "inspection" ? [(b) => b.set(db.collection(`departments/${departmentId}/inspectionAuditEvents`).doc(), {
      action: "delete",
      recordType: "inspection",
      recordId,
      summary,
      actorUid,
      actorName,
      before: { label, status: record.status || "" },
      after: { deletedRecordId: archiveRef.id, reason, notes },
      created_at: stamp,
    })] : []),
  ]);
  await commitInChunks(db, [
    ...related.map((row) => (b) => b.delete(row.ref)),
    (b) => b.delete(recordRef),
  ]);

  return { deletedRecordId: archiveRef.id, label, relatedCount: related.length };
}

module.exports = { DELETE_REASONS, OTHER_REASON, cleanReason, deleteRecordWithReason };
