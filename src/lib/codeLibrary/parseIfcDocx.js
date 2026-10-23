/**
 * Client/Node-safe IFC DOCX hierarchy helpers.
 * Full CLI import lives in scripts/ifc/parseIfcDocx.mjs
 */

import { CODE_NODE_TYPES, IFC_2024_PUBLICATION_ID } from "./paths.js";

/**
 * Build a deterministic node id.
 * @param {string} publicationId
 * @param {string} numberOrKey
 * @param {string} [nodeType]
 */
export function buildCodeNodeId(publicationId, numberOrKey, nodeType = "section") {
  const key = String(numberOrKey || "unknown")
    .trim()
    .toLowerCase()
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 80);
  return `${publicationId}_${nodeType}_${key}`;
}

/**
 * Parse bookmark names like "SECTION 101—SCOPE AND GENERAL REQUIREMEN"
 * @param {string} name
 */
export function parseBookmarkName(name) {
  const raw = String(name || "").trim();
  const section = raw.match(/^SECTION\s+([0-9A-Z.]+)\s*[—\-–:]+\s*(.+)$/i);
  if (section) {
    return {
      nodeType: CODE_NODE_TYPES.SECTION,
      number: section[1].trim(),
      title: section[2].trim(),
    };
  }
  const chapter = raw.match(/^CHAPTER\s+(\d+)\s*[—\-–:]+\s*(.+)$/i);
  if (chapter) {
    return {
      nodeType: CODE_NODE_TYPES.CHAPTER,
      number: chapter[1].trim(),
      title: chapter[2].trim(),
    };
  }
  const appendix = raw.match(/^APPENDIX\s+([A-Z0-9]+)\s*[—\-–:]+\s*(.+)$/i);
  if (appendix) {
    return {
      nodeType: CODE_NODE_TYPES.APPENDIX,
      number: appendix[1].trim(),
      title: appendix[2].trim(),
    };
  }
  const part = raw.match(/^PART\s+([0-9IVX]+)\s*[—\-–:]+\s*(.+)$/i);
  if (part) {
    return {
      nodeType: CODE_NODE_TYPES.PART,
      number: part[1].trim(),
      title: part[2].trim(),
    };
  }
  return null;
}

/**
 * Convert TOC/bookmark entries into code node stubs.
 * @param {Array<{ number: string, title: string, nodeType?: string, chapterNumber?: string, chapterTitle?: string, bodyText?: string }>} entries
 * @param {string} [publicationId]
 */
export function entriesToCodeNodes(entries = [], publicationId = IFC_2024_PUBLICATION_ID) {
  return entries.map((entry, index) => {
    const nodeType = entry.nodeType || CODE_NODE_TYPES.SECTION;
    const number = String(entry.number || "").trim();
    const title = String(entry.title || "").trim();
    return {
      id: buildCodeNodeId(publicationId, number || title || index, nodeType),
      publicationId,
      nodeType,
      number,
      title,
      parentId: entry.parentId || "",
      path: Array.isArray(entry.path) ? entry.path : [number].filter(Boolean),
      bodyText: String(entry.bodyText || "").slice(0, 20000),
      pageRef: entry.pageRef || "",
      keywords: Array.isArray(entry.keywords) ? entry.keywords : [],
      chapterNumber: String(entry.chapterNumber || ""),
      chapterTitle: String(entry.chapterTitle || ""),
      active: true,
      sortKey: number || String(index).padStart(5, "0"),
    };
  });
}

/**
 * Seed sample nodes for UI when full import has not been published yet.
 */
export function buildIfc2024PreviewSeed() {
  const publicationId = IFC_2024_PUBLICATION_ID;
  const chapters = [
    { number: "1", title: "Scope and Administration" },
    { number: "3", title: "General Requirements" },
    { number: "5", title: "Fire Service Features" },
    { number: "9", title: "Fire Protection and Life Safety Systems" },
    { number: "10", title: "Means of Egress" },
  ];
  const sections = [
    {
      number: "101.1",
      title: "Title",
      chapterNumber: "1",
      chapterTitle: "Scope and Administration",
      bodyText:
        "These regulations shall be known as the Fire Code of [NAME OF JURISDICTION], hereinafter referred to as \"this code.\"",
    },
    {
      number: "102.1",
      title: "Construction and design provisions",
      chapterNumber: "1",
      chapterTitle: "Scope and Administration",
      bodyText:
        "The construction and design provisions of this code shall apply to existing buildings and conditions unless otherwise specified.",
    },
    {
      number: "503.1.1",
      title: "Buildings and facilities",
      chapterNumber: "5",
      chapterTitle: "Fire Service Features",
      bodyText:
        "Approved fire apparatus access roads shall be provided for every facility, building or portion of a building hereafter constructed or moved into the jurisdiction.",
      keywords: ["fire department access", "fire lane"],
    },
    {
      number: "903.2",
      title: "Where required",
      chapterNumber: "9",
      chapterTitle: "Fire Protection and Life Safety Systems",
      bodyText:
        "Approved automatic sprinkler systems in new buildings and structures shall be provided in the locations described in Sections 903.2.1 through 903.2.12.",
      keywords: ["sprinkler", "automatic sprinkler"],
    },
    {
      number: "904.13",
      title: "Commercial cooking systems",
      chapterNumber: "9",
      chapterTitle: "Fire Protection and Life Safety Systems",
      bodyText:
        "The automatic fire-extinguishing system for commercial cooking systems shall be of a type recognized for protection of commercial cooking equipment and exhaust systems.",
      keywords: ["cooking", "hood"],
    },
    {
      number: "1001.1",
      title: "General",
      chapterNumber: "10",
      chapterTitle: "Means of Egress",
      bodyText:
        "Buildings or portions thereof shall be provided with a means of egress system as required by this chapter.",
      keywords: ["egress", "exits"],
    },
    {
      number: "1031.2",
      title: "Reliability",
      chapterNumber: "10",
      chapterTitle: "Means of Egress",
      bodyText:
        "Required exit accesses, exits and exit discharges shall be continuously maintained free from obstructions or impediments to full instant use in the case of fire or other emergency.",
      keywords: ["blocked exit", "egress"],
    },
  ];

  const chapterNodes = entriesToCodeNodes(
    chapters.map((c) => ({
      ...c,
      nodeType: CODE_NODE_TYPES.CHAPTER,
      chapterNumber: c.number,
      chapterTitle: c.title,
      bodyText: "",
    })),
    publicationId,
  );

  const sectionNodes = entriesToCodeNodes(
    sections.map((s) => ({
      ...s,
      nodeType: CODE_NODE_TYPES.SECTION,
      path: [s.chapterNumber, s.number],
    })),
    publicationId,
  );

  const commentaryNodes = entriesToCodeNodes(
    sections.slice(0, 3).map((s) => ({
      number: `${s.number}-commentary`,
      title: `Commentary — ${s.number}`,
      nodeType: CODE_NODE_TYPES.COMMENTARY,
      chapterNumber: s.chapterNumber,
      chapterTitle: s.chapterTitle,
      bodyText: `ICC commentary guidance related to Section ${s.number}. Import the full combo DOCX to replace this preview text.`,
      parentId: buildCodeNodeId(publicationId, s.number, CODE_NODE_TYPES.SECTION),
    })),
    publicationId,
  );

  return {
    publication: {
      id: publicationId,
      name: "2024 International Fire Code",
      publisher: "ICC",
      edition: "2024",
      includesCommentary: true,
      notes: "Preview seed for UI. Replace by publishing the owner-supplied IFC combo DOCX.",
    },
    nodes: [...chapterNodes, ...sectionNodes, ...commentaryNodes],
  };
}
