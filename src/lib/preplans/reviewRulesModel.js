/**
 * Rules for automatic preplan review tasks (pure, no Firebase). The server
 * applies them (functions/lib/preplanReviewTasks.js); DEFAULT_REVIEW_RULES must
 * match the server's copy (tests/unit/preplanReviewTasks.test.mjs checks).
 */
export const DEFAULT_REVIEW_RULES = Object.freeze({
  occupancyChanges: true,
  violationFindings: true,
  citationPrefixes: ["5", "6", "9", "10", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "61", "62", "63", "64", "65", "66", "67"],
  keywords: ["sprinkler", "standpipe", "alarm", "suppression", "hood", "riser", "fire pump", "fire department connection", "fdc",
    "knox", "fire lane", "access", "egress", "exit", "hazardous", "hazmat", "flammable", "combustible", "utility", "shutoff",
    "renovat", "remodel", "addition", "change of use", "change in use", "occupancy change"],
  minSeverity: "",
  correctedFindings: true,
  notifyOnNewTasks: true,
});

export const SEVERITY_OPTIONS = Object.freeze([
  { id: "", label: "Any severity" },
  { id: "moderate", label: "Moderate and above" },
  { id: "major", label: "Major / high and above" },
  { id: "critical", label: "Critical only" },
]);

/** Parse a comma or newline separated list typed by an administrator. */
export function parseRuleList(value) {
  return [...new Set(String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))].slice(0, 100);
}

export function normalizeReviewRules(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const list = (value, fallback) => (Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [...fallback]);
  return {
    occupancyChanges: data.occupancyChanges !== false,
    violationFindings: data.violationFindings !== false,
    citationPrefixes: list(data.citationPrefixes, DEFAULT_REVIEW_RULES.citationPrefixes),
    keywords: list(data.keywords, DEFAULT_REVIEW_RULES.keywords),
    minSeverity: SEVERITY_OPTIONS.some((row) => row.id === data.minSeverity) ? data.minSeverity : "",
    correctedFindings: data.correctedFindings !== false,
    notifyOnNewTasks: data.notifyOnNewTasks !== false,
  };
}
