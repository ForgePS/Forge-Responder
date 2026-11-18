import { Fragment, useEffect, useMemo, useState } from "react";
import { BookOpen, LifeBuoy, Search } from "lucide-react";
import { loadHelpArticles, searchHelpArticles } from "../../lib/helpDesk/helpArticles.js";

/** **bold**, `code` and [links](...) as plain React (never raw HTML). */
function inline(text = "") {
  const parts = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, index) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={index}>{part.slice(1, -1)}</code>;
    const link = part.match(/^\[([^\]]+)\]\([^)]+\)$/);
    if (link) return <Fragment key={index}>{link[1]}</Fragment>;
    return <Fragment key={index}>{part}</Fragment>;
  });
}

function MarkdownBody({ text }) {
  const blocks = [];
  let list = null;
  let code = null;
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "p", text: paragraph.join(" ") });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };
  for (const raw of String(text).split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (code) {
      if (/^```/.test(line)) {
        blocks.push(code);
        code = null;
      } else code.lines.push(raw);
      continue;
    }
    if (/^```/.test(line)) {
      flushParagraph();
      flushList();
      code = { type: "pre", lines: [] };
      continue;
    }
    const heading = line.match(/^#{3,6}\s+(.*)$/);
    const bullet = line.match(/^\s*(?:[-*]|\d+\.)\s+(.*)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "h", text: heading[1] });
    } else if (bullet) {
      flushParagraph();
      if (!list) list = { type: /^\s*\d+\./.test(line) ? "ol" : "ul", items: [] };
      list.items.push(bullet[1]);
    } else if (/^\|/.test(line)) {
      flushParagraph();
      flushList();
      if (!/^\|[\s:|-]+\|$/.test(line)) blocks.push({ type: "row", cells: line.split("|").slice(1, -1).map((cell) => cell.trim()) });
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (list && /^\s+/.test(raw)) {
      list.items[list.items.length - 1] += ` ${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  flushList();
  if (code) blocks.push(code);

  return (
    <div className="hd-article-body">
      {blocks.map((block, index) => {
        if (block.type === "h") return <h4 key={index}>{inline(block.text)}</h4>;
        if (block.type === "ul") return <ul key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ul>;
        if (block.type === "ol") return <ol key={index}>{block.items.map((item, i) => <li key={i}>{inline(item)}</li>)}</ol>;
        if (block.type === "pre") return <pre key={index}>{block.lines.join("\n")}</pre>;
        if (block.type === "row") return <p key={index} className="hd-article-row">{block.cells.map((cell, i) => <span key={i}>{inline(cell)}</span>)}</p>;
        return <p key={index}>{inline(block.text)}</p>;
      })}
    </div>
  );
}

export default function HelpArticles({ onAsk }) {
  const [sections, setSections] = useState([]);
  const [state, setState] = useState("loading");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    loadHelpArticles()
      .then((list) => { if (active) { setSections(list); setState("ready"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);

  const results = useMemo(() => searchHelpArticles(sections, search), [sections, search]);
  const guides = useMemo(() => [...new Set(sections.map((section) => section.guide))], [sections]);

  return (
    <div className="hd-articles">
      <div className="hd-articles-head">
        <label className="msg-search">
          <Search size={15} />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search help articles" aria-label="Search help articles" />
        </label>
        <p className="muted">{state === "ready" ? `${results.length} of ${sections.length} articles from ${guides.length} guides` : ""}</p>
      </div>
      {state === "loading" ? <p className="muted">Loading articles…</p> : null}
      {state === "error" ? <p className="banner error">The help articles couldn't load.</p> : null}
      {state === "ready" && !results.length ? (
        <div className="msg-empty hd-articles-empty">
          <BookOpen size={28} />
          <p>Nothing matches “{search}”.</p>
          {onAsk ? <button type="button" className="primary-button" onClick={onAsk}><LifeBuoy size={15} /> Ask the help desk</button> : null}
        </div>
      ) : null}
      <div className="hd-article-list">
        {results.slice(0, 60).map((section) => (
          <details key={section.id} className="hd-article" open={Boolean(search.trim()) && results.length <= 3}>
            <summary>
              <strong>{section.title}</strong>
              <span>{section.guide}</span>
            </summary>
            <MarkdownBody text={section.body} />
          </details>
        ))}
      </div>
      {state === "ready" && results.length > 0 && onAsk ? (
        <p className="hd-articles-foot">
          Didn't find it? <button type="button" className="hd-link-button" onClick={onAsk}>Open a help request</button>
        </p>
      ) : null}
    </div>
  );
}
