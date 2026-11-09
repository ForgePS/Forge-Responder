/**
 * Platform Knowledge: answers come only from FORGE's own documentation,
 * packed by scripts/build-forge-ai-knowledge.mjs. If no passage matches, the
 * answer says the topic isn't documented instead of guessing.
 */
const R = require("../records");

let index = null;
function loadIndex() {
  if (!index) {
    try {
      index = require("../generated/knowledgeIndex.json");
    } catch {
      index = { documents: [], chunks: [] };
    }
  }
  return index;
}

const STOP = new Set("a an the and or of to in on for is are be do does how what where when which who can i we you my our it this that with from by as at about into".split(" "));

function tokens(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

/** BM25 over chunk text (heading counted twice). */
function search(question, { limit = 5, chunks = loadIndex().chunks } = {}) {
  const q = [...new Set(tokens(question))];
  if (!q.length || !chunks.length) return [];
  const docs = chunks.map((c) => tokens(`${c.title} ${c.heading} ${c.heading} ${c.text}`));
  const avg = docs.reduce((s, d) => s + d.length, 0) / docs.length;
  const df = Object.fromEntries(q.map((t) => [t, docs.filter((d) => d.includes(t)).length]));
  const k1 = 1.4;
  const b = 0.75;
  return chunks
    .map((chunk, i) => {
      const d = docs[i];
      let score = 0;
      let hits = 0;
      for (const t of q) {
        const tf = d.filter((x) => x === t).length;
        if (!tf) continue;
        hits += 1;
        const idf = Math.log(1 + (chunks.length - df[t] + 0.5) / (df[t] + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avg)));
      }
      return { chunk, score, coverage: hits / q.length };
    })
    .filter((x) => x.score > 1.5 && x.coverage >= 0.34)
    .sort((a, b2) => b2.score - a.score)
    .slice(0, limit);
}

/** Markdown passage -> one readable line for the records-only answer. */
function plainPassage(markdown, max = 420) {
  const lines = String(markdown || "").split("\n")
    .filter((line) => !/^\s*\|?\s*:?-{3,}/.test(line))            // table separator rows
    .map((line) => line.trim().replace(/^\|(.*)\|$/, "$1").split("|").map((c) => c.trim()).filter(Boolean).join("; "))
    .map((line) => line.replace(/^[-*+]\s+|^\d+\.\s+|^>\s*/, ""))  // bullets, numbers, quotes
    .filter(Boolean);
  const out = lines.join(" ").replace(/\x60+/g, "").replace(/\*\*|__/g, "").replace(/\s+/g, " ").trim();
  return out.length > max ? `${out.slice(0, max).replace(/\s+\S*$/, "")}…` : out;
}

async function run(ctx) {
  const book = new R.SourceBook();
  const hits = search(ctx.message);
  const passages = hits.map(({ chunk }) => ({
    source: book.add({ kind: "doc", recordId: chunk.id, label: `${chunk.title}`, detail: `${chunk.doc} — ${chunk.heading}`, liveness: "reference", asOf: null, link: { doc: chunk.doc } }),
    document: chunk.doc,
    heading: chunk.heading,
    text: chunk.text,
  }));
  const fallbackAnswer = passages.length
    ? ["From FORGE's documentation:", ...passages.slice(0, 2).map((p) => `- **${p.heading}** [${p.source}]: ${plainPassage(p.text)}`)].join("\n")
    : "That isn't covered in FORGE's documentation, so I can't confirm how it works or whether the feature exists. Your FORGE administrator or FORGE Public Safety can help.";
  return {
    capability: "knowledge",
    title: "Platform knowledge",
    liveness: "reference",
    facts: { passages, documentsIndexed: loadIndex().documents.length },
    book,
    tables: [],
    limitations: ["Answers come only from FORGE's documentation in this release; features not described there are not confirmed."],
    fallbackAnswer,
    empty: passages.length === 0,
  };
}

module.exports = { run, search, tokens, plainPassage };
