import {
  createRecord,
  listRecords,
  updateRecord,
} from "../firestoreService.js";
import { CODE_SAVED_SECTIONS_COLLECTION, CODE_SEARCH_HISTORY_COLLECTION } from "./paths.js";
import { normalizeSavedSection, nowIso } from "./types.js";

export async function listSavedSections(departmentId, userId = "") {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, CODE_SAVED_SECTIONS_COLLECTION);
  return rows
    .map((row) => normalizeSavedSection(row, departmentId))
    .filter((row) => !userId || row.userId === userId)
    .sort((a, b) => String(b.lastUsedAt || b.updatedAt).localeCompare(String(a.lastUsedAt || a.updatedAt)));
}

export async function saveSectionBookmark(departmentId, input, audit = {}) {
  if (!departmentId) throw new Error("departmentId is required.");
  const stamp = nowIso();
  const id =
    input.id ||
    `saved_${String(input.userId || "user")}_${String(input.codeNodeId || input.sectionNumber || Date.now())}`.replace(
      /[^\w.-]+/g,
      "_",
    );
  const existing = (await listSavedSections(departmentId)).find((row) => row.id === id);
  const payload = normalizeSavedSection(
    {
      ...existing,
      ...input,
      id,
      departmentId,
      useCount: (Number(existing?.useCount) || 0) + (input.incrementUse ? 1 : 0),
      lastUsedAt: input.incrementUse ? stamp : existing?.lastUsedAt || stamp,
      updatedAt: stamp,
      createdAt: existing?.createdAt || stamp,
      userId: input.userId || audit.actorUid || existing?.userId || "",
    },
    departmentId,
  );
  if (existing) await updateRecord(departmentId, CODE_SAVED_SECTIONS_COLLECTION, id, payload);
  else await createRecord(departmentId, CODE_SAVED_SECTIONS_COLLECTION, id, payload);
  return payload;
}

export async function listFrequentSections(departmentId, userId = "", limitCount = 12) {
  const rows = await listSavedSections(departmentId, userId);
  return rows
    .slice()
    .sort((a, b) => (b.useCount || 0) - (a.useCount || 0))
    .slice(0, limitCount);
}

export async function recordSearchHistory(departmentId, userId, queryText) {
  if (!departmentId || !queryText?.trim()) return null;
  const stamp = nowIso();
  const id = `search_${Date.now().toString(36)}`;
  const payload = {
    id,
    departmentId,
    userId: userId || "",
    query: String(queryText).trim().slice(0, 200),
    createdAt: stamp,
    updatedAt: stamp,
  };
  await createRecord(departmentId, CODE_SEARCH_HISTORY_COLLECTION, id, payload);
  return payload;
}

export async function listSearchHistory(departmentId, userId = "", limitCount = 20) {
  if (!departmentId) return [];
  const rows = await listRecords(departmentId, CODE_SEARCH_HISTORY_COLLECTION);
  return rows
    .filter((row) => !userId || row.userId === userId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limitCount);
}
