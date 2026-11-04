/**
 * Where the field app lives:
 *  - its own address, field.<root domain> (e.g. field.forgeresponder.com): the
 *    whole site is the field app;
 *  - /field and /<department>/field on the other addresses.
 */

export const FIELD_SEGMENT = "field";
export const FIELD_HOST_LABEL = "field";

function currentHostname() {
  return typeof window !== "undefined" ? window.location.hostname : "";
}

/** True on the field app's own address (field.forgeresponder.com). */
export function isFieldHost(hostname = currentHostname()) {
  return String(hostname || "").trim().toLowerCase().startsWith(`${FIELD_HOST_LABEL}.`);
}

export function isFieldAppPath(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  hostname = currentHostname(),
) {
  if (isFieldHost(hostname)) return true;
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts.length === 1) return parts[0].toLowerCase() === FIELD_SEGMENT;
  if (parts.length === 2) return parts[1].toLowerCase() === FIELD_SEGMENT;
  return false;
}

/**
 * The desktop RMS address for the current department (drops the /field part).
 * On field.<root> it's the main app address, app.<root>.
 */
export function rmsPathFromFieldPath(
  pathname = typeof window !== "undefined" ? window.location.pathname : "/",
  hostname = currentHostname(),
) {
  if (isFieldHost(hostname)) {
    const root = String(hostname).toLowerCase().slice(FIELD_HOST_LABEL.length + 1);
    return `https://app.${root}/`;
  }
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts.length === 2 && parts[1].toLowerCase() === FIELD_SEGMENT) return `/${parts[0]}`;
  return "/";
}
