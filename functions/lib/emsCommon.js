/**
 * Shared by the EMS Management callables (emsInventory/, emsEquipment/): input
 * cleaning, the caller check (membership + permission + the plan's
 * emsManagement module) and the audit event written inside each change's
 * transaction.
 */
const { HttpsError } = require("firebase-functions/v2/https");
const { assertMemberPermission } = require("./access");

const MODULE_KEY = "emsManagement";

const text = (v, max = 200) => (v === null || v === undefined ? "" : String(v).trim().slice(0, max));
const nowIso = () => new Date().toISOString();
const auditPath = (departmentId) => `departments/${departmentId}/emsAuditEvents`;

function cleanDepartmentId(value) {
  const id = text(value, 200);
  if (!id || id.length > 120 || id.includes("/") || id === "." || id === "..") {
    throw new HttpsError("invalid-argument", "departmentId is required.");
  }
  return id;
}

function cleanDocId(value, label) {
  const id = text(value, 200);
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new HttpsError("invalid-argument", `${label} is required.`);
  return id;
}

/** Request ids come from the browser (crypto.randomUUID) and make retries safe. */
function cleanRequestId(value) {
  const id = text(value, 100);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new HttpsError("invalid-argument", "requestId is required.");
  return id;
}

function newId(prefix) {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase();
}

/**
 * Verify membership, one of `anyOf`, and that the plan includes EMS Management.
 * `named` maps short names to permission keys for `caller.can(name)`.
 */
async function resolveEmsCaller(db, request, anyOf, { named = {}, message = "You don't have permission to do that." } = {}) {
  const departmentId = cleanDepartmentId(request.data?.departmentId);
  const permissions = await assertMemberPermission(db, departmentId, request.auth, anyOf, message);
  const ent = await db.doc(`platformEntitlements/${departmentId}`).get();
  const modules = ent.data()?.modules;
  if (Array.isArray(modules) && !modules.includes(MODULE_KEY)) {
    throw new HttpsError("permission-denied", "EMS Management isn't included in your department's plan.");
  }
  return {
    departmentId,
    uid: request.auth.uid,
    name: text(request.auth.token?.name || request.auth.token?.email, 200) || request.auth.uid,
    permissions,
    can: (key) => permissions[named[key] || key] === true,
  };
}

/** One audit event, written with the change it describes (pass the transaction or batch). */
function auditEvent(db, tx, caller, { action, recordType, recordId, summary, details = null }) {
  const ref = db.collection(auditPath(caller.departmentId)).doc();
  const data = {
    id: ref.id,
    action,
    recordType,
    recordId,
    summary: text(summary, 500),
    actorUid: caller.uid,
    actorName: caller.name,
    at: nowIso(),
    ...(details ? { details } : {}),
  };
  if (tx) tx.create(ref, data);
  else return ref.create(data);
  return null;
}

module.exports = {
  MODULE_KEY,
  text,
  nowIso,
  auditPath,
  cleanDepartmentId,
  cleanDocId,
  cleanRequestId,
  newId,
  resolveEmsCaller,
  auditEvent,
};
