import { listCodeNodes } from "./platformLibraryService.js";
import { CODE_NODE_TYPES } from "./paths.js";

const SYNONYMS = {
  sprinkler: ["fire sprinkler", "automatic sprinkler", "nfpa 13"],
  alarm: ["fire alarm", "detection", "notification"],
  egress: ["means of egress", "exit", "exit access", "exit discharge"],
  "high-piled": ["high piled", "high-piled combustible storage", "hpcs"],
  cooking: ["commercial cooking", "hood", "type i hood"],
  hydrant: ["fire hydrant", "water supply"],
  "fire department access": ["fire lane", "apparatus access", "fd access"],
};

function expandQueryTerms(raw) {
  const q = String(raw || "").trim().toLowerCase();
  if (!q) return [];
  const terms = new Set([q]);
  for (const [key, values] of Object.entries(SYNONYMS)) {
    if (q.includes(key) || values.some((v) => q.includes(v))) {
      terms.add(key);
      values.forEach((v) => terms.add(v));
    }
  }
  // simple stemming / plural
  if (q.endsWith("s") && q.length > 3) terms.add(q.slice(0, -1));
  else terms.add(`${q}s`);
  return [...terms];
}

function scoreNode(node, query, terms) {
  const number = String(node.number || "").toLowerCase();
  const title = String(node.title || "").toLowerCase();
  const body = String(node.bodyText || "").toLowerCase();
  const hay = `${number} ${title} ${body} ${(node.keywords || []).join(" ")}`.toLowerCase();
  let score = 0;

  if (number === query) score += 100;
  else if (number.startsWith(query)) score += 80;
  else if (number.includes(query)) score += 50;

  if (title === query) score += 40;
  else if (title.includes(query)) score += 25;

  for (const term of terms) {
    if (!term || term.length < 2) continue;
    if (number.includes(term)) score += 20;
    if (title.includes(term)) score += 12;
    if (body.includes(term)) score += 4;
    if ((node.keywords || []).some((k) => String(k).toLowerCase().includes(term))) score += 8;
  }

  // typo tolerance: allow 1-char edit distance on section numbers for short queries
  if (/^\d{3}(\.\d+){0,3}$/.test(query) && number && number !== query) {
    if (Math.abs(number.length - query.length) <= 1) score += 5;
  }

  return score;
}

function previewFor(node, query) {
  const body = String(node.bodyText || "");
  if (!body) return node.title || "";
  const idx = body.toLowerCase().indexOf(String(query || "").toLowerCase());
  if (idx < 0) return body.slice(0, 160);
  const start = Math.max(0, idx - 40);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 180)}${body.length > start + 180 ? "…" : ""}`;
}

/**
 * MVP + Phase 4 search over loaded nodes (or fetched chapter slice).
 * @param {string} publicationId
 * @param {{
 *   query?: string,
 *   chapterNumber?: string,
 *   nodeTypes?: string[],
 *   includeCommentary?: boolean,
 *   limit?: number,
 * }} options
 */
export async function searchCodeLibrary(publicationId, options = {}) {
  const queryText = String(options.query || "").trim();
  const terms = expandQueryTerms(queryText);
  const max = Math.min(Number(options.limit) || 50, 200);

  const nodes = await listCodeNodes(publicationId, {
    chapterNumber: options.chapterNumber || "",
    max: 1000,
  });

  const allowedTypes = Array.isArray(options.nodeTypes) && options.nodeTypes.length
    ? new Set(options.nodeTypes)
    : null;

  const scored = nodes
    .filter((node) => {
      if (allowedTypes && !allowedTypes.has(node.nodeType)) return false;
      if (!options.includeCommentary && node.nodeType === CODE_NODE_TYPES.COMMENTARY) return false;
      return true;
    })
    .map((node) => {
      const score = queryText ? scoreNode(node, queryText.toLowerCase(), terms) : 1;
      return {
        node,
        score,
        preview: previewFor(node, queryText),
      };
    })
    .filter((row) => (queryText ? row.score > 0 : true))
    .sort((a, b) => b.score - a.score || String(a.node.number).localeCompare(String(b.node.number), undefined, { numeric: true }))
    .slice(0, max);

  return {
    query: queryText,
    terms,
    results: scored,
  };
}

/**
 * Compare two editions by section number (Phase 4).
 */
export async function compareCodeEditions(publicationIdA, publicationIdB, sectionNumber) {
  const [aNodes, bNodes] = await Promise.all([
    listCodeNodes(publicationIdA, { max: 1000 }),
    listCodeNodes(publicationIdB, { max: 1000 }),
  ]);
  const a = aNodes.find((n) => n.number === sectionNumber && n.nodeType !== CODE_NODE_TYPES.COMMENTARY) || null;
  const b = bNodes.find((n) => n.number === sectionNumber && n.nodeType !== CODE_NODE_TYPES.COMMENTARY) || null;
  return {
    sectionNumber,
    left: a,
    right: b,
    changed: Boolean(a && b && a.bodyText !== b.bodyText),
    onlyInLeft: Boolean(a && !b),
    onlyInRight: Boolean(!a && b),
  };
}
