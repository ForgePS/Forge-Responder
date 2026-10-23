/** The field app lives at /field (and /<department>/field on the shared domain). */

export const FIELD_SEGMENT = "field";

export function isFieldAppPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts.length === 1) return parts[0].toLowerCase() === FIELD_SEGMENT;
  if (parts.length === 2) return parts[1].toLowerCase() === FIELD_SEGMENT;
  return false;
}

/** The desktop RMS address for the current department (drops the /field part). */
export function rmsPathFromFieldPath(pathname = typeof window !== "undefined" ? window.location.pathname : "/") {
  const parts = String(pathname || "/").split("/").filter(Boolean);
  if (parts.length === 2 && parts[1].toLowerCase() === FIELD_SEGMENT) return `/${parts[0]}`;
  return "/";
}
