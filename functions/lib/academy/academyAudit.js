/**
 * Append-only academy integration audit log.
 * Path: departments/{departmentId}/academyAuditLogs/{logId}
 */

const { maskFemaSid } = require("./types");

function auditCol(db, departmentId) {
  return db.collection(`departments/${departmentId}/academyAuditLogs`);
}

function sanitizeValue(value) {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const lower = key.toLowerCase();
    if (
      lower.includes("password")
      || lower.includes("token")
      || lower.includes("secret")
      || lower.includes("apikey")
      || lower.includes("privatekey")
      || lower.includes("serviceaccount")
    ) {
      out[key] = "[redacted]";
      continue;
    }
    if (lower.includes("femasid") || lower === "femaid") {
      out[key] = maskFemaSid(raw);
      continue;
    }
    if (lower.includes("dateofbirth") || lower === "birthdate" || lower === "dob") {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeValue(raw);
  }
  return out;
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} departmentId
 * @param {object} entry
 */
async function writeAcademyAudit(db, departmentId, entry = {}) {
  const now = new Date().toISOString();
  const doc = {
    departmentId,
    connectionId: entry.connectionId || null,
    academyOrganizationId: entry.academyOrganizationId || null,
    personId: entry.personId || null,
    actor: entry.actor || null,
    actorType: entry.actorType || "user",
    action: entry.action || "unknown",
    timestamp: now,
    result: entry.result || "ok",
    sourceSystem: entry.sourceSystem || "rms",
    before: entry.before != null ? sanitizeValue(entry.before) : null,
    after: entry.after != null ? sanitizeValue(entry.after) : null,
    errorDetails: entry.errorDetails || null,
    meta: entry.meta != null ? sanitizeValue(entry.meta) : null,
  };
  const ref = await auditCol(db, departmentId).add(doc);
  return { id: ref.id, ...doc };
}

async function listAcademyAuditLogs(db, departmentId, { limit = 50, connectionId } = {}) {
  let query = auditCol(db, departmentId).orderBy("timestamp", "desc").limit(Math.min(Number(limit) || 50, 200));
  // Avoid composite index requirement when filtering — filter in memory for scaffolding.
  const snap = await query.get();
  let rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (connectionId) {
    rows = rows.filter((r) => r.connectionId === connectionId);
  }
  return rows;
}

module.exports = {
  writeAcademyAudit,
  listAcademyAuditLogs,
  sanitizeValue,
};
