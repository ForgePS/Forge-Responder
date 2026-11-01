/**
 * Hand-off of a code section from the Code Library to an open inspection.
 * "Add to inspection" stores one pending citation for this browser tab; the
 * inspection workspace reads it and offers to cite it.
 */

export const PENDING_CODE_CITATION_KEY = "forgePendingCodeCitation";

function storage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/** Keep only the fields we need, with safe types. Returns null if there is no section number. */
export function normalizePendingCitation(raw) {
  if (!raw || typeof raw !== "object") return null;
  const sectionNumber = String(raw.sectionNumber || "").trim();
  if (!sectionNumber) return null;
  return {
    publicationId: String(raw.publicationId || ""),
    codeNodeId: String(raw.codeNodeId || ""),
    sectionNumber,
    sectionTitle: String(raw.sectionTitle || ""),
    citedText: String(raw.citedText || "").slice(0, 4000),
    citedAt: String(raw.citedAt || ""),
  };
}

/** Short label like "1010.1 Doors" for buttons and fields. */
export function formatCitationLabel(citation) {
  if (!citation) return "";
  return [citation.sectionNumber, citation.sectionTitle].filter(Boolean).join(" ").trim();
}

export function setPendingCodeCitation(citation) {
  const normalized = normalizePendingCitation(citation);
  if (!normalized) return false;
  const store = storage();
  if (!store) return false;
  try {
    store.setItem(PENDING_CODE_CITATION_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}

export function readPendingCodeCitation() {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(PENDING_CODE_CITATION_KEY);
    return raw ? normalizePendingCitation(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function clearPendingCodeCitation() {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PENDING_CODE_CITATION_KEY);
  } catch {
    // Nothing to clear.
  }
}
