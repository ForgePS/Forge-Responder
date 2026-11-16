// Searchable help articles built from the user guides in docs/ (loaded on demand).
// Only guides written for people using the app are included; specs, audits and
// design notes are not.
const GUIDES = import.meta.glob([
  "/docs/help-desk/HELP_DESK_USER_GUIDE.md",
  "/docs/FIELD_APP.md",
  "/docs/forge-ai/FORGE_AI_USER_GUIDE.md",
  "/docs/fleet/operator-guide.md",
  "/docs/fleet/technician-guide.md",
  "/docs/fleet/fleet-manager-guide.md",
  "/docs/fleet/admin-guide.md",
  "/docs/fleet/vendor-portal-guide.md",
  "/docs/inspections/admin-guide.md",
], { query: "?raw", import: "default" });

import { splitGuide } from "./helpArticleSearch.js";

export { searchHelpArticles, splitGuide } from "./helpArticleSearch.js";

let cache = null;

export async function loadHelpArticles() {
  if (!cache) {
    cache = Promise.all(Object.entries(GUIDES).map(async ([path, load]) => splitGuide(await load(), path.replace(/^\/docs\//, ""))))
      .then((groups) => groups.flat())
      .catch((error) => {
        cache = null;
        throw error;
      });
  }
  return cache;
}
