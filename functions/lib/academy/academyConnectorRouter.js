/**
 * Academy connector router — department-scoped, capability-gated, audited.
 * Frontend must never pass Firebase project IDs or arbitrary academy URLs.
 */

const { HttpsError } = require("firebase-functions/v2/https");
const { assertDepartmentAccess, isPlatformCreator } = require("../access");
const {
  getConnection,
  getPrimaryConnection,
  getActiveConnections,
  patchConnectionStatus,
} = require("./academyIntegrationsStore");
const { loadConnectionSecrets } = require("./academySecrets");
const { createAcademyConnector } = require("./academyConnectorFactory");
const { writeAcademyAudit } = require("./academyAudit");
const { ACADEMY_PERMISSIONS } = require("./types");

const METHOD_CAPABILITY = {
  testConnection: null,
  findStudent: "studentLookup",
  getStudent: "studentLookup",
  getEnrollments: "studentLookup",
  getCourseCompletions: "courseCompletionSync",
  getCertificates: "certificateSync",
  getTranscript: "transcriptAccess",
  submitEnrollment: "enrollmentSubmission",
  syncPerson: "rosterSync",
};

const METHOD_PERMISSION = {
  testConnection: ACADEMY_PERMISSIONS.test,
  findStudent: ACADEMY_PERMISSIONS.personSearch,
  getStudent: ACADEMY_PERMISSIONS.personSearch,
  getEnrollments: ACADEMY_PERMISSIONS.personSearch,
  getCourseCompletions: ACADEMY_PERMISSIONS.personSearch,
  getCertificates: ACADEMY_PERMISSIONS.personSearch,
  getTranscript: ACADEMY_PERMISSIONS.transcriptView,
  submitEnrollment: ACADEMY_PERMISSIONS.enrollmentSubmit,
  syncPerson: ACADEMY_PERMISSIONS.syncRun,
};

const rateBuckets = new Map();

function assertNoClientRoutingHints(data = {}) {
  const banned = ["firebaseProjectId", "academyProjectId", "projectId", "firestoreDatabase", "serviceAccount"];
  for (const key of banned) {
    if (data[key] != null && String(data[key]).trim()) {
      throw new HttpsError(
        "invalid-argument",
        "Academy routing is determined by department configuration. Do not pass project or database locations from the client."
      );
    }
  }
}

function throttle(uid, action, limitMs = 1500) {
  const key = `${uid || "anon"}:${action}`;
  const now = Date.now();
  const prev = rateBuckets.get(key) || 0;
  if (now - prev < limitMs) {
    throw new HttpsError("resource-exhausted", "Too many academy requests. Try again shortly.");
  }
  rateBuckets.set(key, now);
}

async function loadUserPermissions(db, departmentId, auth) {
  if (await isPlatformCreator(db, auth)) {
    return { __platformCreator: true };
  }
  const userSnap = await db.doc(`departments/${departmentId}/users/${auth.uid}`).get();
  if (!userSnap.exists) return {};
  const user = userSnap.data() || {};
  const roleIds = Array.isArray(user.roleIds)
    ? user.roleIds
    : user.roleId
      ? [user.roleId]
      : user.role
        ? [user.role]
        : [];

  const merged = { ...(user.permissions || {}) };
  for (const roleId of roleIds) {
    const roleSnap = await db.doc(`departments/${departmentId}/roles/${roleId}`).get();
    if (roleSnap.exists) {
      Object.assign(merged, roleSnap.data()?.permissions || {});
    }
  }
  return merged;
}

function assertPermission(permissions, permissionKey) {
  if (!permissionKey) return;
  if (permissions.__platformCreator) return;
  if (permissions[permissionKey]) return;
  throw new HttpsError("permission-denied", `Missing permission: ${permissionKey}`);
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {object} auth
 * @param {object} opts
 */
async function routeAcademyAction(db, auth, opts = {}) {
  const {
    departmentId,
    connectionId = null,
    method,
    args = [],
    data = {},
  } = opts;

  assertNoClientRoutingHints(data);
  await assertDepartmentAccess(db, departmentId, auth);
  throttle(auth?.uid, `${departmentId}:${method}`);

  const permissions = await loadUserPermissions(db, departmentId, auth);
  assertPermission(permissions, METHOD_PERMISSION[method]);

  let connection = connectionId
    ? await getConnection(db, departmentId, connectionId)
    : await getPrimaryConnection(db, departmentId);

  if (!connection || !connection.enabled) {
    return { status: "not_connected", message: "This department is not currently connected to a training academy." };
  }

  if (["disconnected", "suspended", "not_connected"].includes(connection.status) && method !== "testConnection") {
    return { status: connection.status, message: `Academy connection is ${connection.status}.` };
  }

  const capabilityKey = METHOD_CAPABILITY[method];
  if (capabilityKey && !connection.capabilities?.[capabilityKey]) {
    throw new HttpsError(
      "permission-denied",
      `${capabilityKey} is not enabled for this academy connection.`
    );
  }

  const secrets = await loadConnectionSecrets(
    db,
    departmentId,
    connection.connectionId,
    connection.secretReference
  );

  const connector = createAcademyConnector(
    { ...connection, departmentId },
    { secrets, db }
  );

  if (typeof connector[method] !== "function") {
    throw new HttpsError("invalid-argument", `Unknown academy method: ${method}`);
  }

  try {
    const result = await connector[method](...args);
    await writeAcademyAudit(db, departmentId, {
      connectionId: connection.connectionId,
      academyOrganizationId: connection.academyOrganizationId,
      actor: auth?.uid || null,
      actorType: "user",
      action: `connector.${method}`,
      result: "ok",
      meta: { method },
    });

    if (method === "testConnection" && result?.ok) {
      await patchConnectionStatus(db, departmentId, connection.connectionId, {
        status: "connected",
        lastSuccessfulSyncAt: new Date().toISOString(),
        lastErrorAt: null,
        lastErrorSummary: null,
      });
    } else if (method === "testConnection" && result && result.ok === false) {
      await patchConnectionStatus(db, departmentId, connection.connectionId, {
        status: result.status || "authentication_error",
        lastErrorAt: new Date().toISOString(),
        lastErrorSummary: result.message || "Connection test failed.",
      });
    }

    return { status: "ok", connectionId: connection.connectionId, result };
  } catch (error) {
    await writeAcademyAudit(db, departmentId, {
      connectionId: connection.connectionId,
      academyOrganizationId: connection.academyOrganizationId,
      actor: auth?.uid || null,
      actorType: "user",
      action: `connector.${method}`,
      result: "error",
      errorDetails: error instanceof Error ? error.message : String(error),
      meta: { method },
    });
    throw error;
  }
}

async function listRoutableConnections(db, departmentId) {
  return getActiveConnections(db, departmentId);
}

module.exports = {
  routeAcademyAction,
  listRoutableConnections,
  assertNoClientRoutingHints,
  loadUserPermissions,
  assertPermission,
};
