function normalizeUrl(value, fallback) {
  const raw = (value || fallback || "").trim();
  if (!raw) return fallback;
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, "");
}

export const FORGE_RMS_APP_URL = normalizeUrl(
  import.meta.env.VITE_RMS_APP_URL,
  "https://rms.forgepublicsafety.com"
);

export const FORGE_RMS_APP_HOST = new URL(FORGE_RMS_APP_URL).host;

function isRmsGatewayHost(hostname) {
  return (
    hostname === "localhost"
    || hostname.endsWith(".web.app")
    || hostname === FORGE_RMS_APP_HOST
  );
}

export function resolveRmsAppUrl() {
  if (typeof window !== "undefined" && isRmsGatewayHost(window.location.hostname)) {
    return window.location.origin;
  }
  return FORGE_RMS_APP_URL;
}
