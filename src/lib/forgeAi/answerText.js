/**
 * A tiny, safe reader for Forge AI answer text: paragraphs, "- " bullets,
 * **bold**, _italic_ and [S1] source citations. It returns plain data that
 * React renders as elements; no HTML string is ever produced or injected.
 */

/** @returns {{type:"text"|"bold"|"italic"|"cite", value:string}[]} */
export function parseInline(line = "") {
  const out = [];
  const re = /\*\*([^*]+)\*\*|_([^_]+)_|\[(S\d{1,4})\]/g;
  let last = 0;
  let match;
  while ((match = re.exec(line))) {
    if (match.index > last) out.push({ type: "text", value: line.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ type: "bold", value: match[1] });
    else if (match[2] !== undefined) out.push({ type: "italic", value: match[2] });
    else out.push({ type: "cite", value: match[3] });
    last = re.lastIndex;
  }
  if (last < line.length) out.push({ type: "text", value: line.slice(last) });
  return out;
}

/** @returns {({type:"p", inline:object[]} | {type:"ul", items:{inline:object[], depth:number}[]})[]} */
export function parseAnswer(text = "") {
  const blocks = [];
  let list = null;
  for (const raw of String(text || "").replace(/\r\n/g, "\n").split("\n")) {
    const bullet = raw.match(/^(\s*)[-*•]\s+(.*)$/);
    if (bullet) {
      if (!list) {
        list = { type: "ul", items: [] };
        blocks.push(list);
      }
      list.items.push({ inline: parseInline(bullet[2]), depth: bullet[1].length >= 2 ? 1 : 0 });
      continue;
    }
    list = null;
    if (raw.trim()) blocks.push({ type: "p", inline: parseInline(raw.trim()) });
  }
  return blocks;
}

/** Plain text for the Copy button: answer, sections, tables and sources. */
export function answerToPlainText(message = {}) {
  const parts = [String(message.text || "").replace(/\*\*/g, "")];
  for (const section of message.answer?.sections || []) parts.push(`\n${section.title}${section.ai ? " (AI)" : ""}\n${String(section.text || "").replace(/\*\*/g, "")}`);
  for (const table of message.answer?.tables || []) {
    parts.push(`\n${table.title}\n${[table.columns, ...table.rows].map((row) => row.join("\t")).join("\n")}`);
  }
  if (message.answer?.limitations?.length) parts.push(`\nData limitations\n${message.answer.limitations.map((l) => `- ${l}`).join("\n")}`);
  if (message.sources?.length) parts.push(`\nSources\n${message.sources.map((s) => `[${s.id}] ${s.label}${s.detail ? ` — ${s.detail}` : ""}`).join("\n")}`);
  return parts.join("\n").trim();
}
