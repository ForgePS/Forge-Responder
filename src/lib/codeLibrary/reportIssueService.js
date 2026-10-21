import { createRecord, listRecords } from "../firestoreService.js";
import { nowIso } from "./types.js";

export const CODE_EXTRACTION_ISSUES_COLLECTION = "codeExtractionIssues";

/**
 * Report a parse / extraction issue for a code node (Phase 4).
 */
export async function reportCodeExtractionIssue(departmentId, input = {}, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required.");
  const stamp = nowIso();
  const id = `issue_${Date.now().toString(36)}`;
  const payload = {
    id,
    departmentId,
    publicationId: String(input.publicationId || ""),
    codeNodeId: String(input.codeNodeId || ""),
    sectionNumber: String(input.sectionNumber || ""),
    sectionTitle: String(input.sectionTitle || ""),
    note: String(input.note || "").trim().slice(0, 2000),
    status: "open",
    reportedBy: audit.actorUid || input.userId || "",
    reportedByName: audit.actorName || "",
    createdAt: stamp,
    updatedAt: stamp,
  };
  await createRecord(departmentId, CODE_EXTRACTION_ISSUES_COLLECTION, id, payload);
  return payload;
}

export async function listCodeExtractionIssues(departmentId, { status } = {}) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, CODE_EXTRACTION_ISSUES_COLLECTION);
  return rows
    .filter((row) => !status || row.status === status)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}
