/**
 * The browser tab's title and icon (favicon) for the RMS, set by creators in
 * Creator Console -> Platform settings -> Browser tab. Saved with the public
 * platform branding so sign-in pages use it too, and remembered in this browser
 * (index.html applies the remembered one before the app loads, so the tab
 * doesn't flash the defaults).
 */

export const DEFAULT_BROWSER_TITLE = "FORGE Public Safety RMS";
export const DEFAULT_FAVICON_PATH = "/favicon.png";
export const TAB_BRANDING_CACHE_KEY = "forge-tab-branding";
export const MAX_BROWSER_TITLE_LENGTH = 80;

/** Only https addresses and site paths can be a favicon (no javascript:, data: or other schemes). */
export function isSafeFaviconUrl(value) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  // http only for this computer (the offline demo's file storage).
  return /^https:\/\//i.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(url);
}

export function normalizeBrowserTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, MAX_BROWSER_TITLE_LENGTH);
}

/** { title, faviconUrl } from platform settings, falling back to the defaults. */
export function resolveTabBranding(config = {}) {
  const title = normalizeBrowserTitle(config?.browserTitle) || DEFAULT_BROWSER_TITLE;
  const faviconUrl = isSafeFaviconUrl(config?.faviconUrl) ? String(config.faviconUrl).trim() : DEFAULT_FAVICON_PATH;
  return { title, faviconUrl };
}

/** Title shown in the tab, keeping a test-environment prefix such as "[STAGING] ". */
export function tabTitle(title, prefix = "") {
  return `${prefix || ""}${title || DEFAULT_BROWSER_TITLE}`;
}

/** Image type for the <link rel="icon"> (browsers sniff it anyway; this helps SVG/ICO). */
export function faviconType(url = "") {
  const path = String(url).split(/[?#]/)[0].toLowerCase();
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".ico")) return "image/x-icon";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  if (path.endsWith(".gif")) return "image/gif";
  return "image/png";
}

/** Set the tab title and icon on a document. */
export function applyTabBranding(doc, branding, prefix = "") {
  if (!doc) return;
  const { title, faviconUrl } = resolveTabBranding({ browserTitle: branding?.title, faviconUrl: branding?.faviconUrl });
  const nextTitle = tabTitle(title, prefix);
  if (doc.title !== nextTitle) doc.title = nextTitle;
  let link = doc.querySelector('link[rel="icon"]');
  if (!link) {
    link = doc.createElement("link");
    link.setAttribute("rel", "icon");
    doc.head.appendChild(link);
  }
  if (link.getAttribute("href") !== faviconUrl) {
    link.setAttribute("href", faviconUrl);
    link.setAttribute("type", faviconType(faviconUrl));
  }
}
