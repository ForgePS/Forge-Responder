/**
 * Pack the repo's own documentation into a small index for Forge AI's
 * Platform Knowledge capability (Cloud Functions only deploy functions/).
 *
 *   npm run build:forge-ai
 *
 * Only docs that describe what exists are included. Specs, plans, audits and
 * internal design notes are left out so Forge AI never presents planned work
 * as a feature. Output: functions/lib/forgeAi/generated/knowledgeIndex.json.
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DOCS = join(ROOT, "docs");
const OUT = join(ROOT, "functions", "lib", "forgeAi", "generated", "knowledgeIndex.json");
const MAX_CHARS = 1800;

// Paths (relative to docs/, forward slashes) that are never indexed.
const EXCLUDE = [
  /^audits\//,
  /^CODEX_RMS_BUILD_SPEC\.md$/,
  /^rms\/saas-readiness-plan\.md$/,
  /^rms\/staging\.md$/,
  /-assessment\.md$/,
  /testing-results\.md$/,
  /migration-report\.md$/,
  /^forge-ai\/FORGE_AI_(ARCHITECTURE_DISCOVERY|TECHNICAL_DESIGN|FINAL_REPORT)\.md$/,
  /architecture-discovery\.md$/,
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** Split a Markdown file into heading-scoped chunks of at most MAX_CHARS. */
export function chunkMarkdown(text, docPath) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const docTitle = (lines.find((l) => /^#\s/.test(l)) || docPath).replace(/^#\s*/, "").trim();
  const chunks = [];
  let heading = docTitle;
  let buffer = [];
  const flush = () => {
    const body = buffer.join("\n").trim();
    buffer = [];
    if (!body) return;
    for (let start = 0; start < body.length; start += MAX_CHARS) {
      chunks.push({ heading, text: body.slice(start, start + MAX_CHARS) });
    }
  };
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.*)$/);
    if (match) {
      flush();
      heading = match[1].length === 1 ? match[2].trim() : `${docTitle} — ${match[2].trim()}`;
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks.map((chunk, i) => ({ id: `${docPath}#${i + 1}`, doc: docPath, title: docTitle, ...chunk }));
}

const files = walk(DOCS)
  .map((full) => ({ full, rel: relative(DOCS, full).split("\\").join("/") }))
  .filter(({ rel }) => !EXCLUDE.some((re) => re.test(rel)));

const chunks = files.flatMap(({ full, rel }) => chunkMarkdown(readFileSync(full, "utf8"), `docs/${rel}`));
mkdirSync(join(OUT, ".."), { recursive: true });
writeFileSync(OUT, `${JSON.stringify({ version: 1, documents: files.map((f) => `docs/${f.rel}`), chunks }, null, 0)}\n`);
console.log(`Indexed ${files.length} documents into ${chunks.length} chunks: ${OUT}`);
