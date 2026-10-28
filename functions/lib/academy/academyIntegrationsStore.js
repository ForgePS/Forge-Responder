/**
 * Academy connection store.
 * Path: departments/{departmentId}/academyIntegrations/{connectionId}
 * Secrets are never stored here — only secretReference.
 */

const {
  PROVIDER_TYPES,
  CONNECTION_STATUSES,
  SYNC_MODES,
  DEFAULT_MATCHING_POLICY,
  defaultCapabilitiesFor,
  newConnectionId,
  secretReferenceFor,
} = require("./types");

function connectionsCol(db, departmentId) {
  return db.collection(`departments/${departmentId}/academyIntegrations`);
}

function connectionRef(db, departmentId, connectionId) {
  return connectionsCol(db, departmentId).doc(connectionId);
}

function publicConnection(doc) {
  if (!doc) return null;
  const data = typeof doc.data === "function" ? doc.data() : doc;
  if (!data) return null;
  const id = doc.id || data.connectionId;
  return {
    connectionId: id,
    departmentId: data.departmentId || null,
    enabled: data.enabled !== false,
    providerType: data.providerType || "manual",
    academyOrganizationId: data.academyOrganizationId || "",
    displayName: data.displayName || "",
    status: data.status || "not_connected",
    syncMode: data.syncMode || "manual",
    isPrimary: Boolean(data.isPrimary),
    priority: Number(data.priority || 100),
    effectiveDate: data.effectiveDate || null,
    expirationDate: data.expirationDate || null,
    capabilities: data.capabilities || defaultCapabilitiesFor(data.providerType),
    matchingPolicy: data.matchingPolicy || { ...DEFAULT_MATCHING_POLICY },
    lastSuccessfulSyncAt: data.lastSuccessfulSyncAt || null,
    lastErrorAt: data.lastErrorAt || null,
    lastErrorSummary: data.lastErrorSummary || null,
    secretReference: data.secretReference || null,
    config: sanitizePublicConfig(data.config || {}),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

/** Strip any accidental secret fields from config before returning to clients. */
function sanitizePublicConfig(config = {}) {
  const out = { ...config };
  delete out.hubBearerToken;
  delete out.hubSecret;
  delete out.apiKey;
  delete out.password;
  delete out.privateKey;
  delete out.serviceAccountJson;
  delete out.credentials;
  return out;
}

async function listConnections(db, departmentId) {
  const snap = await connectionsCol(db, departmentId).get();
  const rows = snap.docs.map((doc) => publicConnection(doc)).filter(Boolean);
  rows.sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    return (a.priority || 100) - (b.priority || 100);
  });
  return rows;
}

async function getConnection(db, departmentId, connectionId) {
  if (!connectionId) return null;
  const snap = await connectionRef(db, departmentId, connectionId).get();
  if (!snap.exists) return null;
  return publicConnection(snap);
}

async function getPrimaryConnection(db, departmentId) {
  const all = await listConnections(db, departmentId);
  const active = all.filter((c) => c.enabled && c.status !== "disconnected" && c.status !== "not_connected");
  return active.find((c) => c.isPrimary) || active[0] || null;
}

async function getActiveConnections(db, departmentId) {
  const all = await listConnections(db, departmentId);
  return all.filter((c) => c.enabled && !["disconnected", "not_connected", "suspended"].includes(c.status));
}

/**
 * Members can't read connections (server-only), so keep a simple flag in the
 * department settings: the menu shows "Academy Class Schedule" only when true.
 */
async function refreshAcademyNavFlag(db, departmentId) {
  if (!departmentId) return false;
  const connected = (await getActiveConnections(db, departmentId)).length > 0;
  await db.doc(`departments/${departmentId}/settings/main`).set(
    { academy: { connected, updatedAt: new Date().toISOString() } },
    { merge: true },
  );
  return connected;
}

function validateProviderType(providerType) {
  if (!PROVIDER_TYPES.includes(providerType)) {
    throw new Error(`Unsupported providerType: ${providerType}`);
  }
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} departmentId
 * @param {Record<string, unknown>} input
 * @param {{ clearOtherPrimary?: boolean }} [opts]
 */
async function upsertConnection(db, departmentId, input = {}, opts = {}) {
  const existingId = String(input.connectionId || "").trim();
  const connectionId = existingId || newConnectionId();
  const ref = connectionRef(db, departmentId, connectionId);
  const existing = await ref.get();
  const prev = existing.exists ? existing.data() || {} : {};
  const now = new Date().toISOString();

  const providerType = String(input.providerType || prev.providerType || "manual").trim();
  validateProviderType(providerType);

  const isPrimary = input.isPrimary !== undefined
    ? input.isPrimary === true
    : existing.exists
      ? Boolean(prev.isPrimary)
      : input.isPrimary !== false;

  const status = CONNECTION_STATUSES.includes(input.status)
    ? input.status
    : prev.status || "pending";
  const syncMode = SYNC_MODES.includes(input.syncMode)
    ? input.syncMode
    : prev.syncMode || "manual";

  const payload = {
    connectionId,
    departmentId,
    enabled: input.enabled !== undefined ? input.enabled !== false : prev.enabled !== false,
    providerType,
    academyOrganizationId:
      input.academyOrganizationId !== undefined
        ? String(input.academyOrganizationId || "").trim()
        : prev.academyOrganizationId || "",
    displayName:
      input.displayName !== undefined
        ? String(input.displayName || "").trim() || "Training Academy"
        : prev.displayName || "Training Academy",
    status,
    syncMode,
    isPrimary,
    priority: Number.isFinite(Number(input.priority))
      ? Number(input.priority)
      : Number(prev.priority || (isPrimary ? 1 : 100)),
    effectiveDate: input.effectiveDate !== undefined ? input.effectiveDate : prev.effectiveDate || now.slice(0, 10),
    expirationDate: input.expirationDate !== undefined ? input.expirationDate : prev.expirationDate || null,
    capabilities: {
      ...defaultCapabilitiesFor(providerType),
      ...(prev.capabilities || {}),
      ...(input.capabilities && typeof input.capabilities === "object" ? input.capabilities : {}),
    },
    matchingPolicy: {
      ...DEFAULT_MATCHING_POLICY,
      ...(prev.matchingPolicy || {}),
      ...(input.matchingPolicy && typeof input.matchingPolicy === "object" ? input.matchingPolicy : {}),
    },
    secretReference:
      input.secretReference
      || prev.secretReference
      || secretReferenceFor(departmentId, connectionId),
    config: sanitizePublicConfig({
      ...(prev.config || {}),
      ...(input.config && typeof input.config === "object" ? input.config : {}),
    }),
    updatedAt: now,
    createdAt: prev.createdAt || now,
  };

  if (input.lastSuccessfulSyncAt !== undefined) payload.lastSuccessfulSyncAt = input.lastSuccessfulSyncAt;
  else if (prev.lastSuccessfulSyncAt) payload.lastSuccessfulSyncAt = prev.lastSuccessfulSyncAt;
  if (input.lastErrorAt !== undefined) payload.lastErrorAt = input.lastErrorAt;
  else if (prev.lastErrorAt) payload.lastErrorAt = prev.lastErrorAt;
  if (input.lastErrorSummary !== undefined) payload.lastErrorSummary = input.lastErrorSummary;
  else if (prev.lastErrorSummary) payload.lastErrorSummary = prev.lastErrorSummary;

  await ref.set(payload, { merge: true });

  if (isPrimary && opts.clearOtherPrimary !== false) {
    await clearOtherPrimaries(db, departmentId, connectionId);
  }

  return publicConnection({ id: connectionId, data: () => payload });
}

async function clearOtherPrimaries(db, departmentId, keepConnectionId) {
  const snap = await connectionsCol(db, departmentId).where("isPrimary", "==", true).get();
  const batch = db.batch();
  let count = 0;
  snap.docs.forEach((doc) => {
    if (doc.id === keepConnectionId) return;
    batch.update(doc.ref, { isPrimary: false, updatedAt: new Date().toISOString() });
    count += 1;
  });
  if (count) await batch.commit();
}

async function setPrimaryConnection(db, departmentId, connectionId) {
  const conn = await getConnection(db, departmentId, connectionId);
  if (!conn) throw new Error("Academy connection not found.");
  await connectionRef(db, departmentId, connectionId).set(
    { isPrimary: true, priority: 1, updatedAt: new Date().toISOString() },
    { merge: true }
  );
  await clearOtherPrimaries(db, departmentId, connectionId);
  return getConnection(db, departmentId, connectionId);
}

async function patchConnectionStatus(db, departmentId, connectionId, patch = {}) {
  const ref = connectionRef(db, departmentId, connectionId);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("Academy connection not found.");
  const next = {
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await ref.set(next, { merge: true });
  return getConnection(db, departmentId, connectionId);
}

async function disableConnection(db, departmentId, connectionId) {
  return patchConnectionStatus(db, departmentId, connectionId, {
    enabled: false,
    status: "suspended",
  });
}

async function disconnectConnection(db, departmentId, connectionId) {
  return patchConnectionStatus(db, departmentId, connectionId, {
    enabled: false,
    status: "disconnected",
    isPrimary: false,
  });
}

module.exports = {
  listConnections,
  getConnection,
  getPrimaryConnection,
  getActiveConnections,
  refreshAcademyNavFlag,
  upsertConnection,
  setPrimaryConnection,
  patchConnectionStatus,
  disableConnection,
  disconnectConnection,
  publicConnection,
  sanitizePublicConfig,
  connectionRef,
};
