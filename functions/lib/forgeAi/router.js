/**
 * Deterministic routing of a question to one capability. An explicit
 * capability (chip or entry point) always wins over the text.
 */
const RULES = [
  ["briefing", 6, /\b(brief(ing)?|shift report|command report|shift summary|situation report|sitrep)\b/i],
  ["supervisorQa", 6, /\b(qa|quality assurance|qa review|supervisor review|review (the )?reports)\b/i],
  ["nerisQuality", 5, /\b(neris|validation|missing (fields?|data)|required fields?|incomplete|data quality|blocking|ready (to|for) submi)/i],
  ["heatZone", 5, /\b(heat ?zones?|heat ?map|hot ?spots?|district|concentration|repeat (locations?|calls?|addresses?)|which address(es)?|most calls|busiest (area|district|hour|time)|time of day|hour of (the )?day|geographic)\b/i],
  ["units", 4, /\b(units?|apparatus|fleet|readiness|out of service|in service|reserve|restricted|engine|ladder|medic|truck)\b/i],
  ["dispatch", 4, /\b(calls?|dispatch(ed)?|cad|active ?911|alerts?|responded|ran|run)\b/i],
  ["incident", 3, /\b(incidents?|reports?|timeline|similar|summar(y|ize)|fires?|medical|crash|mva)\b/i],
  ["knowledge", 5, /\b(how (do|does|can|to)|where (is|do|can)|what is forge|help with|explain (the|how)|documentation|feature|setting up|configure|offline demo)\b/i],
];

/**
 * @param {string} message
 * @param {string[]} allowed capability ids the caller may use (order = preference on ties)
 * @returns {{capability:string, scores:Record<string,number>}}
 */
function classify(message, allowed = []) {
  const scores = {};
  // Report numbers ("NERIS-2026-129", "HL-2026-001") name a record, not a topic.
  const topic = String(message || "").replace(/\b[a-z]{1,8}-\d{2,4}-\d{1,6}\b/gi, " report ");
  for (const [id, weight, re] of RULES) {
    const matches = topic.match(new RegExp(re.source, "gi"));
    if (matches) scores[id] = (scores[id] || 0) + weight + matches.length - 1;
  }
  // "How do I..." / "Where is..." asks how FORGE works, even when it names a module.
  if (scores.knowledge && /^\s*(how (do|does|can|to)|where (is|do|can))\b/i.test(String(message || ""))) scores.knowledge += 3;
  // A unit id ("E1", "Medic 2") alongside call words is a dispatch question.
  if (scores.units && scores.dispatch) scores.dispatch += 1;
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const best = ranked[0]?.[0];
  if (best) return { capability: best, scores };
  // Nothing matched: the most general data capability the caller has, else knowledge.
  const fallback = ["incident", "dispatch", "knowledge"].find((id) => allowed.includes(id)) || "knowledge";
  return { capability: fallback, scores };
}

module.exports = { classify };
