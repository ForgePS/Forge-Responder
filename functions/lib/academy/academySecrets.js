/**
 * Academy connection secrets.
 * Prefer Google Secret Manager; fall back to Admin-SDK-only Firestore
 * under departments/{id}/integrations/academy-secret-{connectionId}
 * (client rules deny all integrations reads/writes).
 */

const { secretReferenceFor } = require("./types");

function firestoreSecretDoc(db, departmentId, connectionId) {
  return db.doc(`departments/${departmentId}/integrations/academy-secret-${connectionId}`);
}

function parseSecretReference(secretReference = "") {
  const value = String(secretReference || "").trim();
  const firestoreMatch = value.match(
    /^firestore:departments\/([^/]+)\/integrations\/academy-secret-(.+)$/
  );
  if (firestoreMatch) {
    return { kind: "firestore", departmentId: firestoreMatch[1], connectionId: firestoreMatch[2] };
  }
  const smMatch = value.match(/^academy-integrations\/([^/]+)\/(.+)$/);
  if (smMatch) {
    return { kind: "secret_manager", departmentId: smMatch[1], connectionId: smMatch[2], secretId: value.replace(/\//g, "__") };
  }
  return { kind: "unknown", raw: value };
}

async function trySaveSecretManager(secretId, payload) {
  try {
    // Optional dependency — may be unavailable on Spark / local.
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) return false;

    const parent = `projects/${projectId}`;
    const secretPath = `${parent}/secrets/${secretId}`;
    try {
      await client.createSecret({
        parent,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    } catch (err) {
      if (!String(err?.message || err).includes("already exists")) {
        // Continue to add version if secret exists; otherwise fail soft.
        if (!String(err?.code || "").includes("6") && err?.code !== 6) {
          throw err;
        }
      }
    }

    await client.addSecretVersion({
      parent: secretPath,
      payload: { data: Buffer.from(JSON.stringify(payload), "utf8") },
    });
    return true;
  } catch {
    return false;
  }
}

async function tryLoadSecretManager(secretId) {
  try {
    // eslint-disable-next-line import/no-extraneous-dependencies, global-require
    const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId) return null;
    const name = `projects/${projectId}/secrets/${secretId}/versions/latest`;
    const [version] = await client.accessSecretVersion({ name });
    const raw = version?.payload?.data?.toString("utf8") || "";
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * @returns {{ secretReference: string }}
 */
async function saveConnectionSecrets(db, departmentId, connectionId, secrets = {}) {
  const cleaned = {
    hubBaseUrl: String(secrets.hubBaseUrl || "").trim().replace(/\/$/, ""),
    hubBearerToken: String(secrets.hubBearerToken || "").trim(),
    hubSecret: String(secrets.hubSecret || "").trim(),
    forgeDepartmentId: String(secrets.forgeDepartmentId || "").trim(),
    apiBaseUrl: String(secrets.apiBaseUrl || "").trim().replace(/\/$/, ""),
    apiKey: String(secrets.apiKey || "").trim(),
    sftpHost: String(secrets.sftpHost || "").trim(),
    sftpUsername: String(secrets.sftpUsername || "").trim(),
    sftpPassword: String(secrets.sftpPassword || "").trim(),
    updatedAt: new Date().toISOString(),
  };

  const preferredRef = secretReferenceFor(departmentId, connectionId);
  const secretId = preferredRef.replace(/\//g, "__");
  const smOk = await trySaveSecretManager(secretId, cleaned);

  // Always mirror to Admin-only Firestore so Spark / missing SM still works.
  await firestoreSecretDoc(db, departmentId, connectionId).set(
    {
      secretReference: preferredRef,
      payload: cleaned,
      updatedAt: cleaned.updatedAt,
    },
    { merge: true }
  );

  return {
    secretReference: smOk
      ? preferredRef
      : `firestore:departments/${departmentId}/integrations/academy-secret-${connectionId}`,
  };
}

async function loadConnectionSecrets(db, departmentId, connectionId, secretReference) {
  const parsed = parseSecretReference(secretReference || secretReferenceFor(departmentId, connectionId));

  if (parsed.kind === "secret_manager") {
    const fromSm = await tryLoadSecretManager(parsed.secretId);
    if (fromSm) return fromSm;
  }

  const snap = await firestoreSecretDoc(db, departmentId, connectionId).get();
  if (snap.exists) {
    return snap.data()?.payload || {};
  }

  if (parsed.kind === "firestore") {
    const alt = await firestoreSecretDoc(db, parsed.departmentId, parsed.connectionId).get();
    if (alt.exists) return alt.data()?.payload || {};
  }

  return {};
}

async function clearConnectionSecrets(db, departmentId, connectionId) {
  await firestoreSecretDoc(db, departmentId, connectionId).delete().catch(() => {});
}

module.exports = {
  saveConnectionSecrets,
  loadConnectionSecrets,
  clearConnectionSecrets,
  secretReferenceFor,
};
