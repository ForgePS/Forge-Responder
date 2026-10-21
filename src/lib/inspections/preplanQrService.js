import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { PREPLAN_QR_TOKENS_COLLECTION } from "./paths.js";
import { writeInspectionAuditLog } from "./inspectionAudit.js";

function nowIso() {
  return new Date().toISOString();
}

function randomToken() {
  const bytes = new Uint8Array(24);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value) {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback for non-browser contexts — not cryptographically ideal; tokens still random.
  return `fallback_${value.slice(0, 32)}`;
}

/**
 * Create a secure QR access token. Never embed raw preplan IDs as the token.
 * Returns { token (show once), record }.
 */
export async function createPreplanQrToken(departmentId, preplanId, audit = {}, options = {}) {
  if (!departmentId) throw new Error("Department required.");
  if (!preplanId) throw new Error("Preplan id required.");
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const stamp = nowIso();
  const id = `PQR-${Date.now().toString(36)}`;
  const record = {
    id,
    departmentId,
    preplanId,
    tokenHash,
    label: options.label || "Preplan access",
    expiresAt: options.expiresAt || "",
    revoked: false,
    scanCount: 0,
    createdAt: stamp,
    updatedAt: stamp,
    createdBy: audit.actorUid || "",
    createdByName: audit.actorName || "",
  };
  await createRecord(departmentId, PREPLAN_QR_TOKENS_COLLECTION, id, record);
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanQr",
    action: "create",
    recordId: id,
    summary: `QR token created for preplan ${preplanId}`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return { token, record: { ...record, tokenHash: undefined } };
}

export async function listPreplanQrTokens(departmentId, preplanId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, PREPLAN_QR_TOKENS_COLLECTION);
  return rows
    .filter((row) => !preplanId || row.preplanId === preplanId)
    .map((row) => {
      const { tokenHash, ...rest } = row;
      return rest;
    })
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function revokePreplanQrToken(departmentId, tokenId, audit = {}) {
  if (!departmentId || !tokenId) throw new Error("Department and token id required.");
  const stamp = nowIso();
  await updateRecord(departmentId, PREPLAN_QR_TOKENS_COLLECTION, tokenId, {
    revoked: true,
    revokedAt: stamp,
    updatedAt: stamp,
  });
  await writeInspectionAuditLog(departmentId, {
    module: "Preplans",
    recordType: "preplanQr",
    action: "revoke",
    recordId: tokenId,
    summary: `QR token revoked`,
    actorUid: audit.actorUid || "",
    actorName: audit.actorName || "",
  });
  return { id: tokenId, revoked: true };
}
