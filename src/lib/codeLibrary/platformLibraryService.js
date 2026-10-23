import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getFirestoreDb } from "../firebaseClient.js";
import {
  CODE_IMPORT_BATCHES_COLLECTION,
  CODE_NODES_COLLECTION,
  CODE_PUBLICATIONS_COLLECTION,
  IFC_2024_PUBLICATION_ID,
  PUBLICATION_STATUSES,
} from "./paths.js";
import {
  normalizeCodeNode,
  normalizeImportBatch,
  normalizePublication,
  nowIso,
} from "./types.js";

function dbOrNull() {
  return getFirestoreDb();
}

export async function listCodePublications({ status } = {}) {
  const db = dbOrNull();
  if (!db) return [];
  const snap = await getDocs(collection(db, CODE_PUBLICATIONS_COLLECTION));
  return snap.docs
    .map((item) => normalizePublication({ id: item.id, ...item.data() }))
    .filter((row) => !status || row.status === status)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getCodePublication(publicationId) {
  if (!publicationId) return null;
  const db = dbOrNull();
  if (!db) return null;
  const snap = await getDoc(doc(db, CODE_PUBLICATIONS_COLLECTION, publicationId));
  if (!snap.exists()) return null;
  return normalizePublication({ id: snap.id, ...snap.data() });
}

export async function saveCodePublication(publicationId, input, actorUid = "") {
  const db = dbOrNull();
  if (!db) throw new Error("Firestore is not available.");
  const stamp = nowIso();
  const existing = await getCodePublication(publicationId);
  const payload = normalizePublication({
    ...existing,
    ...input,
    id: publicationId,
    updatedAt: stamp,
    createdAt: existing?.createdAt || stamp,
    updatedBy: actorUid,
  });
  await setDoc(doc(db, CODE_PUBLICATIONS_COLLECTION, publicationId), payload, { merge: true });
  return payload;
}

export async function listCodeNodes(publicationId, { chapterNumber, nodeType, parentId, max = 500 } = {}) {
  if (!publicationId) return [];
  const db = dbOrNull();
  if (!db) throw new Error("Firestore is not available.");

  const pageSize = Math.min(Math.max(Number(max) || 500, 1), 1000);
  const snap = await getDocs(
    query(
      collection(db, CODE_NODES_COLLECTION),
      where("publicationId", "==", publicationId),
      limit(pageSize),
    ),
  );
  const chapterKey = chapterNumber == null || chapterNumber === "" ? "" : String(chapterNumber);
  return snap.docs
    .map((item) => normalizeCodeNode({ id: item.id, ...item.data() }))
    .filter((row) => row.active)
    .filter((row) => !chapterKey || String(row.chapterNumber) === chapterKey)
    .filter((row) => !nodeType || row.nodeType === nodeType)
    .filter((row) => parentId == null || row.parentId === parentId)
    .sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey), undefined, { numeric: true }));
}

export async function getCodeNode(nodeId) {
  if (!nodeId) return null;
  const db = dbOrNull();
  if (!db) return null;
  const snap = await getDoc(doc(db, CODE_NODES_COLLECTION, nodeId));
  if (!snap.exists()) return null;
  return normalizeCodeNode({ id: snap.id, ...snap.data() });
}

/**
 * Prefer explicit chapter nodes; otherwise derive chapters from section chapterNumber values.
 */
export async function listChapters(publicationId) {
  const chapters = await listCodeNodes(publicationId, { nodeType: "chapter", max: 500 });
  if (chapters.length) {
    return chapters.sort((a, b) =>
      String(a.number).localeCompare(String(b.number), undefined, { numeric: true }),
    );
  }

  const nodes = await listCodeNodes(publicationId, { max: 1000 });
  const byNumber = new Map();
  for (const node of nodes) {
    const number = String(node.chapterNumber || "").trim();
    if (!number || byNumber.has(number)) continue;
    byNumber.set(number, normalizeCodeNode({
      id: `${publicationId}_chapter_${number}`,
      publicationId,
      nodeType: "chapter",
      number,
      title: node.chapterTitle || `Chapter ${number}`,
      chapterNumber: number,
      chapterTitle: node.chapterTitle || `Chapter ${number}`,
      sortKey: number,
      active: true,
    }));
  }
  return [...byNumber.values()].sort((a, b) =>
    String(a.number).localeCompare(String(b.number), undefined, { numeric: true }),
  );
}

/**
 * Upsert many code nodes in batches of 400.
 * @param {Array<Record<string, unknown>>} nodes
 */
export async function upsertCodeNodes(nodes = []) {
  const db = dbOrNull();
  if (!db) throw new Error("Firestore is not available.");
  const stamp = nowIso();
  let written = 0;
  for (let i = 0; i < nodes.length; i += 400) {
    const chunk = nodes.slice(i, i + 400);
    const batch = writeBatch(db);
    for (const raw of chunk) {
      const node = normalizeCodeNode({
        ...raw,
        updatedAt: stamp,
        createdAt: raw.createdAt || stamp,
      });
      if (!node.id) continue;
      batch.set(doc(db, CODE_NODES_COLLECTION, node.id), node, { merge: true });
      written += 1;
    }
    await batch.commit();
  }
  return written;
}

export async function saveImportBatch(batchId, input) {
  const db = dbOrNull();
  if (!db) throw new Error("Firestore is not available.");
  const stamp = nowIso();
  const payload = normalizeImportBatch({
    ...input,
    id: batchId,
    updatedAt: stamp,
    createdAt: input.createdAt || stamp,
  });
  await setDoc(doc(db, CODE_IMPORT_BATCHES_COLLECTION, batchId), payload, { merge: true });
  return payload;
}

export async function listImportBatches(publicationId = "") {
  const db = dbOrNull();
  if (!db) return [];
  const snap = await getDocs(collection(db, CODE_IMPORT_BATCHES_COLLECTION));
  return snap.docs
    .map((item) => normalizeImportBatch({ id: item.id, ...item.data() }))
    .filter((row) => !publicationId || row.publicationId === publicationId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

/**
 * Publish a parsed preview payload into platform library.
 * @param {{
 *   publicationId?: string,
 *   publication?: Record<string, unknown>,
 *   nodes?: Array<Record<string, unknown>>,
 *   batch?: Record<string, unknown>,
 *   actorUid?: string,
 * }} input
 */
export async function publishParsedLibrary(input = {}) {
  const publicationId = input.publicationId || IFC_2024_PUBLICATION_ID;
  const stamp = nowIso();
  const nodes = Array.isArray(input.nodes) ? input.nodes : [];
  const chapterCount = nodes.filter((n) => n.nodeType === "chapter").length;

  await saveCodePublication(
    publicationId,
    {
      ...(input.publication || {}),
      id: publicationId,
      status: PUBLICATION_STATUSES.PUBLISHED,
      publishedAt: stamp,
      importedAt: stamp,
      nodeCount: nodes.length,
      chapterCount,
    },
    input.actorUid || "",
  );

  const written = await upsertCodeNodes(
    nodes.map((node) => ({
      ...node,
      publicationId,
      id: node.id || `${publicationId}_${String(node.number || node.title || "").replace(/[^\w.-]+/g, "_")}`,
    })),
  );

  const batchId = input.batch?.id || `import-${Date.now().toString(36)}`;
  await saveImportBatch(batchId, {
    ...(input.batch || {}),
    id: batchId,
    publicationId,
    status: "published",
    publishedBy: input.actorUid || "",
    stats: {
      ...(input.batch?.stats || {}),
      nodeCount: written,
      chapterCount,
    },
  });

  return { publicationId, written, batchId };
}

export async function ensureIfc2024PublicationStub() {
  const existing = await getCodePublication(IFC_2024_PUBLICATION_ID);
  if (existing) return existing;
  return saveCodePublication(IFC_2024_PUBLICATION_ID, {
    name: "2024 International Fire Code",
    publisher: "ICC",
    edition: "2024",
    includesCommentary: true,
    status: PUBLICATION_STATUSES.DRAFT,
    notes: "Import the owner-supplied IFC Code and Commentary Combo DOCX to publish.",
  });
}
