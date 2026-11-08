/**
 * Per-department NERIS connection record.
 *
 * Stored at departments/{id}/integrations/neris, which firestore.rules keeps
 * closed to browsers; only these server functions read or write it. Nothing
 * secret is kept here: FORGE's client secret lives in Firebase secrets.
 */
const {
  NERIS_ENROLLMENT_GUIDE_URL,
  NerisError,
  fetchEntity,
  isValidNerisId,
  normalizeEnvironment,
  normalizeNerisId,
} = require("./nerisClient");

// connected      - NERIS answered for this department's entity
// not_enrolled   - NERIS refused: the department hasn't enrolled FORGE (or removed it)
// not_found      - NERIS has no entity with that ID
// error          - anything else (NERIS down, FORGE credentials missing)
// unchecked      - ID saved, not tested yet
const STATUSES = ["connected", "not_enrolled", "not_found", "error", "unchecked"];

function connectionRef(db, departmentId) {
  return db.doc(`departments/${departmentId}/integrations/neris`);
}

async function loadConnection(db, departmentId) {
  const snap = await connectionRef(db, departmentId).get();
  return snap.exists ? snap.data() || null : null;
}

function statusFromError(error) {
  if (error instanceof NerisError && ["not_enrolled", "not_found"].includes(error.code)) return error.code;
  return "error";
}

/** What the setup screen may see. Safe for any department member. */
function publicStatus(connection, { clientId = "", environment = "test" } = {}) {
  const base = {
    clientId: String(clientId || "").trim(),
    environment: normalizeEnvironment(environment),
    enrollmentGuideUrl: NERIS_ENROLLMENT_GUIDE_URL,
  };
  if (!connection?.nerisId) {
    return { ...base, configured: false, status: "not_set_up" };
  }
  return {
    ...base,
    configured: true,
    nerisId: connection.nerisId,
    status: STATUSES.includes(connection.status) ? connection.status : "unchecked",
    entityName: connection.entityName || "",
    // Status was checked against a different NERIS environment than FORGE now uses.
    environmentMismatch: Boolean(connection.checkedEnvironment)
      && connection.checkedEnvironment !== base.environment,
    lastCheckedAt: connection.lastCheckedAt || "",
    lastConnectedAt: connection.lastConnectedAt || "",
    lastError: connection.lastError || "",
    lastSync: connection.lastSync || null,
    savedAt: connection.savedAt || "",
  };
}

/**
 * Asks NERIS for the department's entity and records the result. Never throws
 * for NERIS-side problems: the outcome is saved and returned as a status.
 */
async function checkConnection(db, departmentId, { credentials, fetchImpl, now = () => new Date() } = {}) {
  const connection = await loadConnection(db, departmentId);
  if (!connection?.nerisId) {
    throw new NerisError("invalid", "Enter the department's NERIS ID first.");
  }
  const checkedAt = now().toISOString();
  const environment = normalizeEnvironment(credentials?.environment);
  let patch;
  try {
    const entity = await fetchEntity(connection.nerisId, { credentials, fetchImpl });
    patch = {
      status: "connected",
      entityName: entity.name || connection.entityName || "",
      lastConnectedAt: checkedAt,
      lastError: "",
    };
  } catch (error) {
    patch = {
      status: statusFromError(error),
      lastError: error.message || "NERIS check failed.",
    };
  }
  await connectionRef(db, departmentId).set({
    ...patch,
    checkedEnvironment: environment,
    lastCheckedAt: checkedAt,
    updatedAt: checkedAt,
  }, { merge: true });
  return loadConnection(db, departmentId);
}

/** Saves (or changes) the department's NERIS ID, then checks it. */
async function saveNerisId(db, departmentId, nerisId, { savedBy = "", credentials, fetchImpl, now = () => new Date() } = {}) {
  const id = normalizeNerisId(nerisId);
  if (!isValidNerisId(id)) {
    throw new NerisError("invalid", "That doesn't look like a NERIS ID. It starts with two letters and five digits, like FD24027214.");
  }
  const current = await loadConnection(db, departmentId);
  const savedAt = now().toISOString();
  const changed = current?.nerisId !== id;
  await connectionRef(db, departmentId).set({
    nerisId: id,
    savedAt,
    savedBy,
    updatedAt: savedAt,
    // A new ID starts fresh; keep history only when re-saving the same ID.
    ...(changed ? { status: "unchecked", entityName: "", lastError: "", lastConnectedAt: "", lastCheckedAt: "", checkedEnvironment: "" } : {}),
  }, { merge: true });
  return checkConnection(db, departmentId, { credentials, fetchImpl, now });
}

/**
 * Records a sync run: FORGE→NERIS links (merged into the existing maps), the
 * admin's unit type/staffing choices, and a short summary of the run.
 */
async function saveSyncResult(db, departmentId, { stationLinks = {}, unitLinks = {}, unitSettings = {}, summary = null, now = () => new Date() } = {}) {
  const at = now().toISOString();
  // A merge with an empty map would wipe the stored map, so skip empty ones.
  const nonEmpty = (key, value) => (value && Object.keys(value).length ? { [key]: value } : {});
  await connectionRef(db, departmentId).set({
    ...nonEmpty("stationLinks", stationLinks),
    ...nonEmpty("unitLinks", unitLinks),
    ...nonEmpty("unitSettings", unitSettings),
    ...(summary ? { lastSync: { ...summary, at } } : {}),
    updatedAt: at,
  }, { merge: true });
}

/**
 * Remembers which NERIS incident a FORGE report became, so corrections update
 * that incident instead of creating a new one. Server-side only.
 */
async function saveIncidentLink(db, departmentId, reportId, link, { now = () => new Date() } = {}) {
  const at = now().toISOString();
  await connectionRef(db, departmentId).set({
    incidentLinks: { [String(reportId)]: { ...link, updatedAt: at } },
    updatedAt: at,
  }, { merge: true });
}

async function removeConnection(db, departmentId) {
  await connectionRef(db, departmentId).delete();
}

module.exports = {
  STATUSES,
  checkConnection,
  connectionRef,
  loadConnection,
  publicStatus,
  removeConnection,
  saveIncidentLink,
  saveSyncResult,
  saveNerisId,
};
