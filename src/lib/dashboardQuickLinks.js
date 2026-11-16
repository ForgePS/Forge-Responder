/**
 * My Dashboard quick links: cards a person pins to jump straight to a page.
 *
 * The chosen page names are saved on the member's own user record
 * (preferences.dashboardQuickLinks), so they follow the person across devices.
 * Only pages in the person's menu can be shown; a saved card for a page they
 * can no longer open stays saved but hidden, and returns if access comes back.
 */

export const QUICK_LINKS_PREFERENCE = "dashboardQuickLinks";
export const MAX_QUICK_LINKS = 12;

/** Starting cards for someone who has never customized their dashboard (first available ones win). */
export const DEFAULT_QUICK_LINKS = [
  "My Schedule",
  "Time Card",
  "Apparatus Checks",
  "Messages",
  "My Training",
  "My Documents",
];
const DEFAULT_COUNT = 4;

// The dashboard itself is never a quick link.
const EXCLUDED_PAGES = new Set(["My Dashboard"]);

/**
 * Pages a person can pin, from their menu groups, in menu order:
 * [{ name, icon, group }]. Items that open an outside website are left out.
 * @param {Array<{label?: string, items?: Array}>} groups menu groups (items are [name, Icon, externalUrl?])
 * @param {(group: object) => Array} [leaves] item tuples of a group (handles nested menu trees)
 */
export function quickLinkOptions(groups = [], leaves = (group) => group?.items || []) {
  const seen = new Set();
  const options = [];
  for (const group of groups || []) {
    for (const [name, icon, externalUrl] of leaves(group) || []) {
      if (!name || externalUrl || EXCLUDED_PAGES.has(name) || seen.has(name)) continue;
      seen.add(name);
      options.push({ name, icon: icon || null, group: group?.label || "" });
    }
  }
  return options;
}

/** Saved page names, cleaned (strings, no duplicates, capped). null when never saved. */
export function normalizeSavedQuickLinks(saved) {
  if (!Array.isArray(saved)) return null;
  const out = [];
  for (const name of saved) {
    if (typeof name !== "string" || !name.trim() || out.includes(name)) continue;
    out.push(name);
    if (out.length >= MAX_QUICK_LINKS) break;
  }
  return out;
}

/** The person's stored list: what they saved, or the defaults they can open. */
export function storedQuickLinks(saved, options = []) {
  const normalized = normalizeSavedQuickLinks(saved);
  if (normalized) return normalized;
  const available = new Set(options.map((option) => option.name));
  return DEFAULT_QUICK_LINKS.filter((name) => available.has(name)).slice(0, DEFAULT_COUNT);
}

/** Cards to show, in order: stored pages the person can open now. */
export function visibleQuickLinks(saved, options = []) {
  const byName = new Map(options.map((option) => [option.name, option]));
  return storedQuickLinks(saved, options).map((name) => byName.get(name)).filter(Boolean);
}

/** Pages that can still be added (not already shown), in menu order. */
export function addableQuickLinks(saved, options = []) {
  const shown = new Set(visibleQuickLinks(saved, options).map((option) => option.name));
  return options.filter((option) => !shown.has(option.name));
}

/**
 * New stored list after editing the visible cards: the edited visible order,
 * followed by saved pages that are hidden right now (kept for if access returns).
 */
function withHidden(saved, options, nextVisible) {
  const available = new Set(options.map((option) => option.name));
  const hidden = storedQuickLinks(saved, options).filter((name) => !available.has(name) && !nextVisible.includes(name));
  return normalizeSavedQuickLinks([...nextVisible, ...hidden]);
}

export function canAddQuickLink(saved, options = []) {
  return visibleQuickLinks(saved, options).length < MAX_QUICK_LINKS;
}

export function addQuickLink(saved, options, name) {
  const visible = visibleQuickLinks(saved, options).map((option) => option.name);
  if (!options.some((option) => option.name === name) || visible.includes(name) || visible.length >= MAX_QUICK_LINKS) {
    return storedQuickLinks(saved, options);
  }
  return withHidden(saved, options, [...visible, name]);
}

export function removeQuickLink(saved, options, name) {
  const visible = visibleQuickLinks(saved, options).map((option) => option.name).filter((item) => item !== name);
  return withHidden(saved, options, visible);
}

/** Move a visible card by `delta` places (-1 = earlier, 1 = later). */
export function moveQuickLink(saved, options, name, delta) {
  const visible = visibleQuickLinks(saved, options).map((option) => option.name);
  const from = visible.indexOf(name);
  const to = from + Number(delta || 0);
  if (from < 0 || to < 0 || to >= visible.length || to === from) return storedQuickLinks(saved, options);
  const next = [...visible];
  next.splice(from, 1);
  next.splice(to, 0, name);
  return withHidden(saved, options, next);
}

/**
 * Preference key for this member. Demo personas share one sign-in, so each
 * persona keeps its own cards instead of overwriting the others'.
 */
export function quickLinksPreferenceKey(membership) {
  const persona = membership?.demoPersona;
  return persona ? `${QUICK_LINKS_PREFERENCE}_${String(persona).replace(/[^a-z0-9]/gi, "")}` : QUICK_LINKS_PREFERENCE;
}
