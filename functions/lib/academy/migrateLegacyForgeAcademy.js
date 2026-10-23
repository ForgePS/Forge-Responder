/**
 * Migrate legacy departments/{id}/settings/main.forgeAcademy into
 * academyIntegrations primary forge_academy connection + secret store.
 */

const { listConnections, upsertConnection } = require("./academyIntegrationsStore");
const { saveConnectionSecrets } = require("./academySecrets");
const { writeAcademyAudit } = require("./academyAudit");

async function migrateLegacyForgeAcademySettings(db, departmentId, actor = {}) {
  const existing = await listConnections(db, departmentId);
  if (existing.length) {
    return {
      migrated: false,
      reason: "connections_already_exist",
      connectionCount: existing.length,
      connections: existing,
    };
  }

  const settingsSnap = await db.doc(`departments/${departmentId}/settings/main`).get();
  const forgeAcademy = settingsSnap.exists ? settingsSnap.data()?.forgeAcademy || null : null;
  if (!forgeAcademy) {
    return { migrated: false, reason: "no_legacy_settings" };
  }

  const hubEnabled = forgeAcademy.hubEnabled !== false;
  const hubBaseUrl = String(forgeAcademy.hubBaseUrl || "").trim().replace(/\/$/, "");
  if (!hubEnabled && !hubBaseUrl) {
    return { migrated: false, reason: "legacy_disabled_empty" };
  }

  const connection = await upsertConnection(db, departmentId, {
    providerType: "forge_academy",
    academyOrganizationId: String(forgeAcademy.forgeDepartmentId || "forge-academy").trim(),
    displayName: "Forge Academy (migrated)",
    enabled: hubEnabled && Boolean(hubBaseUrl),
    status: hubEnabled && hubBaseUrl ? "connected" : "pending",
    syncMode: "automatic",
    isPrimary: true,
    priority: 1,
    config: {
      hubBaseUrl,
      forgeDepartmentId: String(forgeAcademy.forgeDepartmentId || "").trim(),
      migratedFrom: "settings/main.forgeAcademy",
    },
  });

  const { secretReference } = await saveConnectionSecrets(db, departmentId, connection.connectionId, {
    hubBaseUrl,
    hubBearerToken: forgeAcademy.hubBearerToken || "",
    hubSecret: forgeAcademy.hubSecret || "",
    forgeDepartmentId: forgeAcademy.forgeDepartmentId || "",
  });

  await db.doc(`departments/${departmentId}/academyIntegrations/${connection.connectionId}`).set(
    { secretReference },
    { merge: true }
  );

  await writeAcademyAudit(db, departmentId, {
    connectionId: connection.connectionId,
    academyOrganizationId: connection.academyOrganizationId,
    actor: actor.uid || null,
    actorType: actor.uid ? "user" : "system",
    action: "connection.migrate_legacy",
    result: "ok",
    after: { ...connection, secretReference },
  });

  return {
    migrated: true,
    connection: { ...connection, secretReference },
  };
}

module.exports = {
  migrateLegacyForgeAcademySettings,
};
