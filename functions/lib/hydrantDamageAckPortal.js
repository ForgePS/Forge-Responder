const crypto = require("crypto");
const { HttpsError } = require("firebase-functions/v2/https");

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

function publicReportSnapshot(report = {}) {
  return {
    id: report.id || "",
    reportNumber: report.reportNumber || "",
    hydrantLabel: report.hydrantLabel || "",
    hydrantAddress: report.hydrantAddress || "",
    waterCompanyName: report.waterCompanyName || "",
    severity: report.severity || "",
    severityLabel: report.severityLabel || report.severity || "",
    operationalStatus: report.operationalStatus || "",
    operationalStatusLabel: report.operationalStatusLabel || report.operationalStatus || "",
    status: report.status || "",
    statusLabel: report.statusLabel || String(report.status || "").replace(/_/g, " "),
    description: report.description || "",
    utilityFacingNotes: report.utilityFacingNotes || "",
    utilityWorkOrderNumber: report.utilityWorkOrderNumber || "",
    acknowledgmentDueAt: report.acknowledgmentDueAt || "",
    repairTargetAt: report.repairTargetAt || "",
    acknowledgedAt: report.acknowledgedAt || "",
    // Explicitly omit internalNotes and recipient internals.
  };
}

/**
 * Create a one-time-capable, expiring acknowledgment token for a report.
 * @param {FirebaseFirestore.Firestore} db
 * @param {{ departmentId: string, reportId: string, origin?: string }} input
 */
async function issueHydrantDamageAckToken(db, input = {}) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenId = crypto.randomBytes(12).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  await db.doc(`hydrantDamageAckTokens/${tokenId}`).set({
    departmentId: input.departmentId,
    reportId: input.reportId,
    tokenHash: hashToken(rawToken),
    expiresAt,
    createdAt: nowIso(),
    usedCount: 0,
  });
  const origin = String(input.origin || "https://rms.forgepublicsafety.com").replace(/\/$/, "");
  const url = `${origin}/utility-ack?t=${encodeURIComponent(`${tokenId}.${rawToken}`)}`;
  return { tokenId, url, expiresAt };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} compositeToken tokenId.rawToken
 */
async function resolveAckToken(db, compositeToken = "") {
  const value = String(compositeToken || "").trim();
  const dot = value.indexOf(".");
  if (dot <= 0) {
    throw new HttpsError("invalid-argument", "Invalid acknowledgment token.");
  }
  const tokenId = value.slice(0, dot);
  const rawToken = value.slice(dot + 1);
  const snap = await db.doc(`hydrantDamageAckTokens/${tokenId}`).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Acknowledgment link not found.");
  }
  const data = snap.data() || {};
  if (data.tokenHash !== hashToken(rawToken)) {
    throw new HttpsError("permission-denied", "Acknowledgment link is invalid.");
  }
  if (data.expiresAt && new Date(data.expiresAt).getTime() < Date.now()) {
    throw new HttpsError("failed-precondition", "Acknowledgment link has expired.");
  }
  if (data.revokedAt) {
    throw new HttpsError("failed-precondition", "Acknowledgment link was revoked.");
  }
  return { tokenId, data };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} token
 */
async function viewAckPortal(db, token) {
  const { data } = await resolveAckToken(db, token);
  const reportRef = db.doc(`departments/${data.departmentId}/hydrantDamageReports/${data.reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = { id: reportSnap.id, ...reportSnap.data() };
  return {
    ok: true,
    report: publicReportSnapshot(report),
    expiresAt: data.expiresAt || "",
  };
}

/**
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} token
 * @param {object} input
 */
async function submitAckPortal(db, token, input = {}) {
  const { tokenId, data } = await resolveAckToken(db, token);
  const reportRef = db.doc(`departments/${data.departmentId}/hydrantDamageReports/${data.reportId}`);
  const reportSnap = await reportRef.get();
  if (!reportSnap.exists) {
    throw new HttpsError("not-found", "Damage report not found.");
  }
  const report = { id: reportSnap.id, ...reportSnap.data() };
  if (["closed", "cancelled", "verified"].includes(report.status)) {
    throw new HttpsError("failed-precondition", "This report is already closed.");
  }

  const action = String(input.action || "acknowledge");
  const at = nowIso();
  /** @type {Record<string, unknown>} */
  let patch = {
    utilityWorkOrderNumber: String(input.utilityWorkOrderNumber || report.utilityWorkOrderNumber || "").trim(),
    updatedAt: at,
    updatedBy: "utility_portal",
  };

  if (input.utilityNotes) {
    patch.utilityFacingNotes = `${report.utilityFacingNotes || ""}\n[Utility portal] ${String(input.utilityNotes).trim()}`.trim();
  }
  if (input.estimatedRepairAt) {
    patch.repairTargetAt = input.estimatedRepairAt;
  }

  if (action === "acknowledge") {
    patch.status = "acknowledged";
    patch.repairStatus = "assigned";
    patch.acknowledgedAt = at;
  } else if (action === "scheduled") {
    patch.status = "repair_scheduled";
    patch.repairStatus = "scheduled";
    if (!report.acknowledgedAt) patch.acknowledgedAt = at;
  } else if (action === "in_progress") {
    patch.status = "repair_in_progress";
    patch.repairStatus = "in_progress";
    if (!report.acknowledgedAt) patch.acknowledgedAt = at;
  } else if (action === "completed") {
    // Utility completion never auto-closes — queue FD verification.
    patch.status = "ready_for_verification";
    patch.repairStatus = "completed";
    patch.repairCompletedAt = at;
    patch.verificationStatus = "pending";
    patch.verificationDueAt = new Date(Date.now() + 48 * 3_600_000).toISOString();
    if (!report.acknowledgedAt) patch.acknowledgedAt = at;
  } else {
    throw new HttpsError("invalid-argument", "Unsupported portal action.");
  }

  await reportRef.set(patch, { merge: true });

  const ackId = `ACK-${Date.now().toString(36).toUpperCase()}`;
  await db.doc(`departments/${data.departmentId}/hydrantDamageAcknowledgments/${ackId}`).set({
    id: ackId,
    reportId: report.id,
    waterCompanyId: report.waterCompanyId || "",
    acknowledgedAt: at,
    acknowledgedByName: String(input.acknowledgedByName || "Utility portal").trim(),
    acknowledgedByEmail: String(input.acknowledgedByEmail || "").trim(),
    utilityWorkOrderNumber: patch.utilityWorkOrderNumber || "",
    estimatedRepairAt: input.estimatedRepairAt || "",
    utilityNotes: String(input.utilityNotes || "").trim(),
    source: "utility_portal",
    action,
    createdAt: at,
    createdBy: "utility_portal",
  });

  await db.doc(`departments/${data.departmentId}/hydrantDamageAuditEvents/${`AUD-${Date.now().toString(36)}`}`).set({
    action: "damage_report.utility_portal_update",
    entityType: "hydrantDamageReport",
    entityId: report.id,
    actorUid: "utility_portal",
    actorName: String(input.acknowledgedByName || "Utility portal").trim(),
    after: { action, tokenId },
    createdAt: at,
  });

  await db.doc(`hydrantDamageAckTokens/${tokenId}`).set({
    usedCount: Number(data.usedCount || 0) + 1,
    lastUsedAt: at,
  }, { merge: true });

  const nextSnap = await reportRef.get();
  const next = { id: nextSnap.id, ...nextSnap.data() };
  return {
    ok: true,
    message: action === "completed"
      ? "Repair marked complete. The fire department will verify before closing."
      : "Update recorded.",
    report: publicReportSnapshot(next),
  };
}

module.exports = {
  issueHydrantDamageAckToken,
  viewAckPortal,
  submitAckPortal,
  publicReportSnapshot,
};
