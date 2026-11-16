// Pure helpers for the Help articles list (no Vite APIs, so unit tests can import them).

/** Split one guide into sections at "## " headings (the intro becomes an "Overview" section). */
export function splitGuide(markdown = "", source = "") {
  const lines = String(markdown).replace(/\r\n/g, "\n").split("\n");
  const titleLine = lines.find((line) => /^#\s/.test(line));
  const guide = titleLine ? titleLine.replace(/^#\s+/, "").trim() : source;
  const sections = [];
  let current = { title: "Overview", lines: [] };
  const flush = () => {
    const body = current.lines.join("\n").replace(/!\[[^\]]*\]\([^)]*\)/g, "").trim();
    if (body) sections.push({ id: `${source}#${sections.length}`, guide, title: current.title, body, source });
  };
  for (const line of lines) {
    if (line === titleLine) continue;
    const heading = line.match(/^##\s+(.*)$/);
    if (heading) {
      flush();
      current = { title: heading[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();
  return sections;
}

/** Sections matching every word of the search, best (title) matches first. */
export function searchHelpArticles(sections = [], text = "") {
  const words = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return sections;
  return sections
    .map((section) => {
      const title = `${section.guide} ${section.title}`.toLowerCase();
      const body = section.body.toLowerCase();
      if (!words.every((word) => title.includes(word) || body.includes(word))) return null;
      const score = words.reduce((sum, word) => sum + (title.includes(word) ? 3 : 0) + (body.split(word).length - 1), 0);
      return { section, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.section);
}
