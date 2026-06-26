import { FORGE_RMS_APP_URL, resolveRmsAppUrl } from "./rmsAppUrl.js";

function normalizeUrl(value, fallback) {
  const raw = (value || fallback || "").trim();
  if (!raw) return fallback;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

/** Public marketing site — company info, not the RMS application. */
export const FORGE_PUBLIC_WEBSITE_URL = normalizeUrl(
  import.meta.env.VITE_PUBLIC_WEBSITE_URL,
  "https://forgepublicsafety.com"
);

export const FORGE_PUBLIC_WEBSITE_HOST = new URL(FORGE_PUBLIC_WEBSITE_URL).host;

export { FORGE_RMS_APP_URL, FORGE_RMS_APP_HOST, resolveRmsAppUrl } from "./rmsAppUrl.js";

export const FORGE_DEMO_URL = `${FORGE_RMS_APP_URL}/demo`;
export const FORGE_CREATOR_CONSOLE_URL = `${FORGE_RMS_APP_URL}/creator-console`;

export function resolvePublicDemoUrl() {
  return `${resolveRmsAppUrl()}/demo`;
}
