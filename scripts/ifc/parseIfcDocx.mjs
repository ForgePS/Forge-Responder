#!/usr/bin/env node
/**
 * Parse 2024 IFC Code and Commentary Combo DOCX into hierarchy JSON.
 *
 *   node scripts/ifc/parseIfcDocx.mjs --input "path/to/file.docx" --out scripts/ifc/out
 *   node scripts/ifc/parseIfcDocx.mjs --from-extract _tmp_ifc_extract.txt --out scripts/ifc/out --max-sections 400
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");
const require = createRequire(import.meta.url);

function argValue(flag, fallback = "") {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] || fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseBookmarkName(name) {
  const raw = String(name || "").trim();
  const section = raw.match(/^SECTION\s+([0-9A-Z.]+)\s*[—\-–:]+\s*(.+)$/i);
  if (section) return { nodeType: "section", number: section[1].trim(), title: section[2].trim() };
  const chapter = raw.match(/^CHAPTER\s+(\d+)\s*[—\-–:]+\s*(.+)$/i);
  if (chapter) return { nodeType: "chapter", number: chapter[1].trim(), title: chapter[2].trim() };
  const appendix = raw.match(/^APPENDIX\s+([A-Z0-9]+)\s*[—\-–:]+\s*(.+)$/i);
  if (appendix) return { nodeType: "appendix", number: appendix[1].trim(), title: appendix[2].trim() };
  const part = raw.match(/^PART\s+([0-9IVX]+)\s*[—\-–:]+\s*(.+)$/i);
  if (part) return { nodeType: "part", number: part[1].trim(), title: part[2].trim() };
  return null;
}

function extractFromDocx(buffer) {
  // Prefer jszip if available; otherwise treat as already-extracted text path.
  let JSZip;
  try {
    JSZip = require("jszip");
  } catch {
    throw new Error("jszip is required to parse DOCX. Run: npm install jszip");
  }
  return JSZip.loadAsync(buffer).then(async (zip) => {
    const xml = await zip.file("word/document.xml").async("string");
    const bookmarks = [...xml.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g)].map((m) => m[1]);
    const texts = [...xml.matchAll(/<w:t[^>]*>(.*?)<\/w:t>/g)].map((m) =>
      m[1]
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"'),
    );
    return { bookmarks, texts, xmlSize: xml.length };
  });
}

function entriesFromBookmarks(bookmarks) {
  const seen = new Set();
  const entries = [];
  for (const name of bookmarks) {
    const parsed = parseBookmarkName(name);
    if (!parsed) continue;
    const key = `${parsed.nodeType}:${parsed.number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(parsed);
  }
  return entries;
}

function attachBodies(entries, joinedText, maxBody = 4000) {
  const withBody = entries.map((entry, index) => {
    if (entry.nodeType === "chapter" || entry.nodeType === "part") {
      return { ...entry, bodyText: "" };
    }
    const needle = entry.number;
    const idx = joinedText.indexOf(needle);
    if (idx < 0) return { ...entry, bodyText: "" };
    const next = entries.slice(index + 1).find((e) => e.nodeType === "section" || e.nodeType === "appendix");
    const end = next ? joinedText.indexOf(next.number, idx + needle.length) : idx + maxBody;
    const sliceEnd = end > idx ? end : idx + maxBody;
    let body = joinedText.slice(idx, Math.min(sliceEnd, idx + maxBody)).replace(/\s+/g, " ").trim();
    // Drop leading number
    body = body.replace(new RegExp(`^${needle.replace(/\./g, "\\.")}\\s*`), "");
    return { ...entry, bodyText: body.slice(0, maxBody) };
  });
  return withBody;
}

function assignChapters(entries) {
  let currentChapter = { number: "", title: "" };
  return entries.map((entry) => {
    if (entry.nodeType === "chapter") {
      currentChapter = { number: entry.number, title: entry.title };
      return {
        ...entry,
        chapterNumber: entry.number,
        chapterTitle: entry.title,
        path: [entry.number],
      };
    }

    let chapterNumber = "";
    let chapterTitle = "";
    if (entry.number) {
      const asInt = Number(String(entry.number).split(".")[0]);
      if (Number.isFinite(asInt) && asInt >= 100) {
        chapterNumber = String(Math.floor(asInt / 100));
      } else if (Number.isFinite(asInt)) {
        chapterNumber = String(asInt);
      }
      if (chapterNumber) {
        chapterTitle = `Chapter ${chapterNumber}`;
        currentChapter = { number: chapterNumber, title: chapterTitle };
      }
    }
    if (!chapterNumber) {
      chapterNumber = currentChapter.number;
      chapterTitle = currentChapter.title;
    }

    return {
      ...entry,
      chapterNumber,
      chapterTitle,
      path: [chapterNumber, entry.number].filter(Boolean),
    };
  });
}

/**
 * Ensure chapter nodes exist for every inferred chapterNumber.
 */
function ensureChapterNodes(entries) {
  const seen = new Set(entries.filter((e) => e.nodeType === "chapter").map((e) => e.number));
  const extras = [];
  for (const entry of entries) {
    const ch = entry.chapterNumber;
    if (!ch || seen.has(ch)) continue;
    seen.add(ch);
    extras.push({
      nodeType: "chapter",
      number: ch,
      title: entry.chapterTitle || `Chapter ${ch}`,
      chapterNumber: ch,
      chapterTitle: entry.chapterTitle || `Chapter ${ch}`,
      path: [ch],
      bodyText: "",
    });
  }
  return [...extras, ...entries];
}

function toNodes(entries, publicationId = "ifc-2024") {
  return entries.map((entry, index) => {
    const key = String(entry.number || entry.title || index)
      .toLowerCase()
      .replace(/[^\w.-]+/g, "_")
      .slice(0, 80);
    return {
      id: `${publicationId}_${entry.nodeType}_${key}`,
      publicationId,
      nodeType: entry.nodeType,
      number: entry.number,
      title: entry.title,
      parentId: entry.parentId || "",
      path: entry.path || [entry.number],
      bodyText: entry.bodyText || "",
      pageRef: "",
      keywords: [],
      chapterNumber: entry.chapterNumber || "",
      chapterTitle: entry.chapterTitle || "",
      active: true,
      sortKey: entry.number || String(index).padStart(5, "0"),
    };
  });
}

/**
 * Attach ICC commentary sibling nodes when "Commentary" markers appear after a section.
 */
function attachCommentaryNodes(nodes, joinedText, publicationId = "ifc-2024") {
  const commentary = [];
  for (const node of nodes) {
    if (node.nodeType !== "section" || !node.number) continue;
    const needle = `${node.number} `;
    const idx = joinedText.indexOf(needle);
    if (idx < 0) continue;
    const window = joinedText.slice(idx, idx + 8000);
    const marker = window.search(/\bCommentary\b/i);
    if (marker < 0) continue;
    const after = window.slice(marker + "Commentary".length).trim();
    if (!after || after.length < 40) continue;
    const body = after.slice(0, 3500).replace(/\s+/g, " ").trim();
    commentary.push({
      id: `${publicationId}_commentary_${String(node.number).toLowerCase().replace(/[^\w.-]+/g, "_")}`,
      publicationId,
      nodeType: "commentary",
      number: `${node.number}-commentary`,
      title: `Commentary — ${node.number}`,
      parentId: node.id,
      path: [...(node.path || []), "commentary"],
      bodyText: body,
      pageRef: "",
      keywords: ["commentary"],
      chapterNumber: node.chapterNumber || "",
      chapterTitle: node.chapterTitle || "",
      active: true,
      sortKey: `${node.sortKey || node.number}-commentary`,
    });
  }
  return commentary;
}

async function main() {
  const inputPath = argValue("--input", "");
  const extractPath = argValue("--from-extract", "");
  const outDir = resolve(ROOT, argValue("--out", "scripts/ifc/out"));
  const maxSections = Number(argValue("--max-sections", "0")) || 0;
  mkdirSync(outDir, { recursive: true });

  let bookmarks = [];
  let texts = [];
  let sourceFilename = "";
  let sourceHash = "";
  let orderId = "";

  if (inputPath) {
    const abs = resolve(inputPath);
    if (!existsSync(abs)) throw new Error(`Input not found: ${abs}`);
    const buffer = readFileSync(abs);
    sourceHash = createHash("sha256").update(buffer).digest("hex");
    sourceFilename = abs.split(/[/\\]/).pop() || "ifc.docx";
    const parsed = await extractFromDocx(buffer);
    bookmarks = parsed.bookmarks;
    texts = parsed.texts;
  } else if (extractPath) {
    const abs = resolve(ROOT, extractPath);
    if (!existsSync(abs)) throw new Error(`Extract not found: ${abs}`);
    const raw = readFileSync(abs, "utf8");
    sourceHash = createHash("sha256").update(raw).digest("hex");
    sourceFilename = abs.split(/[/\\]/).pop() || "extract.txt";
    bookmarks = [...raw.matchAll(/w:bookmarkStart[^>]*w:name="([^"]+)"/g)].map((m) => m[1]);
    // extract file is already one token per line
    texts = raw.split(/\r?\n/).filter((line) => line && !line.startsWith("<w:"));
  } else {
    throw new Error("Provide --input <docx> or --from-extract <txt>");
  }

  let entries = ensureChapterNodes(assignChapters(entriesFromBookmarks(bookmarks)));
  if (maxSections > 0) {
    const chapters = entries.filter((e) => e.nodeType === "chapter" || e.nodeType === "part");
    const sections = entries.filter((e) => e.nodeType === "section" || e.nodeType === "appendix").slice(0, maxSections);
    entries = ensureChapterNodes(assignChapters([...chapters, ...sections]));
  }

  const joined = texts.join(" ").replace(/\s+/g, " ");
  orderId = (joined.match(/102062229/) || [])[0] || "";
  entries = attachBodies(entries, joined);

  let nodes = toNodes(entries);
  const commentaryNodes = attachCommentaryNodes(nodes, joined);
  nodes = [...nodes, ...commentaryNodes];
  const stats = {
    bookmarks: bookmarks.length,
    entries: entries.length,
    chapters: nodes.filter((n) => n.nodeType === "chapter").length,
    sections: nodes.filter((n) => n.nodeType === "section").length,
    appendices: nodes.filter((n) => n.nodeType === "appendix").length,
    commentary: commentaryNodes.length,
    withBody: nodes.filter((n) => n.bodyText).length,
    sourceHash,
    sourceFilename,
    orderId,
  };

  const publication = {
    id: "ifc-2024",
    name: "2024 International Fire Code",
    publisher: "ICC",
    edition: "2024",
    sourceFilename,
    sourceHash,
    sourceOrderId: orderId,
    includesCommentary: true,
    notes: "Parsed from owner-supplied IFC Code and Commentary Combo.",
  };

  const payload = {
    publication,
    nodes,
    stats,
    errors: [],
    previewSummary: `Parsed ${stats.chapters} chapters, ${stats.sections} sections, ${stats.commentary} commentary nodes (${stats.withBody} with body text).`,
  };

  writeFileSync(join(outDir, "ifc-2024-preview.json"), JSON.stringify(payload, null, 2));
  writeFileSync(join(outDir, "ifc-2024-nodes.jsonl"), nodes.map((n) => JSON.stringify(n)).join("\n"));
  writeFileSync(join(outDir, "ifc-2024-stats.json"), JSON.stringify(stats, null, 2));

  console.log(JSON.stringify({ ok: true, outDir, stats }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
