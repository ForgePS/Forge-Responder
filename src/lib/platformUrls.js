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

/** Forge Academy hosting (separate Firebase project / auth). */
export const FORGE_ACADEMY_HOSTING_URL = normalizeUrl(
  import.meta.env.VITE_ACADEMY_HOSTING_URL,
  "https://forge-academy-95f84.web.app"
);

/** Student class browse + self-registration (not admin scheduling). */
export const FORGE_ACADEMY_CLASS_SCHEDULE_URL = `${FORGE_ACADEMY_HOSTING_URL}/student/register`;

export function resolvePublicDemoUrl() {
  return `${resolveRmsAppUrl()}/demo`;
}
