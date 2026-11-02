/**
 * Scope src/hydrant-testing.css (a minified stylesheet from the standalone
 * hydrant app) so its rules only apply inside the hydrant module. Without
 * this, once the hydrant page has loaded, its global rules (inputs, buttons,
 * .app-shell, .side-nav, modals) restyle the rest of the RMS.
 *
 * Scopes: .hydrant-module-root (embedded in the RMS), .hydrant-standalone
 * (the branded hydrant site) and .hydrant-portal-scope (dialogs rendered
 * into document.body). Page-level rules (html, body, :root, #root) only
 * apply on the standalone site. Safe to run more than once.
 *
 *   node scripts/scope-hydrant-css.mjs
 */
import fs from "node:fs";
import postcss from "postcss";

const FILE = new URL("../src/hydrant-testing.css", import.meta.url);
const SCOPE = ":where(.hydrant-module-root, .hydrant-standalone, .hydrant-portal-scope)";
const STANDALONE = ":has(.hydrant-standalone)";
const ALREADY_SCOPED = /^(:where\(\.hydrant-module-root|\.hydrant-module-root|\.hydrant-standalone|\.hydrant-portal-scope|[a-z]*\.hydrant-rms-theme|html:has|body:has|:root:has|#root:has)/;

function scopeSelector(selector) {
  const sel = selector.trim();
  if (!sel || ALREADY_SCOPED.test(sel)) return sel;
  // Page-level selectors: standalone site only.
  const page = sel.match(/^(html|body|:root|#root)(?![\w-])(.*)$/);
  if (page) return `${page[1]}${STANDALONE}${page[2]}`;
  return `${SCOPE} ${sel}`;
}

const css = fs.readFileSync(FILE, "utf8");
const root = postcss.parse(css);
let count = 0;
root.walkRules((rule) => {
  if (rule.parent?.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
  const next = rule.selectors.map(scopeSelector);
  if (next.join(",") !== rule.selectors.join(",")) count += 1;
  rule.selectors = next;
});
fs.writeFileSync(FILE, root.toString());
console.log(`Scoped ${count} rules in src/hydrant-testing.css`);
