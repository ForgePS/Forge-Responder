/**
 * Callable handlers for Academy Integration Hub.
 */

const { HttpsError } = require("firebase-functions/v2/https");
const { assertDepartmentAccess } = require("../access");
const {
  listConnections,
  getConnection,
  upsertConnection,
  setPrimaryConnection,
  disableConnection,
  disconnectConnection,
} = require("./academyIntegrationsStore");
const { saveConnectionSecrets, clearConnectionSecrets } = require("./academySecrets");
const { writeAcademyAudit, listAcademyAuditLogs } = require("./academyAudit");
const { routeAcademyAction, loadUserPermissions, assertPermission } = require("./academyConnectorRouter");
const { ACADEMY_PERMISSIONS, PROVIDER_TYPES, defaultCapabilitiesFor } = require("./types");
const { migrateLegacyForgeAcademySettings } = require("./migrateLegacyForgeAcademy");
const {
  listAcademyLinks,
  linkAcademyPerson,
  unlinkAcademyPerson,
  resolveAcademyMatchConflict,
  getAcademyCache,
  upsertAcademyCache,
} = require("./academyPeopleStore");
const { replayAcademyEvent, ingestAcademyEvent } = require("./academyEventProcessor");

function requireDept(data) {
  const departmentId = String(data?.departmentId || "").trim();
  if (!departmentId) throw new HttpsError("invalid-argument", "departmentId is required.");
  return departmentId;
}

async function requireAcademyPerm(db, departmentId, auth, permissionKey) {
  await assertDepartmentAccess(db, departmentId, auth);
  const permissions = await loadUserPermissions(db, departmentId, auth);
  assertPermission(permissions, permissionKey);
  return permissions;
}

async function handleListAcademyConnections(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.view);
  const connections = await listConnections(db, departmentId);
  return {
    ok: true,
    connections,
    notConnected: connections.filter((c) => c.enabled && c.status !== "disconnected").length === 0,
  };
}

async function handleUpsertAcademyConnection(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.manage);

  const input = request.data?.connection || request.data || {};
  const providerType = String(input.providerType || "").trim();
  if (providerType && !PROVIDER_TYPES.includes(providerType)) {
    throw new HttpsError("invalid-argument", `Unsupported providerType: ${providerType}`);
  }

  // Reject client-supplied routing to arbitrary projects.
  if (input.firebaseProjectId || input.academyProjectId || input.projectId) {
    throw new HttpsError(
      "invalid-argument",
      "Do not pass Firebase project IDs. Configure provider credentials through the secure connection form."
    );
  }

  const secrets = request.data?.secrets || {};
  const connection = await upsertConnection(db, departmentId, {
    ...input,
    capabilities: input.capabilities || defaultCapabilitiesFor(providerType || "manual"),
    config: {
      ...(input.config || {}),
      hubBaseUrl: secrets.hubBaseUrl || input.config?.hubBaseUrl,
      forgeDepartmentId: secrets.forgeDepartmentId || input.config?.forgeDepartmentId,
      apiBaseUrl: input.config?.apiBaseUrl,
      sftpHost: input.config?.sftpHost,
    },
  });

  let secretReference = connection.secretReference;
  const hasSecrets = Object.values(secrets).some((v) => String(v || "").trim());
  if (hasSecrets) {
    const saved = await saveConnectionSecrets(db, departmentId, connection.connectionId, {
      ...secrets,
      hubBaseUrl: secrets.hubBaseUrl || connection.config?.hubBaseUrl,
      forgeDepartmentId: secrets.forgeDepartmentId || connection.config?.forgeDepartmentId,
    });
    secretReference = saved.secretReference;
    await upsertConnection(db, departmentId, {
      connectionId: connection.connectionId,
      providerType: connection.providerType,
      secretReference,
      status: connection.status === "not_connected" ? "pending" : connection.status,
    });
  }

  await writeAcademyAudit(db, departmentId, {
    connectionId: connection.connectionId,
    academyOrganizationId: connection.academyOrganizationId,
    actor: request.auth?.uid || null,
    actorType: "user",
    action: input.connectionId ? "connection.update" : "connection.create",
    result: "ok",
    after: { ...connection, secretReference },
  });

  return { ok: true, connection: await getConnection(db, departmentId, connection.connectionId) };
}

async function handleTestAcademyConnection(db, request) {
  const departmentId = requireDept(request.data);
  const connectionId = String(request.data?.connectionId || "").trim() || null;
  return routeAcademyAction(db, request.auth, {
    departmentId,
    connectionId,
    method: "testConnection",
    data: request.data,
  });
}

async function handleSetPrimaryAcademyConnection(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.manage);
  const connectionId = String(request.data?.connectionId || "").trim();
  if (!connectionId) throw new HttpsError("invalid-argument", "connectionId is required.");
  const connection = await setPrimaryConnection(db, departmentId, connectionId);
  await writeAcademyAudit(db, departmentId, {
    connectionId,
    actor: request.auth?.uid || null,
    actorType: "user",
    action: "connection.set_primary",
    result: "ok",
    after: connection,
  });
  return { ok: true, connection };
}

async function handleDisableAcademyConnection(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.manage);
  const connectionId = String(request.data?.connectionId || "").trim();
  const connection = await disableConnection(db, departmentId, connectionId);
  await writeAcademyAudit(db, departmentId, {
    connectionId,
    actor: request.auth?.uid || null,
    actorType: "user",
    action: "connection.disable",
    result: "ok",
    after: connection,
  });
  return { ok: true, connection };
}

async function handleDisconnectAcademyConnection(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.manage);
  const connectionId = String(request.data?.connectionId || "").trim();
  const connection = await disconnectConnection(db, departmentId, connectionId);
  await clearConnectionSecrets(db, departmentId, connectionId);
  await writeAcademyAudit(db, departmentId, {
    connectionId,
    actor: request.auth?.uid || null,
    actorType: "user",
    action: "connection.disconnect",
    result: "ok",
    after: connection,
  });
  return { ok: true, connection };
}

async function handleListAcademyAuditLogs(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.auditView);
  const logs = await listAcademyAuditLogs(db, departmentId, {
    limit: request.data?.limit,
    connectionId: request.data?.connectionId,
  });
  return { ok: true, logs };
}

async function handleMigrateLegacyForgeAcademySettings(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.manage);
  return migrateLegacyForgeAcademySettings(db, departmentId, { uid: request.auth?.uid });
}

async function handleAcademyPersonAction(db, request, method) {
  const departmentId = requireDept(request.data);
  const connectionId = String(request.data?.connectionId || "").trim() || null;
  const person = request.data?.person || request.data || {};
  return routeAcademyAction(db, request.auth, {
    departmentId,
    connectionId,
    method,
    args: method === "findStudent"
      ? [person]
      : method === "getStudent"
        ? [request.data?.externalStudentId]
        : method === "submitEnrollment" || method === "syncPerson"
          ? [request.data]
          : [request.data?.personId],
    data: request.data,
  });
}

async function handleListAcademyLinks(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.personSearch);
  const personId = String(request.data?.personId || "").trim();
  const links = await listAcademyLinks(db, departmentId, personId);
  const cache = await getAcademyCache(db, departmentId, personId);
  return { ok: true, links, cache };
}

async function handleLinkAcademyPerson(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.personLink);
  const link = await linkAcademyPerson(db, departmentId, request.data || {}, { uid: request.auth?.uid });
  await upsertAcademyCache(db, departmentId, link.personId, link.connectionId, {
    academyOrganizationId: link.academyOrganizationId,
    syncStatus: "pending",
  });
  return { ok: true, link };
}

async function handleUnlinkAcademyPerson(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.personUnlink);
  const link = await unlinkAcademyPerson(
    db,
    departmentId,
    {
      personId: String(request.data?.personId || "").trim(),
      linkId: String(request.data?.linkId || "").trim(),
    },
    { uid: request.auth?.uid }
  );
  return { ok: true, link };
}

async function handleResolveAcademyMatchConflict(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.personResolveConflict);
  const result = await resolveAcademyMatchConflict(db, departmentId, request.data || {}, {
    uid: request.auth?.uid,
  });
  return { ok: true, result };
}

async function handleReplayAcademyEvent(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.syncRun);
  const eventId = String(request.data?.eventId || "").trim();
  if (!eventId) throw new HttpsError("invalid-argument", "eventId is required.");
  const result = await replayAcademyEvent(db, departmentId, eventId);
  return { ok: true, result };
}

async function handleIngestAcademyEvent(db, request) {
  const departmentId = requireDept(request.data);
  await requireAcademyPerm(db, departmentId, request.auth, ACADEMY_PERMISSIONS.syncRun);
  const result = await ingestAcademyEvent(db, departmentId, request.data?.event || request.data || {});
  return { ok: true, result };
}

module.exports = {
  handleListAcademyConnections,
  handleUpsertAcademyConnection,
  handleTestAcademyConnection,
  handleSetPrimaryAcademyConnection,
  handleDisableAcademyConnection,
  handleDisconnectAcademyConnection,
  handleListAcademyAuditLogs,
  handleMigrateLegacyForgeAcademySettings,
  handleAcademyPersonAction,
  handleListAcademyLinks,
  handleLinkAcademyPerson,
  handleUnlinkAcademyPerson,
  handleResolveAcademyMatchConflict,
  handleReplayAcademyEvent,
  handleIngestAcademyEvent,
};
