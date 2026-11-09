/**
 * Validate and clean model output before anyone sees it. Anything that fails
 * is dropped; if nothing usable is left, the caller uses the deterministic
 * answer built from the same records.
 */

// Medication amounts. "units" is deliberately absent: "4 units responded" is fire service language.
const DOSE = /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|ug|grams?|ml|mL|cc|iu|IU|meq|mEq|L\/min|lpm)\b(?:\s*\/\s*(?:kg|hr|min))?/g;
const BLAME = /\b(fault|faulted|blame\w*|negligen\w*|misconduct|disciplin\w*|reprimand\w*|incompeten\w*|careless\w*|insubordinat\w*|terminat(e|ion) (him|her|them|the))\b/i;
const ACTION_CLAIM = /\b(i|forge ai) (have |has )?(dispatched|cancel(l)?ed|reassigned|reprioriti[sz]ed|submitted|approved|updated|edited|changed|deleted)\b/i;

function clean(value, max = 6000) {
  return String(value ?? "")
    .replace(/<[^>]{0,200}>/g, "")                     // HTML / XML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")               // markdown images
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")        // markdown links -> text
    .replace(/\bhttps?:\/\/\S+/gi, "")                  // bare URLs
    .replace(/^#{1,6}\s+/gm, "")                        // headings
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function sentences(textValue) {
  return textValue.split(/(?<=[.!?])\s+|\n/);
}

/** Remove sentences/lines matching `re`; returns [text, removedCount]. */
function dropMatching(textValue, re) {
  let removed = 0;
  const lines = textValue.split("\n").map((line) => {
    const parts = sentences(line);
    const kept = parts.filter((s) => {
      if (re.test(s)) { removed += 1; return false; }
      return true;
    });
    return kept.join(" ");
  });
  return [lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(), removed];
}

/** Keep [S#] citations that exist; strip the rest. */
function fixCitations(textValue, known) {
  return textValue.replace(/\[(S\d{1,4})\]/g, (m, id) => (known.has(id) ? m : ""));
}

/**
 * @param {object} output raw model JSON
 * @param {{knownSourceIds:Set<string>, sectionIds:string[], capability:string}} opts
 */
function validateOutput(output, { knownSourceIds, sectionIds = [], capability }) {
  const issues = [];
  if (!output || typeof output !== "object") return { ok: false, issues: ["not an object"] };

  const scrub = (value, max) => {
    let t = clean(value, max);
    t = fixCitations(t, knownSourceIds);
    if (DOSE.test(t)) {
      issues.push("dose removed");
      t = t.replace(DOSE, "[dose removed]");
    }
    DOSE.lastIndex = 0;
    let removed;
    [t, removed] = dropMatching(t, ACTION_CLAIM);
    if (removed) issues.push("action claim removed");
    if (capability === "supervisorQa" || capability === "briefing") {
      [t, removed] = dropMatching(t, BLAME);
      if (removed) issues.push("blame language removed");
    }
    return t;
  };

  const answer = scrub(output.answer, 6000);
  const knownSections = new Set(sectionIds);
  const sectionNotes = (Array.isArray(output.sectionNotes) ? output.sectionNotes : [])
    .filter((n) => n && knownSections.has(String(n.sectionId)))
    .map((n) => ({ sectionId: String(n.sectionId), text: scrub(n.text, 2000) }))
    .filter((n) => n.text);
  const observations = (Array.isArray(output.observations) ? output.observations : [])
    .map((o) => {
      const t = scrub(o, 400);
      return BLAME.test(t) ? "" : t;
    })
    .filter(Boolean)
    .slice(0, 5);
  const inline = new Set([...`${answer} ${sectionNotes.map((n) => n.text).join(" ")}`.matchAll(/\[(S\d{1,4})\]/g)].map((m) => m[1]));
  const cited = [...new Set([...(Array.isArray(output.citedSourceIds) ? output.citedSourceIds.map(String) : []), ...inline])]
    .filter((id) => knownSourceIds.has(id));
  const followUps = (Array.isArray(output.followUpQuestions) ? output.followUpQuestions : [])
    .map((q) => clean(q, 160)).filter(Boolean).slice(0, 3);

  const ok = answer.length > 0 || sectionNotes.length > 0;
  if (!ok) issues.push("empty answer");
  return { ok, answer, sectionNotes, observations, citedSourceIds: cited, followUps, issues };
}

module.exports = { validateOutput, clean, fixCitations };
