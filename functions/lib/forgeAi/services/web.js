/**
 * Web Research. Nothing is read from the department here: the only thing that
 * leaves FORGE is the member's question, sent to Anthropic's server-side web
 * search by model.generateWeb. Sources are the web pages the answer cites.
 */
const R = require("../records");
const { safeSnippet } = require("../validate");

const LIMITATIONS = [
  "This answer comes from public websites, not your department's records. Check important details at the source.",
  "Web results are general information, not legal, medical or engineering advice for a specific situation. Follow your department's policies, protocols and medical direction.",
];

const NOT_CONFIGURED = "Web Research needs the AI model, which isn't set up for FORGE right now, so I couldn't search the web. You can still ask about your department's records.";
const UNAVAILABLE = "I couldn't search the web just now. Try again in a few minutes, or ask about your department's records instead.";

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const isWebUrl = (url) => /^https?:\/\//i.test(String(url || "")) && Boolean(hostOf(url));

async function run() {
  return {
    capability: "web",
    title: "Web research",
    liveness: "web",
    facts: {},
    book: new R.SourceBook(),
    tables: [],
    limitations: LIMITATIONS,
    fallbackAnswer: NOT_CONFIGURED,
    empty: false,
    webSearch: true,
  };
}

/**
 * Turn generateWeb's result into sources and model-shaped output for
 * validateOutput: each cited page becomes a source, and its [S#] marker is
 * placed after the text that cites it.
 */
function toOutput(retrieval, result) {
  const idFor = new Map();
  for (const c of result.citations || []) {
    if (!isWebUrl(c.url) || idFor.has(c.url)) continue;
    const host = hostOf(c.url);
    const id = retrieval.book.add({
      kind: "web",
      recordId: c.url,
      // Page titles and excerpts are shown and copied too, so they get the answer's dose and URL scrubbing.
      label: safeSnippet(c.title, 160) || host,
      detail: [host, safeSnippet(c.citedText, 200)].filter(Boolean).join(" — "),
      liveness: "web",
      asOf: null,
      link: { url: c.url },
    });
    idFor.set(c.url, id);
  }
  const answer = (result.blocks || []).map((b) => {
    const marks = [...new Set((b.urls || []).map((u) => idFor.get(u)).filter(Boolean))].map((id) => `[${id}]`).join("");
    if (!marks) return b.text;
    // Keep the marker before any trailing newline or space.
    const m = /\s*$/.exec(b.text);
    return `${b.text.slice(0, m.index)} ${marks}${m[0]}`;
  }).join("").trim();
  return { answer, sectionNotes: [], observations: [], citedSourceIds: [...idFor.values()], followUpQuestions: [] };
}

module.exports = { run, toOutput, hostOf, isWebUrl, NOT_CONFIGURED, UNAVAILABLE, LIMITATIONS };
