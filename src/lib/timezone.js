/** True when the browser can format dates in this IANA timezone (e.g. "America/Chicago"). */
export function isValidTimezone(value) {
  if (!value || typeof value !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
