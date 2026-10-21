/**
 * Page addresses: the open module is kept in the URL as ?page=<slug>
 * (e.g. camden.forgeresponder.com/?page=fleet-work-orders), so pages can be
 * bookmarked, shared and reached with the browser's back/forward buttons.
 * A query setting is used (not a path) because paths already carry the
 * department (/camden on web.app), the hydrant app and alert boards.
 */

export const PAGE_PARAM = "page";
const HISTORY_KEY = "forgePage";

/** "Fleet Work Orders" -> "fleet-work-orders", "Fuel & Energy" -> "fuel-and-energy". */
export function pageSlug(name = "") {
  return String(name)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\//g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Map of slug -> page name for the given page names (first name wins on a clash). */
export function buildPageIndex(names = []) {
  const index = new Map();
  for (const name of names) {
    const slug = pageSlug(name);
    if (slug && !index.has(slug)) index.set(slug, name);
  }
  return index;
}

export function readPageSlug(location = typeof window !== "undefined" ? window.location : null) {
  if (!location) return "";
  return String(new URLSearchParams(location.search || "").get(PAGE_PARAM) || "").toLowerCase();
}

/** Page name named by the URL, or null when absent/unknown. */
export function pageFromLocation(index, location) {
  const slug = readPageSlug(location);
  return slug ? index.get(slug) || null : null;
}

/** Same URL with ?page set (or removed for the default page), keeping everything else. */
export function urlWithPage(href, slug) {
  const url = new URL(href);
  if (slug) url.searchParams.set(PAGE_PARAM, slug);
  else url.searchParams.delete(PAGE_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

/** History state written with each page entry, so back/forward can tell our entries apart. */
export function pageHistoryState(slug) {
  return { [HISTORY_KEY]: slug || "" };
}

/** The page slug stored on a history entry we created, or null for other entries. */
export function slugFromHistoryState(state) {
  return state && typeof state === "object" && HISTORY_KEY in state ? String(state[HISTORY_KEY] || "") : null;
}
