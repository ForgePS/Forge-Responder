import {
  CODE_NODE_TYPES,
  PUBLICATION_STATUSES,
} from "./paths.js";

export function nowIso() {
  return new Date().toISOString();
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizePublication(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(data.id || ""),
    name: String(data.name || "Untitled publication").trim(),
    publisher: String(data.publisher || "").trim(),
    edition: String(data.edition || "").trim(),
    sourceFilename: String(data.sourceFilename || ""),
    sourceHash: String(data.sourceHash || ""),
    sourceOrderId: String(data.sourceOrderId || ""),
    includesCommentary: data.includesCommentary !== false,
    status: data.status || PUBLICATION_STATUSES.DRAFT,
    importedAt: data.importedAt || "",
    publishedAt: data.publishedAt || "",
    nodeCount: Number(data.nodeCount) || 0,
    chapterCount: Number(data.chapterCount) || 0,
    notes: String(data.notes || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeCodeNode(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  const path = Array.isArray(data.path) ? data.path.map(String) : [];
  return {
    id: String(data.id || ""),
    publicationId: String(data.publicationId || ""),
    nodeType: String(data.nodeType || CODE_NODE_TYPES.SECTION),
    number: String(data.number || "").trim(),
    title: String(data.title || "").trim(),
    parentId: String(data.parentId || ""),
    path,
    bodyText: String(data.bodyText || ""),
    pageRef: String(data.pageRef || ""),
    keywords: Array.isArray(data.keywords) ? data.keywords.map(String) : [],
    chapterNumber: String(data.chapterNumber || ""),
    chapterTitle: String(data.chapterTitle || ""),
    active: data.active !== false,
    sortKey: String(data.sortKey || data.number || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [departmentId]
 */
export function normalizeLibraryAccess(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(data.id || departmentId || ""),
    departmentId: String(departmentId || data.departmentId || data.id || ""),
    moduleEnabled: data.moduleEnabled === true,
    enabledPublicationIds: Array.isArray(data.enabledPublicationIds)
      ? data.enabledPublicationIds.map(String)
      : [],
    updatedAt: data.updatedAt || "",
    updatedBy: String(data.updatedBy || ""),
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [departmentId]
 */
export function normalizeAdoptedCodeProfile(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(data.id || ""),
    departmentId: String(departmentId || data.departmentId || ""),
    jurisdictionName: String(data.jurisdictionName || "").trim(),
    state: String(data.state || "").trim(),
    county: String(data.county || "").trim(),
    municipality: String(data.municipality || "").trim(),
    primaryPublicationId: String(data.primaryPublicationId || ""),
    edition: String(data.edition || ""),
    adoptionOrdinance: String(data.adoptionOrdinance || ""),
    adoptionDate: String(data.adoptionDate || ""),
    effectiveDate: String(data.effectiveDate || ""),
    adoptedAppendices: Array.isArray(data.adoptedAppendices)
      ? data.adoptedAppendices.map(String)
      : [],
    secondaryPublicationIds: Array.isArray(data.secondaryPublicationIds)
      ? data.secondaryPublicationIds.map(String)
      : [],
    active: data.active !== false,
    history: Array.isArray(data.history) ? data.history : [],
    notes: String(data.notes || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} [departmentId]
 */
export function normalizeSavedSection(raw = {}, departmentId = "") {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(data.id || ""),
    departmentId: String(departmentId || data.departmentId || ""),
    userId: String(data.userId || ""),
    publicationId: String(data.publicationId || ""),
    codeNodeId: String(data.codeNodeId || ""),
    sectionNumber: String(data.sectionNumber || ""),
    sectionTitle: String(data.sectionTitle || ""),
    label: String(data.label || ""),
    useCount: Number(data.useCount) || 0,
    lastUsedAt: data.lastUsedAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}

/**
 * @param {Record<string, unknown>} raw
 */
export function normalizeImportBatch(raw = {}) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(data.id || ""),
    publicationId: String(data.publicationId || ""),
    sourceFilename: String(data.sourceFilename || ""),
    sourceHash: String(data.sourceHash || ""),
    status: String(data.status || "preview"),
    stats: data.stats && typeof data.stats === "object" ? data.stats : {},
    errors: Array.isArray(data.errors) ? data.errors.map(String) : [],
    previewSummary: String(data.previewSummary || ""),
    publishedBy: String(data.publishedBy || ""),
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || "",
  };
}
